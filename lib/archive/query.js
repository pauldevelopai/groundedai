// Archive query primitives. Pure SQL + pgvector + recursive CTEs — no LLM.
//
// The Archivist agent (lib/agents/archivist.js) sits on top of these and
// uses Haiku to interpret a natural-language question, route to the right
// primitive, and synthesize a cited answer. The primitives themselves are
// deterministic and re-usable from any agent or the workspace UI.
//
// Every primitive enforces newsroom_id at the SQL level — no cross-tenant
// leak path even if a UI bug passes the wrong id.

const { pool } = require('../db');
const { embedQuery } = require('../storage/embed');

// ─── Entity lookup ─────────────────────────────────────────────────────────
// Find entities matching a free-text query. Hybrid: trigram on canonical_name
// + cosine on embedding. Returns top-K with both scores so callers can decide
// which to pick. Used by the Archivist agent to resolve "who is Ramaphosa" →
// an entity_id before walking the graph.

async function fuzzyEntitySearch({ newsroomId, query, k = 5, typeSlug }) {
  const q = (query || '').trim();
  if (!q) return [];
  const embedding = await embedQuery(q);
  const vec = '[' + embedding.join(',') + ']';

  // Filter by type if requested. Universal types use newsroom_id IS NULL.
  let typeFilter = '';
  const params = [newsroomId, q, vec, k];
  if (typeSlug) {
    typeFilter = `AND t.slug = $${params.length + 1}`;
    params.push(typeSlug);
  }

  const { rows } = await pool.query(
    `SELECT e.id, e.canonical_name, e.surface_forms, e.mention_count,
            t.slug AS type_slug, t.label AS type_label, t.kind AS type_kind,
            similarity(e.canonical_name, $2) AS trgm_sim,
            1 - (e.embedding <=> $3::vector) AS cos_sim,
            -- Composite: weighted sum so a trigram hit on a long surface form
            -- still ranks above an embedding-only near-miss
            (0.6 * similarity(e.canonical_name, $2)) + (0.4 * (1 - (e.embedding <=> $3::vector))) AS score
       FROM archive_entities e
       JOIN archive_entity_types t ON t.id = e.type_id
      WHERE e.newsroom_id = $1
        AND e.embedding IS NOT NULL
        ${typeFilter}
      ORDER BY score DESC
      LIMIT $4`,
    params
  );
  return rows.map((r) => ({
    id: r.id,
    canonical_name: r.canonical_name,
    surface_forms: r.surface_forms || [],
    mention_count: r.mention_count,
    type_slug: r.type_slug,
    type_label: r.type_label,
    type_kind: r.type_kind,
    trgm_sim: Number(r.trgm_sim),
    cos_sim: Number(r.cos_sim),
    score: Number(r.score),
  }));
}

// ─── Entity profile (with optional time cutoff) ────────────────────────────
// Return everything we know about an entity: type, surface_forms, top
// relationships, top claims, documents that mention it. The `asOf` parameter
// scopes claims to those asserted_at <= asOf — answers "what did we know
// about X as of date Y".

async function entityProfile({ newsroomId, entityId, asOf, claimLimit = 20, relLimit = 20, docLimit = 10 }) {
  // Entity row
  const { rows: ents } = await pool.query(
    `SELECT e.id, e.canonical_name, e.surface_forms, e.mention_count, e.metadata,
            e.first_seen_at, e.last_seen_at, e.wikidata_qid,
            t.slug AS type_slug, t.label AS type_label, t.kind AS type_kind
       FROM archive_entities e
       JOIN archive_entity_types t ON t.id = e.type_id
      WHERE e.id = $1 AND e.newsroom_id = $2`,
    [entityId, newsroomId]
  );
  if (ents.length === 0) return null;
  const entity = ents[0];

  // Top relationships where this entity is subject OR object
  const asOfClause = asOf ? `AND d.published_at IS NOT NULL AND d.published_at <= $3` : '';
  const relParams = asOf ? [entityId, newsroomId, asOf, relLimit] : [entityId, newsroomId, relLimit];
  const relLimitIdx = relParams.length;

  const { rows: rels } = await pool.query(
    `SELECT r.predicate,
            r.confidence,
            r.evidence_text,
            r.document_id,
            d.title AS document_title, d.published_at, d.byline,
            CASE WHEN r.subject_entity_id = $1 THEN 'outgoing' ELSE 'incoming' END AS direction,
            CASE WHEN r.subject_entity_id = $1 THEN o.id ELSE s.id END AS other_id,
            CASE WHEN r.subject_entity_id = $1 THEN o.canonical_name ELSE s.canonical_name END AS other_name,
            CASE WHEN r.subject_entity_id = $1 THEN ot.slug ELSE st.slug END AS other_type
       FROM archive_relationships r
       JOIN archive_entities s ON s.id = r.subject_entity_id
       JOIN archive_entities o ON o.id = r.object_entity_id
       JOIN archive_entity_types st ON st.id = s.type_id
       JOIN archive_entity_types ot ON ot.id = o.type_id
       JOIN archive_documents d ON d.id = r.document_id
      WHERE (r.subject_entity_id = $1 OR r.object_entity_id = $1)
        AND r.newsroom_id = $2
        ${asOfClause}
      ORDER BY r.confidence DESC, d.published_at DESC NULLS LAST
      LIMIT $${relLimitIdx}`,
    relParams
  );

  // Top claims about this entity (subject OR object)
  const claimParams = asOf ? [entityId, newsroomId, asOf, claimLimit] : [entityId, newsroomId, claimLimit];
  const claimLimitIdx = claimParams.length;
  const { rows: claims } = await pool.query(
    `SELECT c.id, c.claim_text, c.evidence_text, c.confidence,
            c.asserted_at, c.byline, c.document_id,
            d.title AS document_title, d.canonical_url, d.source_url
       FROM archive_claims c
       JOIN archive_documents d ON d.id = c.document_id
      WHERE (c.subject_entity_id = $1 OR c.object_entity_id = $1)
        AND c.newsroom_id = $2
        ${asOf ? 'AND c.asserted_at IS NOT NULL AND c.asserted_at <= $3' : ''}
      ORDER BY c.asserted_at DESC NULLS LAST, c.confidence DESC
      LIMIT $${claimLimitIdx}`,
    claimParams
  );

  // Documents that mention this entity
  const docParams = asOf ? [entityId, newsroomId, asOf, docLimit] : [entityId, newsroomId, docLimit];
  const docLimitIdx = docParams.length;
  const { rows: docs } = await pool.query(
    `SELECT d.id, d.title, d.published_at, d.byline, d.beat, d.story_type,
            COUNT(m.id) AS mentions_in_doc
       FROM archive_entity_mentions m
       JOIN archive_documents d ON d.id = m.document_id
      WHERE m.entity_id = $1 AND m.newsroom_id = $2
        ${asOf ? 'AND (d.published_at IS NULL OR d.published_at <= $3)' : ''}
   GROUP BY d.id
   ORDER BY d.published_at DESC NULLS LAST, mentions_in_doc DESC
      LIMIT $${docLimitIdx}`,
    docParams
  );

  return { entity, relationships: rels, claims, documents: docs };
}

// ─── Graph walk (recursive CTE) ────────────────────────────────────────────
// "Two-hop walk from X" — useful for the entity-graph view in the UI and for
// answering "who is connected to X?" queries. Cycle-safe via the visited path.

async function walkGraph({ newsroomId, startEntityId, depth = 2, predicateFilter }) {
  const predicateClause = predicateFilter && predicateFilter.length > 0
    ? `AND r.predicate = ANY($4::text[])`
    : '';
  const params = predicateClause
    ? [startEntityId, depth, newsroomId, predicateFilter]
    : [startEntityId, depth, newsroomId];

  const { rows } = await pool.query(
    `WITH RECURSIVE walk AS (
       -- Seed: outgoing AND incoming edges from the start entity
       SELECT r.id AS edge_id, r.subject_entity_id, r.predicate, r.object_entity_id,
              r.confidence, r.document_id, 1 AS depth,
              ARRAY[r.subject_entity_id, r.object_entity_id] AS path
         FROM archive_relationships r
        WHERE (r.subject_entity_id = $1 OR r.object_entity_id = $1)
          AND r.newsroom_id = $3
          ${predicateClause}

       UNION ALL

       -- Step: from each frontier entity, follow edges we haven't visited
       SELECT r.id, r.subject_entity_id, r.predicate, r.object_entity_id,
              r.confidence, r.document_id, w.depth + 1,
              w.path || CASE WHEN r.subject_entity_id = ANY(w.path)
                             THEN r.object_entity_id ELSE r.subject_entity_id END
         FROM archive_relationships r
         JOIN walk w ON (r.subject_entity_id = ANY(w.path) OR r.object_entity_id = ANY(w.path))
        WHERE w.depth < $2
          AND r.newsroom_id = $3
          AND NOT (r.subject_entity_id = ANY(w.path) AND r.object_entity_id = ANY(w.path))
          ${predicateClause}
     )
     SELECT DISTINCT w.depth, w.subject_entity_id, w.predicate, w.object_entity_id,
            w.confidence, w.document_id,
            s.canonical_name AS subject_name, st.slug AS subject_type,
            o.canonical_name AS object_name, ot.slug AS object_type,
            d.title AS document_title, d.published_at
       FROM walk w
       JOIN archive_entities s ON s.id = w.subject_entity_id
       JOIN archive_entities o ON o.id = w.object_entity_id
       JOIN archive_entity_types st ON st.id = s.type_id
       JOIN archive_entity_types ot ON ot.id = o.type_id
       JOIN archive_documents d ON d.id = w.document_id
      ORDER BY w.depth, w.confidence DESC`,
    params
  );
  return rows;
}

// ─── Semantic claim search ─────────────────────────────────────────────────
// BGE-M3 cosine over archive_claims.claim_text. Returns top-K claims similar
// to a free-text proposition. Useful for "find claims that support / contradict
// this statement" or when no entity match exists for a question.

async function semanticClaimSearch({ newsroomId, query, k = 10, asOf }) {
  const q = (query || '').trim();
  if (!q) return [];
  const embedding = await embedQuery(q);
  const vec = '[' + embedding.join(',') + ']';
  const params = asOf ? [newsroomId, vec, asOf, k] : [newsroomId, vec, k];
  const asOfClause = asOf ? 'AND c.asserted_at IS NOT NULL AND c.asserted_at <= $3' : '';
  const limitIdx = params.length;
  const { rows } = await pool.query(
    `SELECT c.id, c.claim_text, c.evidence_text, c.asserted_at, c.byline,
            c.confidence, c.document_id,
            d.title AS document_title, d.canonical_url, d.source_url,
            1 - (c.embedding <=> $2::vector) AS similarity
       FROM archive_claims c
       JOIN archive_documents d ON d.id = c.document_id
      WHERE c.newsroom_id = $1 AND c.embedding IS NOT NULL
        ${asOfClause}
      ORDER BY c.embedding <=> $2::vector
      LIMIT $${limitIdx}`,
    params
  );
  return rows.map((r) => ({ ...r, similarity: Number(r.similarity) }));
}

// ─── Chunk-level fallback search ───────────────────────────────────────────
// When entity lookup AND claim search both miss, fall back to the existing
// passage retrieval (BGE-M3 cosine over archive_chunks). Keeps "fuzzy
// questions with no clear entity" working.

async function semanticChunkSearch({ newsroomId, query, k = 10 }) {
  const q = (query || '').trim();
  if (!q) return [];
  const embedding = await embedQuery(q);
  const vec = '[' + embedding.join(',') + ']';
  const { rows } = await pool.query(
    `SELECT c.id, c.text, c.chunk_index, c.document_id,
            d.title AS document_title, d.byline, d.published_at,
            1 - (c.embedding <=> $2::vector) AS similarity
       FROM archive_chunks c
       JOIN archive_documents d ON d.id = c.document_id
      WHERE c.newsroom_id = $1 AND c.embedding IS NOT NULL
      ORDER BY c.embedding <=> $2::vector
      LIMIT $3`,
    [newsroomId, vec, k]
  );
  return rows.map((r) => ({ ...r, similarity: Number(r.similarity) }));
}

// ─── Timeline for an entity ────────────────────────────────────────────────
// Claims about an entity in chronological order. Used by the UI's claim
// timeline view.

async function entityTimeline({ newsroomId, entityId, fromDate, toDate }) {
  const conditions = [`c.newsroom_id = $1`, `(c.subject_entity_id = $2 OR c.object_entity_id = $2)`];
  const params = [newsroomId, entityId];
  if (fromDate) {
    params.push(fromDate);
    conditions.push(`c.asserted_at >= $${params.length}`);
  }
  if (toDate) {
    params.push(toDate);
    conditions.push(`c.asserted_at <= $${params.length}`);
  }

  const { rows } = await pool.query(
    `SELECT c.id, c.claim_text, c.asserted_at, c.byline, c.confidence,
            c.document_id, d.title AS document_title
       FROM archive_claims c
       JOIN archive_documents d ON d.id = c.document_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY c.asserted_at ASC NULLS LAST`,
    params
  );
  return rows;
}

module.exports = {
  fuzzyEntitySearch,
  entityProfile,
  walkGraph,
  semanticClaimSearch,
  semanticChunkSearch,
  entityTimeline,
};
