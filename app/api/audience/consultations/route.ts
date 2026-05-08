// /api/audience/consultations — list + POST (kicks Audience agent)

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';
const { runAudienceConsultation } = require('@/lib/agents/audience');

export async function GET(req: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const url = new URL(req.url);
  const kind = url.searchParams.get('kind');
  const params: unknown[] = [session.newsroomId];
  let where = 'newsroom_id = $1';
  if (kind) { params.push(kind); where += ` AND kind = $${params.length}`; }
  const { rows } = await pool.query(
    `SELECT id, title, kind, input_text, referenced_signal_ids,
            status, duration_ms, cost_usd, error,
            created_at, updated_at
       FROM audience_consultations
      WHERE ${where}
      ORDER BY created_at DESC LIMIT 50`,
    params
  );
  return NextResponse.json({ consultations: rows });
}

export async function POST(req: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (session.role !== 'builder' && session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — builder role required' }, { status: 403 });
  }
  let body: { kind?: string; input_text?: string; context_brief?: string; title?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  if (!body.kind) return NextResponse.json({ error: 'kind is required' }, { status: 400 });
  if (!body.input_text) return NextResponse.json({ error: 'input_text is required' }, { status: 400 });

  try {
    const result = await runAudienceConsultation({
      kind: body.kind,
      inputText: body.input_text,
      contextBrief: body.context_brief,
      title: body.title,
      context: {
        newsroomId: session.newsroomId,
        userId: session.userId,
        endpoint: '/api/audience/consultations',
      },
    });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
