// /api/distribution/briefs — list + POST (kicks Distributor agent)

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';
const { runDistributorBrief } = require('@/lib/agents/distributor');

export async function GET(req: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const url = new URL(req.url);
  const kind = url.searchParams.get('kind');
  const params: unknown[] = [session.newsroomId];
  let where = 'newsroom_id = $1';
  if (kind) { params.push(kind); where += ` AND kind = $${params.length}`; }
  const { rows } = await pool.query(
    `SELECT id, title, kind, status, inbound_id, send_id, correction_id,
            source_kind, source_id, duration_ms, cost_usd, error,
            created_at, updated_at
       FROM distributor_briefs
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
  let body: {
    kind?: string; title?: string; brief_input?: string;
    inbound_id?: string;
    source_kind?: string; source_id?: string;
    correction_id?: string;
  };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  if (!body.kind) return NextResponse.json({ error: 'kind is required' }, { status: 400 });

  try {
    const result = await runDistributorBrief({
      kind: body.kind,
      briefInput: body.brief_input,
      title: body.title,
      inboundId: body.inbound_id,
      sourceKind: body.source_kind,
      sourceId: body.source_id,
      correctionId: body.correction_id,
      context: {
        newsroomId: session.newsroomId,
        userId: session.userId,
        endpoint: '/api/distribution/briefs',
      },
    });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
