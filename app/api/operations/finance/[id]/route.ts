// /api/operations/finance/:id — PATCH (status update most common) + DELETE

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES = ['recorded', 'pending', 'paid', 'reconciled', 'cancelled'];

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (session.role !== 'builder' && session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — builder role required' }, { status: 403 });
  }
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  const exist = await pool.query(`SELECT id, newsroom_id FROM ops_finance_entries WHERE id = $1`, [id]);
  if (exist.rows.length === 0 || exist.rows[0].newsroom_id !== session.newsroomId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  let body: { status?: string; notes?: string; description?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const updates: string[] = [];
  const values: unknown[] = [];
  if (typeof body.status === 'string') {
    if (!STATUSES.includes(body.status)) {
      return NextResponse.json({ error: `status must be one of ${STATUSES.join(', ')}` }, { status: 400 });
    }
    values.push(body.status); updates.push(`status = $${values.length}`);
  }
  if (typeof body.notes === 'string') { values.push(body.notes); updates.push(`notes = $${values.length}`); }
  if (typeof body.description === 'string') {
    if (!body.description.trim()) return NextResponse.json({ error: 'description cannot be empty' }, { status: 400 });
    values.push(body.description.trim()); updates.push(`description = $${values.length}`);
  }
  if (updates.length === 0) return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  values.push(id);

  const { rows } = await pool.query(
    `UPDATE ops_finance_entries SET ${updates.join(', ')} WHERE id = $${values.length} RETURNING *`,
    values
  );
  return NextResponse.json({ entry: rows[0] });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (session.role !== 'builder' && session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — builder role required' }, { status: 403 });
  }
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  const exist = await pool.query(`SELECT id, newsroom_id FROM ops_finance_entries WHERE id = $1`, [id]);
  if (exist.rows.length === 0 || exist.rows[0].newsroom_id !== session.newsroomId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  await pool.query(`DELETE FROM ops_finance_entries WHERE id = $1`, [id]);
  return NextResponse.json({ ok: true });
}
