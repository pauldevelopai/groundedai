// GET /api/security/jurisdiction/effective
//
// Security Audit Slice B. Returns:
//   - jurisdiction: the newsroom's set jurisdiction code (or 'default')
//   - pack: the base pack for that jurisdiction
//   - overrides: the per-newsroom override blob (or null)
//   - effective: pack merged with overrides — what the audit will actually
//     score against. The UI shows what differs from the base pack so the
//     editor knows the impact of their overrides at a glance.

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';
const { packFor, mergePackWithOverrides } = require('@/lib/security/jurisdiction');

export async function GET() {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { rows } = await pool.query(
    `SELECT metadata->>'jurisdiction' AS jurisdiction,
            metadata->'jurisdiction_overrides' AS overrides
       FROM newsroom_profiles
      WHERE newsroom_id = $1`,
    [session.newsroomId]
  );
  const jurisdiction = (rows[0]?.jurisdiction || 'default').trim() || 'default';
  const overrides = rows[0]?.overrides || null;

  const basePack = packFor(jurisdiction);
  const effective = mergePackWithOverrides(basePack, overrides);

  return NextResponse.json({
    jurisdiction,
    pack: basePack,
    overrides,
    effective,
  });
}
