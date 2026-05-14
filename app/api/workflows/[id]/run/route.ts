// POST /api/workflows/:id/run
//
// Auth-required, any role. Runs the workflow's graph against the provided
// input map. Visible to: own newsroom, OR is_shared workflows from other
// newsrooms (per-newsroom data still flows through the running newsroom's
// own ctx — shared workflows borrow the *recipe*, not another newsroom's
// data).
//
// Body: { inputs: Record<string, any> }   — keys match definition.inputs[*].name
// Response (200):
//   { runId, output, nodeOutputs, nodeCosts, totalCost, durationMs }
// Response (4xx/5xx): { error, runId? }

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';
import { runWorkflow } from '@/lib/workflows/runner';
const {
  startWorkflowExecution,
  finishWorkflowExecution,
  attachRunToExecution,
} = require('@/lib/observatory/log');
const { decideRoute } = require('@/lib/agents/route');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Invalid workflow id' }, { status: 400 });
  }

  let body: { inputs?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const inputs = body.inputs || {};
  if (typeof inputs !== 'object' || Array.isArray(inputs)) {
    return NextResponse.json({ error: 'inputs must be an object' }, { status: 400 });
  }

  const wfRows = await pool.query(
    `SELECT id, newsroom_id, name, slug, definition, is_shared
       FROM workflows
      WHERE id = $1`,
    [id]
  );
  const workflow = wfRows.rows[0];
  if (!workflow) {
    return NextResponse.json({ error: 'Workflow not found' }, { status: 404 });
  }
  if (workflow.newsroom_id !== session.newsroomId && !workflow.is_shared) {
    return NextResponse.json({ error: 'Workflow not found' }, { status: 404 });
  }

  // V2 Step 5: classify sensitivity before any Claude call. Refused
  // requests don't open a workflow_runs row — they fail clean.
  const inputSummary = JSON.stringify(inputs).slice(0, 500);
  const route = await decideRoute({
    newsroomId: session.newsroomId,
    inputText: inputSummary,
    workflowSlug: workflow.slug,
  });
  if (route.refuse) {
    return NextResponse.json({
      error: route.error,
      sensitivity_label: route.label,
      sensitivity_reasons: route.reasons,
      message: 'This workflow input was classified as sensitive. The newsroom-appliance dispatch path lands in V2 Step 6; for now sensitive jobs are refused. Adjust your sensitivity rules in /newsroom if this is a false positive.',
    }, { status: 400 });
  }

  const runInsert = await pool.query(
    `INSERT INTO workflow_runs (newsroom_id, user_id, agent, status, input, sensitivity_label)
     VALUES ($1, $2, 'workflow', 'running', $3, $4)
     RETURNING id`,
    [
      session.newsroomId,
      session.userId,
      JSON.stringify({ workflow_id: workflow.id, workflow_slug: workflow.slug, inputs }),
      route.label,
    ]
  );
  const runId = runInsert.rows[0].id;

  // Observatory: parent execution row + back-link the workflow_runs row.
  const executionId: string | null = await startWorkflowExecution({
    newsroomId: session.newsroomId,
    userId: session.userId,
    workflowId: workflow.id,
    workflowSlug: workflow.slug,
    triggeredVia: 'user_run',
    inputSummary,
  });
  await attachRunToExecution(runId, executionId);

  // Stamp sensitivity onto the parent execution row so Observatory and
  // Mentorship can filter by it.
  if (executionId) {
    await pool.query(
      `UPDATE workflow_executions
          SET sensitivity_label = $2,
              sensitivity_reasons = $3
        WHERE id = $1`,
      [executionId, route.label, route.reasons]
    );
  }

  try {
    const { output, nodeOutputs, nodeCosts, totalCost, durationMs } = await runWorkflow(
      workflow.definition,
      inputs,
      {
        newsroomId: session.newsroomId,
        userId: session.userId,
        endpoint: `/api/workflows/${id}/run`,
      }
    );

    await pool.query(
      `UPDATE workflow_runs
          SET status = 'completed',
              output = $2,
              input_tokens = $3,
              output_tokens = $4,
              cost_usd = $5,
              duration_ms = $6,
              completed_at = NOW()
        WHERE id = $1`,
      [
        runId,
        JSON.stringify({ output, nodeOutputs, nodeCosts, workflow_id: workflow.id }),
        totalCost.inputTokens,
        totalCost.outputTokens,
        totalCost.costUsd,
        durationMs,
      ]
    );

    await finishWorkflowExecution(executionId, {
      status: 'completed',
      nodeCount: Array.isArray(nodeCosts) ? nodeCosts.length : null,
      totalCostUsd: totalCost?.costUsd ?? null,
      totalDurationMs: durationMs,
    });

    return NextResponse.json({ runId, output, nodeOutputs, nodeCosts, totalCost, durationMs });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    await pool.query(
      `UPDATE workflow_runs SET status = 'failed', error = $2, completed_at = NOW() WHERE id = $1`,
      [runId, message]
    );
    await finishWorkflowExecution(executionId, { status: 'failed', error: message });
    return NextResponse.json({ error: message, runId }, { status: 500 });
  }
}
