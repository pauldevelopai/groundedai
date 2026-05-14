-- Observatory — V2 Step 1.
--
-- Two new tables + one FK on the existing workflow_runs table. The
-- observatory layer aggregates two streams:
--
--   workflow_executions  — one row per user-facing workflow run.
--                          The parent rollup that workflow_runs (per-agent
--                          invocation) rows belong to. Filled in only by the
--                          workflow run route (POST /api/workflows/:id/run).
--                          Direct agent calls (POST /api/agents/<slug>) do
--                          NOT get an execution row; their workflow_runs row
--                          stands alone with workflow_execution_id NULL.
--
--   output_edits         — one row per "accepted / edited / rejected" event
--                          a human emits about an agent's output. References
--                          the workflow_runs row (the invocation that
--                          produced the output). The raw signal that drives
--                          Step 2's Mentorship dashboard and the cohort
--                          library's "what works" detection.
--
-- Naming note: the existing migration 003 named the per-agent-invocation
-- table `workflow_runs`, which is misleading. We keep the name (it's
-- referenced by 8+ files) and add `workflow_executions` as the parent
-- rollup. Existing workflow_runs rows with agent='workflow' (the
-- transitional artefact of the V1 workflow-run-route insert) keep working;
-- new rows additionally populate workflow_executions.

CREATE TABLE workflow_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  newsroom_id UUID NOT NULL REFERENCES newsrooms(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  -- workflow_id is the workflows.id; nullable to keep room for ad-hoc
  -- multi-agent runs that aren't backed by a saved workflow row.
  workflow_id UUID REFERENCES workflows(id) ON DELETE SET NULL,
  workflow_slug TEXT,                                -- denormalised for fast filtering
  triggered_via TEXT NOT NULL DEFAULT 'user_run'
    CHECK (triggered_via IN ('user_run', 'chat', 'builder_test', 'cron')),
  input_summary TEXT,                                -- truncated to ≤500 chars at insert time
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'failed', 'cancelled')),
  node_count INTEGER NOT NULL DEFAULT 0,
  total_cost_usd NUMERIC(10, 6),
  total_duration_ms INTEGER,
  error TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);

CREATE INDEX workflow_executions_newsroom_id_idx ON workflow_executions (newsroom_id);
CREATE INDEX workflow_executions_workflow_id_idx ON workflow_executions (workflow_id);
CREATE INDEX workflow_executions_started_at_idx ON workflow_executions (started_at DESC);
CREATE INDEX workflow_executions_status_idx ON workflow_executions (status);

-- Link each agent invocation (in workflow_runs) to its parent execution.
-- Nullable: direct agent calls keep workflow_execution_id NULL.
ALTER TABLE workflow_runs
  ADD COLUMN workflow_execution_id UUID REFERENCES workflow_executions(id) ON DELETE SET NULL;

CREATE INDEX workflow_runs_workflow_execution_id_idx
  ON workflow_runs (workflow_execution_id);

CREATE TABLE output_edits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  newsroom_id UUID NOT NULL REFERENCES newsrooms(id) ON DELETE RESTRICT,
  -- workflow_runs.id is the invocation that produced the output being
  -- judged. Cascade so deleting a run also drops its edit feedback rather
  -- than leaving orphans.
  workflow_run_id UUID NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
  workflow_execution_id UUID REFERENCES workflow_executions(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  edit_kind TEXT NOT NULL CHECK (edit_kind IN ('accepted', 'edited', 'rejected', 'forked')),
  -- For 'accepted' and 'rejected': original_text is the agent's output verbatim;
  -- edited_text is NULL. For 'edited': both populated; diff_chars is the
  -- Levenshtein-ish edit distance. For 'forked': edited_text is the
  -- branch-off text the user wrote starting from the original.
  original_text TEXT NOT NULL,
  edited_text TEXT,
  diff_chars INTEGER,                                -- NULL unless edit_kind='edited' or 'forked'
  notes TEXT,                                        -- optional one-line user note
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX output_edits_newsroom_id_idx ON output_edits (newsroom_id);
CREATE INDEX output_edits_workflow_run_id_idx ON output_edits (workflow_run_id);
CREATE INDEX output_edits_user_id_idx ON output_edits (user_id);
CREATE INDEX output_edits_created_at_idx ON output_edits (created_at DESC);
CREATE INDEX output_edits_edit_kind_idx ON output_edits (edit_kind);
