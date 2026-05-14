// GET /api/newsroom/ai-crawler-policy/effective
//
// Returns the effective AI-crawler policy (defaults ⊕ override) plus the
// rendered robots.txt / ai.txt / llms.txt snippets so the UI can offer
// copy + download without a second round-trip.

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';
const {
  KNOWN_BOTS,
  DEFAULT_POLICY,
  getEffectiveAiCrawlerPolicy,
  renderRobotsTxt,
  renderAiTxt,
  renderLlmsTxt,
} = require('@/lib/newsroom-profile/ai-crawler-policy');

export async function GET(_req: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const effective = await getEffectiveAiCrawlerPolicy(session.newsroomId);
  const { rows } = await pool.query(
    `SELECT metadata->'ai_crawler_policy' AS override, name AS newsroom_name
       FROM newsroom_profiles
       JOIN newsrooms ON newsrooms.id = newsroom_profiles.newsroom_id
      WHERE newsroom_id = $1`,
    [session.newsroomId]
  );
  const override = rows[0]?.override || null;
  const siteName = rows[0]?.newsroom_name || 'Newsroom';

  return NextResponse.json({
    known_bots: KNOWN_BOTS,
    defaults: DEFAULT_POLICY,
    effective,
    override,
    snippets: {
      robots_txt: renderRobotsTxt(effective),
      ai_txt: renderAiTxt(effective),
      llms_txt: renderLlmsTxt(effective, { siteName }),
    },
  });
}
