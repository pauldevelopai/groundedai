// /api/operations/briefs — list + POST (kicks the agent)

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';
const { runOperationsBrief } = require('@/lib/agents/operations');

export async function GET(req: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const url = new URL(req.url);
  const kind = url.searchParams.get('kind');
  const params: unknown[] = [session.newsroomId];
  let where = 'newsroom_id = $1';
  if (kind) { params.push(kind); where += ` AND kind = $${params.length}`; }
  const { rows } = await pool.query(
    `SELECT id, title, kind, status, duration_ms, cost_usd, error, created_at, updated_at
       FROM ops_briefs
      WHERE ${where}
      ORDER BY created_at DESC LIMIT 50`,
    params
  );
  return NextResponse.json({ briefs: rows });
}

export async function POST(req: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (session.role !== 'builder' && session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — builder role required' }, { status: 403 });
  }
  let body: { kind?: string; brief_input?: string; title?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  if (!body.kind) return NextResponse.json({ error: 'kind is required' }, { status: 400 });

  try {
    const result = await runOperationsBrief({
      kind: body.kind,
      briefInput: body.brief_input,
      title: body.title,
      context: {
        newsroomId: session.newsroomId,
        userId: session.userId,
        endpoint: '/api/operations/briefs',
      },
    });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
