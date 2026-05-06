-- Fundraiser agent backbone — three tables.
--
-- funders                   — per-newsroom funder library. Default rows
--                             (OSF, MacArthur, Luminate, GNI, Ford, IFPIM,
--                             KAS-Africa) auto-seeded on first list call,
--                             editable by the newsroom afterwards.
-- fundraiser_briefs         — drafts of grant applications / donor reports
--                             / concept notes / LOIs. JSONB output is shaped
--                             to the funder's application_structure when one
--                             is selected.
-- fundraiser_cohort_matches — joint-application opportunities surfaced
--                             across cohort newsrooms. Anchor proposes,
--                             editors accept or decline.
--
-- All per-newsroom isolated. Cohort matches reference two newsrooms by id;
-- the proposing newsroom owns the row and only it can mutate the status.

BEGIN;

CREATE TABLE funders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  newsroom_id UUID NOT NULL REFERENCES newsrooms(id) ON DELETE CASCADE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,

  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'foundation'
    CHECK (type IN ('foundation', 'government', 'corporate', 'individual', 'cohort_pool', 'other')),
  description TEXT,

  focus_areas TEXT[] NOT NULL DEFAULT '{}',     -- e.g. ['independent media', 'investigative', 'climate']
  geography TEXT[] NOT NULL DEFAULT '{}',        -- e.g. ['Africa', 'Southern Africa', 'Global']
  typical_grant_range TEXT,                      -- e.g. '$10k–$100k'
  application_url TEXT,

  -- Structure of the funder's application form. Used by the agent to shape
  -- its draft into the same sections + word limits the funder asks for.
  -- Shape: [{ section: 'Project summary', word_limit: 250, prompt: '...' }, ...]
  application_structure JSONB NOT NULL DEFAULT '[]'::jsonb,
  deadlines JSONB NOT NULL DEFAULT '[]'::jsonb,
                                                 -- [{ label: 'Spring 2026', date: '2026-03-15' }]

  notes TEXT,

  source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('default', 'manual')),
  is_default BOOLEAN NOT NULL DEFAULT FALSE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX funders_newsroom_id_idx ON funders (newsroom_id);
CREATE INDEX funders_type_idx ON funders (type);

CREATE TABLE fundraiser_briefs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  newsroom_id UUID NOT NULL REFERENCES newsrooms(id) ON DELETE CASCADE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  funder_id UUID REFERENCES funders(id) ON DELETE SET NULL,

  title TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'grant_application'
    CHECK (kind IN ('grant_application', 'donor_report', 'concept_note', 'loi')),

  brief_input TEXT NOT NULL,                     -- the editor's short brief / what the project is
  budget_request_usd INTEGER,                    -- optional ask amount
  duration_months INTEGER,                       -- project length

  output JSONB NOT NULL DEFAULT '{}'::jsonb,     -- structured: { sections: [{ title, word_limit, content }], budget_scaffold, ... }
  edited_output JSONB,                           -- editor-corrected
  notes TEXT,

  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'generated', 'edited', 'submitted', 'won', 'lost', 'failed')),
  duration_ms INTEGER,
  cost_usd NUMERIC(10, 6),
  error TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX fundraiser_briefs_newsroom_id_idx ON fundraiser_briefs (newsroom_id);
CREATE INDEX fundraiser_briefs_funder_id_idx ON fundraiser_briefs (funder_id);
CREATE INDEX fundraiser_briefs_status_idx ON fundraiser_briefs (status);

CREATE TABLE fundraiser_cohort_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  funder_id UUID REFERENCES funders(id) ON DELETE CASCADE,
  funder_name TEXT NOT NULL,                     -- denormalised so match survives funder edits
  anchor_newsroom_id UUID NOT NULL REFERENCES newsrooms(id) ON DELETE CASCADE,
  partner_newsroom_id UUID NOT NULL REFERENCES newsrooms(id) ON DELETE CASCADE,

  rationale TEXT NOT NULL,                       -- why these two newsrooms fit a joint app
  match_score NUMERIC(4, 3),                     -- 0..1 confidence
  shared_strengths TEXT[] NOT NULL DEFAULT '{}',
  shared_geography TEXT[] NOT NULL DEFAULT '{}',

  status TEXT NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed', 'accepted', 'declined', 'expired')),
  responded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  responded_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT no_self_match CHECK (anchor_newsroom_id <> partner_newsroom_id)
);
CREATE INDEX fundraiser_cohort_matches_anchor_idx ON fundraiser_cohort_matches (anchor_newsroom_id);
CREATE INDEX fundraiser_cohort_matches_partner_idx ON fundraiser_cohort_matches (partner_newsroom_id);
CREATE INDEX fundraiser_cohort_matches_status_idx ON fundraiser_cohort_matches (status);

COMMIT;
