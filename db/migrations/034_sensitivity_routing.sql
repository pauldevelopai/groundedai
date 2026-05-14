-- Sensitivity routing — V2 Step 5.
--
-- Every workflow execution + standalone agent invocation gets a
-- sensitivity_label decided at the routing layer before any Claude call
-- is made:
--
--   'public'    — fine to send to Anthropic (default for most editorial work)
--   'internal'  — fine to send to Anthropic (newsroom-private but not
--                  source-protection material)
--   'sensitive' — must NOT be sent to Anthropic. Step 5 refuses these
--                 outright; Step 6 routes them to the newsroom appliance.
--
-- The label is set by the classifier (lib/sensitivity/classify.js) plus
-- per-newsroom rules at newsroom_profile.metadata.sensitivity_rules.
-- Reasons are captured on the row so editors understand why a job was
-- classified the way it was.
--
-- Both new columns are nullable; existing rows (pre-Step 5) keep
-- sensitivity_label NULL and readers treat NULL as 'public'.

ALTER TABLE workflow_executions
  ADD COLUMN sensitivity_label TEXT
    CHECK (sensitivity_label IN ('public', 'internal', 'sensitive')),
  ADD COLUMN sensitivity_reasons TEXT[];

ALTER TABLE workflow_runs
  ADD COLUMN sensitivity_label TEXT
    CHECK (sensitivity_label IN ('public', 'internal', 'sensitive'));

CREATE INDEX workflow_executions_sensitivity_idx
  ON workflow_executions (sensitivity_label) WHERE sensitivity_label IS NOT NULL;

CREATE INDEX workflow_runs_sensitivity_idx
  ON workflow_runs (sensitivity_label) WHERE sensitivity_label IS NOT NULL;
