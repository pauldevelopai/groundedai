// /api/distribution/channels/:id — PATCH + DELETE

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES = ['active', 'paused', 'archived'];

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (session.role !== 'builder' && session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — builder role required' }, { status: 403 });
  }
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  const exist = await pool.query(`SELECT id, newsroom_id FROM distribution_channels WHERE id = $1`, [id]);
  if (exist.rows.length === 0 || exist.rows[0].newsroom_id !== session.newsroomId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const updates: string[] = [];
  const values: unknown[] = [];
  for (const f of ['name', 'external_handle', 'external_url', 'notes'] as const) {
    if (!(f in body)) continue;
    const v = body[f];
    if (f === 'name' && (!v || !String(v).trim())) {
      return NextResponse.json({ error: 'name cannot be empty' }, { status: 400 });
    }
    values.push(v === null || v === '' ? null : String(v).trim());
    updates.push(`${f} = $${values.length}`);
  }
  if ('status' in body) {
    if (!STATUSES.includes(String(body.status))) return NextResponse.json({ error: `status invalid` }, { status: 400 });
    values.push(body.status); updates.push(`status = $${values.length}`);
  }
  if ('defaults' in body) {
    values.push(JSON.stringify(body.defaults || {})); updates.push(`defaults = $${values.length}::jsonb`);
  }
  if ('credential_id' in body) {
    if (body.credential_id) {
      const cr = await pool.query(`SELECT newsroom_id FROM distribution_credentials WHERE id = $1`, [body.credential_id]);
      if (cr.rows.length === 0 || cr.rows[0].newsroom_id !== session.newsroomId) {
        return NextResponse.json({ error: 'credential_id not found' }, { status: 400 });
      }
    }
    values.push(body.credential_id || null); updates.push(`credential_id = $${values.length}`);
  }
  if (updates.length === 0) return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  updates.push(`updated_at = NOW()`);
  values.push(id);
  const { rows } = await pool.query(
    `UPDATE distribution_channels SET ${updates.join(', ')} WHERE id = $${values.length} RETURNING *`,
    values
  );
  return NextResponse.json({ channel: rows[0] });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (session.role !== 'builder' && session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — builder role required' }, { status: 403 });
  }
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  const exist = await pool.query(`SELECT id, newsroom_id FROM distribution_channels WHERE id = $1`, [id]);
  if (exist.rows.length === 0 || exist.rows[0].newsroom_id !== session.newsroomId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  await pool.query(`DELETE FROM distribution_channels WHERE id = $1`, [id]);
  return NextResponse.json({ ok: true });
}
