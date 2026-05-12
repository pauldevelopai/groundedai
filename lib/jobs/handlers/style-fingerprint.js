// pg-boss handler for 'newsroom-profile.compute-fingerprint'.
//
// Reads either { documentIds: [...] } from archive_documents (preferred —
// uses each newsroom's own archive) or { texts: [...] } for ad-hoc. Calls
// the analyser, writes the result back to newsroom_profile.metadata
// .house_style_fingerprint. Never overwrites editor-authored voice / style_
// notes / ethics_policy.

const { pool } = require('../../db');
const { computeFingerprint } = require('../../newsroom-profile/style-fingerprint');

const QUEUE = 'newsroom-profile.compute-fingerprint';

async function handler(job) {
  const { newsroomId, documentIds, texts: rawTexts } = job.data || {};
  if (!newsroomId) throw new Error('compute-fingerprint: newsroomId required');

  let texts = [];

  if (Array.isArray(documentIds) && documentIds.length > 0) {
    const { rows } = await pool.query(
      `SELECT d.id, d.title,
              (SELECT string_agg(c.text, E'\n\n' ORDER BY c.chunk_index)
                 FROM archive_chunks c WHERE c.document_id = d.id) AS text,
              d.published_at
         FROM archive_documents d
        WHERE d.newsroom_id = $1 AND d.id = ANY($2)`,
      [newsroomId, documentIds]
    );
    texts = rows
      .filter((r) => r.text)
      .map((r) => ({ text: r.text, title: r.title, publishedAt: r.published_at }));
  } else if (Array.isArray(rawTexts) && rawTexts.length > 0) {
    // Ad-hoc path (used by tests + the editor's "paste some samples" mode)
    texts = rawTexts
      .filter((t) => t && typeof t.text === 'string' && t.text.length > 100)
      .map((t) => ({ text: t.text, title: t.title, publishedAt: t.publishedAt }));
  }

  if (texts.length === 0) {
    throw new Error('compute-fingerprint: no usable texts for this newsroom (need at least one document with chunks)');
  }

  // Pull geography from the profile so the place-name gazetteer gets the
  // newsroom's coverage area for free.
  const { rows: profRows } = await pool.query(
    `SELECT geography FROM newsroom_profiles WHERE newsroom_id = $1`,
    [newsroomId]
  );
  const geography = profRows[0]?.geography || [];

  const fingerprint = computeFingerprint({ texts, geography });

  // Merge into newsroom_profile.metadata.house_style_fingerprint. Never
  // touches voice / style_notes / ethics_policy.
  await pool.query(
    `INSERT INTO newsroom_profiles (newsroom_id, metadata)
     VALUES ($1, jsonb_build_object('house_style_fingerprint', $2::jsonb))
     ON CONFLICT (newsroom_id) DO UPDATE
        SET metadata = COALESCE(newsroom_profiles.metadata, '{}'::jsonb)
                         || jsonb_build_object('house_style_fingerprint', $2::jsonb),
            updated_at = NOW()`,
    [newsroomId, JSON.stringify(fingerprint)]
  );

  return { newsroomId, sourceCount: texts.length, computedAt: fingerprint.computed_at };
}

module.exports = { queue: QUEUE, handler };
