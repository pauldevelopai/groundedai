// /social — Social Listener workspace. Five regions:
// briefs at top, signals queue, keywords watchlist, source-reputation
// list, ingest panel (manual paste + bulk JSON).

import { redirect } from 'next/navigation';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';
import SocialWorkspace from './SocialWorkspace';
const { listSources } = require('@/lib/social/sources');
const { listKeywords } = require('@/lib/social/keywords');

export default async function SocialPage() {
  const session = await getCurrentSession();
  if (!session) redirect('/login?next=/social');

  const [signalsRes, keywords, sources, briefsRes] = await Promise.all([
    pool.query(
      `SELECT id, ingestion_kind, platform, post_url, author_handle, author_display_name,
              source_domain, raw_text, posted_at, matched_keywords, analysis,
              status, flagged_at, notes, created_at, updated_at
         FROM social_signals
        WHERE newsroom_id = $1
        ORDER BY
          CASE status WHEN 'flagged' THEN 0 WHEN 'new' THEN 1 WHEN 'analysed' THEN 2 ELSE 3 END,
          created_at DESC LIMIT 80`,
      [session.newsroomId]
    ),
    listKeywords(session.newsroomId),
    listSources(session.newsroomId),
    pool.query(
      `SELECT id, title, kind, signal_ids, status, duration_ms, cost_usd, error,
              created_at, updated_at
         FROM social_listener_briefs WHERE newsroom_id = $1
        ORDER BY created_at DESC LIMIT 30`,
      [session.newsroomId]
    ),
  ]);

  const canEdit = session.role === 'builder' || session.role === 'admin';
  return (
    <SocialWorkspace
      initialSignals={signalsRes.rows}
      initialKeywords={keywords}
      initialSources={sources}
      initialBriefs={briefsRes.rows}
      canEdit={canEdit}
      role={session.role}
    />
  );
}
