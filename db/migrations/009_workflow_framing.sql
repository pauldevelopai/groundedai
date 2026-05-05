-- Workflow problem framing — every workflow is shaped as a product solving a
-- newsroom problem. Builders write a problem statement + pick a category +
-- author user-facing instructions; Users see those when they pick the
-- workflow to run.
--
-- All three are nullable to keep saves easy for in-progress drafts.

BEGIN;

ALTER TABLE workflows
  ADD COLUMN problem_statement TEXT,
  ADD COLUMN problem_category TEXT,
  ADD COLUMN user_instructions TEXT;

CREATE INDEX workflows_problem_category_idx
  ON workflows (problem_category)
  WHERE problem_category IS NOT NULL;

COMMIT;
