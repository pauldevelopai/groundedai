// /social — Social Listener workspace. Six regions:
// briefs at top, signals queue, keywords watchlist, documented IO
// networks (Doppelganger, African Initiative, Spamouflage Dragon,
// Wagner-aligned, Secondary Infektion — seeded by default), source-
// reputation list, and an ingest form that captures Page Transparency
// metadata (the strongest origin signal).

import { redirect } from 'next/navigation';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';
import SocialWorkspace from './SocialWorkspace';
const { listSources } = require('@/lib/social/sources');
const { listKeywords } = require('@/lib/social/keywords');
const { listNetworks } = require('@/lib/social/networks');

export default async function SocialPage() {
  const session = await getCurrentSession();
  if (!session) redirect('/login?next=/social');

  const [signalsRes, keywords, sources, networks, briefsRes] = await Promise.all([
    pool.query(
      `SELECT id, ingestion_kind, platform, post_url, author_handle, author_display_name,
              source_domain, raw_text, posted_at, matched_keywords, analysis,
              account_country, account_country_iso, account_created_at,
              posting_cadence_note, matched_networks,
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
    listNetworks(session.newsroomId),
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
      initialNetworks={networks}
      initialBriefs={briefsRes.rows}
      canEdit={canEdit}
      role={session.role}
    />
  );
}
