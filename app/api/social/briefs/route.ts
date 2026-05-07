// /api/social/briefs — list + POST (kicks Social Listener agent)

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';
const { runSocialListenerBrief } = require('@/lib/agents/social_listener');

export async function GET(req: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const url = new URL(req.url);
  const kind = url.searchParams.get('kind');
  const params: unknown[] = [session.newsroomId];
  let where = 'newsroom_id = $1';
  if (kind) { params.push(kind); where += ` AND kind = $${params.length}`; }
  const { rows } = await pool.query(
    `SELECT id, title, kind, signal_ids, status, duration_ms, cost_usd, error,
            created_at, updated_at
       FROM social_listener_briefs
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
  let body: { kind?: string; title?: string; brief_input?: string; signal_ids?: string[] };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  if (!body.kind) return NextResponse.json({ error: 'kind is required' }, { status: 400 });

  try {
    const result = await runSocialListenerBrief({
      kind: body.kind,
      title: body.title,
      briefInput: body.brief_input,
      signalIds: Array.isArray(body.signal_ids) ? body.signal_ids : null,
      context: {
        newsroomId: session.newsroomId,
        userId: session.userId,
        endpoint: '/api/social/briefs',
      },
    });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
