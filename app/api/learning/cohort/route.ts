// /api/learning/cohort — cohort-level meta-analytics. Anonymised aggregates
// across all newsrooms; the calling newsroom is included in the rollup.

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
const { cohortMetrics } = require('@/lib/learning/cohort');

export async function GET() {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const metrics = await cohortMetrics();
  return NextResponse.json({ metrics });
}
