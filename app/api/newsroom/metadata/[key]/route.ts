// /api/newsroom/metadata/:key
//
// Surgical read/write of a single top-level key inside newsroom_profile.
// metadata. Avoids the foot-gun of PATCHing the whole metadata blob (which
// would clobber sibling keys like house_style_fingerprint).
//
// Used by the per-newsroom override editors:
//   /metadata/topic_tags         (Track B1)
//   /metadata/trusted_sources    (Track B2)
//   /metadata/crawl_rules        (Track B3)
//   /metadata/ai_crawler_policy  (V1.3)
//
// GET — returns { value: <whatever's stored at metadata.key>, exists: bool }
// PATCH — body { value: <JSON> }. Builder+admin only. Writes via
//         jsonb_build_object so other keys survive untouched. Pass
//         { value: null } to remove the key entirely.

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';

// Whitelist the keys we allow editing through this endpoint. Anything else
// would be a typo / mistake — refuse rather than store cruft.
const EDITABLE_KEYS = new Set([
  'topic_tags',
  'trusted_sources',
  'crawl_rules',
  'ai_crawler_policy',
  'cohort_signals_enabled',     // V2 Step 2 — Mentorship cohort-tab opt-in
  'sensitivity_rules',          // V2 Step 5 — per-newsroom sensitivity overrides
]);

export async function GET(_req: Request, ctx: { params: Promise<{ key: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { key } = await ctx.params;
  if (!EDITABLE_KEYS.has(key)) {
    return NextResponse.json({ error: 'Unknown metadata key' }, { status: 400 });
  }

  const { rows } = await pool.query(
    `SELECT metadata-> $1 AS value
       FROM newsroom_profiles
      WHERE newsroom_id = $2`,
    [key, session.newsroomId]
  );
  if (rows.length === 0) return NextResponse.json({ value: null, exists: false });
  return NextResponse.json({ value: rows[0].value, exists: rows[0].value != null });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ key: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (session.role !== 'builder' && session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — builder role required' }, { status: 403 });
  }
  const { key } = await ctx.params;
  if (!EDITABLE_KEYS.has(key)) {
    return NextResponse.json({ error: 'Unknown metadata key' }, { status: 400 });
  }

  let body: { value?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  // null → remove the key. Anything else → replace it.
  if (body.value === null) {
    await pool.query(
      `INSERT INTO newsroom_profiles (newsroom_id, metadata)
       VALUES ($1, '{}'::jsonb)
       ON CONFLICT (newsroom_id) DO UPDATE
          SET metadata = newsroom_profiles.metadata - $2,
              updated_at = NOW()`,
      [session.newsroomId, key]
    );
    return NextResponse.json({ value: null, exists: false });
  }

  await pool.query(
    `INSERT INTO newsroom_profiles (newsroom_id, metadata)
     VALUES ($1, jsonb_build_object($2, $3::jsonb))
     ON CONFLICT (newsroom_id) DO UPDATE
        SET metadata = COALESCE(newsroom_profiles.metadata, '{}'::jsonb)
                         || jsonb_build_object($2, $3::jsonb),
            updated_at = NOW()`,
    [session.newsroomId, key, JSON.stringify(body.value)]
  );
  return NextResponse.json({ value: body.value, exists: true });
}
