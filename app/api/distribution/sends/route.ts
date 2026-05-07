// /api/distribution/sends — list + POST queue+dispatch.
//
// POST queues a send and immediately dispatches it (or simulates dispatch
// during the pilot — see lib/distribution/dispatch.js). Use ?dispatch=0
// to queue without dispatching, e.g. for scheduled sends.

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';
const { queueSend, dispatchSend } = require('@/lib/distribution/dispatch');

const SOURCE_KINDS = ['production', 'draft', 'translation', 'manual'];

export async function GET(req: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const url = new URL(req.url);
  const status = url.searchParams.get('status') || undefined;
  const params: unknown[] = [session.newsroomId];
  let where = 's.newsroom_id = $1';
  if (status) { params.push(status); where += ` AND s.status = $${params.length}`; }
  const { rows } = await pool.query(
    `SELECT s.id, s.channel_id, c.name AS channel_name, c.channel_kind,
            s.source_kind, s.source_id, s.source_calendar_id,
            s.payload, s.status, s.external_id, s.permalink,
            s.scheduled_for, s.dispatched_at, s.error,
            s.created_at, s.updated_at
       FROM distribution_sends s
       JOIN distribution_channels c ON c.id = s.channel_id
      WHERE ${where}
      ORDER BY s.created_at DESC LIMIT 80`,
    params
  );
  return NextResponse.json({ sends: rows });
}

export async function POST(req: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (session.role !== 'builder' && session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — builder role required' }, { status: 403 });
  }

  let body: {
    channel_id?: string;
    source_kind?: string; source_id?: string; source_calendar_id?: string;
    payload?: Record<string, unknown>;
    scheduled_for?: string;
  };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  if (!body.channel_id) return NextResponse.json({ error: 'channel_id is required' }, { status: 400 });
  if (!body.source_kind || !SOURCE_KINDS.includes(body.source_kind)) {
    return NextResponse.json({ error: `source_kind must be one of ${SOURCE_KINDS.join(', ')}` }, { status: 400 });
  }
  // Verify channel ownership
  const ch = await pool.query(`SELECT id, newsroom_id FROM distribution_channels WHERE id = $1`, [body.channel_id]);
  if (ch.rows.length === 0 || ch.rows[0].newsroom_id !== session.newsroomId) {
    return NextResponse.json({ error: 'channel_id not found in this newsroom' }, { status: 404 });
  }

  const url = new URL(req.url);
  const dispatchNow = url.searchParams.get('dispatch') !== '0';

  const queued = await queueSend({
    newsroomId: session.newsroomId,
    channelId: body.channel_id,
    sourceKind: body.source_kind,
    sourceId: body.source_id,
    sourceCalendarId: body.source_calendar_id,
    payload: body.payload || {},
    scheduledFor: body.scheduled_for,
    userId: session.userId,
  });

  if (!dispatchNow) return NextResponse.json({ send: queued }, { status: 201 });

  try {
    const result = await dispatchSend(queued.id, session.newsroomId);
    return NextResponse.json({ send: result.send }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message, sendId: queued.id }, { status: 422 });
  }
}
