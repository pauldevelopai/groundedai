-- 042_node_podcasting.sql
-- Integrated telemetry tables for the Podcast Studio node (slug: podcasting).
--
-- NOTE — graduation-readiness: this node currently persists its STATE to local
-- JSON files and audio on disk, NOT through host.db:
--   • data/processed/node_podcasting_voices.json     (trained ElevenLabs voices)
--   • data/processed/node_podcasting_podcasts.json   (generated episode metadata)
--   • data/processed/podcasts/**/*.mp3               (generated audio, git-ignored)
--   • an in-node key store for the ElevenLabs API key
-- It uses host.log, but not host.db. Graduating its state needs (a) refactoring
-- the node to target host.db.query, and (b) a decision on audio blob storage
-- online (GROUNDED defers S3/Drive — local disk for now). Both are out of scope
-- for this migration; state tables (e.g. node_podcasting_voices, _podcasts) are
-- intentionally deferred. Writing them now would be dead schema.
--
-- Provider note: this node uses ElevenLabs (not Claude) via its own key — it does
-- not touch host.ai.chat, so the Haiku lock does not apply to it.

-- Standard node telemetry (written by lib/nodes/host: log.run/edit, log.error, feedback.submit).
CREATE TABLE node_podcasting_activity (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  newsroom_id UUID NOT NULL REFERENCES newsrooms(id) ON DELETE CASCADE,
  host_id     TEXT,
  kind        TEXT,
  op          TEXT,
  details     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX node_podcasting_activity_newsroom_idx
  ON node_podcasting_activity (newsroom_id, created_at DESC);

CREATE TABLE node_podcasting_errors (
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
CREATE INDEX node_podcasting_errors_newsroom_idx
  ON node_podcasting_errors (newsroom_id, created_at DESC);

CREATE TABLE node_podcasting_feedback (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  newsroom_id UUID NOT NULL REFERENCES newsrooms(id) ON DELETE CASCADE,
  host_id     TEXT,
  type        TEXT,
  message     TEXT,
  page        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX node_podcasting_feedback_newsroom_idx
  ON node_podcasting_feedback (newsroom_id, created_at DESC);
