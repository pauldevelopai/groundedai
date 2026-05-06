// POST /api/research/dossiers/:id/analyze
//
// Runs the Researcher agent across every PARSED document in the dossier
// that has not already been analyzed. Merges results into research_entities
// (dedup by normalized_name within the dossier — increments mention_count),
// research_relationships, and research_findings. Marks each document
// 'analyzed' on success.
//
// Body (optional):
//   {
//     depth: 'quick' | 'thorough' | 'forensic',
//     jurisdiction: 'none' | 'SA' | 'ZW' | 'ZM' | 'KE',
//     coverage: 'basic' | 'full' | 'financial',
//     generate_questions?: boolean,
//     suggest_records?: boolean,
//     max_entities?: number,
//     reanalyze?: boolean         // re-run on already-analyzed docs (default false)
//   }
//
// Response:
//   {
//     analyzed: <number>,
//     entities_created: <number>,
//     entities_updated: <number>,
//     relationships_created: <number>,
//     findings_created: <number>,
//     totalCost: { costUsd, inputTokens, outputTokens },
//     durationMs: <number>,
//     errors: [{ document_id, message }]   // present only if some docs failed
//   }

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';
const { analyzeText } = require('@/lib/agents/researcher');
const { search: archivistSearch } = require('@/lib/agents/archivist');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalise(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

type AnalyzeBody = {
  depth?: 'quick' | 'thorough' | 'forensic';
  jurisdiction?: 'none' | 'SA' | 'ZW' | 'ZM' | 'KE';
  coverage?: 'basic' | 'full' | 'financial';
  generate_questions?: boolean;
  suggest_records?: boolean;
  max_entities?: number;
  reanalyze?: boolean;
  archive_cross_reference?: boolean;        // default true
  archive_top_k_per_entity?: number;        // default 3
  archive_min_similarity?: number;          // default 0.3
};

type EntityOut = { kind?: string; name?: string; role?: string; metadata?: Record<string, unknown> };
type RelOut = { from?: string; to?: string; kind?: string; evidence?: string };
type FindingOut = { body?: string; rationale?: string; confidence?: number };

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (session.role !== 'builder' && session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — builder role required' }, { status: 403 });
  }
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid dossier id' }, { status: 400 });

  const dossierRows = await pool.query(
    `SELECT id, newsroom_id FROM research_dossiers WHERE id = $1`,
    [id]
  );
  if (dossierRows.rows.length === 0) {
    return NextResponse.json({ error: 'Dossier not found' }, { status: 404 });
  }
  if (dossierRows.rows[0].newsroom_id !== session.newsroomId) {
    return NextResponse.json({ error: 'Dossier not found' }, { status: 404 });
  }

  let body: AnalyzeBody = {};
  try {
    body = (await req.json()) as AnalyzeBody;
  } catch {
    // body is optional
  }

  const reanalyze = !!body.reanalyze;
  const docsRes = await pool.query(
    `SELECT id, filename, raw_text
       FROM research_documents
      WHERE dossier_id = $1
        AND status = ${reanalyze ? "ANY(ARRAY['parsed','analyzed'])" : "'parsed'"}
        AND raw_text IS NOT NULL`,
    [id]
  );
  const docs = docsRes.rows as Array<{ id: string; filename: string; raw_text: string }>;
  if (docs.length === 0) {
    return NextResponse.json(
      { error: reanalyze ? 'No parsed documents to re-analyze' : 'No new parsed documents to analyze (use reanalyze:true to re-run)' },
      { status: 422 }
    );
  }

  const startedAt = Date.now();
  let entitiesCreated = 0;
  let entitiesUpdated = 0;
  let relationshipsCreated = 0;
  let findingsCreated = 0;
  let totalCostUsd = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  const errors: { document_id: string; message: string }[] = [];

  for (const doc of docs) {
    let result;
    try {
      const out = await analyzeText({
        documentText: doc.raw_text,
        depth: body.depth,
        jurisdiction: body.jurisdiction,
        coverage: body.coverage,
        generateQuestions: body.generate_questions !== false,
        suggestRecords: body.suggest_records !== false,
        maxEntities: body.max_entities,
        context: {
          newsroomId: session.newsroomId,
          userId: session.userId,
          endpoint: `/api/research/dossiers/${id}/analyze`,
        },
      });
      result = out.result;
      totalCostUsd += out.cost?.costUsd || 0;
      totalInputTokens += out.cost?.inputTokens || 0;
      totalOutputTokens += out.cost?.outputTokens || 0;
    } catch (err) {
      errors.push({
        document_id: doc.id,
        message: err instanceof Error ? err.message : String(err),
      });
      continue;
    }

    // Build a name → entity_id map per document so we can resolve
    // relationship/finding references after upserting entities.
    const entityIdByName = new Map<string, string>();

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Upsert entities
      for (const e of (result.entities as EntityOut[]) || []) {
        const name = String(e.name || '').trim();
        if (!name) continue;
        const kind = String(e.kind || 'other').trim().toLowerCase();
        const norm = normalise(name);
        const upsert = await client.query(
          `INSERT INTO research_entities
             (dossier_id, newsroom_id, kind, name, normalized_name, role, metadata, mention_count, first_seen_doc_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 1, $8)
           ON CONFLICT (dossier_id, kind, normalized_name)
           DO UPDATE SET
             mention_count = research_entities.mention_count + 1,
             role = COALESCE(research_entities.role, EXCLUDED.role),
             metadata = research_entities.metadata || EXCLUDED.metadata,
             updated_at = NOW()
           RETURNING id, (xmax = 0) AS inserted`,
          [
            id,
            session.newsroomId,
            kind,
            name,
            norm,
            e.role || null,
            JSON.stringify(e.metadata || {}),
            doc.id,
          ]
        );
        const row = upsert.rows[0];
        entityIdByName.set(norm, row.id);
        if (row.inserted) entitiesCreated++; else entitiesUpdated++;
      }

      // Insert relationships (resolve names to entity ids; skip if either side missing)
      for (const r of (result.relationships as RelOut[]) || []) {
        const fromName = r.from ? normalise(r.from) : '';
        const toName = r.to ? normalise(r.to) : '';
        const fromId = entityIdByName.get(fromName);
        const toId = entityIdByName.get(toName);
        if (!fromId || !toId) continue;
        await client.query(
          `INSERT INTO research_relationships
             (dossier_id, newsroom_id, from_entity_id, to_entity_id, kind, evidence, source_doc_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            id,
            session.newsroomId,
            fromId,
            toId,
            String(r.kind || 'related_to').trim().toLowerCase(),
            r.evidence || null,
            doc.id,
          ]
        );
        relationshipsCreated++;
      }

      // Insert findings (claims, questions, records_to_pull, gaps, summary)
      const findingBatches: Array<{ kind: string; items: Array<FindingOut & { body?: string }> }> = [
        { kind: 'claim', items: (result.claims as FindingOut[]) || [] },
        { kind: 'question', items: ((result.questions as FindingOut[]) || []) },
        { kind: 'record_to_pull', items: ((result.records_to_pull as FindingOut[]) || []) },
        { kind: 'gap', items: ((result.gaps as FindingOut[]) || []) },
      ];
      if (typeof result.summary === 'string' && result.summary.trim()) {
        findingBatches.push({ kind: 'summary', items: [{ body: result.summary, confidence: undefined }] });
      }
      for (const batch of findingBatches) {
        for (const f of batch.items) {
          const text = String(f.body || '').trim();
          if (!text) continue;
          await client.query(
            `INSERT INTO research_findings
               (dossier_id, newsroom_id, kind, body, rationale, source_doc_id, confidence)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
              id,
              session.newsroomId,
              batch.kind,
              text,
              f.rationale || null,
              doc.id,
              typeof f.confidence === 'number' ? f.confidence : null,
            ]
          );
          findingsCreated++;
        }
      }

      await client.query(
        `UPDATE research_documents
            SET status = 'analyzed', analyzed_at = NOW()
          WHERE id = $1`,
        [doc.id]
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      errors.push({
        document_id: doc.id,
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      client.release();
    }
  }

  // ─── Archivist cross-reference ──────────────────────────────────────────
  // For each significant person + organisation entity in the dossier, run
  // the newsroom's archive search and persist hits as 'archive_match'
  // findings keyed back to the entity in metadata. Reanalyze re-creates the
  // archive matches; otherwise we only run for entities without existing
  // matches so re-analyze of new docs doesn't re-search every old entity.
  let archiveMatchesCreated = 0;
  let archiveMatchErrors = 0;
  const doCrossRef = body.archive_cross_reference !== false;
  if (doCrossRef && errors.length < docs.length) {
    if (reanalyze) {
      await pool.query(
        `DELETE FROM research_findings WHERE dossier_id = $1 AND kind = 'archive_match'`,
        [id]
      );
    }
    const entitiesToCheckRes = await pool.query(
      `SELECT e.id, e.name, e.kind, e.mention_count
         FROM research_entities e
        WHERE e.dossier_id = $1
          AND e.kind IN ('person', 'organisation')
          ${reanalyze ? '' : `
          AND NOT EXISTS (
            SELECT 1 FROM research_findings f
             WHERE f.dossier_id = e.dossier_id
               AND f.kind = 'archive_match'
               AND f.metadata->>'entity_id' = e.id::text
          )`}
        ORDER BY e.mention_count DESC, e.name ASC
        LIMIT 12`,
      [id]
    );
    const k = Math.max(1, Math.min(10, body.archive_top_k_per_entity ?? 3));
    const minSim = Math.max(0, Math.min(1, body.archive_min_similarity ?? 0.3));

    for (const ent of entitiesToCheckRes.rows) {
      try {
        const matches = await archivistSearch({
          newsroomId: session.newsroomId,
          query: ent.name,
          k,
        });
        for (const m of matches as Array<{ text: string; filename: string; similarity: number }>) {
          if ((m.similarity || 0) < minSim) continue;
          await pool.query(
            `INSERT INTO research_findings
               (dossier_id, newsroom_id, kind, body, rationale, source_doc_id, confidence, metadata)
             VALUES ($1, $2, 'archive_match', $3, $4, NULL, $5, $6)`,
            [
              id,
              session.newsroomId,
              m.text,
              `Mentions "${ent.name}" — past coverage from ${m.filename}.`,
              Number(m.similarity?.toFixed(3) ?? 0),
              JSON.stringify({
                entity_id: ent.id,
                entity_name: ent.name,
                entity_kind: ent.kind,
                archive_filename: m.filename,
                similarity: m.similarity,
              }),
            ]
          );
          archiveMatchesCreated++;
        }
      } catch (err) {
        archiveMatchErrors++;
        // Log but don't fail the whole analyze on archive issues — the
        // most likely cause is "no archive ingested yet", which is fine.
        console.error('Archivist cross-reference error for', ent.name, err);
      }
    }
  }

  await pool.query(`UPDATE research_dossiers SET updated_at = NOW() WHERE id = $1`, [id]);
  await pool.query(
    `INSERT INTO audit_log (newsroom_id, user_id, event_type, payload)
     VALUES ($1, $2, 'research.dossier.analyzed', $3)`,
    [
      session.newsroomId,
      session.userId,
      JSON.stringify({
        dossier_id: id,
        documents: docs.length,
        entities_created: entitiesCreated,
        entities_updated: entitiesUpdated,
        relationships_created: relationshipsCreated,
        findings_created: findingsCreated,
        archive_matches_created: archiveMatchesCreated,
        cost_usd: totalCostUsd,
      }),
    ]
  );

  return NextResponse.json({
    analyzed: docs.length - errors.length,
    entities_created: entitiesCreated,
    entities_updated: entitiesUpdated,
    relationships_created: relationshipsCreated,
    findings_created: findingsCreated,
    archive_matches_created: archiveMatchesCreated,
    archive_match_errors: archiveMatchErrors,
    totalCost: { costUsd: totalCostUsd, inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
    durationMs: Date.now() - startedAt,
    errors,
  });
}
