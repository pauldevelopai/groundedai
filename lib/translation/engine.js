// Translation engine — Helsinki-NLP opus-mt models via Transformers.js,
// in-process (no separate worker). OSS, fully free, satisfies the
// open-source-first rule. Slice 7a covers en↔af, en↔zu, en↔xh; Slice 7b
// will add NLLB-200 + Masakhane routing for Sesotho, Setswana, Siswati,
// IsiNdebele, Sepedi.
//
// The package is ESM-only so we load it via dynamic import() inside an async
// wrapper, same shape as lib/storage/embed.js does for BGE-M3.

// Pair → Hugging Face model id. All Xenova-converted ONNX so they run in
// pure JS without a Python sidecar.
//
// Slice 7a verified pairs (see docs/HANDOFF.md §13 follow-up):
//   en→af, af→en, en→xh — direct Helsinki-NLP opus-mt models, work cleanly.
//
// Pairs explicitly NOT shipped in 7a (Xenova hasn't converted these or the
// models don't exist):
//   en↔zu (isiZulu) — Xenova/opus-mt-en-zu returns 401; defer to Slice 7b
//                     where NLLB-200 routing covers it.
//   xh→en           — no direct Xenova xh-en model; defer to Slice 7b too
//                     (opus-mt-en-mul exists but quality is uneven).
//
// Slice 7b adds NLLB-200 distilled (Xenova/nllb-200-distilled-600M) as the
// catch-all that fills these gaps and adds Sesotho, Setswana, Siswati,
// IsiNdebele, Sepedi.
const MODEL_PAIRS = {
  'en-af': 'Xenova/opus-mt-en-af',
  'af-en': 'Xenova/opus-mt-af-en',
  'en-xh': 'Xenova/opus-mt-en-xh',
};

const SUPPORTED_LANGUAGES = {
  en: 'English',
  af: 'Afrikaans',
  xh: 'isiXhosa',
};

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
  const pairKey = `${source}-${target}`;
  const modelId = MODEL_PAIRS[pairKey];
  if (!modelId) {
    const supportedPairs = Object.keys(MODEL_PAIRS).join(', ');
    throw new Error(
      `Translator does not support ${source} → ${target} yet. Currently available pairs: ${supportedPairs}. ` +
        `Slice 7b adds NLLB-200 + Masakhane routing for the rest of the SA language list.`
    );
  }

  // Reduce glossary to entries for THIS pair.
  const pairGlossary = (glossary || []).filter(
    (g) => g.source_language === source && g.target_language === target
  );
  const glossaryHits = detectGlossaryHits(text, pairGlossary);

  const startedAt = Date.now();
  const translator = await getPipeline(modelId);
  // opus-mt has a max-input-tokens limit — ~512 tokens. For longer text we
  // chunk by sentences. Naive splitter for v1; Slice 7c may improve it.
  const chunks = chunkBySentences(text, 480);
  const translatedChunks = [];
  for (const chunk of chunks) {
    const out = await translator(chunk);
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
  return Object.keys(MODEL_PAIRS).map((p) => {
    const [s, t] = p.split('-');
    return {
      source: s,
      target: t,
      source_label: SUPPORTED_LANGUAGES[s] || s,
      target_label: SUPPORTED_LANGUAGES[t] || t,
      model: MODEL_PAIRS[p],
    };
  });
}

module.exports = {
  translate,
  detectGlossaryHits,
  supportedPairs,
  SUPPORTED_LANGUAGES,
};
