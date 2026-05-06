// /audience — Audience workspace. Three regions: personas (top), signals
// (middle), focus groups (bottom). Server pre-loads everything; client
// component handles all the create/edit/delete actions.
//
// Personas auto-seed defaults (low-data, vernacular-first, feature-phone)
// on first load — listPersonas does that under the hood.

import { redirect } from 'next/navigation';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';
import AudienceWorkspace from './AudienceWorkspace';
const { listPersonas } = require('@/lib/audience/personas');

export default async function AudiencePage() {
  const session = await getCurrentSession();
  if (!session) redirect('/login?next=/audience');

  const [personas, signalsRes, sessionsRes] = await Promise.all([
    listPersonas(session.newsroomId),
    pool.query(
      `SELECT id, source, filename, signals, total_pageviews, unique_visitors,
              analysis_summary, status, cost_usd, duration_ms, error, notes, created_at
         FROM audience_signals
        WHERE newsroom_id = $1
        ORDER BY created_at DESC LIMIT 30`,
      [session.newsroomId]
    ),
    pool.query(
      `SELECT id, title, test_material_kind, context_brief, persona_ids,
              summary, recommendations, status, duration_ms, cost_usd, error, created_at
         FROM focus_group_sessions
        WHERE newsroom_id = $1
        ORDER BY created_at DESC LIMIT 30`,
      [session.newsroomId]
    ),
  ]);

  const canEdit = session.role === 'builder' || session.role === 'admin';
  return (
    <AudienceWorkspace
      initialPersonas={personas}
      initialSignals={signalsRes.rows}
      initialSessions={sessionsRes.rows}
      canEdit={canEdit}
      role={session.role}
    />
  );
}
