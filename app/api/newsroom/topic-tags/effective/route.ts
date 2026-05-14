// GET /api/newsroom/topic-tags/effective
//
// Returns the full topic taxonomy AFTER merging the pan-African default with
// the per-newsroom override. Plus the default by itself + the override by
// itself so the UI can render a diff view.

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';
const { loadDefaultTopics, getEffectiveTopics } = require('@/lib/copywriter/topic-tags');

export async function GET(_req: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const defaults = loadDefaultTopics();
  const effective = await getEffectiveTopics(session.newsroomId);

  const { rows } = await pool.query(
    `SELECT metadata->'topic_tags' AS override FROM newsroom_profiles WHERE newsroom_id = $1`,
    [session.newsroomId]
  );
  const override = rows[0]?.override || null;

  return NextResponse.json({ defaults, effective, override });
}
