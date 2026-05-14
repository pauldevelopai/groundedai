// GET /api/observatory/summary?days=14
//
// Single-shot rollup endpoint that powers the four Observatory views:
//   - recent_runs        last 50 workflow executions (parent rollup)
//   - recent_invocations last 50 standalone workflow_runs (no parent)
//   - per_workflow       cost / success / edit-rate per workflow
//   - per_agent_failures top failing agents
//   - edit_hotspots      agents whose outputs are most edited
//
// One query per dataset to keep the page snappy. All queries are
// newsroom-scoped to session.newsroomId.

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';

export async function GET(req: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const url = new URL(req.url);
  const days = Math.max(1, Math.min(180, parseInt(url.searchParams.get('days') || '14', 10)));
  const nid = session.newsroomId;

  const recentRuns = await pool.query(
    `SELECT we.id, we.workflow_id, we.workflow_slug, we.triggered_via, we.input_summary,
            we.status, we.node_count, we.total_cost_usd, we.total_duration_ms,
            we.started_at, we.finished_at, we.error,
            we.sensitivity_label, we.sensitivity_reasons,
            u.email AS user_email
       FROM workflow_executions we
       JOIN users u ON u.id = we.user_id
      WHERE we.newsroom_id = $1
        AND we.started_at >= NOW() - ($2 || ' days')::interval
   ORDER BY we.started_at DESC
      LIMIT 50`,
    [nid, String(days)]
  );

  const recentInvocations = await pool.query(
    `SELECT wr.id, wr.agent, wr.status, wr.cost_usd, wr.duration_ms,
            wr.created_at, wr.completed_at, wr.error,
            u.email AS user_email
       FROM workflow_runs wr
       JOIN users u ON u.id = wr.user_id
      WHERE wr.newsroom_id = $1
        AND wr.workflow_execution_id IS NULL
        AND wr.agent <> 'workflow'
        AND wr.created_at >= NOW() - ($2 || ' days')::interval
   ORDER BY wr.created_at DESC
      LIMIT 50`,
    [nid, String(days)]
  );

  const perWorkflow = await pool.query(
    `SELECT we.workflow_slug,
            COUNT(*)::int                                      AS runs,
            SUM(CASE WHEN we.status = 'completed' THEN 1 ELSE 0 END)::int AS completed,
            SUM(CASE WHEN we.status = 'failed' THEN 1 ELSE 0 END)::int    AS failed,
            COALESCE(SUM(we.total_cost_usd), 0)::numeric(10,4) AS total_cost_usd,
            COALESCE(AVG(we.total_duration_ms), 0)::int        AS avg_duration_ms,
            (
              SELECT COUNT(*)::int FROM output_edits oe
               JOIN workflow_executions we2 ON we2.id = oe.workflow_execution_id
               WHERE we2.newsroom_id = $1 AND we2.workflow_slug = we.workflow_slug
                 AND oe.created_at >= NOW() - ($2 || ' days')::interval
            ) AS edit_count
       FROM workflow_executions we
      WHERE we.newsroom_id = $1
        AND we.started_at >= NOW() - ($2 || ' days')::interval
        AND we.workflow_slug IS NOT NULL
   GROUP BY we.workflow_slug
   ORDER BY runs DESC
      LIMIT 30`,
    [nid, String(days)]
  );

  const perAgentFailures = await pool.query(
    `SELECT wr.agent,
            COUNT(*)::int                                      AS total,
            SUM(CASE WHEN wr.status = 'failed' THEN 1 ELSE 0 END)::int AS failed
       FROM workflow_runs wr
      WHERE wr.newsroom_id = $1
        AND wr.created_at >= NOW() - ($2 || ' days')::interval
        AND wr.agent <> 'workflow'
   GROUP BY wr.agent
     HAVING SUM(CASE WHEN wr.status = 'failed' THEN 1 ELSE 0 END) > 0
   ORDER BY failed DESC
      LIMIT 20`,
    [nid, String(days)]
  );

  const editHotspots = await pool.query(
    `SELECT wr.agent,
            COUNT(*)::int                                            AS edit_count,
            SUM(CASE WHEN oe.edit_kind = 'accepted' THEN 1 ELSE 0 END)::int AS accepted,
            SUM(CASE WHEN oe.edit_kind = 'edited' THEN 1 ELSE 0 END)::int   AS edited,
            SUM(CASE WHEN oe.edit_kind = 'rejected' THEN 1 ELSE 0 END)::int AS rejected,
            SUM(CASE WHEN oe.edit_kind = 'forked' THEN 1 ELSE 0 END)::int   AS forked,
            COALESCE(AVG(oe.diff_chars), 0)::int                     AS avg_diff_chars
       FROM output_edits oe
       JOIN workflow_runs wr ON wr.id = oe.workflow_run_id
      WHERE oe.newsroom_id = $1
        AND oe.created_at >= NOW() - ($2 || ' days')::interval
   GROUP BY wr.agent
   ORDER BY edit_count DESC
      LIMIT 20`,
    [nid, String(days)]
  );

  return NextResponse.json({
    days,
    recent_runs: recentRuns.rows,
    recent_invocations: recentInvocations.rows,
    per_workflow: perWorkflow.rows,
    per_agent_failures: perAgentFailures.rows,
    edit_hotspots: editHotspots.rows,
  });
}
