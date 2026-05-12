// POST /api/archive/exports — generate a new signed dataset bundle.
// GET  /api/archive/exports — list recent exports for this newsroom.
//
// Builder + admin only — exports may be licensable artefacts; users shouldn't
// kick off generation.

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';
const { createExport } = require('@/lib/archive/export');

export async function POST(req: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (session.role !== 'builder' && session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — builder role required' }, { status: 403 });
  }

  let body: { title?: string; filters?: any };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  // Validate filters shape — only allow known keys
  const f = body.filters || {};
  const filters: any = {};
  if (typeof f.beat === 'string' && f.beat.trim()) filters.beat = f.beat.trim();
  if (typeof f.fromDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(f.fromDate)) filters.fromDate = f.fromDate;
  if (typeof f.toDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(f.toDate)) filters.toDate = f.toDate;
  if (f.includeClaims === false) filters.includeClaims = false;
  if (f.includeRelationships === false) filters.includeRelationships = false;
  if (f.anonymiseByline === true) filters.anonymiseByline = true;

  try {
    const result = await createExport({
      newsroomId: session.newsroomId,
      userId: session.userId,
      title: body.title,
      filters,
    });
    return NextResponse.json({
      exportId: result.exportId,
      manifest: result.manifest,
      sizeBytes: result.sizeBytes,
    }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 422 }
    );
  }
}

export async function GET(_req: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { rows } = await pool.query(
    `SELECT id, title, filters, counts, content_hash, public_key, size_bytes,
            status, error, created_at, completed_at, expires_at
       FROM archive_dataset_exports
      WHERE newsroom_id = $1
      ORDER BY created_at DESC
      LIMIT 50`,
    [session.newsroomId]
  );
  return NextResponse.json({ exports: rows });
}
