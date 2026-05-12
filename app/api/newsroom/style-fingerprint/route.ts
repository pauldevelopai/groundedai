// POST /api/newsroom/style-fingerprint/compute — enqueue a fingerprint job.
//   body: { documentIds?: string[] }  (defaults to the most-recent 30
//          archive_documents that have chunks)
// GET  /api/newsroom/style-fingerprint — return the current fingerprint
//   from newsroom_profile.metadata.house_style_fingerprint.
//
// Builder + admin only — fingerprinting touches the newsroom profile.

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';
const { enqueue } = require('@/lib/jobs/boss');

export async function GET(_req: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { rows } = await pool.query(
    `SELECT metadata->'house_style_fingerprint' AS fingerprint, updated_at
       FROM newsroom_profiles WHERE newsroom_id = $1`,
    [session.newsroomId]
  );
  if (rows.length === 0 || !rows[0].fingerprint) {
    return NextResponse.json({ fingerprint: null });
  }
  return NextResponse.json({ fingerprint: rows[0].fingerprint, profileUpdatedAt: rows[0].updated_at });
}

export async function POST(req: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (session.role !== 'builder' && session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — builder role required' }, { status: 403 });
  }

  let body: { documentIds?: string[] };
  try { body = await req.json(); } catch { body = {}; }

  let documentIds = body.documentIds;
  if (!Array.isArray(documentIds) || documentIds.length === 0) {
    // Default: most-recent 30 archive_documents that have chunks
    const { rows } = await pool.query(
      `SELECT d.id FROM archive_documents d
        WHERE d.newsroom_id = $1
          AND EXISTS (SELECT 1 FROM archive_chunks c WHERE c.document_id = d.id)
        ORDER BY d.published_at DESC NULLS LAST, d.created_at DESC
        LIMIT 30`,
      [session.newsroomId]
    );
    documentIds = rows.map((r: any) => r.id);
  }

  if (documentIds.length === 0) {
    return NextResponse.json(
      { error: 'No archive documents with extracted chunks — upload + ingest first' },
      { status: 422 }
    );
  }

  const id = await enqueue('newsroom-profile.compute-fingerprint', {
    newsroomId: session.newsroomId,
    documentIds,
  });
  return NextResponse.json({ jobId: id, documentIds, status: 'pending' }, { status: 202 });
}
