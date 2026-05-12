// Entity resolution: given a (surface_text, entity_type_slug), find an
// existing archive_entities row for this newsroom that's the SAME entity, or
// create a new one.
//
// HYBRID HEURISTIC. BGE-M3 embeddings alone don't reliably catch name variants
// — measured on a set of South African political names:
//
//   "Cyril Ramaphosa" ↔ "President Ramaphosa"   embed=0.82  trigram=0.38
//   "Cyril Ramaphosa" ↔ "C. Ramaphosa"          embed=0.81  trigram=0.65
//   "Cyril Ramaphosa" ↔ "Ramaphosa"             embed=0.86  trigram=0.63
//   "Cyril Ramaphosa" ↔ "Cyril Sigcau"          embed=0.50  trigram=0.26  (DIFFERENT PERSON)
//   "Cyril Ramaphosa" ↔ "Hakainde Hichilema"    embed=0.30  trigram=0.00
//
// So we require BOTH:
//   embedding cosine >= EMBED_THRESHOLD (0.70)  — catches semantic equivalence
//   trigram similarity >= TRGM_THRESHOLD (0.30) — rules out same-first-name confusions
//
// This intentionally misses:
//   acronyms ("ANC" ↔ "African National Congress" — embed 0.62, trigram 0.03)
//   nicknames ("Johannesburg" ↔ "Jozi" — embed 0.50, trigram 0.13)
//
// Those need a curated alias table or editor-mediated merge in the UI. Slice 5
// will surface a "merge entities" action. For pilot, an acronym and its
// expansion will create two entities; that's an honest limitation.

const { pool } = require('../db');
const { embedQuery } = require('../storage/embed');

const EMBED_THRESHOLD = 0.70;
const TRGM_THRESHOLD = 0.30;

/**
 * Resolve or create an entity. Returns the entity row + whether it was newly
 * created. Idempotent across re-runs of the ingestion pipeline.
 *
 * @param {object} args
 * @param {string} args.newsroomId
 * @param {string} args.typeId            archive_entity_types.id
 * @param {string} args.surfaceText       what appeared in the document
 * @param {number[]} [args.embedding]     pre-computed; if absent, we compute via BGE-M3
 * @returns {Promise<{ entity: object, created: boolean }>}
 */
async function resolveOrCreate({ newsroomId, typeId, surfaceText, embedding }) {
  const surface = (surfaceText || '').trim();
  if (!surface) throw new Error('resolveOrCreate: surfaceText required');

  if (!embedding) {
    embedding = await embedQuery(surface);
  }
  const vectorLiteral = '[' + embedding.join(',') + ']';

  // Find the top-N nearest candidates by embedding, then filter by trigram
  // similarity in the same query. ORDER BY embedding distance, return first
  // row that passes both thresholds.
  const maxDistance = 1 - EMBED_THRESHOLD;
  const { rows: candidates } = await pool.query(
    `SELECT id, canonical_name, surface_forms, mention_count,
            (embedding <=> $1::vector) AS distance,
            similarity(canonical_name, $4) AS trgm_sim
       FROM archive_entities
      WHERE newsroom_id = $2
        AND type_id = $3
        AND embedding IS NOT NULL
        AND (embedding <=> $1::vector) <= $5
      ORDER BY embedding <=> $1::vector
      LIMIT 10`,
    [vectorLiteral, newsroomId, typeId, surface, maxDistance]
  );

  // First candidate that also passes the trigram threshold — or check
  // surface_forms[] for an exact-case-insensitive hit (handles "C. Ramaphosa"
  // being added to "Cyril Ramaphosa"'s surface_forms later then queried again).
  for (const c of candidates) {
    const trgmOk = Number(c.trgm_sim) >= TRGM_THRESHOLD;
    const surfaceFormHit = (c.surface_forms || []).some(
      (s) => s.toLowerCase() === surface.toLowerCase()
    );
    if (trgmOk || surfaceFormHit) {
      // De-duplicate surface_forms and append if new
      const existingForms = c.surface_forms || [];
      const seen = new Set(existingForms.map((s) => s.toLowerCase()));
      if (!seen.has(surface.toLowerCase())) {
        existingForms.push(surface);
      }
      const { rows: [updated] } = await pool.query(
        `UPDATE archive_entities
            SET surface_forms = $1,
                mention_count = mention_count + 1,
                last_seen_at = NOW(),
                updated_at = NOW()
          WHERE id = $2
        RETURNING *`,
        [existingForms, c.id]
      );
      return { entity: updated, created: false };
    }
  }

  // No match — create a new canonical entity
  const { rows: [created] } = await pool.query(
    `INSERT INTO archive_entities
       (newsroom_id, type_id, canonical_name, surface_forms, embedding, mention_count)
     VALUES ($1, $2, $3, ARRAY[$3], $4::vector, 1)
     RETURNING *`,
    [newsroomId, typeId, surface, vectorLiteral]
  );
  return { entity: created, created: true };
}

async function resolveBatch({ newsroomId, mentions }) {
  const out = [];
  for (const m of mentions) {
    out.push(
      await resolveOrCreate({
        newsroomId,
        typeId: m.typeId,
        surfaceText: m.surfaceText,
        embedding: m.embedding,
      })
    );
  }
  return out;
}

/**
 * Manually merge entity B into entity A. All mentions, relationships, claims
 * pointing at B get re-pointed at A. Surface_forms are unioned. B is deleted.
 * Used by the Slice 5 UI when an editor sees two entities that should be one
 * (e.g. "ANC" and "African National Congress").
 */
async function mergeEntities({ newsroomId, keepId, mergeId }) {
  if (keepId === mergeId) throw new Error('mergeEntities: keepId and mergeId must differ');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Verify both entities exist and belong to this newsroom
    const { rows: ents } = await client.query(
      `SELECT id, canonical_name, surface_forms FROM archive_entities
        WHERE newsroom_id = $1 AND id IN ($2, $3) FOR UPDATE`,
      [newsroomId, keepId, mergeId]
    );
    if (ents.length !== 2) throw new Error('mergeEntities: both entities must exist in this newsroom');
    const keep = ents.find((e) => e.id === keepId);
    const merge = ents.find((e) => e.id === mergeId);

    // Union surface_forms
    const allForms = [...(keep.surface_forms || []), ...(merge.surface_forms || [])];
    const seen = new Set();
    const uniqForms = [];
    for (const s of allForms) {
      const k = s.toLowerCase();
      if (!seen.has(k)) { seen.add(k); uniqForms.push(s); }
    }

    // Re-point references
    await client.query('UPDATE archive_entity_mentions SET entity_id = $1 WHERE entity_id = $2', [keepId, mergeId]);
    await client.query('UPDATE archive_relationships SET subject_entity_id = $1 WHERE subject_entity_id = $2', [keepId, mergeId]);
    await client.query('UPDATE archive_relationships SET object_entity_id = $1 WHERE object_entity_id = $2', [keepId, mergeId]);
    await client.query('UPDATE archive_claims SET subject_entity_id = $1 WHERE subject_entity_id = $2', [keepId, mergeId]);
    await client.query('UPDATE archive_claims SET object_entity_id = $1 WHERE object_entity_id = $2', [keepId, mergeId]);

    // Refresh keep entity (mention_count, surface_forms)
    await client.query(
      `UPDATE archive_entities
          SET surface_forms = $1,
              mention_count = (SELECT COUNT(*) FROM archive_entity_mentions WHERE entity_id = $2),
              updated_at = NOW()
        WHERE id = $2`,
      [uniqForms, keepId]
    );

    // Delete the merged-away entity
    await client.query('DELETE FROM archive_entities WHERE id = $1', [mergeId]);

    await client.query('COMMIT');
    return { keepId, mergedSurfaceFormCount: uniqForms.length };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

module.exports = {
  resolveOrCreate,
  resolveBatch,
  mergeEntities,
  EMBED_THRESHOLD,
  TRGM_THRESHOLD,
};
