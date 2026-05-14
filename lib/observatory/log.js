// Observatory log wrappers — thin helpers around the workflow_executions
// + output_edits tables added in migration 030.
//
// Three call sites:
//
//   1. POST /api/workflows/:id/run  → startWorkflowExecution(ctx, summary)
//                                     finishWorkflowExecution(id, status, totals, error?)
//   2. (Step 4 / future agentic loops) — same wrappers
//   3. POST /api/observatory/edits  → recordEdit({...})
//
// Pure DB writes. No side effects beyond the rows. Callers handle errors
// (we don't want a logging failure to fail the user-facing action — every
// helper returns the row id or null on failure and logs to console.error).

const { pool } = require('../db');

const MAX_SUMMARY_CHARS = 500;

/**
 * Begin a workflow execution rollup. Returns the execution row id.
 *
 * @param {object} args
 * @param {string} args.newsroomId
 * @param {string} args.userId
 * @param {string} [args.workflowId]      null for ad-hoc multi-agent runs
 * @param {string} [args.workflowSlug]    denormalised for fast filtering
 * @param {string} [args.triggeredVia]    'user_run' | 'chat' | 'builder_test' | 'cron'
 * @param {string} [args.inputSummary]    trimmed to MAX_SUMMARY_CHARS
 * @returns {Promise<string|null>}
 */
async function startWorkflowExecution({
  newsroomId,
  userId,
  workflowId = null,
  workflowSlug = null,
  triggeredVia = 'user_run',
  inputSummary = null,
}) {
  try {
    const summary = inputSummary ? String(inputSummary).slice(0, MAX_SUMMARY_CHARS) : null;
    const { rows } = await pool.query(
      `INSERT INTO workflow_executions
         (newsroom_id, user_id, workflow_id, workflow_slug, triggered_via, input_summary, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'running')
       RETURNING id`,
      [newsroomId, userId, workflowId, workflowSlug, triggeredVia, summary]
    );
    return rows[0].id;
  } catch (err) {
    console.error('observatory.startWorkflowExecution failed:', err);
    return null;
  }
}

/**
 * Mark a workflow execution as completed (or failed). Idempotent: callers
 * may pass partial totals; missing fields stay NULL.
 *
 * @param {string|null} executionId
 * @param {object} args
 * @param {'completed'|'failed'|'cancelled'} args.status
 * @param {number} [args.nodeCount]
 * @param {number} [args.totalCostUsd]
 * @param {number} [args.totalDurationMs]
 * @param {string} [args.error]
 */
async function finishWorkflowExecution(executionId, {
  status,
  nodeCount = null,
  totalCostUsd = null,
  totalDurationMs = null,
  error = null,
} = {}) {
  if (!executionId) return;
  try {
    await pool.query(
      `UPDATE workflow_executions
          SET status = $2,
              node_count = COALESCE($3, node_count),
              total_cost_usd = COALESCE($4, total_cost_usd),
              total_duration_ms = COALESCE($5, total_duration_ms),
              error = $6,
              finished_at = NOW()
        WHERE id = $1`,
      [executionId, status, nodeCount, totalCostUsd, totalDurationMs, error]
    );
  } catch (err) {
    console.error('observatory.finishWorkflowExecution failed:', err);
  }
}

/**
 * Link an agent invocation (workflow_runs row) to its parent execution.
 * Called by the workflow run route after the inner runWorkflow returns,
 * so the existing single workflow_runs row gets the FK populated.
 */
async function attachRunToExecution(workflowRunId, executionId) {
  if (!workflowRunId || !executionId) return;
  try {
    await pool.query(
      `UPDATE workflow_runs SET workflow_execution_id = $2 WHERE id = $1`,
      [workflowRunId, executionId]
    );
  } catch (err) {
    console.error('observatory.attachRunToExecution failed:', err);
  }
}

/**
 * Persist one human-in-the-loop edit signal. Computes diff_chars for
 * 'edited' / 'forked'. Caller must already have authenticated the user
 * and verified the workflow_run is in their newsroom.
 *
 * @param {object} args
 * @param {string} args.newsroomId
 * @param {string} args.userId
 * @param {string} args.workflowRunId       must exist + be in newsroomId
 * @param {string|null} [args.workflowExecutionId]
 * @param {'accepted'|'edited'|'rejected'|'forked'} args.editKind
 * @param {string} args.originalText
 * @param {string} [args.editedText]
 * @param {string} [args.notes]
 * @returns {Promise<string|null>}   the output_edits.id, or null on failure
 */
async function recordEdit({
  newsroomId,
  userId,
  workflowRunId,
  workflowExecutionId = null,
  editKind,
  originalText,
  editedText = null,
  notes = null,
}) {
  if (!['accepted', 'edited', 'rejected', 'forked'].includes(editKind)) {
    throw new Error(`recordEdit: invalid editKind "${editKind}"`);
  }
  const diff = (editKind === 'edited' || editKind === 'forked') && editedText != null
    ? cheapDiffChars(originalText, editedText)
    : null;

  try {
    const { rows } = await pool.query(
      `INSERT INTO output_edits
         (newsroom_id, user_id, workflow_run_id, workflow_execution_id,
          edit_kind, original_text, edited_text, diff_chars, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [newsroomId, userId, workflowRunId, workflowExecutionId, editKind,
       originalText, editedText, diff, notes]
    );
    return rows[0].id;
  } catch (err) {
    console.error('observatory.recordEdit failed:', err);
    return null;
  }
}

// Cheap O(min(m, n)) diff approximation: abs character-count delta plus
// a per-position mismatch count up to the shorter length. Not true
// Levenshtein — we don't need an exact edit-distance, just a coarse
// "how much did the user change" signal for the Mentorship dashboard.
// Capped at 10k chars per side to keep CPU bounded.
function cheapDiffChars(a, b) {
  if (a == null || b == null) return null;
  const sa = String(a).slice(0, 10000);
  const sb = String(b).slice(0, 10000);
  const lenDelta = Math.abs(sa.length - sb.length);
  const overlap = Math.min(sa.length, sb.length);
  let mismatches = 0;
  for (let i = 0; i < overlap; i++) if (sa[i] !== sb[i]) mismatches += 1;
  return lenDelta + mismatches;
}

module.exports = {
  startWorkflowExecution,
  finishWorkflowExecution,
  attachRunToExecution,
  recordEdit,
  cheapDiffChars,
  MAX_SUMMARY_CHARS,
};
