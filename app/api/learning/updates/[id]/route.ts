// /api/learning/updates/:id — PATCH (acknowledge/dismiss + edit own private notes) + DELETE.

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DECISIONS = ['applies', 'dismissed', 'pending'];

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (session.role !== 'builder' && session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — builder role required' }, { status: 403 });
  }
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const exist = await pool.query(`SELECT id, newsroom_id FROM learning_updates WHERE id = $1`, [id]);
  if (exist.rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const update = exist.rows[0];

  let body: { decision?: string; ack_notes?: string; title?: string; body?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  // Acknowledgement is per-newsroom — even on cohort-shared updates.
  if (body.decision !== undefined) {
    if (!DECISIONS.includes(body.decision)) {
      return NextResponse.json({ error: `decision must be one of ${DECISIONS.join(', ')}` }, { status: 400 });
    }
    await pool.query(
      `INSERT INTO learning_update_acknowledgements
         (newsroom_id, update_id, acknowledged_by, decision, notes)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (newsroom_id, update_id) DO UPDATE SET
         decision = EXCLUDED.decision,
         notes = EXCLUDED.notes,
         acknowledged_by = EXCLUDED.acknowledged_by,
         updated_at = NOW()`,
      [session.newsroomId, id, session.userId, body.decision, body.ack_notes || null]
    );
  }

  // Editing the underlying update row only allowed for newsroom-private notes
  // OR by admins for cohort-shared rows.
  if (body.title !== undefined || body.body !== undefined) {
    const isOwnPrivate = update.newsroom_id === session.newsroomId;
    const isCohortAdmin = update.newsroom_id === null && session.role === 'admin';
    if (!isOwnPrivate && !isCohortAdmin) {
      return NextResponse.json({ error: 'Cannot edit this update — cohort-shared updates are admin-only.' }, { status: 403 });
    }
    const updates: string[] = [];
    const values: unknown[] = [];
    if (typeof body.title === 'string' && body.title.trim()) {
      values.push(body.title.trim()); updates.push(`title = $${values.length}`);
    }
    if (typeof body.body === 'string' && body.body.trim()) {
      values.push(body.body.trim()); updates.push(`body = $${values.length}`);
    }
    if (updates.length > 0) {
      updates.push(`updated_at = NOW()`);
      values.push(id);
      await pool.query(
        `UPDATE learning_updates SET ${updates.join(', ')} WHERE id = $${values.length}`,
        values
      );
    }
  }

  // Return the up-to-date row + ack
  const { rows } = await pool.query(
    `SELECT u.*, ack.decision AS ack_decision, ack.notes AS ack_notes
       FROM learning_updates u
       LEFT JOIN learning_update_acknowledgements ack
         ON ack.update_id = u.id AND ack.newsroom_id = $2
      WHERE u.id = $1`,
    [id, session.newsroomId]
  );
  return NextResponse.json({ update: rows[0] });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — admin role required' }, { status: 403 });
  }
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  const exist = await pool.query(`SELECT id, newsroom_id FROM learning_updates WHERE id = $1`, [id]);
  if (exist.rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const update = exist.rows[0];
  // Cohort updates: admin-only delete (we already gated above). Newsroom-private:
  // must belong to caller's newsroom.
  if (update.newsroom_id !== null && update.newsroom_id !== session.newsroomId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  await pool.query(`DELETE FROM learning_updates WHERE id = $1`, [id]);
  return NextResponse.json({ ok: true });
}
