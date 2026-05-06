-- Audience agent backbone — three tables.
--
-- audience_personas      — synthetic readers the newsroom interrogates
--                          before publishing. Default personas
--                          (low-data smartphone, vernacular-first,
--                          feature-phone) auto-seeded on first use per
--                          the AGENTS.md spec.
-- audience_signals       — analytics ingestions (Plausible, Umami, GA,
--                          raw CSV). Anchor parses each into structured
--                          signals + a Claude-summarised analysis.
-- focus_group_sessions   — transcripts of personas reacting to a piece
--                          of test material (headline / lede / draft).
--
-- All per-newsroom isolated. Defaults are PER newsroom (each newsroom gets
-- its own editable copy) rather than a global shared set, so editors can
-- refine the defaults to their actual audience.

BEGIN;

CREATE TABLE audience_personas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  newsroom_id UUID NOT NULL REFERENCES newsrooms(id) ON DELETE CASCADE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,

  name TEXT NOT NULL,
  archetype TEXT NOT NULL,            -- 'low_data', 'vernacular_first', 'feature_phone', 'custom', etc.
  description TEXT,                   -- prose

  -- Demographics
  age_range TEXT,
  location TEXT,
  languages TEXT[] NOT NULL DEFAULT '{}',
  device TEXT,                        -- 'feature_phone' | 'low_data_smartphone' | 'smartphone' | 'desktop'

  -- Habits
  reading_habits TEXT,
  primary_platforms TEXT[] NOT NULL DEFAULT '{}',
  trust_signals TEXT,

  interests TEXT[] NOT NULL DEFAULT '{}',

  -- Provenance
  source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('default', 'manual', 'derived_from_analytics')),
  is_default BOOLEAN NOT NULL DEFAULT FALSE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX audience_personas_newsroom_id_idx ON audience_personas (newsroom_id);
CREATE INDEX audience_personas_archetype_idx ON audience_personas (archetype);

CREATE TABLE audience_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  newsroom_id UUID NOT NULL REFERENCES newsrooms(id) ON DELETE CASCADE,
  uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,

  source TEXT NOT NULL                -- 'plausible' | 'umami' | 'ga' | 'csv' | 'manual'
    CHECK (source IN ('plausible', 'umami', 'ga', 'csv', 'manual')),
  filename TEXT,
  period_start DATE,
  period_end DATE,

  raw_csv TEXT,                       -- original upload (optional, capped in handler)
  signals JSONB NOT NULL DEFAULT '{}'::jsonb,
                                      -- { landed_topics: [...], gaps: [...], bounced: [...], drift_notes }
  total_pageviews BIGINT,
  unique_visitors BIGINT,

  analysis_summary TEXT,
  cost_usd NUMERIC(10, 6),
  duration_ms INTEGER,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'analyzed', 'failed')),
  error TEXT,

  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX audience_signals_newsroom_id_idx ON audience_signals (newsroom_id);
CREATE INDEX audience_signals_status_idx ON audience_signals (status);

CREATE TABLE focus_group_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  newsroom_id UUID NOT NULL REFERENCES newsrooms(id) ON DELETE CASCADE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,

  title TEXT NOT NULL,
  test_material TEXT NOT NULL,        -- headline / lede / angle / full draft
  test_material_kind TEXT NOT NULL    -- 'headline' | 'lede' | 'angle' | 'full_draft'
    CHECK (test_material_kind IN ('headline', 'lede', 'angle', 'full_draft')),
  context_brief TEXT,                 -- what the editor wants tested

  persona_ids UUID[] NOT NULL,
  transcript JSONB NOT NULL DEFAULT '[]'::jsonb,
                                      -- [{persona_id, persona_name, reaction, would_share, confidence}, ...]
  summary TEXT,
  recommendations TEXT[] NOT NULL DEFAULT '{}',

  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed', 'failed')),
  duration_ms INTEGER,
  cost_usd NUMERIC(10, 6),
  error TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX focus_group_sessions_newsroom_id_idx ON focus_group_sessions (newsroom_id);
CREATE INDEX focus_group_sessions_status_idx ON focus_group_sessions (status);

COMMIT;
