// GET /api/archive/entities/:id — full entity profile (relationships + claims
// + documents), with optional ?asOf=YYYY-MM-DD time cutoff.
//
// Tenant isolation: 404 if the entity doesn't belong to session.newsroomId.

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';
const { entityProfile } = require('@/lib/archive/query');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const url = new URL(req.url);
  const asOfRaw = url.searchParams.get('asOf');
  let asOf: string | undefined;
  if (asOfRaw) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(asOfRaw)) {
      return NextResponse.json({ error: 'asOf must be YYYY-MM-DD' }, { status: 400 });
    }
    asOf = asOfRaw;
  }

  const profile = await entityProfile({
    newsroomId: session.newsroomId,
    entityId: id,
    asOf,
  });
  if (!profile) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json(profile);
}

// DELETE /api/archive/entities/:id — manual entity deletion. Cascades to
// mentions, relationships, claims. Builders + admins only.
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (session.role !== 'builder' && session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — builder role required' }, { status: 403 });
  }
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  const { rowCount } = await pool.query(
    'DELETE FROM archive_entities WHERE id = $1 AND newsroom_id = $2',
    [id, session.newsroomId]
  );
  if (rowCount === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ deleted: true });
}
