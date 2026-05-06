// /api/fundraiser/briefs — list + POST (kicks off agent)

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';
const { runFundraiserBrief } = require('@/lib/agents/fundraiser');

export async function GET(req: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const url = new URL(req.url);
  const kind = url.searchParams.get('kind');
  const status = url.searchParams.get('status');
  let where = 'b.newsroom_id = $1';
  const params: unknown[] = [session.newsroomId];
  if (kind) {
    params.push(kind);
    where += ` AND b.kind = $${params.length}`;
  }
  if (status) {
    params.push(status);
    where += ` AND b.status = $${params.length}`;
  }
  const { rows } = await pool.query(
    `SELECT b.id, b.title, b.kind, b.status, b.funder_id, f.name AS funder_name,
            b.budget_request_usd, b.duration_months,
            b.duration_ms, b.cost_usd, b.error, b.created_at, b.updated_at
       FROM fundraiser_briefs b
       LEFT JOIN funders f ON f.id = b.funder_id
      WHERE ${where}
      ORDER BY b.created_at DESC
      LIMIT 50`,
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
    kind?: string;
    brief_input?: string;
    title?: string;
    funder_id?: string;
    budget_request_usd?: number;
    duration_months?: number;
  };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  if (!body.kind) return NextResponse.json({ error: 'kind is required' }, { status: 400 });
  if (!body.brief_input) return NextResponse.json({ error: 'brief_input is required' }, { status: 400 });

  try {
    const result = await runFundraiserBrief({
      kind: body.kind,
      briefInput: body.brief_input,
      title: body.title,
      funderId: body.funder_id,
      budgetRequestUsd: body.budget_request_usd,
      durationMonths: body.duration_months,
      context: {
        newsroomId: session.newsroomId,
        userId: session.userId,
        endpoint: '/api/fundraiser/briefs',
      },
    });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
