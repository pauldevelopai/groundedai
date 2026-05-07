// /api/distribution/corrections/:id — GET + PATCH (per-channel propagation status, plain status, notes) + DELETE

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';
const { setChannelPropagation } = require('@/lib/distribution/corrections');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES = ['open', 'drafted', 'partially_dispatched', 'dispatched', 'closed'];

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  const { rows } = await pool.query(
    `SELECT * FROM distribution_corrections WHERE id = $1 AND newsroom_id = $2`,
    [id, session.newsroomId]
  );
  if (rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ correction: rows[0] });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (session.role !== 'builder' && session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — builder role required' }, { status: 403 });
  }
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  const exist = await pool.query(`SELECT id, newsroom_id FROM distribution_corrections WHERE id = $1`, [id]);
  if (exist.rows.length === 0 || exist.rows[0].newsroom_id !== session.newsroomId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  let body: {
    correction_text?: string; severity?: string; notes?: string; status?: string;
    propagate?: { send_id: string; status: string };
  };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  // Per-channel propagation update
  if (body.propagate) {
    if (!body.propagate.send_id || !UUID_RE.test(body.propagate.send_id)) {
      return NextResponse.json({ error: 'propagate.send_id required' }, { status: 400 });
    }
    try {
      const updated = await setChannelPropagation(id, session.newsroomId, body.propagate.send_id, body.propagate.status);
      return NextResponse.json({ correction: updated });
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 400 });
    }
  }

  const updates: string[] = [];
  const values: unknown[] = [];
  if (typeof body.correction_text === 'string' && body.correction_text.trim()) {
    values.push(body.correction_text); updates.push(`correction_text = $${values.length}`);
  }
  if (typeof body.severity === 'string') {
    if (!['typo', 'minor', 'material', 'critical'].includes(body.severity)) {
      return NextResponse.json({ error: 'severity invalid' }, { status: 400 });
    }
    values.push(body.severity); updates.push(`severity = $${values.length}`);
  }
  if (typeof body.notes === 'string') { values.push(body.notes); updates.push(`notes = $${values.length}`); }
  if (typeof body.status === 'string') {
    if (!STATUSES.includes(body.status)) return NextResponse.json({ error: `status must be one of ${STATUSES.join(', ')}` }, { status: 400 });
    values.push(body.status); updates.push(`status = $${values.length}`);
  }
  if (updates.length === 0) return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  updates.push(`updated_at = NOW()`);
  values.push(id);
  const { rows } = await pool.query(
    `UPDATE distribution_corrections SET ${updates.join(', ')} WHERE id = $${values.length} RETURNING *`,
    values
  );
  return NextResponse.json({ correction: rows[0] });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (session.role !== 'builder' && session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — builder role required' }, { status: 403 });
  }
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  const exist = await pool.query(`SELECT id, newsroom_id FROM distribution_corrections WHERE id = $1`, [id]);
  if (exist.rows.length === 0 || exist.rows[0].newsroom_id !== session.newsroomId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  await pool.query(`DELETE FROM distribution_corrections WHERE id = $1`, [id]);
  return NextResponse.json({ ok: true });
}
