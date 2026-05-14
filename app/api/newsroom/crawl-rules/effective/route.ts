// GET /api/newsroom/crawl-rules/effective
//
// Returns effective crawl rules (defaults ⊕ override) plus the default and
// override individually so the UI can show diff state.

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';
const { DEFAULT_RULES, getEffectiveCrawlRules } = require('@/lib/research/crawl');

export async function GET(_req: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const effective = await getEffectiveCrawlRules(session.newsroomId);
  const { rows } = await pool.query(
    `SELECT metadata->'crawl_rules' AS override FROM newsroom_profiles WHERE newsroom_id = $1`,
    [session.newsroomId]
  );
  const override = rows[0]?.override || null;

  return NextResponse.json({ defaults: DEFAULT_RULES, effective, override });
}
