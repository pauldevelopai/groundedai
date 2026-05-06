// Translation engine — Helsinki-NLP opus-mt models via Transformers.js,
// in-process (no separate worker). OSS, fully free, satisfies the
// open-source-first rule. Slice 7a covers en↔af, en↔zu, en↔xh; Slice 7b
// will add NLLB-200 + Masakhane routing for Sesotho, Setswana, Siswati,
// IsiNdebele, Sepedi.
//
// The package is ESM-only so we load it via dynamic import() inside an async
// wrapper, same shape as lib/storage/embed.js does for BGE-M3.

// Two-tier routing per the spec ("not equivalent problems, and Translator
// does not pretend they are"):
//
//   Tier 1 — Helsinki-NLP opus-mt (specialised per pair, fast, ~50–80 MB):
//     en→af, af→en, en→xh — verified live, sub-3-second sentences.
//
//   Tier 2 — Meta NLLB-200 distilled 600M (catch-all, ~1.4 GB, slower):
//     covers the rest of the SA language list — isiZulu, Sesotho, Setswana,
//     Siswati, isiNdebele (SA variant), Sepedi (Northern Sotho), plus
//     reverse pairs where opus-mt doesn't have a Xenova-converted model.
//
// The router picks Tier 1 when an opus-mt pair exists (better quality on
// pairs the model was trained for); otherwise it routes to NLLB with the
// Flores-200 source/target language codes.
const OPUS_MT_PAIRS = {
  'en-af': 'Xenova/opus-mt-en-af',
  'af-en': 'Xenova/opus-mt-af-en',
  'en-xh': 'Xenova/opus-mt-en-xh',
};

const NLLB_MODEL = 'Xenova/nllb-200-distilled-600M';

// Flores-200 codes per our ISO-639 internal codes. Used only when routing
// to NLLB.
const FLORES_CODES = {
  en: 'eng_Latn',
  af: 'afr_Latn',
  zu: 'zul_Latn',
  xh: 'xho_Latn',
  st: 'sot_Latn',         // Sesotho
  tn: 'tsn_Latn',         // Setswana
  ss: 'ssw_Latn',         // Siswati
  nr: 'nbl_Latn',         // South African isiNdebele (Northern Ndebele in Flores)
  nso: 'nso_Latn',        // Sepedi / Northern Sotho
};

const SUPPORTED_LANGUAGES = {
  en: 'English',
  af: 'Afrikaans',
  zu: 'isiZulu',
  xh: 'isiXhosa',
  st: 'Sesotho',
  tn: 'Setswana',
  ss: 'Siswati',
  nr: 'isiNdebele',
  nso: 'Sepedi',
};

// Curated pairs the UI exposes — every SA language ↔ English. Cross-SA
// pairs (e.g. zu↔xh) are valid in NLLB but omitted from the UI for now;
// re-enable case-by-case when newsroom workflows actually need them.
function curatedPairKeys() {
  const sa = ['af', 'zu', 'xh', 'st', 'tn', 'ss', 'nr', 'nso'];
  const keys = [];
  for (const lang of sa) {
    keys.push(`en-${lang}`);
    keys.push(`${lang}-en`);
  }
  return keys;
}

// Pipelines are expensive to construct (model download + load). Cache them
// per pair across calls within the same Node process.
const _pipelines = new Map();

async function getPipeline(modelId) {
  if (_pipelines.has(modelId)) return _pipelines.get(modelId);
  const { pipeline } = await import('@huggingface/transformers');
  const p = await pipeline('translation', modelId);
  _pipelines.set(modelId, p);
  return p;
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Detect which glossary entries' source terms appear in the input text.
 * Whole-word match, case-insensitive. Returns the matched entries plus their
 * occurrence count in the source.
 *
 * @param {string} text
 * @param {Array<{term:string, translation:string, id:string}>} glossaryForPair
 * @returns {Array<{id:string, term:string, translation:string, occurrences:number}>}
 */
function detectGlossaryHits(text, glossaryForPair) {
  const out = [];
  for (const g of glossaryForPair) {
    const re = new RegExp(`\\b${escapeRegex(g.term)}\\b`, 'gi');
    const matches = text.match(re);
    if (matches && matches.length > 0) {
      out.push({ id: g.id, term: g.term, translation: g.translation, occurrences: matches.length });
    }
  }
  return out;
}

/**
 * Translate text from source → target language. Reads the per-newsroom
 * glossary; reports which glossary terms appeared in the source so the
 * editor can verify them in the output. Slice 7d will close the loop by
 * applying glossary corrections automatically.
 *
 * @param {object} opts
 * @param {string} opts.text                                — non-empty source text
 * @param {string} opts.source                              — ISO code e.g. 'en'
 * @param {string} opts.target                              — ISO code e.g. 'zu'
 * @param {Array<{id:string, term:string, translation:string, source_language:string, target_language:string}>} [opts.glossary]
 * @returns {Promise<{
 *   translatedText: string,
 *   modelId: string,
 *   glossaryHits: Array<{id:string, term:string, translation:string, occurrences:number}>,
 *   durationMs: number
 * }>}
 */
async function translate({ text, source, target, glossary = [] }) {
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    throw new Error('text is required.');
  }
  if (source === target) {
    throw new Error('source and target language must differ.');
  }

  // Routing — Tier 1: opus-mt where it exists; Tier 2: NLLB-200 fallback.
  const pairKey = `${source}-${target}`;
  let modelId;
  let useNllb = false;
  if (OPUS_MT_PAIRS[pairKey]) {
    modelId = OPUS_MT_PAIRS[pairKey];
  } else if (FLORES_CODES[source] && FLORES_CODES[target]) {
    modelId = NLLB_MODEL;
    useNllb = true;
  } else {
    const known = Object.keys(SUPPORTED_LANGUAGES).join(', ');
    throw new Error(
      `Translator does not support ${source} → ${target}. Known languages: ${known}.`
    );
  }

  // Reduce glossary to entries for THIS pair.
  const pairGlossary = (glossary || []).filter(
    (g) => g.source_language === source && g.target_language === target
  );
  const glossaryHits = detectGlossaryHits(text, pairGlossary);

  const startedAt = Date.now();
  const translator = await getPipeline(modelId);
  // Both opus-mt and NLLB have ~512-token input windows. Chunk by sentence.
  const chunks = chunkBySentences(text, 480);
  const translatedChunks = [];
  for (const chunk of chunks) {
    const out = useNllb
      ? await translator(chunk, {
          src_lang: FLORES_CODES[source],
          tgt_lang: FLORES_CODES[target],
        })
      : await translator(chunk);
    const t = Array.isArray(out)
      ? out[0]?.translation_text ?? ''
      : out?.translation_text ?? '';
    translatedChunks.push(t);
  }

  return {
    translatedText: translatedChunks.join(' ').trim(),
    modelId,
    glossaryHits,
    durationMs: Date.now() - startedAt,
  };
}

/**
 * Naive sentence chunker. Caps each chunk at ~maxTokens characters to stay
 * under opus-mt's 512-token window (rough rule: ~4 chars/token in English).
 */
function chunkBySentences(text, maxTokens = 480) {
  const charLimit = maxTokens * 4;
  // Split on .!? followed by whitespace; preserve the delimiter on the
  // previous segment.
  const parts = text.split(/(?<=[.!?])\s+/);
  const chunks = [];
  let current = '';
  for (const p of parts) {
    if ((current + ' ' + p).length > charLimit && current.length > 0) {
      chunks.push(current.trim());
      current = p;
    } else {
      current = current ? `${current} ${p}` : p;
    }
  }
  if (current.trim().length > 0) chunks.push(current.trim());
  return chunks.length > 0 ? chunks : [text];
}

function supportedPairs() {
  return curatedPairKeys().map((p) => {
    const [s, t] = p.split('-');
    const tier = OPUS_MT_PAIRS[p] ? 'opus-mt' : 'nllb-200';
    return {
      source: s,
      target: t,
      source_label: SUPPORTED_LANGUAGES[s] || s,
      target_label: SUPPORTED_LANGUAGES[t] || t,
      model: OPUS_MT_PAIRS[p] || NLLB_MODEL,
      tier,
    };
  });
}

module.exports = {
  translate,
  detectGlossaryHits,
  supportedPairs,
  SUPPORTED_LANGUAGES,
};
