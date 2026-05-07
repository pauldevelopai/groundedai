// /api/operations/metrics — list snapshots + POST snapshot.

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';
const { listSnapshots } = require('@/lib/operations/metrics');

export async function GET() {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const rows = await listSnapshots(session.newsroomId, { limit: 24 });
  return NextResponse.json({ snapshots: rows });
}

export async function POST(req: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (session.role !== 'builder' && session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — builder role required' }, { status: 403 });
  }
  let body: {
    period_start?: string; period_end?: string; label?: string;
    metrics?: Record<string, unknown>; notes?: string;
  };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  if (!body.period_start || !body.period_end) {
    return NextResponse.json({ error: 'period_start and period_end (ISO date) are required' }, { status: 400 });
  }
  if (!body.metrics || typeof body.metrics !== 'object' || Array.isArray(body.metrics)) {
    return NextResponse.json({ error: 'metrics must be an object' }, { status: 400 });
  }
  const { rows } = await pool.query(
    `INSERT INTO ops_metric_snapshots
       (newsroom_id, recorded_by, period_start, period_end, label, metrics, notes)
     VALUES ($1, $2, $3::date, $4::date, $5, $6::jsonb, $7)
     RETURNING *`,
    [
      session.newsroomId, session.userId,
      body.period_start, body.period_end,
      body.label?.trim() || null,
      JSON.stringify(body.metrics),
      body.notes?.trim() || null,
    ]
  );
  return NextResponse.json({ snapshot: rows[0] }, { status: 201 });
}
