// /api/operations/contributors/:id — PATCH (vetting, attribution, etc) + DELETE

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VETTING_STATES = ['unvetted', 'in_review', 'vetted', 'blocked'];
const PAYMENT_KINDS = ['unpaid', 'small_stipend', 'per_tip', 'per_piece'];
const SCALARS = ['name', 'contact', 'contact_kind', 'location', 'attribution_name', 'notes'];

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (session.role !== 'builder' && session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — builder role required' }, { status: 403 });
  }
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  const exist = await pool.query(`SELECT id, newsroom_id FROM community_contributors WHERE id = $1`, [id]);
  if (exist.rows.length === 0 || exist.rows[0].newsroom_id !== session.newsroomId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const updates: string[] = [];
  const values: unknown[] = [];
  for (const f of SCALARS) {
    if (!(f in body)) continue;
    const v = body[f];
    if (f === 'name' && (!v || !String(v).trim())) {
      return NextResponse.json({ error: 'name cannot be empty' }, { status: 400 });
    }
    values.push(v === null || v === '' ? null : String(v).trim());
    updates.push(`${f} = $${values.length}`);
  }
  if ('vetting_status' in body) {
    if (!VETTING_STATES.includes(String(body.vetting_status))) {
      return NextResponse.json({ error: `vetting_status must be one of ${VETTING_STATES.join(', ')}` }, { status: 400 });
    }
    values.push(body.vetting_status);
    updates.push(`vetting_status = $${values.length}`);
  }
  if ('payment_kind' in body) {
    if (!PAYMENT_KINDS.includes(String(body.payment_kind))) {
      return NextResponse.json({ error: `payment_kind must be one of ${PAYMENT_KINDS.join(', ')}` }, { status: 400 });
    }
    values.push(body.payment_kind);
    updates.push(`payment_kind = $${values.length}`);
  }
  if ('trust_score' in body) {
    const n = body.trust_score === null ? null : Number(body.trust_score);
    if (n !== null && (!Number.isFinite(n) || n < 0 || n > 1)) {
      return NextResponse.json({ error: 'trust_score must be 0..1 or null' }, { status: 400 });
    }
    values.push(n);
    updates.push(`trust_score = $${values.length}`);
  }
  if (updates.length === 0) return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  updates.push(`updated_at = NOW()`);
  values.push(id);

  const { rows } = await pool.query(
    `UPDATE community_contributors SET ${updates.join(', ')} WHERE id = $${values.length} RETURNING *`,
    values
  );
  return NextResponse.json({ contributor: rows[0] });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (session.role !== 'builder' && session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — builder role required' }, { status: 403 });
  }
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  const exist = await pool.query(`SELECT id, newsroom_id FROM community_contributors WHERE id = $1`, [id]);
  if (exist.rows.length === 0 || exist.rows[0].newsroom_id !== session.newsroomId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  await pool.query(`DELETE FROM community_contributors WHERE id = $1`, [id]);
  return NextResponse.json({ ok: true });
}
