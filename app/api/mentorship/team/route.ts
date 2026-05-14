// GET /api/mentorship/team?days=14
//
// V2 Step 2 — Mentorship dashboard, Team activity tab.
//
// Per-user rollup of workflow runs + direct agent invocations + edit
// feedback for the current newsroom over the last N days. Admin + builder
// only — this is a leadership view, not a peer view.
//
// Returns one row per user who's done anything in the window. Users with
// zero activity are not returned; the dashboard explicitly says "active
// users only" to avoid the dashboard becoming a roll call.

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

  // Aggregate per user across workflow_executions (parent rollup),
  // standalone workflow_runs invocations (no parent), and output_edits
  // (the human-in-the-loop signal). Each is its own query, then merged
  // server-side keyed by user_id.
  const execs = await pool.query(
    `SELECT user_id, COUNT(*)::int AS workflow_runs,
            SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END)::int AS completed,
            SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END)::int AS failed,
            COALESCE(SUM(total_cost_usd), 0)::numeric(10,4) AS total_cost_usd,
            MAX(started_at) AS last_active
       FROM workflow_executions
      WHERE newsroom_id = $1
        AND started_at >= NOW() - ($2 || ' days')::interval
   GROUP BY user_id`,
    [nid, String(days)]
  );

  const invs = await pool.query(
    `SELECT user_id, COUNT(*)::int AS direct_invocations,
            SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END)::int AS direct_completed,
            SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END)::int AS direct_failed,
            COALESCE(SUM(cost_usd), 0)::numeric(10,4) AS direct_cost_usd,
            MAX(created_at) AS last_active
       FROM workflow_runs
      WHERE newsroom_id = $1
        AND workflow_execution_id IS NULL
        AND agent <> 'workflow'
        AND created_at >= NOW() - ($2 || ' days')::interval
   GROUP BY user_id`,
    [nid, String(days)]
  );

  const edits = await pool.query(
    `SELECT user_id,
            COUNT(*)::int AS edit_count,
            SUM(CASE WHEN edit_kind = 'accepted' THEN 1 ELSE 0 END)::int AS accepted,
            SUM(CASE WHEN edit_kind = 'edited' THEN 1 ELSE 0 END)::int AS edited,
            SUM(CASE WHEN edit_kind = 'rejected' THEN 1 ELSE 0 END)::int AS rejected,
            SUM(CASE WHEN edit_kind = 'forked' THEN 1 ELSE 0 END)::int AS forked
       FROM output_edits
      WHERE newsroom_id = $1
        AND created_at >= NOW() - ($2 || ' days')::interval
   GROUP BY user_id`,
    [nid, String(days)]
  );

  // Emails for any user_id that appeared in any aggregation.
  const userIds = new Set<string>();
  for (const r of execs.rows) userIds.add(r.user_id);
  for (const r of invs.rows) userIds.add(r.user_id);
  for (const r of edits.rows) userIds.add(r.user_id);
  const emails: Record<string, string> = {};
  if (userIds.size > 0) {
    const u = await pool.query(`SELECT id, email FROM users WHERE id = ANY($1::uuid[])`, [[...userIds]]);
    for (const r of u.rows) emails[r.id] = r.email;
  }

  type Row = {
    user_id: string;
    email: string;
    workflow_runs: number;
    completed: number;
    failed: number;
    direct_invocations: number;
    direct_completed: number;
    direct_failed: number;
    edit_count: number;
    accepted: number;
    edited: number;
    rejected: number;
    forked: number;
    accept_rate: number | null;
    total_cost_usd: number;
    last_active: string | null;
  };
  const rows: Record<string, Row> = {};
  function ensureRow(uid: string): Row {
    if (!rows[uid]) {
      rows[uid] = {
        user_id: uid,
        email: emails[uid] || '(unknown)',
        workflow_runs: 0, completed: 0, failed: 0,
        direct_invocations: 0, direct_completed: 0, direct_failed: 0,
        edit_count: 0, accepted: 0, edited: 0, rejected: 0, forked: 0,
        accept_rate: null,
        total_cost_usd: 0,
        last_active: null,
      };
    }
    return rows[uid];
  }
  for (const r of execs.rows) {
    const row = ensureRow(r.user_id);
    row.workflow_runs = r.workflow_runs;
    row.completed = r.completed;
    row.failed = r.failed;
    row.total_cost_usd += Number(r.total_cost_usd);
    row.last_active = latestIso(row.last_active, r.last_active);
  }
  for (const r of invs.rows) {
    const row = ensureRow(r.user_id);
    row.direct_invocations = r.direct_invocations;
    row.direct_completed = r.direct_completed;
    row.direct_failed = r.direct_failed;
    row.total_cost_usd += Number(r.direct_cost_usd);
    row.last_active = latestIso(row.last_active, r.last_active);
  }
  for (const r of edits.rows) {
    const row = ensureRow(r.user_id);
    row.edit_count = r.edit_count;
    row.accepted = r.accepted;
    row.edited = r.edited;
    row.rejected = r.rejected;
    row.forked = r.forked;
    row.accept_rate = r.edit_count > 0 ? r.accepted / r.edit_count : null;
  }

  const list = Object.values(rows).sort((a, b) => {
    if (!a.last_active) return 1;
    if (!b.last_active) return -1;
    return b.last_active.localeCompare(a.last_active);
  });

  return NextResponse.json({ days, rows: list });
}

function latestIso(a: string | null, b: string | Date | null): string | null {
  if (!a) return b instanceof Date ? b.toISOString() : (b as string | null);
  if (!b) return a;
  const bIso = b instanceof Date ? b.toISOString() : b;
  return bIso > a ? bIso : a;
}
