// Translator agent — takes source text + a target language, reads the
// caller's per-newsroom glossary, runs the OSS Helsinki-NLP opus-mt model
// for the pair (in-process via Transformers.js), persists a translations
// row, and returns the translated text plus glossary hits the editor
// should verify.
//
// Slice 7a baseline: en↔af, en↔zu, en↔xh. Slice 7b adds NLLB-200 + Masakhane
// routing for the rest of the SA language list. Slice 7c adds phrase-level
// confidence; Slice 7d closes the editor edit-feedback loop into the glossary.

const { pool } = require('../db');
const { translate, SUPPORTED_LANGUAGES } = require('../translation/engine');

const LANG_OPTIONS = Object.entries(SUPPORTED_LANGUAGES).map(([value, label]) => ({ value, label }));

/**
 * Run a translation as a workflow node. Persists the row and returns
 * the translated text + which glossary terms appeared in the source.
 */
async function runTranslation({
  sourceText,
  sourceLanguage = 'en',
  targetLanguage,
  context,
}) {
  if (!sourceText || typeof sourceText !== 'string' || sourceText.trim().length === 0) {
    throw new Error('sourceText is required.');
  }
  if (!targetLanguage || typeof targetLanguage !== 'string') {
    throw new Error('targetLanguage is required (e.g. "zu", "xh", "af").');
  }
  const src = sourceLanguage.toLowerCase().trim();
  const tgt = targetLanguage.toLowerCase().trim();

  // Open a translations row up front so failures get logged, not silenced.
  const insert = await pool.query(
    `INSERT INTO translations
       (newsroom_id, requested_by, source_language, target_language, source_text, status)
     VALUES ($1, $2, $3, $4, $5, 'pending')
     RETURNING id`,
    [context.newsroomId, context.userId || null, src, tgt, sourceText]
  );
  const translationId = insert.rows[0].id;

  // Pull the per-newsroom glossary for this pair so the engine can flag hits.
  const glossaryRes = await pool.query(
    `SELECT id, term, translation, source_language, target_language
       FROM translation_glossary
      WHERE newsroom_id = $1 AND source_language = $2 AND target_language = $3`,
    [context.newsroomId, src, tgt]
  );

  try {
    const out = await translate({
      text: sourceText,
      source: src,
      target: tgt,
      glossary: glossaryRes.rows,
    });

    await pool.query(
      `UPDATE translations
          SET translated_text = $2,
              model_id = $3,
              glossary_terms_seen = $4,
              segments = $5,
              duration_ms = $6,
              status = 'translated',
              updated_at = NOW()
        WHERE id = $1`,
      [
        translationId,
        out.translatedText,
        out.modelId,
        JSON.stringify(out.glossaryHits),
        JSON.stringify(out.segments || []),
        out.durationMs,
      ]
    );

    // Bump use_count on the glossary entries that appeared.
    if (out.glossaryHits.length > 0) {
      const ids = out.glossaryHits.map((h) => h.id);
      await pool.query(
        `UPDATE translation_glossary
            SET use_count = use_count + 1, updated_at = NOW()
          WHERE id = ANY($1::uuid[])`,
        [ids]
      );
    }

    return {
      translationId,
      translatedText: out.translatedText,
      modelId: out.modelId,
      glossaryHits: out.glossaryHits,
      durationMs: out.durationMs,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await pool.query(
      `UPDATE translations SET status = 'failed', error = $2, updated_at = NOW() WHERE id = $1`,
      [translationId, message]
    );
    throw err;
  }
}

module.exports = { runTranslation };

// ─── Agent registry entry ──────────────────────────────────────────────────
const { register, resolveConfig } = require('./registry');
register({
  slug: 'translator',
  name: 'Translator',
  icon: '🌐',
  description: 'Moves full stories between English and African languages with the depth needed to publish in them, not just gloss them. Maintains a per-newsroom glossary of approved terminology, place names, and idiom that builds with every edit. Routes each language pair to the model that performs best on it (Helsinki-NLP opus-mt where it exists; NLLB-200 distilled for the rest). Surfaces phrase-level confidence so editors can see where the model is guessing, not just what it produced. Every human edit feeds back into the glossary and the routing logic, so quality compounds rather than plateaus. Covers Afrikaans, isiZulu, isiXhosa, Sesotho, Setswana, Siswati, isiNdebele, and Sepedi.',
  triggers: ['translate', 'isizulu', 'isixhosa', 'afrikaans'],
  inputs: {
    sourceText: {
      type: 'longtext',
      required: true,
      label: 'Text to translate',
      description: 'The article, headline, or copy the user wants translated.',
    },
    targetLanguage: {
      type: 'string',
      required: true,
      label: 'Target language',
      description: 'ISO 639-1 code: zu (isiZulu), xh (isiXhosa), af (Afrikaans). When wired from upstream, accept the same.',
    },
  },
  config: {
    source_language: {
      type: 'select',
      default: 'en',
      label: 'Source language',
      description: 'The language the input text is in.',
      options: LANG_OPTIONS,
    },
  },
  outputs: {
    translatedText: { type: 'longtext', description: 'The model output translation. Editor sign-off recommended.' },
    glossaryHits: { type: 'json', description: 'Glossary entries whose source term appeared in the input — verify against the output.' },
    translationId: { type: 'string', description: 'Persisted translations row id, useful for downstream nodes that want to update the translation.' },
  },
  route: '/api/translation/translate',
  async run(input, ctx) {
    const cfg = resolveConfig('translator', input);
    const startedAt = Date.now();
    const { translationId, translatedText, modelId, glossaryHits, durationMs } = await runTranslation({
      sourceText: input.sourceText,
      sourceLanguage: cfg.source_language,
      targetLanguage: input.targetLanguage,
      context: ctx,
    });
    return {
      result: { translatedText, glossaryHits, translationId, modelId },
      cost: { costUsd: 0, model: modelId, inputTokens: 0, outputTokens: 0 },
      durationMs: durationMs || Date.now() - startedAt,
    };
  },
});
