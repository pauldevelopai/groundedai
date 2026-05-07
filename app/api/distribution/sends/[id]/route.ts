// /api/distribution/sends/:id — GET + PATCH (retract / mark failed) + DELETE
// + POST /dispatch (re-dispatch a queued or failed send).

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';
const { dispatchSend } = require('@/lib/distribution/dispatch');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES = ['queued', 'dispatching', 'dispatched', 'dispatched_simulated', 'failed', 'retracted'];

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  const { rows } = await pool.query(
    `SELECT s.*, c.name AS channel_name, c.channel_kind
       FROM distribution_sends s
       JOIN distribution_channels c ON c.id = s.channel_id
      WHERE s.id = $1 AND s.newsroom_id = $2`,
    [id, session.newsroomId]
  );
  if (rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ send: rows[0] });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (session.role !== 'builder' && session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — builder role required' }, { status: 403 });
  }
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  const exist = await pool.query(`SELECT id, newsroom_id FROM distribution_sends WHERE id = $1`, [id]);
  if (exist.rows.length === 0 || exist.rows[0].newsroom_id !== session.newsroomId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  let body: { status?: string; payload?: Record<string, unknown>; action?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  // Action shortcut: dispatch a queued send
  if (body.action === 'dispatch') {
    try {
      const result = await dispatchSend(id, session.newsroomId);
      return NextResponse.json({ send: result.send });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ error: message }, { status: 422 });
    }
  }

  const updates: string[] = [];
  const values: unknown[] = [];
  if (typeof body.status === 'string') {
    if (!STATUSES.includes(body.status)) return NextResponse.json({ error: `status must be one of ${STATUSES.join(', ')}` }, { status: 400 });
    values.push(body.status); updates.push(`status = $${values.length}`);
  }
  if (body.payload && typeof body.payload === 'object') {
    values.push(JSON.stringify(body.payload)); updates.push(`payload = $${values.length}::jsonb`);
  }
  if (updates.length === 0) return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  updates.push(`updated_at = NOW()`);
  values.push(id);
  const { rows } = await pool.query(
    `UPDATE distribution_sends SET ${updates.join(', ')} WHERE id = $${values.length} RETURNING *`,
    values
  );
  return NextResponse.json({ send: rows[0] });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (session.role !== 'builder' && session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — builder role required' }, { status: 403 });
  }
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  const exist = await pool.query(`SELECT id, newsroom_id FROM distribution_sends WHERE id = $1`, [id]);
  if (exist.rows.length === 0 || exist.rows[0].newsroom_id !== session.newsroomId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  await pool.query(`DELETE FROM distribution_sends WHERE id = $1`, [id]);
  return NextResponse.json({ ok: true });
}
