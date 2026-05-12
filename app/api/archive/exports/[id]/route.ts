// GET /api/archive/exports/:id        — export status + manifest
// GET /api/archive/exports/:id?download=1 — stream the bundle JSON (signed file)
// DELETE /api/archive/exports/:id      — drop the row + the on-disk file
//
// Tenant isolation: 404 if the export isn't in this newsroom.

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';
import { readFile, unlink } from 'node:fs/promises';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const { rows } = await pool.query(
    `SELECT id, title, filters, counts, content_hash, signature, public_key,
            manifest, size_bytes, status, error, bundle_path, created_at,
            completed_at, expires_at
       FROM archive_dataset_exports
      WHERE id = $1 AND newsroom_id = $2`,
    [id, session.newsroomId]
  );
  if (rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const row = rows[0];

  const url = new URL(req.url);
  if (url.searchParams.get('download') === '1') {
    if (row.status !== 'ready' || !row.bundle_path) {
      return NextResponse.json({ error: 'Bundle not ready' }, { status: 409 });
    }
    let body: Buffer;
    try {
      body = await readFile(row.bundle_path);
    } catch (err) {
      return NextResponse.json(
        { error: 'Bundle file missing on disk — re-export needed' },
        { status: 410 }
      );
    }
    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="grounded-archive-${id}.json"`,
        'X-Content-Hash-SHA256': row.content_hash || '',
        'X-Public-Key': row.public_key || '',
      },
    });
  }

  // Don't expose bundle_path to the client — it's a server filesystem path
  const { bundle_path, ...safeRow } = row;
  return NextResponse.json(safeRow);
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (session.role !== 'builder' && session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — builder role required' }, { status: 403 });
  }
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const { rows } = await pool.query(
    `SELECT bundle_path FROM archive_dataset_exports WHERE id = $1 AND newsroom_id = $2`,
    [id, session.newsroomId]
  );
  if (rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const bundlePath = rows[0].bundle_path;

  await pool.query(
    `DELETE FROM archive_dataset_exports WHERE id = $1 AND newsroom_id = $2`,
    [id, session.newsroomId]
  );
  if (bundlePath) {
    try { await unlink(bundlePath); } catch { /* best-effort */ }
  }
  return NextResponse.json({ deleted: true });
}
