// GET /api/newsroom/sensitivity-rules/effective
//
// V2 Step 5. Returns the effective sensitivity rules (defaults ⊕
// override) plus the default + override individually so the editor can
// show what differs from platform defaults.

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';
const { DEFAULT_RULES, getEffectiveRules } = require('@/lib/sensitivity/classify');

export async function GET(_req: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const effective = await getEffectiveRules(session.newsroomId);
  const { rows } = await pool.query(
    `SELECT metadata->'sensitivity_rules' AS override
       FROM newsroom_profiles
      WHERE newsroom_id = $1`,
    [session.newsroomId]
  );
  const override = rows[0]?.override || null;
  return NextResponse.json({ defaults: DEFAULT_RULES, effective, override });
}
