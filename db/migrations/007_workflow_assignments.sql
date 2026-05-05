-- Workflow assignments — which users in a newsroom can run a given workflow
-- in User mode. Builder/admin users can always run their own newsroom's
-- workflows; this table is what restricts/exposes a workflow to other
-- (non-builder) team members.
--
-- For shared workflows from the cross-newsroom library, the running
-- newsroom's own users get assigned via this table — assignment doesn't
-- cross newsrooms.

BEGIN;

CREATE TABLE workflow_assignments (
  workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (workflow_id, user_id)
);

CREATE INDEX workflow_assignments_user_id_idx ON workflow_assignments (user_id);

COMMIT;
