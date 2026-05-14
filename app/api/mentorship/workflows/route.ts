// GET /api/mentorship/workflows?days=14
//
// V2 Step 2 — Mentorship dashboard, Workflow performance tab.
//
// Per-workflow rollup: runs, success rate, mean edit_chars, top 3
// most-edited outputs (with deep-link to the run). The signal for
// "this workflow needs work" or "this is our most-loved workflow."
//
// Admin + builder only.

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';

export async function GET(req: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (session.role !== 'builder' && session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — builder or admin role required' }, { status: 403 });
  }

  const url = new URL(req.url);
  const days = Math.max(1, Math.min(180, parseInt(url.searchParams.get('days') || '14', 10)));
  const nid = session.newsroomId;

  // Workflow-level rollup. Joins workflow_executions with workflows for
  // display name, and counts edits via the workflow_execution_id back-ref
  // on output_edits.
  const perWorkflow = await pool.query(
    `SELECT
        we.workflow_id,
        COALESCE(w.name, we.workflow_slug, '(deleted)')         AS workflow_name,
        we.workflow_slug,
        COUNT(*)::int                                            AS runs,
        SUM(CASE WHEN we.status = 'completed' THEN 1 ELSE 0 END)::int AS completed,
        SUM(CASE WHEN we.status = 'failed' THEN 1 ELSE 0 END)::int    AS failed,
        COALESCE(SUM(we.total_cost_usd), 0)::numeric(10,4)       AS total_cost_usd,
        COALESCE(AVG(we.total_duration_ms), 0)::int              AS avg_duration_ms,
        (
          SELECT COUNT(*)::int FROM output_edits oe
           WHERE oe.workflow_execution_id IN (
             SELECT id FROM workflow_executions
              WHERE newsroom_id = $1 AND workflow_slug = we.workflow_slug
                AND started_at >= NOW() - ($2 || ' days')::interval
           )
        )                                                         AS edits,
        (
          SELECT COALESCE(SUM(CASE WHEN oe.edit_kind = 'accepted' THEN 1 ELSE 0 END), 0)::int
            FROM output_edits oe
           WHERE oe.workflow_execution_id IN (
             SELECT id FROM workflow_executions
              WHERE newsroom_id = $1 AND workflow_slug = we.workflow_slug
                AND started_at >= NOW() - ($2 || ' days')::interval
           )
        )                                                         AS accepted_edits,
        (
          SELECT COALESCE(AVG(oe.diff_chars), 0)::int
            FROM output_edits oe
           WHERE oe.workflow_execution_id IN (
             SELECT id FROM workflow_executions
              WHERE newsroom_id = $1 AND workflow_slug = we.workflow_slug
                AND started_at >= NOW() - ($2 || ' days')::interval
           )
        )                                                         AS avg_edit_chars
       FROM workflow_executions we
       LEFT JOIN workflows w ON w.id = we.workflow_id
      WHERE we.newsroom_id = $1
        AND we.started_at >= NOW() - ($2 || ' days')::interval
        AND we.workflow_slug IS NOT NULL
   GROUP BY we.workflow_id, w.name, we.workflow_slug
   ORDER BY runs DESC
      LIMIT 50`,
    [nid, String(days)]
  );

  // Top 5 most-edited individual outputs in this window — deep-link
  // targets for "this output needs editorial attention" in the UI.
  const topEdits = await pool.query(
    `SELECT oe.id, oe.workflow_run_id, oe.edit_kind, oe.diff_chars,
            oe.created_at, oe.notes,
            wr.agent,
            we.workflow_slug,
            we.id AS workflow_execution_id
       FROM output_edits oe
  LEFT JOIN workflow_runs wr ON wr.id = oe.workflow_run_id
  LEFT JOIN workflow_executions we ON we.id = oe.workflow_execution_id
      WHERE oe.newsroom_id = $1
        AND oe.created_at >= NOW() - ($2 || ' days')::interval
        AND oe.edit_kind IN ('edited', 'forked', 'rejected')
   ORDER BY oe.diff_chars DESC NULLS LAST, oe.created_at DESC
      LIMIT 10`,
    [nid, String(days)]
  );

  return NextResponse.json({
    days,
    per_workflow: perWorkflow.rows,
    top_edits: topEdits.rows,
  });
}
