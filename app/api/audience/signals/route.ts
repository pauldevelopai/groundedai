// /api/audience/signals — GET list + POST ingest CSV
//
// POST body: { source, raw_csv, filename?, notes? }

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';
const { ingestSignals } = require('@/lib/audience/signals');

const VALID_SOURCES = new Set(['plausible', 'umami', 'ga', 'csv', 'manual']);

export async function GET() {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { rows } = await pool.query(
    `SELECT id, source, filename, period_start, period_end, signals,
            total_pageviews, unique_visitors, analysis_summary, status,
            cost_usd, duration_ms, error, notes, created_at
       FROM audience_signals
      WHERE newsroom_id = $1
      ORDER BY created_at DESC
      LIMIT 50`,
    [session.newsroomId]
  );
  return NextResponse.json({ signals: rows });
}

export async function POST(req: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (session.role !== 'builder' && session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — builder role required' }, { status: 403 });
  }
  let body: { source?: string; raw_csv?: string; filename?: string; notes?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const source = body.source?.trim().toLowerCase();
  if (!source || !VALID_SOURCES.has(source)) {
    return NextResponse.json({ error: `source must be one of: ${[...VALID_SOURCES].join(', ')}` }, { status: 400 });
  }
  const rawCsv = body.raw_csv?.trim();
  if (!rawCsv || rawCsv.length < 10) {
    return NextResponse.json({ error: 'raw_csv is required (paste rows or upload a CSV)' }, { status: 400 });
  }

  try {
    const out = await ingestSignals({
      rawCsv,
      source,
      filename: body.filename?.trim() || null,
      notes: body.notes?.trim() || null,
      context: { newsroomId: session.newsroomId, userId: session.userId },
    });
    return NextResponse.json(out, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
