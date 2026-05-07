// /api/social/signals/:id — GET + PATCH (status / classification / route_action) + DELETE
//
// route_action shortcuts:
//   refer-to-distributor — opens a distribution_correction tied to this signal
//                          (so the newsroom can publish a context note across
//                          the channels it's published on)
//   refer-to-calendar    — creates an editorial_calendar idea ('this needs reporting')
//   flag                 — set status='flagged' (editor wants a closer look)
//   clear                — set status='cleared'

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES = ['new', 'analysing', 'analysed', 'flagged', 'cleared', 'reported', 'failed'];
const ROUTE_ACTIONS = ['flag', 'clear', 'refer-to-distributor', 'refer-to-calendar'];

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  const { rows } = await pool.query(
    `SELECT * FROM social_signals WHERE id = $1 AND newsroom_id = $2`,
    [id, session.newsroomId]
  );
  if (rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ signal: rows[0] });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (session.role !== 'builder' && session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — builder role required' }, { status: 403 });
  }
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  const exist = await pool.query(`SELECT * FROM social_signals WHERE id = $1`, [id]);
  if (exist.rows.length === 0 || exist.rows[0].newsroom_id !== session.newsroomId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const signal = exist.rows[0];

  let body: { status?: string; notes?: string; route_action?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  if (body.route_action) {
    if (!ROUTE_ACTIONS.includes(body.route_action)) {
      return NextResponse.json({ error: `route_action must be one of ${ROUTE_ACTIONS.join(', ')}` }, { status: 400 });
    }
    if (body.route_action === 'flag') {
      await pool.query(
        `UPDATE social_signals SET status='flagged', flagged_by=$2, flagged_at=NOW(), updated_at=NOW() WHERE id=$1`,
        [id, session.userId]
      );
    } else if (body.route_action === 'clear') {
      await pool.query(
        `UPDATE social_signals SET status='cleared', updated_at=NOW() WHERE id=$1`,
        [id]
      );
    } else if (body.route_action === 'refer-to-calendar') {
      const summary = (signal.raw_text || '').slice(0, 280);
      const a = signal.analysis || {};
      const align = a.origin_signals?.source_match?.alignment;
      const note = `From flagged social signal ${id}.${align ? ` Source alignment: ${align}.` : ''} ${signal.post_url || ''}`.trim();
      const cal = await pool.query(
        `INSERT INTO editorial_calendar (newsroom_id, created_by, title, summary, status, beat, notes)
         VALUES ($1, $2, $3, $4, 'idea', 'disinformation', $5) RETURNING id`,
        [
          session.newsroomId, session.userId,
          (signal.author_display_name || signal.author_handle || 'Social signal') + ' — needs reporting',
          summary, note,
        ]
      );
      await pool.query(
        `UPDATE social_signals SET routed_to_calendar_id=$2, status='reported', updated_at=NOW() WHERE id=$1`,
        [id, cal.rows[0].id]
      );
    } else if (body.route_action === 'refer-to-distributor') {
      const a = signal.analysis || {};
      const align = a.origin_signals?.source_match?.alignment;
      const reason = `Damaging social-media post — ${align || 'origin under review'}.`;
      const corrText =
        `We've published context noting that the following social-media post is being amplified by an account associated with ${align || 'an under-review source'}. ` +
        `Original: ${signal.post_url || '(URL not captured)'}.`;
      const cor = await pool.query(
        `INSERT INTO distribution_corrections
           (newsroom_id, raised_by, source_kind, source_id, reason, correction_text, severity, status)
         VALUES ($1, $2, 'manual', $3, $4, $5, $6, 'open')
         RETURNING id`,
        [session.newsroomId, session.userId, id, reason, corrText, 'minor']
      );
      await pool.query(
        `UPDATE social_signals SET routed_to_distribution_correction_id=$2, status='reported', updated_at=NOW() WHERE id=$1`,
        [id, cor.rows[0].id]
      );
    }
    const final = await pool.query(`SELECT * FROM social_signals WHERE id=$1`, [id]);
    return NextResponse.json({ signal: final.rows[0] });
  }

  const updates: string[] = [];
  const values: unknown[] = [];
  if (typeof body.status === 'string') {
    if (!STATUSES.includes(body.status)) return NextResponse.json({ error: `status must be one of ${STATUSES.join(', ')}` }, { status: 400 });
    values.push(body.status); updates.push(`status = $${values.length}`);
  }
  if (typeof body.notes === 'string') { values.push(body.notes); updates.push(`notes = $${values.length}`); }
  if (updates.length === 0) return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  updates.push(`updated_at = NOW()`);
  values.push(id);
  const { rows } = await pool.query(
    `UPDATE social_signals SET ${updates.join(', ')} WHERE id = $${values.length} RETURNING *`,
    values
  );
  return NextResponse.json({ signal: rows[0] });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (session.role !== 'builder' && session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — builder role required' }, { status: 403 });
  }
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  const exist = await pool.query(`SELECT id, newsroom_id FROM social_signals WHERE id = $1`, [id]);
  if (exist.rows.length === 0 || exist.rows[0].newsroom_id !== session.newsroomId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  await pool.query(`DELETE FROM social_signals WHERE id = $1`, [id]);
  return NextResponse.json({ ok: true });
}
