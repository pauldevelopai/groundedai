// Multilingual named-entity recognition for social signals.
//
// Model: Xenova/bert-base-multilingual-cased-ner-hrl. HRL = high-resource
// languages — covers Arabic, German, English, Spanish, French, Italian,
// Latvian, Dutch, Portuguese, Chinese, plus Russian via XLM cross-lingual
// transfer. Outputs PER (persons), LOC (locations), ORG (organisations),
// MISC. Strong on the Russian + Chinese signals we care about.
//
// Falls back gracefully on languages outside the training set: we still
// try to run it, because BERT-multilingual tokenization handles unknown
// scripts reasonably and we'd rather have noisy entities than none at all.

const MODEL_ID = 'Xenova/bert-base-multilingual-cased-ner-hrl';

let pipelinePromise = null;

async function getPipeline() {
  if (pipelinePromise) return pipelinePromise;
  pipelinePromise = (async () => {
    const { pipeline, env } = await import('@huggingface/transformers');
    env.allowRemoteModels = true;
    env.allowLocalModels = true;
    return pipeline('token-classification', MODEL_ID, { ignore_labels: ['O'] });
  })();
  return pipelinePromise;
}

/**
 * Run NER on a piece of text. Returns entities grouped by category
 * (persons, orgs, locations, misc).
 *
 * The pipeline emits BIO-tagged sub-word tokens. We re-stitch contiguous
 * same-type tokens by using the original text's character offsets when
 * Transformers.js provides them, falling back to an offset-from-the-text
 * recovery when start/end are null (some model exports omit them).
 *
 * @param {string} text
 * @returns {Promise<{persons:string[], orgs:string[], locations:string[], misc:string[], raw:Array}>}
 */
async function extractEntities(text) {
  const cleaned = (text || '').trim();
  if (!cleaned) return emptyResult();

  const sample = cleaned.slice(0, 4000);
  const pipe = await getPipeline();
  let raw;
  try {
    raw = await pipe(sample);
  } catch {
    return emptyResult();
  }

  const merged = mergeBioTags(Array.isArray(raw) ? raw : [], sample);

  const persons = uniqueStrings(merged.filter(e => e.type === 'PER').map(e => e.text));
  const orgs = uniqueStrings(merged.filter(e => e.type === 'ORG').map(e => e.text));
  const locations = uniqueStrings(merged.filter(e => e.type === 'LOC').map(e => e.text));
  const misc = uniqueStrings(merged.filter(e => e.type === 'MISC').map(e => e.text));

  return { persons, orgs, locations, misc, raw: merged };
}

function emptyResult() {
  return { persons: [], orgs: [], locations: [], misc: [], raw: [] };
}

function uniqueStrings(arr) {
  const seen = new Set();
  const out = [];
  for (const s of arr) {
    const key = s.toLowerCase();
    if (!seen.has(key)) { seen.add(key); out.push(s); }
  }
  return out;
}

function mergeBioTags(tokens, sourceText) {
  // BERT-style tokens carry a '##' prefix on sub-word continuations
  // (e.g. 'Rama', '##ph', '##osa'). We use that as the join signal:
  // tokens starting with '##' concatenate to the previous, all others
  // get a space prefix. Token `index` gaps (>1) also mark new words
  // even when both pieces lack '##' (e.g. 'Vladimir' + 'Putin').
  const merged = [];
  let current = null;
  for (const t of tokens) {
    const label = String(t.entity || t.entity_group || '');
    const m = label.match(/^([BIE])-(PER|ORG|LOC|MISC)$/);
    const type = m ? m[2] : (label === 'O' ? null : label);
    if (!type) continue;
    const word = String(t.word || '');
    const idx = typeof t.index === 'number' ? t.index : null;

    const startsNewEntity = !m || m[1] === 'B' || !current || current.type !== type;
    if (startsNewEntity) {
      if (current) merged.push(finaliseEntity(current, sourceText));
      current = {
        type,
        // Store as { word, isContinuation } pairs so we know how to join later.
        pieces: [{ word, isContinuation: false, idx }],
        score: Number(t.score || 0),
        start: typeof t.start === 'number' ? t.start : null,
        end: typeof t.end === 'number' ? t.end : null,
      };
      continue;
    }

    // Decide whether this is a sub-word continuation of the previous piece.
    // Two signals:
    //   - explicit ## prefix on the word
    //   - token index is exactly prev.idx+1 AND no whitespace in source between
    //     them (i.e. they were tokenised as part of the same word)
    const prevPiece = current.pieces[current.pieces.length - 1];
    const indexAdjacent = idx != null && prevPiece.idx != null && idx === prevPiece.idx + 1;
    const isContinuation = word.startsWith('##') || (indexAdjacent && !startsWithCapital(word));
    current.pieces.push({ word, isContinuation, idx });
    current.score = Math.min(current.score, Number(t.score || 0));
    if (typeof t.end === 'number') current.end = t.end;
  }
  if (current) merged.push(finaliseEntity(current, sourceText));
  return merged.filter(e => e.text && e.text.length > 1);
}

function startsWithCapital(w) {
  if (!w) return false;
  const c = w.replace(/^##/, '').charCodeAt(0);
  // ASCII A-Z, also covers most Latin diacritics. Cyrillic capitals are
  // 0x0410-0x042F. We want to know "is this likely a new proper noun?"
  return (c >= 0x41 && c <= 0x5A) || (c >= 0x0410 && c <= 0x042F);
}

function finaliseEntity(entity, sourceText) {
  // Prefer source-text slicing when we have valid offsets — round-trips
  // diacritics, capitalization, and original whitespace verbatim.
  if (sourceText && entity.start != null && entity.end != null && entity.end > entity.start) {
    return {
      type: entity.type,
      text: sourceText.slice(entity.start, entity.end).trim(),
      start: entity.start,
      end: entity.end,
      score: entity.score,
    };
  }
  // Otherwise reconstruct from sub-word pieces using the continuation flag.
  let text = '';
  for (let i = 0; i < entity.pieces.length; i++) {
    const p = entity.pieces[i];
    const stripped = p.word.replace(/^##/, '');
    if (i === 0 || p.isContinuation) text += stripped;
    else text += ' ' + stripped;
  }
  return { type: entity.type, text: text.trim(), start: entity.start, end: entity.end, score: entity.score };
}

module.exports = { extractEntities, MODEL_ID };
