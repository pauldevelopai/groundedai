// GET /api/newsroom/trusted-sources/effective
//
// Returns the trusted-sources allowlist AFTER merging the pan-African
// default with the per-newsroom override. Plus the default and the override
// individually so the UI can show a diff.

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';
const { loadDefault, getEffectiveAllowlist } = require('@/lib/research/trusted-sources');

export async function GET(_req: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const defaults = loadDefault();
  const effective = await getEffectiveAllowlist(session.newsroomId);

  const { rows } = await pool.query(
    `SELECT metadata->'trusted_sources' AS override FROM newsroom_profiles WHERE newsroom_id = $1`,
    [session.newsroomId]
  );
  const override = rows[0]?.override || null;

  return NextResponse.json({ defaults, effective, override });
}
