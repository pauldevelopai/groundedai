-- Workflow runs ─ every agent invocation across all newsrooms.
-- One row per agent call (Verifier, Archivist, Drafter, future agents).
-- Stores input + output + status + token usage so the audit log and compliance
-- reports can replay any run. Per-newsroom isolation via newsroom_id.
--
-- Distinct from api_costs (per-API-call) and audit_log (workflow-level events
-- like "user X created workflow Y"). workflow_runs sits in the middle: one row
-- per agent execution.

CREATE TABLE workflow_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  newsroom_id UUID NOT NULL REFERENCES newsrooms(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  agent TEXT NOT NULL,                          -- 'verifier' | 'archivist' | 'drafter'
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  input JSONB NOT NULL DEFAULT '{}'::jsonb,
  output JSONB,                                 -- null until completed
  error TEXT,                                   -- set on status='failed'
  input_tokens INTEGER,
  output_tokens INTEGER,
  cost_usd NUMERIC(10, 6),
  duration_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX workflow_runs_newsroom_id_idx ON workflow_runs (newsroom_id);
CREATE INDEX workflow_runs_user_id_idx ON workflow_runs (user_id);
CREATE INDEX workflow_runs_agent_idx ON workflow_runs (agent);
CREATE INDEX workflow_runs_status_idx ON workflow_runs (status);
CREATE INDEX workflow_runs_created_at_idx ON workflow_runs (created_at DESC);
