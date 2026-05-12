// Archive knowledge-graph ingestion orchestrator.
//
// Given a document_id, runs four passes:
//   1. metadata  — extract title / byline / published_at / beat / story_type
//                  (deferred to Slice 3; this slice records metadata as
//                  'completed' with 0 rows so the pipeline can proceed)
//   2. ner       — wikineural for universal types + Haiku for newsroom-
//                  defined custom types; resolves each mention against
//                  existing entities; inserts mention rows
//   3. relations — Haiku-driven subject-predicate-object extraction over
//                  pairs of co-mentioned entities
//   4. claims    — Haiku-driven atomic factual-claim extraction with
//                  optional entity references and BGE-M3 embedding
//
// Idempotent: each pass writes to archive_ingestion_runs (UNIQUE on
// document_id + pass) so re-runs update in place. To force re-extraction,
// delete the row(s) for that document.
//
// Per-chunk processing: NER and Haiku passes run on individual archive_chunks
// rather than full document text. Chunks are ~500 words = ~700 tokens, well
// within Haiku's window. Mentions store chunk_id + char_start/char_end
// relative to that chunk. This keeps the unit of work small and the Haiku
// calls cheap.

const { pool } = require('../db');
const { extractEntities: extractUniversalEntities } = require('../social/ner');
const { embedQuery } = require('../storage/embed');
const { listForNewsroom, findBySlug, seedUniversalTypes } = require('./entity_types');
const { resolveOrCreate } = require('./resolve');
const { extractCustomEntities, extractRelations, extractClaims } = require('./extract');

// Map wikineural tag (PER/ORG/LOC/MISC) → universal type slug
const UNIVERSAL_TAG_TO_SLUG = {
  PER: 'person',
  ORG: 'organisation',
  LOC: 'place',
  MISC: 'misc',
};

/**
 * Run the full ingestion pipeline for a document.
 *
 * @param {object} args
 * @param {string} args.documentId
 * @param {string[]} [args.passes]  Default: all four. Order matters.
 * @param {boolean} [args.force]    Re-run even if already completed.
 * @param {object} [args.context]   Cost-logging context.
 */
async function ingestDocument({ documentId, passes, force = false, context = {} }) {
  if (!documentId) throw new Error('ingestDocument: documentId required');
  passes = passes || ['metadata', 'ner', 'relations', 'claims'];

  // Load document + newsroom
  const { rows: docs } = await pool.query(
    `SELECT id, newsroom_id, title, filename, status FROM archive_documents WHERE id = $1`,
    [documentId]
  );
  if (docs.length === 0) throw new Error(`Document ${documentId} not found`);
  const doc = docs[0];
  if (doc.status !== 'ready') {
    throw new Error(`Document ${documentId} is not ready (status=${doc.status})`);
  }
  const newsroomId = doc.newsroom_id;

  // Ensure universal types are seeded
  await seedUniversalTypes();

  const summary = {};
  for (const pass of passes) {
    summary[pass] = await runPass({ pass, doc, newsroomId, force, context });
  }
  return { documentId, summary };
}

/**
 * Run one pass, recording the start/complete in archive_ingestion_runs.
 * Idempotent — re-runs the work and updates the row in place.
 */
async function runPass({ pass, doc, newsroomId, force, context }) {
  // Skip if already completed and not forced
  const { rows: prev } = await pool.query(
    `SELECT id, status FROM archive_ingestion_runs WHERE document_id = $1 AND pass = $2`,
    [doc.id, pass]
  );
  if (prev.length > 0 && prev[0].status === 'completed' && !force) {
    return { pass, status: 'skipped', reason: 'already completed' };
  }

  // Upsert run row, mark running
  await pool.query(
    `INSERT INTO archive_ingestion_runs (newsroom_id, document_id, pass, status, started_at)
     VALUES ($1, $2, $3, 'running', NOW())
     ON CONFLICT (document_id, pass) DO UPDATE
        SET status = 'running', started_at = NOW(), error = NULL, updated_at = NOW()`,
    [newsroomId, doc.id, pass]
  );

  try {
    let rowsAdded = 0;
    let costUsd = 0;

    if (pass === 'metadata') {
      // Slice 3 will fill this in. For now, no-op so ner/relations/claims
      // can run on documents without explicit metadata extraction.
      rowsAdded = 0;
    } else if (pass === 'ner') {
      const r = await runNerPass({ doc, newsroomId, context });
      rowsAdded = r.rowsAdded;
      costUsd = r.costUsd;
    } else if (pass === 'relations') {
      const r = await runRelationsPass({ doc, newsroomId, context });
      rowsAdded = r.rowsAdded;
      costUsd = r.costUsd;
    } else if (pass === 'claims') {
      const r = await runClaimsPass({ doc, newsroomId, context });
      rowsAdded = r.rowsAdded;
      costUsd = r.costUsd;
    } else {
      throw new Error(`Unknown pass: ${pass}`);
    }

    await pool.query(
      `UPDATE archive_ingestion_runs
          SET status = 'completed', rows_added = $1, cost_usd = $2, completed_at = NOW(), updated_at = NOW()
        WHERE document_id = $3 AND pass = $4`,
      [rowsAdded, costUsd, doc.id, pass]
    );
    return { pass, status: 'completed', rowsAdded, costUsd };
  } catch (err) {
    await pool.query(
      `UPDATE archive_ingestion_runs
          SET status = 'failed', error = $1, completed_at = NOW(), updated_at = NOW()
        WHERE document_id = $2 AND pass = $3`,
      [err.message || String(err), doc.id, pass]
    );
    return { pass, status: 'failed', error: err.message };
  }
}

// ─── NER pass ───────────────────────────────────────────────────────────────
// Run wikineural over each chunk for universal types, plus Haiku for any
// newsroom-defined custom types. Resolve each mention → insert mention rows.

async function runNerPass({ doc, newsroomId, context }) {
  // Load chunks
  const { rows: chunks } = await pool.query(
    `SELECT id, text FROM archive_chunks WHERE document_id = $1 ORDER BY chunk_index ASC`,
    [doc.id]
  );
  if (chunks.length === 0) return { rowsAdded: 0, costUsd: 0 };

  // Build universal-type id map (slug → type_id)
  const types = await listForNewsroom(newsroomId);
  const universalTypeIds = {};
  for (const t of types) {
    if (t.kind === 'universal') universalTypeIds[t.slug] = t.id;
  }
  const customTypes = types.filter((t) => t.kind === 'newsroom');

  // Delete prior mentions for this document so re-runs don't duplicate
  await pool.query(`DELETE FROM archive_entity_mentions WHERE document_id = $1`, [doc.id]);

  let rowsAdded = 0;
  let costUsd = 0;

  for (const chunk of chunks) {
    // Universal NER via wikineural
    const ner = await extractUniversalEntities(chunk.text);
    const universalMentions = [];
    for (const r of ner.raw) {
      const slug = UNIVERSAL_TAG_TO_SLUG[r.type];
      if (!slug) continue;
      const typeId = universalTypeIds[slug];
      if (!typeId) continue;
      // wikineural exports often don't populate start/end. Fall back to
      // locating the surface text in the chunk via indexOf. We accept the
      // first occurrence — duplicates within a chunk still get mentions
      // resolved to the same canonical entity downstream.
      let charStart = r.start;
      let charEnd = r.end;
      if (charStart == null || charEnd == null || charEnd <= charStart) {
        const idx = chunk.text.indexOf(r.text);
        if (idx < 0) continue;
        charStart = idx;
        charEnd = idx + r.text.length;
      }
      universalMentions.push({
        typeId,
        surface_text: r.text,
        char_start: charStart,
        char_end: charEnd,
        confidence: Math.min(1, Math.max(0, r.score || 0.8)),
        extracted_by: 'wikineural',
      });
    }

    // Custom-type NER via Haiku (only if newsroom has defined custom types)
    let customMentions = [];
    if (customTypes.length > 0) {
      const customResult = await extractCustomEntities({
        text: chunk.text,
        customTypes,
        context: { ...context, newsroomId },
      });
      if (customResult.cost) costUsd += Number(customResult.cost.costUsd || 0);
      for (const m of customResult.mentions) {
        const type = customTypes.find((t) => t.slug === m.type_slug);
        if (!type) continue;
        customMentions.push({
          typeId: type.id,
          surface_text: m.surface_text,
          char_start: m.char_start,
          char_end: m.char_end,
          confidence: m.confidence,
          extracted_by: 'haiku',
        });
      }
    }

    // Resolve and insert each mention
    for (const m of [...universalMentions, ...customMentions]) {
      const { entity } = await resolveOrCreate({
        newsroomId,
        typeId: m.typeId,
        surfaceText: m.surface_text,
      });
      await pool.query(
        `INSERT INTO archive_entity_mentions
           (newsroom_id, entity_id, document_id, chunk_id, char_start, char_end,
            surface_text, confidence, extracted_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          newsroomId, entity.id, doc.id, chunk.id,
          m.char_start, m.char_end, m.surface_text, m.confidence, m.extracted_by,
        ]
      );
      rowsAdded++;
    }
  }

  return { rowsAdded, costUsd };
}

// ─── Relations pass ─────────────────────────────────────────────────────────
// For each chunk, gather the entities mentioned within it; pass that list +
// the chunk text to Haiku for triple extraction.

async function runRelationsPass({ doc, newsroomId, context }) {
  const { rows: chunks } = await pool.query(
    `SELECT id, text FROM archive_chunks WHERE document_id = $1 ORDER BY chunk_index ASC`,
    [doc.id]
  );
  if (chunks.length === 0) return { rowsAdded: 0, costUsd: 0 };

  // Wipe prior relationships for this document so re-runs don't duplicate
  await pool.query(`DELETE FROM archive_relationships WHERE document_id = $1`, [doc.id]);

  let rowsAdded = 0;
  let costUsd = 0;

  for (const chunk of chunks) {
    // Collect distinct entities mentioned in this chunk
    const { rows: ents } = await pool.query(
      `SELECT DISTINCT e.id, e.canonical_name, t.slug AS type_slug
         FROM archive_entity_mentions m
         JOIN archive_entities e ON e.id = m.entity_id
         JOIN archive_entity_types t ON t.id = e.type_id
        WHERE m.chunk_id = $1`,
      [chunk.id]
    );
    if (ents.length < 2) continue; // need at least two entities for a relation

    const { triples, cost } = await extractRelations({
      text: chunk.text,
      entities: ents,
      context: { ...context, newsroomId },
    });
    if (cost) costUsd += Number(cost.costUsd || 0);

    for (const t of triples) {
      await pool.query(
        `INSERT INTO archive_relationships
           (newsroom_id, subject_entity_id, predicate, object_entity_id,
            document_id, confidence, evidence_text, char_offset, extracted_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'haiku')`,
        [
          newsroomId, t.subject_entity_id, t.predicate, t.object_entity_id,
          doc.id, t.confidence, t.evidence_text, t.char_offset,
        ]
      );
      rowsAdded++;
    }
  }

  return { rowsAdded, costUsd };
}

// ─── Claims pass ───────────────────────────────────────────────────────────
// Per chunk, extract atomic factual claims; embed each claim with BGE-M3;
// inherit document byline / published_at into the claim.

async function runClaimsPass({ doc, newsroomId, context }) {
  // Load document metadata + chunks
  const { rows: docRows } = await pool.query(
    `SELECT published_at, byline FROM archive_documents WHERE id = $1`,
    [doc.id]
  );
  const docMeta = docRows[0] || {};

  const { rows: chunks } = await pool.query(
    `SELECT id, text FROM archive_chunks WHERE document_id = $1 ORDER BY chunk_index ASC`,
    [doc.id]
  );
  if (chunks.length === 0) return { rowsAdded: 0, costUsd: 0 };

  await pool.query(`DELETE FROM archive_claims WHERE document_id = $1`, [doc.id]);

  let rowsAdded = 0;
  let costUsd = 0;

  for (const chunk of chunks) {
    // Entities in this chunk (Haiku gets these as candidate subjects/objects)
    const { rows: ents } = await pool.query(
      `SELECT DISTINCT e.id, e.canonical_name
         FROM archive_entity_mentions m
         JOIN archive_entities e ON e.id = m.entity_id
        WHERE m.chunk_id = $1`,
      [chunk.id]
    );

    const { claims, cost } = await extractClaims({
      text: chunk.text,
      entities: ents,
      context: { ...context, newsroomId },
    });
    if (cost) costUsd += Number(cost.costUsd || 0);

    for (const c of claims) {
      const embedding = await embedQuery(c.claim_text);
      const vectorLiteral = '[' + embedding.join(',') + ']';
      await pool.query(
        `INSERT INTO archive_claims
           (newsroom_id, document_id, chunk_id, claim_text, subject_entity_id,
            predicate, object_entity_id, asserted_at, byline, confidence,
            embedding, evidence_text, char_offset, extracted_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::vector, $12, $13, 'haiku')`,
        [
          newsroomId, doc.id, chunk.id, c.claim_text, c.subject_entity_id,
          c.predicate, c.object_entity_id, docMeta.published_at || null,
          docMeta.byline || null, c.confidence, vectorLiteral,
          c.evidence_text, c.char_offset,
        ]
      );
      rowsAdded++;
    }
  }

  return { rowsAdded, costUsd };
}

module.exports = { ingestDocument };
