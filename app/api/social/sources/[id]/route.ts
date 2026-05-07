// /api/social/sources/:id — PATCH + DELETE

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALIGNMENTS = ['uncategorised', 'state_russia', 'state_china', 'state_other', 'cib_network', 'extremist', 'commercial', 'reputable'];

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (session.role !== 'builder' && session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — builder role required' }, { status: 403 });
  }
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  const exist = await pool.query(`SELECT id, newsroom_id FROM social_sources WHERE id = $1`, [id]);
  if (exist.rows.length === 0 || exist.rows[0].newsroom_id !== session.newsroomId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const updates: string[] = [];
  const values: unknown[] = [];
  if (typeof body.display_name === 'string') {
    values.push(body.display_name.trim() || null); updates.push(`display_name = $${values.length}`);
  }
  if (typeof body.alignment === 'string') {
    if (!ALIGNMENTS.includes(body.alignment)) return NextResponse.json({ error: 'alignment invalid' }, { status: 400 });
    values.push(body.alignment); updates.push(`alignment = $${values.length}`);
  }
  if ('alignment_confidence' in body) {
    const v = body.alignment_confidence;
    const n = v === null ? null : Number(v);
    if (n !== null && (!Number.isFinite(n) || n < 0 || n > 1)) {
      return NextResponse.json({ error: 'alignment_confidence must be 0..1 or null' }, { status: 400 });
    }
    values.push(n); updates.push(`alignment_confidence = $${values.length}`);
  }
  if (typeof body.country === 'string') {
    values.push(body.country.trim().toUpperCase() || null); updates.push(`country = $${values.length}`);
  }
  if ('notes' in body) {
    values.push(body.notes === null || body.notes === '' ? null : String(body.notes)); updates.push(`notes = $${values.length}`);
  }
  if (updates.length === 0) return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  updates.push(`updated_at = NOW()`);
  values.push(id);
  const { rows } = await pool.query(
    `UPDATE social_sources SET ${updates.join(', ')} WHERE id = $${values.length} RETURNING *`,
    values
  );
  return NextResponse.json({ source: rows[0] });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (session.role !== 'builder' && session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — builder role required' }, { status: 403 });
  }
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  const exist = await pool.query(`SELECT id, newsroom_id FROM social_sources WHERE id = $1`, [id]);
  if (exist.rows.length === 0 || exist.rows[0].newsroom_id !== session.newsroomId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  await pool.query(`DELETE FROM social_sources WHERE id = $1`, [id]);
  return NextResponse.json({ ok: true });
}
