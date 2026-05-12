// Document metadata extraction.
//
// Most newsroom archives arrive as PDFs / DOCXs / TXTs with the title, byline,
// and publication date embedded in the first few hundred characters of the
// text. This pass uses Haiku to pull that structured metadata out and write
// it back to archive_documents (title, byline[], published_at, beat,
// story_type, canonical_url, source_url).
//
// We feed Haiku only the first ~2000 characters of the document text — that's
// where the byline and dateline live in essentially every news article and
// long-form piece. Cheaper than full-document scan, and the load-bearing
// signal is at the top.
//
// IDEMPOTENCY: writes archive_documents.metadata_extracted_at on success so
// re-runs are a no-op unless force=true. Editors can override any extracted
// value via the archive UI later; the extraction never overwrites editor-
// edited values (we only set columns that are still NULL — except when force).
//
// HALLUCINATION GUARD: published_at, byline, and other "specific factual"
// fields are only set if Haiku says it found them VERBATIM in the text. We
// don't accept inferences ("this looks like a 2024 article based on tone").

const { pool } = require('../db');
const { chat } = require('../claude');
const { parseClaudeJson } = require('../parse-claude-json');

const HEAD_CHARS = 2000;

const VALID_STORY_TYPES = new Set([
  'news', 'feature', 'investigation', 'opinion', 'review', 'profile', 'analysis', 'obituary',
]);

/**
 * Extract metadata for a document and write it back to archive_documents.
 *
 * @param {object} args
 * @param {string} args.documentId
 * @param {boolean} [args.force]  Overwrite existing extracted values.
 * @param {object} [args.context] Cost-logging context.
 * @returns {Promise<{ documentId, fieldsSet: string[], skipped: boolean, cost }>}
 */
async function extractMetadata({ documentId, force = false, context = {} }) {
  // Load document + first chunk
  const { rows: docs } = await pool.query(
    `SELECT id, newsroom_id, filename, title, published_at, byline, beat, source_url,
            canonical_url, story_type, metadata_extracted_at
       FROM archive_documents WHERE id = $1`,
    [documentId]
  );
  if (docs.length === 0) throw new Error(`Document ${documentId} not found`);
  const doc = docs[0];

  // Skip if already extracted and not forcing
  if (doc.metadata_extracted_at && !force) {
    return { documentId, fieldsSet: [], skipped: true, reason: 'already extracted', cost: null };
  }

  // Pull the first chunks (we'll concat up to HEAD_CHARS)
  const { rows: chunks } = await pool.query(
    `SELECT text FROM archive_chunks WHERE document_id = $1 ORDER BY chunk_index LIMIT 5`,
    [documentId]
  );
  if (chunks.length === 0) {
    return { documentId, fieldsSet: [], skipped: true, reason: 'no chunks', cost: null };
  }
  const head = chunks.map((c) => c.text).join('\n\n').slice(0, HEAD_CHARS);

  const system = `You extract bibliographic metadata from the opening of a news article. Be strict — only return fields you can identify VERBATIM in the text. Return null for fields not clearly present. Do not infer or guess.`;

  const userMsg = `Extract the metadata from the opening passage of this article. Return only JSON matching this shape:

{
  "title": "<headline as it appears, or null>",
  "byline": ["<author 1>", "<author 2>"],
  "published_at": "<YYYY-MM-DD if explicit date present, or null>",
  "beat": "<one word: politics | business | investigations | sport | culture | tech | health | environment | crime | local | general — or null>",
  "story_type": "<one of: news | feature | investigation | opinion | review | profile | analysis | obituary — or null>",
  "source_url": "<URL if explicitly listed as source/origin, or null>",
  "canonical_url": "<URL if explicitly listed as the canonical/original publication URL, or null>"
}

Rules:
- byline: array of author names exactly as printed. Strip "By " prefix. Empty array if no byline.
- published_at: ONLY if a complete explicit date is present. Reformat to YYYY-MM-DD. Otherwise null.
- title: the headline at the top of the piece, not a paraphrase.
- beat / story_type: only set if the framing is clear from the opening; otherwise null.
- source_url / canonical_url: only if literally present as a URL string.

Passage:
${head}

Return JSON only. Be conservative — null is the right answer when unsure.`;

  const { text: response, cost } = await chat({
    system,
    messages: [{ role: 'user', content: userMsg }],
    maxTokens: 1024,
    context: { ...context, agent: 'archivist', endpoint: 'archive-metadata' },
  });
  const parsed = parseClaudeJson(response) || {};

  // Sanitize + only set fields where Haiku gave us a non-null value AND
  // the doc doesn't already have a non-null value (unless force).
  const updates = {};
  const fieldsSet = [];

  function maybeSet(field, value) {
    if (value == null) return;
    if (value === '') return;
    if (!force && doc[field] != null && (typeof doc[field] !== 'object' || (Array.isArray(doc[field]) && doc[field].length > 0))) {
      return;
    }
    updates[field] = value;
    fieldsSet.push(field);
  }

  const title = typeof parsed.title === 'string' ? parsed.title.trim() : null;
  if (title) maybeSet('title', title);

  if (Array.isArray(parsed.byline) && parsed.byline.length > 0) {
    const cleaned = parsed.byline
      .filter((b) => typeof b === 'string')
      .map((b) => b.replace(/^By\s+/i, '').trim())
      .filter(Boolean);
    if (cleaned.length > 0) maybeSet('byline', cleaned);
  }

  if (typeof parsed.published_at === 'string') {
    const d = parsed.published_at.match(/^\d{4}-\d{2}-\d{2}$/) ? parsed.published_at : null;
    if (d) maybeSet('published_at', d);
  }

  const beat = typeof parsed.beat === 'string' ? parsed.beat.trim().toLowerCase() : null;
  if (beat) maybeSet('beat', beat);

  if (typeof parsed.story_type === 'string' && VALID_STORY_TYPES.has(parsed.story_type.trim().toLowerCase())) {
    maybeSet('story_type', parsed.story_type.trim().toLowerCase());
  }

  if (typeof parsed.source_url === 'string' && /^https?:\/\//.test(parsed.source_url)) {
    maybeSet('source_url', parsed.source_url.trim());
  }
  if (typeof parsed.canonical_url === 'string' && /^https?:\/\//.test(parsed.canonical_url)) {
    maybeSet('canonical_url', parsed.canonical_url.trim());
  }

  if (fieldsSet.length === 0) {
    // Still mark extraction attempted so we don't keep retrying every run
    await pool.query(
      `UPDATE archive_documents SET metadata_extracted_at = NOW() WHERE id = $1`,
      [documentId]
    );
    return { documentId, fieldsSet: [], skipped: false, cost };
  }

  // Build the dynamic UPDATE
  const sets = [];
  const params = [];
  for (const [field, value] of Object.entries(updates)) {
    sets.push(`${field} = $${params.length + 1}`);
    params.push(value);
  }
  sets.push('metadata_extracted_at = NOW()');
  params.push(documentId);
  await pool.query(
    `UPDATE archive_documents SET ${sets.join(', ')} WHERE id = $${params.length}`,
    params
  );

  return { documentId, fieldsSet, skipped: false, cost };
}

module.exports = { extractMetadata, VALID_STORY_TYPES };
