-- Workflows ─ named, reusable agent compositions built by a newsroom's AI champion
-- in Builder mode (drag-and-drop graph). Per-newsroom owned; cross-newsroom visible
-- when is_shared = TRUE (the Anchor "shared workflow library" network effect).
--
-- The graph itself lives in `definition` JSONB. Schema (documented, not enforced):
--   {
--     "nodes":  [ { "id": "n1", "agent_slug": "archivist", "config": { "k": "5" } } ],
--     "edges":  [ { "from": { "node": "n1", "field": "archiveContext" },
--                   "to":   { "node": "n2", "field": "archiveContext" } } ],
--     "inputs": [ { "name": "articleText",
--                   "to":   { "node": "n2", "field": "articleText" } } ],
--     "output": { "node": "n2", "field": "result" }
--   }
--
-- v1 is a flat shared library — no versioning, no moderation. The audit_log table
-- (001_init) is the backstop for "who did what when."

BEGIN;

CREATE TABLE workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  newsroom_id UUID NOT NULL REFERENCES newsrooms(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  trigger_phrase TEXT,
  description TEXT,
  definition JSONB NOT NULL,
  is_shared BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (newsroom_id, slug)
);

CREATE INDEX workflows_newsroom_id_idx ON workflows (newsroom_id);
CREATE INDEX workflows_is_shared_idx ON workflows (is_shared) WHERE is_shared = TRUE;
CREATE INDEX workflows_trigger_phrase_idx ON workflows (trigger_phrase) WHERE trigger_phrase IS NOT NULL;

COMMIT;
