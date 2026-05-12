// GET /api/archive/documents — paged list of documents in this newsroom with
// ingestion status (per-pass run state) joined. Drives the "Documents" tab
// in the archive workspace.
//
// Query params:
//   page?      default 1
//   pageSize?  default 30, max 100
//   beat?      filter by beat (politics | business | …)
//   pending?   if "1", only docs missing one or more ingestion passes

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';

export async function GET(req: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get('pageSize') || '30', 10)));
  const beat = (url.searchParams.get('beat') || '').trim() || null;
  const pendingOnly = url.searchParams.get('pending') === '1';

  const params: any[] = [session.newsroomId];
  const conditions = ['d.newsroom_id = $1'];
  if (beat) {
    params.push(beat);
    conditions.push(`d.beat = $${params.length}`);
  }
  const offset = (page - 1) * pageSize;

  // Aggregate ingestion-run state into a JSON object keyed by pass
  params.push(pageSize, offset);
  const { rows: documents } = await pool.query(
    `SELECT d.id, d.filename, d.title, d.beat, d.story_type, d.byline, d.published_at,
            d.source_url, d.canonical_url, d.status, d.created_at,
            d.metadata_extracted_at,
            (SELECT COUNT(*) FROM archive_entity_mentions m WHERE m.document_id = d.id) AS mention_count,
            (SELECT COUNT(*) FROM archive_relationships r WHERE r.document_id = d.id) AS relationship_count,
            (SELECT COUNT(*) FROM archive_claims c WHERE c.document_id = d.id) AS claim_count,
            COALESCE(
              (SELECT jsonb_object_agg(pass, jsonb_build_object('status', status, 'rows_added', rows_added, 'completed_at', completed_at, 'error', error))
                 FROM archive_ingestion_runs WHERE document_id = d.id),
              '{}'::jsonb
            ) AS ingestion
       FROM archive_documents d
      WHERE ${conditions.join(' AND ')}
      ORDER BY d.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  // If pendingOnly, filter out docs that have all 4 passes completed
  const filtered = pendingOnly
    ? documents.filter((d: any) => {
        const ing = d.ingestion || {};
        const passes = ['metadata', 'ner', 'relations', 'claims'];
        return passes.some((p) => !ing[p] || ing[p].status !== 'completed');
      })
    : documents;

  const countParams: any[] = [session.newsroomId];
  let countBeatFilter = '';
  if (beat) {
    countParams.push(beat);
    countBeatFilter = `AND d.beat = $2`;
  }
  const { rows: [totalRow] } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM archive_documents d
      WHERE d.newsroom_id = $1 ${countBeatFilter}`,
    countParams
  );

  return NextResponse.json({
    documents: filtered,
    total: totalRow.n,
    page,
    pageSize,
    pendingOnly,
  });
}
