// /api/verifier/runs — list + POST (kicks runVerifierStandalone)

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';
const { runVerifierStandalone } = require('@/lib/agents/verifier');
const { decideRoute } = require('@/lib/agents/route');

export async function GET(req: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const url = new URL(req.url);
  const status = url.searchParams.get('status');
  const params: unknown[] = [session.newsroomId];
  let where = 'newsroom_id = $1';
  if (status) { params.push(status); where += ` AND status = $${params.length}`; }
  const { rows } = await pool.query(
    `SELECT id, title, claim_text, source_kind, source_id,
            matched_outlet_findings, status, duration_ms, cost_usd, error,
            created_at, updated_at
       FROM verifier_runs
      WHERE ${where}
      ORDER BY created_at DESC LIMIT 50`,
    params
  );
  return NextResponse.json({ runs: rows });
}

export async function POST(req: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (session.role !== 'builder' && session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — builder role required' }, { status: 403 });
  }
  let body: {
    claim_text?: string; title?: string; context_brief?: string;
    source_kind?: string; source_id?: string;
    archive_context?: string;
    options?: Record<string, unknown>;
  };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  if (!body.claim_text) return NextResponse.json({ error: 'claim_text is required' }, { status: 400 });

  // V2 Step 5: sensitivity classification before any Claude call.
  const route = await decideRoute({
    newsroomId: session.newsroomId,
    inputText: body.claim_text,
  });
  if (route.refuse) {
    return NextResponse.json({
      error: route.error,
      sensitivity_label: route.label,
      sensitivity_reasons: route.reasons,
      message: 'This claim was classified as sensitive. Verifier cannot send it to Anthropic; the newsroom-appliance dispatch path lands in V2 Step 6.',
    }, { status: 400 });
  }

  try {
    const result = await runVerifierStandalone({
      claimText: body.claim_text,
      title: body.title,
      contextBrief: body.context_brief,
      sourceKind: body.source_kind || 'manual',
      sourceId: body.source_id,
      archiveContext: body.archive_context,
      options: body.options || {},
      context: {
        newsroomId: session.newsroomId,
        userId: session.userId,
        endpoint: '/api/verifier/runs',
      },
    });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message, runId: (err as { runId?: string })?.runId }, { status: 422 });
  }
}
