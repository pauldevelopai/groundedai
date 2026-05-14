-- Link verifier_runs to workflow_runs so the V2 Observatory has unified
-- per-agent invocation data, and so EditPills (which POST to
-- /api/observatory/edits with a workflow_run_id) can record human-in-
-- the-loop feedback on Verifier outputs.
--
-- runVerifierStandalone inserts a workflow_runs row in tandem with the
-- existing verifier_runs row from now on; existing verifier_runs (prior
-- to this migration) keep workflow_run_id NULL. No back-fill — historic
-- runs don't need a synthetic workflow_runs row.

ALTER TABLE verifier_runs
  ADD COLUMN workflow_run_id UUID REFERENCES workflow_runs(id) ON DELETE SET NULL;

CREATE INDEX verifier_runs_workflow_run_id_idx ON verifier_runs (workflow_run_id);
