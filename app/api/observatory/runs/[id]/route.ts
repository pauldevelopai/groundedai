// GET /api/observatory/runs/:id
//
// Trace view. The :id may be either a workflow_executions.id (the parent
// rollup of a multi-agent workflow run) OR a workflow_runs.id (a single
// agent invocation, optionally with agentic-tool children).
//
// Returns:
//   - kind: 'execution' | 'invocation'
//   - execution? — when :id is a workflow_executions row
//   - invocation? — when :id is a workflow_runs row
//   - invocations: workflow_runs rows belonging to the execution (kind != 'agentic_tool')
//   - tool_calls_by_parent: { [parentInvocationId]: workflow_runs[] }
//   - edits: output_edits rows for any of the involved invocations
//
// Tenant-scoped: 404 if the row isn't in the caller's newsroom.

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  // Try execution first.
  const ex = await pool.query(
    `SELECT we.*, u.email AS user_email
       FROM workflow_executions we
       JOIN users u ON u.id = we.user_id
      WHERE we.id = $1 AND we.newsroom_id = $2`,
    [id, session.newsroomId]
  );

  let executionId: string | null = null;
  let invocation: any = null;
  if (ex.rows.length > 0) {
    executionId = id;
  } else {
    // Maybe it's a single workflow_runs row.
    const inv = await pool.query(
      `SELECT wr.*, u.email AS user_email
         FROM workflow_runs wr
         LEFT JOIN users u ON u.id = wr.user_id
        WHERE wr.id = $1 AND wr.newsroom_id = $2`,
      [id, session.newsroomId]
    );
    if (inv.rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    invocation = inv.rows[0];
    executionId = invocation.workflow_execution_id || null;
  }

  // Top-level invocations under this execution (or the single invocation when no execution).
  let topInvocations: any[] = [];
  if (executionId) {
    const r = await pool.query(
      `SELECT wr.*, u.email AS user_email
         FROM workflow_runs wr
         LEFT JOIN users u ON u.id = wr.user_id
        WHERE wr.workflow_execution_id = $1
          AND wr.newsroom_id = $2
          AND (wr.kind IS NULL OR wr.kind <> 'agentic_tool')
        ORDER BY wr.created_at ASC`,
      [executionId, session.newsroomId]
    );
    topInvocations = r.rows;
  } else if (invocation) {
    topInvocations = [invocation];
  }

  // Tool calls — every agentic_tool row whose parent_invocation_id is one of
  // the top-level invocations OR the singleton invocation.
  const parentIds = topInvocations.map((i) => i.id);
  let toolRows: any[] = [];
  if (parentIds.length > 0) {
    const r = await pool.query(
      `SELECT wr.*
         FROM workflow_runs wr
        WHERE wr.parent_invocation_id = ANY($1::uuid[])
          AND wr.newsroom_id = $2
        ORDER BY wr.created_at ASC`,
      [parentIds, session.newsroomId]
    );
    toolRows = r.rows;
  }
  const toolCallsByParent: Record<string, any[]> = {};
  for (const t of toolRows) {
    const pid = t.parent_invocation_id;
    if (!pid) continue;
    if (!toolCallsByParent[pid]) toolCallsByParent[pid] = [];
    toolCallsByParent[pid].push(t);
  }

  // Edits — any output_edits whose agent_invocation_id is one of the top invocations.
  let edits: any[] = [];
  if (parentIds.length > 0) {
    const r = await pool.query(
      `SELECT oe.*, u.email AS user_email
         FROM output_edits oe
         LEFT JOIN users u ON u.id = oe.user_id
        WHERE oe.agent_invocation_id = ANY($1::uuid[])
          AND oe.newsroom_id = $2
        ORDER BY oe.created_at ASC`,
      [parentIds, session.newsroomId]
    );
    edits = r.rows;
  }

  return NextResponse.json({
    kind: ex.rows.length > 0 ? 'execution' : 'invocation',
    execution: ex.rows[0] || null,
    invocation: invocation || null,
    invocations: topInvocations,
    tool_calls_by_parent: toolCallsByParent,
    edits,
  });
}
