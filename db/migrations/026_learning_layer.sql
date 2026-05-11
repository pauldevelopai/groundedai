-- Learning layer — three components per the pilot spec:
--
--   1. learning_updates    — curated feed of AI ethics / data-law /
--                            security / governance updates relevant to
--                            African newsrooms. Default seed covers
--                            ~10 real, citable updates (POPIA, EU AI
--                            Act, Meta quarterly threat reports, MISA
--                            Africa, Stanford CIB reports, etc).
--                            Newsrooms add their own; admins curate the
--                            cohort-shared feed.
--   2. workflow_promotions — workflows the cohort has adopted widely.
--                            Surfaced to other newsrooms as "starter
--                            workflows you might want to adopt". Editors
--                            click "adopt" to copy into their newsroom.
--   3. cohort meta-analytics — derived views (no table; SELECTs across
--                              existing per-newsroom tables roll up
--                              into anonymised cohort metrics).

BEGIN;

CREATE TABLE learning_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- newsroom_id is NULL for cohort-shared updates that admins curate
  -- for the whole cohort; non-NULL for newsroom-private notes.
  newsroom_id UUID REFERENCES newsrooms(id) ON DELETE CASCADE,
  added_by UUID REFERENCES users(id) ON DELETE SET NULL,

  title TEXT NOT NULL,
  body TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'governance'
    CHECK (kind IN ('ethics', 'data_law', 'security', 'governance', 'model_change', 'platform_takedown', 'press_freedom')),
  severity TEXT NOT NULL DEFAULT 'info'
    CHECK (severity IN ('info', 'advisory', 'urgent')),

  -- Where the update came from (publisher + URL + date the source was published).
  source_publisher TEXT,
  source_url TEXT,
  published_at DATE,

  -- Which agents this update is relevant to. Empty = applies to all
  -- agents / general newsroom practice.
  applies_to_agents TEXT[] NOT NULL DEFAULT '{}',
  -- Country / region scope. e.g. ['ZA','ZW','ZM','KE','EU','global'].
  -- Empty = global.
  country_scope TEXT[] NOT NULL DEFAULT '{}',

  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('default', 'manual', 'cohort_admin')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX learning_updates_newsroom_id_idx ON learning_updates (newsroom_id);
CREATE INDEX learning_updates_kind_idx ON learning_updates (kind);
CREATE INDEX learning_updates_published_at_idx ON learning_updates (published_at DESC NULLS LAST);

-- Per-newsroom dismissals/acknowledgements of cohort-shared updates,
-- so an editor can mark something as "applies to us" or "dismissed"
-- without affecting other newsrooms.
CREATE TABLE learning_update_acknowledgements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  newsroom_id UUID NOT NULL REFERENCES newsrooms(id) ON DELETE CASCADE,
  update_id UUID NOT NULL REFERENCES learning_updates(id) ON DELETE CASCADE,
  acknowledged_by UUID REFERENCES users(id) ON DELETE SET NULL,
  decision TEXT NOT NULL CHECK (decision IN ('applies', 'dismissed', 'pending')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT lu_ack_unique UNIQUE (newsroom_id, update_id)
);
CREATE INDEX lu_ack_newsroom_id_idx ON learning_update_acknowledgements (newsroom_id);

-- Workflows the cohort has adopted at scale. Anchor populates this
-- automatically when a workflow has been:
--   - deployed (`is_shared = true` in `workflows`)
--   - adopted by ≥ N newsrooms (where adoption = the workflow was
--     copied or referenced by a workflow_run in that newsroom)
-- Editors at other newsrooms see these as "starter workflows".
CREATE TABLE workflow_promotions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The original workflow being promoted.
  workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  -- Snapshot of the workflow's metadata at promotion time so the
  -- promotion stays meaningful even if the original is later deleted.
  title TEXT NOT NULL,
  problem_statement TEXT,
  problem_category TEXT,
  origin_newsroom_id UUID REFERENCES newsrooms(id) ON DELETE SET NULL,
  origin_newsroom_name TEXT,

  -- Counters
  usage_count INTEGER NOT NULL DEFAULT 0,            -- total runs across the cohort
  cohort_adopter_count INTEGER NOT NULL DEFAULT 0,   -- distinct newsrooms that have run it
  cohort_success_rate NUMERIC(4, 3),                 -- 0..1 of runs that succeeded

  -- Editorial framing (filled at promotion time)
  recommendation_note TEXT,

  status TEXT NOT NULL DEFAULT 'promoted'
    CHECK (status IN ('promoted', 'archived')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX workflow_promotions_status_idx ON workflow_promotions (status);

-- Per-newsroom adoptions of promoted workflows.
CREATE TABLE workflow_adoptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  promotion_id UUID NOT NULL REFERENCES workflow_promotions(id) ON DELETE CASCADE,
  newsroom_id UUID NOT NULL REFERENCES newsrooms(id) ON DELETE CASCADE,
  adopted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  -- Optional: the new workflow row that was created in the adopting newsroom.
  copied_workflow_id UUID REFERENCES workflows(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT wa_unique UNIQUE (promotion_id, newsroom_id)
);
CREATE INDEX workflow_adoptions_newsroom_id_idx ON workflow_adoptions (newsroom_id);

COMMIT;
