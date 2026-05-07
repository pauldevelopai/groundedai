// /api/operations/freelancers/:id — PATCH + DELETE

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SCALARS = ['name', 'email', 'phone', 'city', 'country', 'preferred_currency', 'status', 'notes'];
const ARRAYS = ['beats', 'languages'];
const NUMBERS = ['rate_per_piece_cents', 'rate_per_word_cents'];

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (session.role !== 'builder' && session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — builder role required' }, { status: 403 });
  }
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  const exist = await pool.query(`SELECT id, newsroom_id FROM freelancers WHERE id = $1`, [id]);
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
    if (f === 'status' && v && !['active', 'paused', 'archived'].includes(String(v))) {
      return NextResponse.json({ error: 'status invalid' }, { status: 400 });
    }
    values.push(v === null || v === '' ? null : String(v).trim());
    updates.push(`${f} = $${values.length}`);
  }
  for (const f of ARRAYS) {
    if (!(f in body)) continue;
    values.push(Array.isArray(body[f]) ? body[f] : []);
    updates.push(`${f} = $${values.length}`);
  }
  for (const f of NUMBERS) {
    if (!(f in body)) continue;
    const v = body[f];
    values.push(v === null || v === '' || v === undefined ? null : Number(v));
    updates.push(`${f} = $${values.length}`);
  }
  if (updates.length === 0) return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  updates.push(`updated_at = NOW()`);
  values.push(id);

  const { rows } = await pool.query(
    `UPDATE freelancers SET ${updates.join(', ')} WHERE id = $${values.length} RETURNING *`,
    values
  );
  return NextResponse.json({ freelancer: rows[0] });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (session.role !== 'builder' && session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — builder role required' }, { status: 403 });
  }
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  const exist = await pool.query(`SELECT id, newsroom_id FROM freelancers WHERE id = $1`, [id]);
  if (exist.rows.length === 0 || exist.rows[0].newsroom_id !== session.newsroomId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  await pool.query(`DELETE FROM freelancers WHERE id = $1`, [id]);
  return NextResponse.json({ ok: true });
}
