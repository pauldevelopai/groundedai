// /audience — Audience workspace, post-2026-05-07 scope refactor.
// Two primary regions: analytics signals (the foundation) and
// consultations (headline_test / angle_check / analytics_query — the
// new primary editor surface). Synthetic personas + focus-groups are
// soft-deprecated; their tables remain for backward compat but the
// workspace UI no longer surfaces them.

import { redirect } from 'next/navigation';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';
import AudienceWorkspace from './AudienceWorkspace';

export default async function AudiencePage() {
  const session = await getCurrentSession();
  if (!session) redirect('/login?next=/audience');

  const [signalsRes, consultationsRes] = await Promise.all([
    pool.query(
      `SELECT id, source, filename, signals, total_pageviews, unique_visitors,
              analysis_summary, status, cost_usd, duration_ms, error, notes, created_at
         FROM audience_signals
        WHERE newsroom_id = $1
        ORDER BY created_at DESC LIMIT 30`,
      [session.newsroomId]
    ),
    pool.query(
      `SELECT id, title, kind, input_text, referenced_signal_ids,
              status, duration_ms, cost_usd, error, created_at, updated_at
         FROM audience_consultations
        WHERE newsroom_id = $1
        ORDER BY created_at DESC LIMIT 30`,
      [session.newsroomId]
    ),
  ]);

  const canEdit = session.role === 'builder' || session.role === 'admin';
  return (
    <AudienceWorkspace
      initialSignals={signalsRes.rows}
      initialConsultations={consultationsRes.rows}
      canEdit={canEdit}
      role={session.role}
    />
  );
}
