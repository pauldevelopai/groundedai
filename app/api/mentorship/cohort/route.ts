// GET /api/mentorship/cohort?days=30
//
// V2 Step 2 — Mentorship dashboard, Cohort signals tab.
//
// Anonymised aggregates across newsrooms that have opted in
// (newsroom_profiles.metadata.cohort_signals_enabled = true). The current
// newsroom must also be opted in — you give to see. Otherwise the
// endpoint returns a clear "opted_out" status that the UI surfaces as
// "Toggle on cohort sharing from /team to see this view."
//
// k-anonymity: per workflow_slug, we require >= MIN_NEWSROOMS_PER_ROW
// distinct opted-in newsrooms before exposing any number. Below that
// threshold, the workflow is simply omitted from the response — we
// don't even hint at its existence.
//
// Admin + builder only.

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';

const MIN_NEWSROOMS_PER_ROW = 3;

export async function GET(req: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (session.role !== 'builder' && session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — builder or admin role required' }, { status: 403 });
  }

  // The current newsroom must be opted in to see cohort signals.
  const optInCheck = await pool.query(
    `SELECT (metadata->'cohort_signals_enabled')::text AS flag
       FROM newsroom_profiles
      WHERE newsroom_id = $1`,
    [session.newsroomId]
  );
  const callerOptedIn = optInCheck.rows[0]?.flag === 'true';
  if (!callerOptedIn) {
    return NextResponse.json({
      status: 'opted_out',
      message: 'Cohort sharing is off for your newsroom. An admin can toggle it on from /team.',
      min_newsrooms_per_row: MIN_NEWSROOMS_PER_ROW,
      rows: [],
    });
  }

  const url = new URL(req.url);
  const days = Math.max(1, Math.min(180, parseInt(url.searchParams.get('days') || '30', 10)));

  // Per-workflow aggregate across all opted-in newsrooms with k-anonymity
  // threshold MIN_NEWSROOMS_PER_ROW. We compute by joining workflow_executions
  // (filter by participating newsroom_ids) and counting distinct newsrooms
  // per workflow_slug. Rows below threshold are filtered out by the HAVING.
  const cohortRows = await pool.query(
    `WITH opted_in AS (
       SELECT newsroom_id FROM newsroom_profiles
        WHERE (metadata->'cohort_signals_enabled')::text = 'true'
     ),
     exec_window AS (
       SELECT we.workflow_slug, we.newsroom_id, we.status, we.total_cost_usd,
              we.total_duration_ms, we.id AS exec_id
         FROM workflow_executions we
         JOIN opted_in oi ON oi.newsroom_id = we.newsroom_id
        WHERE we.started_at >= NOW() - ($1 || ' days')::interval
          AND we.workflow_slug IS NOT NULL
     )
     SELECT
       workflow_slug,
       COUNT(DISTINCT newsroom_id)::int AS newsrooms,
       COUNT(*)::int                    AS runs,
       SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END)::int AS completed,
       SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END)::int    AS failed,
       COALESCE(AVG(total_cost_usd), 0)::numeric(10,4)            AS avg_cost_usd,
       COALESCE(AVG(total_duration_ms), 0)::int                   AS avg_duration_ms,
       (
         SELECT COALESCE(
                  CAST(SUM(CASE WHEN oe.edit_kind='accepted' THEN 1 ELSE 0 END) AS NUMERIC)
                  / NULLIF(COUNT(*), 0),
                0)::numeric(4,3)
           FROM output_edits oe
          WHERE oe.workflow_execution_id IN (SELECT exec_id FROM exec_window e2 WHERE e2.workflow_slug = ew.workflow_slug)
       ) AS accept_rate,
       (
         SELECT COUNT(*)::int FROM output_edits oe
          WHERE oe.workflow_execution_id IN (SELECT exec_id FROM exec_window e2 WHERE e2.workflow_slug = ew.workflow_slug)
       ) AS edit_signals
       FROM exec_window ew
   GROUP BY workflow_slug
     HAVING COUNT(DISTINCT newsroom_id) >= $2
   ORDER BY runs DESC
      LIMIT 30`,
    [String(days), MIN_NEWSROOMS_PER_ROW]
  );

  return NextResponse.json({
    status: 'ok',
    days,
    min_newsrooms_per_row: MIN_NEWSROOMS_PER_ROW,
    rows: cohortRows.rows,
  });
}
