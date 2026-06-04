-- 040_node_makanday_analytics.sql
-- Integrated tables for the MakanDay Audience Signal node (slug: makanday-analytics).
--
-- This node's lib/* (ingest.js, handlers.js) already targets the host.db
-- interface, so its code runs unchanged online on lib/nodes/host. These tables
-- mirror the JSON shapes it used standalone. Columns + SQL verified against:
--   Nodes/node-makanday-analytics/lib/ingest.js  (INSERT column lists)
--   Nodes/node-makanday-analytics/lib/handlers.js (SELECTs)
--
-- All tables are prefixed node_makanday_analytics_ and scoped by newsroom_id;
-- lib/nodes/host binds $1 = newsroom_id and refuses any table outside the prefix.

-- Story performance matrix — one row per story per ingested source_label.
-- ingest.js DELETEs by (newsroom_id, source_label) then bulk-INSERTs.
CREATE TABLE node_makanday_analytics_stories (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  newsroom_id   UUID NOT NULL REFERENCES newsrooms(id) ON DELETE CASCADE,
  source_label  TEXT NOT NULL,
  n             INTEGER,
  title         TEXT,
  month         TEXT,
  story_date    TEXT,                 -- free-form as parsed from the matrix
  reach         BIGINT,
  engagement    BIGINT,
  type          TEXT,
  ingested_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX node_makanday_analytics_stories_newsroom_idx
  ON node_makanday_analytics_stories (newsroom_id);
CREATE INDEX node_makanday_analytics_stories_source_idx
  ON node_makanday_analytics_stories (newsroom_id, source_label);

-- Data-quality summary — one row per ingest; getQuality reads the latest by ingested_at.
CREATE TABLE node_makanday_analytics_quality (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  newsroom_id   UUID NOT NULL REFERENCES newsrooms(id) ON DELETE CASCADE,
  source_label  TEXT NOT NULL,
  story_count   INTEGER,
  errors        INTEGER,
  warnings      INTEGER,
  info          INTEGER,
  uncategorised INTEGER,
  issues        JSONB,
  ingested_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX node_makanday_analytics_quality_latest_idx
  ON node_makanday_analytics_quality (newsroom_id, source_label, ingested_at DESC);

-- Standard node telemetry (written by lib/nodes/host: log.run/edit, log.error, feedback.submit).
CREATE TABLE node_makanday_analytics_activity (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  newsroom_id UUID NOT NULL REFERENCES newsrooms(id) ON DELETE CASCADE,
  host_id     TEXT,
  kind        TEXT,                   -- 'run' | 'edit'
  op          TEXT,                   -- operation name, e.g. 'ingest' | 'brief'
  details     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX node_makanday_analytics_activity_newsroom_idx
  ON node_makanday_analytics_activity (newsroom_id, created_at DESC);

CREATE TABLE node_makanday_analytics_errors (
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
CREATE INDEX node_makanday_analytics_errors_newsroom_idx
  ON node_makanday_analytics_errors (newsroom_id, created_at DESC);

CREATE TABLE node_makanday_analytics_feedback (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  newsroom_id UUID NOT NULL REFERENCES newsrooms(id) ON DELETE CASCADE,
  host_id     TEXT,
  type        TEXT,                   -- bug | suggestion | praise | question | other
  message     TEXT,
  page        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX node_makanday_analytics_feedback_newsroom_idx
  ON node_makanday_analytics_feedback (newsroom_id, created_at DESC);
