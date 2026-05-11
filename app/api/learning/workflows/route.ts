// /api/learning/workflows — list cohort-promoted workflows + recompute (admin only).

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
const { listPromotions, computePromotions } = require('@/lib/learning/promotions');

export async function GET() {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const promotions = await listPromotions(session.newsroomId);
  return NextResponse.json({ promotions });
}

export async function POST(req: Request) {
  // POST recomputes the promotions table from current usage. Admin only —
  // this is intentionally a manual trigger rather than a cron job, so
  // newsroom administrators control when the cohort view refreshes.
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — admin role required' }, { status: 403 });
  }
  let body: { thresholds?: { minRuns?: number; minAdopters?: number } } = {};
  try { body = await req.json(); } catch { /* empty body OK */ }
  const result = await computePromotions(body.thresholds);
  return NextResponse.json(result);
}
