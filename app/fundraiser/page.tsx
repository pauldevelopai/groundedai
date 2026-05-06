// /fundraiser — Fundraiser workspace. Three regions: funder library (top),
// briefs (middle), cohort joint-application opportunities (bottom). Server
// pre-loads everything; client component handles all create/edit actions.
//
// Funders auto-seed defaults (OSF, MacArthur, Luminate, GNI, Ford, IFPIM,
// KAS-Africa, Hewlett) on first load — listFunders does that under the hood.

import { redirect } from 'next/navigation';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';
import FundraiserWorkspace from './FundraiserWorkspace';
const { listFunders } = require('@/lib/fundraiser/funders');

export default async function FundraiserPage() {
  const session = await getCurrentSession();
  if (!session) redirect('/login?next=/fundraiser');

  const [funders, briefsRes, matchesRes, profileRes] = await Promise.all([
    listFunders(session.newsroomId),
    pool.query(
      `SELECT b.id, b.title, b.kind, b.status, b.funder_id, f.name AS funder_name,
              b.budget_request_usd, b.duration_months,
              b.duration_ms, b.cost_usd, b.error, b.created_at, b.updated_at
         FROM fundraiser_briefs b
         LEFT JOIN funders f ON f.id = b.funder_id
        WHERE b.newsroom_id = $1
        ORDER BY b.created_at DESC LIMIT 50`,
      [session.newsroomId]
    ),
    pool.query(
      `SELECT m.id, m.funder_id, m.funder_name, m.partner_newsroom_id,
              n.name AS partner_newsroom_name,
              m.rationale, m.match_score, m.shared_strengths, m.shared_geography,
              m.status, m.responded_at, m.created_at
         FROM fundraiser_cohort_matches m
         LEFT JOIN newsrooms n ON n.id = m.partner_newsroom_id
        WHERE m.anchor_newsroom_id = $1
        ORDER BY m.created_at DESC LIMIT 30`,
      [session.newsroomId]
    ),
    pool.query(
      `SELECT id FROM newsroom_profiles WHERE newsroom_id = $1`,
      [session.newsroomId]
    ),
  ]);

  const canEdit = session.role === 'builder' || session.role === 'admin';
  return (
    <FundraiserWorkspace
      initialFunders={funders}
      initialBriefs={briefsRes.rows}
      initialMatches={matchesRes.rows}
      hasProfile={profileRes.rows.length > 0}
      canEdit={canEdit}
      role={session.role}
    />
  );
}
