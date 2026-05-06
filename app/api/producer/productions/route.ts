// /api/producer/productions
//
// GET  — list productions in the caller's newsroom (latest first, capped 50).
//        Optional ?format=&status=
// POST — kick off a new production. Body:
//        { title?, source_text, format, archive_context? }
//        Builder/admin role required.

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';
const { runProduction } = require('@/lib/agents/producer');

export async function GET(req: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const url = new URL(req.url);
  const format = url.searchParams.get('format');
  const status = url.searchParams.get('status');
  let where = 'newsroom_id = $1';
  const params: unknown[] = [session.newsroomId];
  if (format) {
    params.push(format);
    where += ` AND format = $${params.length}`;
  }
  if (status) {
    params.push(status);
    where += ` AND status = $${params.length}`;
  }
  const { rows } = await pool.query(
    `SELECT id, title, format, status, duration_estimate_seconds, duration_ms,
            cost_usd, error, created_at, updated_at
       FROM producer_productions
      WHERE ${where}
      ORDER BY created_at DESC
      LIMIT 50`,
    params
  );
  return NextResponse.json({ productions: rows });
}

export async function POST(req: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (session.role !== 'builder' && session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — builder role required' }, { status: 403 });
  }

  let body: { title?: string; source_text?: string; format?: string; archive_context?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!body.source_text || typeof body.source_text !== 'string') {
    return NextResponse.json({ error: 'source_text is required' }, { status: 400 });
  }
  if (!body.format || typeof body.format !== 'string') {
    return NextResponse.json({ error: 'format is required' }, { status: 400 });
  }

  try {
    const result = await runProduction({
      title: body.title,
      sourceText: body.source_text,
      format: body.format,
      archiveContext: body.archive_context,
      context: {
        newsroomId: session.newsroomId,
        userId: session.userId,
        endpoint: '/api/producer/productions',
      },
    });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
