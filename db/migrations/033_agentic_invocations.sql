-- Agentic tool-call telemetry — V2 Step 4.
--
-- The agentic loop (lib/agents/agentic/loop.js) makes Haiku tool-use
-- calls, executes the tools, and feeds results back. Each tool execution
-- becomes its own workflow_runs row with:
--
--   kind = 'agentic_tool'
--   parent_invocation_id = the agent invocation that triggered the loop
--   agent = '<parent agent>.<tool name>'  (e.g. 'verifier.archive_search')
--
-- The parent FK is nullable + ON DELETE SET NULL so deleting a parent
-- invocation doesn't cascade out the tool trail, but the loop check uses
-- the link to render the trace tree.

ALTER TABLE workflow_runs
  ADD COLUMN parent_invocation_id UUID REFERENCES workflow_runs(id) ON DELETE SET NULL,
  -- 'agent' | 'agentic_tool' | (anything else from older rows stays NULL,
  --  treated as 'agent' by readers). New rows always set this.
  ADD COLUMN kind TEXT;

CREATE INDEX workflow_runs_parent_invocation_id_idx
  ON workflow_runs (parent_invocation_id);

CREATE INDEX workflow_runs_kind_idx
  ON workflow_runs (kind) WHERE kind IS NOT NULL;
