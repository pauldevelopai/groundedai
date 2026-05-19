// /api/security/reports — Digital Security Audit Slice C.
//
// GET  — list the newsroom's recent audit reports (any role).
// POST — run a new audit (builder + admin only). Body (optional):
//        { routingWindowDays?: number } — default 90.
//
// POST is synchronous in this slice: it kicks runAudit() inline. Typical
// runs take 2-6s (one Haiku call + a handful of SQL reads). If the call
// errors mid-run, the row is still created with status='failed' and the
// error captured so the editor can see what happened.

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';
const { runAudit } = require('@/lib/agents/security_audit');

export async function GET() {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { rows } = await pool.query(
    `SELECT r.id, r.status, r.overall_risk_band, r.routing_window_days,
            r.started_at, r.finished_at, r.cost_usd, r.error,
            u.email AS initiated_by_email
       FROM security_audit_reports r
       LEFT JOIN users u ON u.id = r.initiated_by
      WHERE r.newsroom_id = $1
      ORDER BY r.started_at DESC
      LIMIT 30`,
    [session.newsroomId]
  );
  return NextResponse.json({ reports: rows });
}

export async function POST(req: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (session.role !== 'builder' && session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — builder role required' }, { status: 403 });
  }

  let body: { routingWindowDays?: number } = {};
  try { if (req.headers.get('content-length')) body = await req.json(); }
  catch { /* empty body is fine */ }

  try {
    const { reportId, overallRiskBand } = await runAudit({
      newsroomId: session.newsroomId,
      userId: session.userId,
      routingWindowDays: body.routingWindowDays,
    });
    return NextResponse.json({ reportId, overallRiskBand }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const reportId = (err as { reportId?: string })?.reportId;
    return NextResponse.json({ error: message, reportId: reportId || null }, { status: 500 });
  }
}
