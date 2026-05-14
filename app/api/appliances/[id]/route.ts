// PATCH /api/appliances/:id  — pause/resume an appliance (admin)
// DELETE /api/appliances/:id  — remove (admin); next register issues a new secret
//
// V2 Step 6. Tenant-scoped: refuses if the appliance isn't in the
// caller's newsroom.

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Admin role required' }, { status: 403 });
  }
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const own = await pool.query(
    `SELECT newsroom_id FROM newsroom_appliances WHERE id = $1`,
    [id]
  );
  if (own.rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (own.rows[0].newsroom_id !== session.newsroomId) {
    return NextResponse.json({ error: 'Not in your newsroom' }, { status: 403 });
  }

  let body: { status?: unknown; display_name?: unknown; dispatch_url?: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const sets: string[] = [];
  const params: unknown[] = [];
  function push(col: string, val: unknown) { params.push(val); sets.push(`${col} = $${params.length}`); }

  if (typeof body.status === 'string') {
    if (!['active', 'paused'].includes(body.status)) {
      return NextResponse.json({ error: 'status must be active or paused' }, { status: 400 });
    }
    push('status', body.status);
  }
  if (typeof body.display_name === 'string' && body.display_name.trim().length > 0) {
    push('display_name', body.display_name.trim());
  }
  if (typeof body.dispatch_url === 'string' && /^https?:\/\//i.test(body.dispatch_url)) {
    push('dispatch_url', body.dispatch_url.trim());
  }

  if (sets.length === 0) {
    return NextResponse.json({ error: 'No editable fields supplied' }, { status: 400 });
  }
  params.push(id);
  await pool.query(
    `UPDATE newsroom_appliances SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${params.length}`,
    params
  );
  return NextResponse.json({ id, updated: sets.length });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Admin role required' }, { status: 403 });
  }
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const own = await pool.query(
    `SELECT newsroom_id FROM newsroom_appliances WHERE id = $1`,
    [id]
  );
  if (own.rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (own.rows[0].newsroom_id !== session.newsroomId) {
    return NextResponse.json({ error: 'Not in your newsroom' }, { status: 403 });
  }
  await pool.query(`DELETE FROM newsroom_appliances WHERE id = $1`, [id]);
  return NextResponse.json({ id, deleted: true });
}
