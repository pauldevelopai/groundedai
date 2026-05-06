-- Newsroom profile — first-class object the newsroom maintains itself.
-- Read by Fundraiser (donor reports + grant briefs), Audience (seeds for
-- audience clones), Producer (house style on multimedia outputs), and
-- Drafter (voice / style refinement).
--
-- One row per newsroom; auto-created on first PATCH if missing. Editable
-- by builder/admin. Structured fields where the agents need predictable
-- shape; metadata JSONB for extensions without future migrations.

BEGIN;

CREATE TABLE newsroom_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  newsroom_id UUID NOT NULL UNIQUE REFERENCES newsrooms(id) ON DELETE CASCADE,

  -- Identity
  tagline TEXT,                                   -- 1-line newsroom positioning
  mission TEXT,                                   -- 1–2 sentences

  -- Coverage
  strengths TEXT[] NOT NULL DEFAULT '{}',         -- "Investigative", "Climate", "Local govt"
  beats TEXT[] NOT NULL DEFAULT '{}',             -- regular beats
  geography TEXT[] NOT NULL DEFAULT '{}',         -- coverage area names

  -- Audience
  audience_summary TEXT,                          -- prose summary editor writes
  audience_size_monthly INTEGER,                  -- approx monthly uniques
  audience_demographics JSONB NOT NULL DEFAULT '{}'::jsonb,
                                                  -- {age_range, urban_rural_mix, language_mix, ...}
  primary_platforms TEXT[] NOT NULL DEFAULT '{}', -- 'web','whatsapp','newsletter','fb','x','instagram','youtube','radio'
  primary_languages TEXT[] NOT NULL DEFAULT '{}', -- ISO 639 codes

  -- House style (read by Drafter, Producer)
  voice TEXT,                                     -- prose description of voice
  style_notes TEXT,                               -- "no Oxford comma", "metric units only", etc.
  ethics_policy TEXT,                             -- POPIA / corrections / use-of-AI policy

  -- Impact (read by Fundraiser)
  impact_stories JSONB NOT NULL DEFAULT '[]'::jsonb,
                                                  -- [{ headline, year, outcome, source_url }, ...]
  awards JSONB NOT NULL DEFAULT '[]'::jsonb,      -- [{ name, year, body }, ...]

  -- Free-form
  additional_notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX newsroom_profiles_newsroom_id_idx ON newsroom_profiles (newsroom_id);

COMMIT;
