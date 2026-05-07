// /api/social/keywords/:id — PATCH + DELETE

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MATCH_KINDS = ['phrase', 'regex', 'name'];
const SCOPES = ['all', 'facebook', 'twitter', 'instagram', 'tiktok', 'telegram', 'whatsapp', 'web', 'other'];
const SEVERITIES = ['low', 'medium', 'high', 'critical'];
const STATUSES = ['active', 'paused', 'archived'];

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (session.role !== 'builder' && session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — builder role required' }, { status: 403 });
  }
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  const exist = await pool.query(`SELECT id, newsroom_id FROM social_keywords WHERE id = $1`, [id]);
  if (exist.rows.length === 0 || exist.rows[0].newsroom_id !== session.newsroomId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const updates: string[] = [];
  const values: unknown[] = [];
  if (typeof body.term === 'string') {
    if (!body.term.trim()) return NextResponse.json({ error: 'term cannot be empty' }, { status: 400 });
    values.push(body.term.trim()); updates.push(`term = $${values.length}`);
  }
  if (typeof body.match_kind === 'string') {
    if (!MATCH_KINDS.includes(body.match_kind)) return NextResponse.json({ error: 'match_kind invalid' }, { status: 400 });
    values.push(body.match_kind); updates.push(`match_kind = $${values.length}`);
  }
  if (typeof body.scope === 'string') {
    if (!SCOPES.includes(body.scope)) return NextResponse.json({ error: 'scope invalid' }, { status: 400 });
    values.push(body.scope); updates.push(`scope = $${values.length}`);
  }
  if (typeof body.severity_floor === 'string') {
    if (!SEVERITIES.includes(body.severity_floor)) return NextResponse.json({ error: 'severity_floor invalid' }, { status: 400 });
    values.push(body.severity_floor); updates.push(`severity_floor = $${values.length}`);
  }
  if (typeof body.status === 'string') {
    if (!STATUSES.includes(body.status)) return NextResponse.json({ error: 'status invalid' }, { status: 400 });
    values.push(body.status); updates.push(`status = $${values.length}`);
  }
  if ('notes' in body) {
    values.push(body.notes === null || body.notes === '' ? null : String(body.notes)); updates.push(`notes = $${values.length}`);
  }
  if (updates.length === 0) return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  updates.push(`updated_at = NOW()`);
  values.push(id);
  const { rows } = await pool.query(
    `UPDATE social_keywords SET ${updates.join(', ')} WHERE id = $${values.length} RETURNING *`,
    values
  );
  return NextResponse.json({ keyword: rows[0] });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (session.role !== 'builder' && session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — builder role required' }, { status: 403 });
  }
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  const exist = await pool.query(`SELECT id, newsroom_id FROM social_keywords WHERE id = $1`, [id]);
  if (exist.rows.length === 0 || exist.rows[0].newsroom_id !== session.newsroomId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  await pool.query(`DELETE FROM social_keywords WHERE id = $1`, [id]);
  return NextResponse.json({ ok: true });
}
