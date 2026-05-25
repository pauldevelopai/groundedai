-- 041_node_capitalfm_verifier.sql
-- Integrated telemetry tables for the Capital FM Claim Check node
-- (slug: capitalfm-verifier).
--
-- NOTE — graduation-readiness: this node currently persists its STATE to local
-- JSON files and a text-file corpus, NOT through host.db:
--   • ./data/processed/capitalfm-verifier-claims.json   (verification runs)
--   • ./data/processed/capitalfm-listener-posts.json     (listener posts)
--   • ./data/processed/capitalfm-listener-briefs.json    (listener briefs)
--   • ./data/raw/training-examples/*.txt                 (RAG-by-inclusion corpus)
-- It uses host.ai (Haiku) and host.log, but not host.db. So its claims/corpus
-- cannot graduate to per-newsroom Postgres until the node code is refactored to
-- target host.db.query (a change in the node repo, not here). Until then, only
-- telemetry + AI work integrated. State tables (e.g. node_capitalfm_verifier_runs,
-- _corpus) are intentionally deferred to that refactor — writing them now would
-- be dead schema.
--
-- (GROUNDED also has a NATIVE verifier agent — app/verifier, lib/agents/verifier
--  + verifier_outlets/runs from migration 024 — which is separate from this node.
--  The node's graduation_target is agent:verifier; reconciliation is later work.)

-- Standard node telemetry (written by lib/nodes/host: log.run/edit, log.error, feedback.submit).
CREATE TABLE node_capitalfm_verifier_activity (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  newsroom_id UUID NOT NULL REFERENCES newsrooms(id) ON DELETE CASCADE,
  host_id     TEXT,
  kind        TEXT,
  op          TEXT,
  details     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX node_capitalfm_verifier_activity_newsroom_idx
  ON node_capitalfm_verifier_activity (newsroom_id, created_at DESC);

CREATE TABLE node_capitalfm_verifier_errors (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  newsroom_id      UUID NOT NULL REFERENCES newsrooms(id) ON DELETE CASCADE,
  host_id          TEXT,
  op               TEXT,
  message          TEXT,
  name             TEXT,
  stack_first_line TEXT,
  context          JSONB,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX node_capitalfm_verifier_errors_newsroom_idx
  ON node_capitalfm_verifier_errors (newsroom_id, created_at DESC);

CREATE TABLE node_capitalfm_verifier_feedback (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  newsroom_id UUID NOT NULL REFERENCES newsrooms(id) ON DELETE CASCADE,
  host_id     TEXT,
  type        TEXT,
  message     TEXT,
  page        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX node_capitalfm_verifier_feedback_newsroom_idx
  ON node_capitalfm_verifier_feedback (newsroom_id, created_at DESC);
