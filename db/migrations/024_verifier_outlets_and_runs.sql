-- Verifier — Africa-grounded credibility map (SA + ZW + ZM + KE) plus
-- a persistent verifier_runs table.
--
-- Why both:
--  · The existing Verifier agent is stateless — the workflow runner
--    persists outputs via workflow_runs. That covers in-workflow use.
--  · Slices 15 and 15b reserved routed_to_verifier_run_id soft refs on
--    inbound_submissions + social_signals, expecting an addressable
--    verifier_runs row to exist. This migration creates it.
--  · The credibility map is a per-newsroom registry of outlets in the
--    countries Anchor's pilot cohort covers, each with a score + the
--    public sources that justify it. The Verifier consults this when it
--    sees a URL in the source text.

BEGIN;

CREATE TABLE verifier_outlets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  newsroom_id UUID NOT NULL REFERENCES newsrooms(id) ON DELETE CASCADE,
  added_by UUID REFERENCES users(id) ON DELETE SET NULL,

  name TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT 'other'
    CHECK (country IN ('ZA', 'ZW', 'ZM', 'KE', 'other')),
  url TEXT,                                                -- canonical apex domain (e.g. dailymaverick.co.za)
  alt_urls TEXT[] NOT NULL DEFAULT '{}',                   -- additional domains the outlet uses

  ownership TEXT,                                          -- e.g. "Naspers / Media24", "State-owned (ZBC)", "Independent non-profit"
  alignment_notes TEXT,                                    -- editorial-alignment notes (private/state/partisan/etc)

  -- 0..1, higher = more credible. Stored as the editor's working score;
  -- the Verifier uses it as a prior, not a verdict. The notes + sources
  -- below explain WHY this score is what it is.
  credibility_score NUMERIC(3, 2),
  beat_strengths TEXT[] NOT NULL DEFAULT '{}',
  beat_weaknesses TEXT[] NOT NULL DEFAULT '{}',
  known_issues TEXT[] NOT NULL DEFAULT '{}',
  notes TEXT,

  -- Citations for the assessment. Shape: [{ publisher, title, url, year }]
  public_sources JSONB NOT NULL DEFAULT '[]'::jsonb,

  source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('default', 'manual')),
  is_default BOOLEAN NOT NULL DEFAULT FALSE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX verifier_outlets_newsroom_id_idx ON verifier_outlets (newsroom_id);
CREATE INDEX verifier_outlets_country_idx ON verifier_outlets (country);
CREATE UNIQUE INDEX verifier_outlets_url_uniq
  ON verifier_outlets (newsroom_id, lower(url)) WHERE url IS NOT NULL;

CREATE TABLE verifier_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  newsroom_id UUID NOT NULL REFERENCES newsrooms(id) ON DELETE CASCADE,
  initiated_by UUID REFERENCES users(id) ON DELETE SET NULL,

  title TEXT NOT NULL,
  -- The text being verified. For inbound-submission referrals this is
  -- the submission body; for manual/standalone runs it's whatever the
  -- editor pasted; for production-source runs it's the article body.
  claim_text TEXT NOT NULL,
  context_brief TEXT,
  -- Optional cross-agent provenance. source_kind tells you what kind of
  -- thing we're verifying ("inbound_submission", "social_signal",
  -- "production", "manual"); source_id is the soft ref. The originating
  -- table also gets back-filled via its routed_to_verifier_run_id column
  -- when applicable.
  source_kind TEXT NOT NULL DEFAULT 'manual'
    CHECK (source_kind IN ('manual', 'inbound_submission', 'social_signal', 'production', 'translation', 'other')),
  source_id UUID,

  -- Outlets matched against URLs in claim_text at run time. Lets the
  -- editor see "your credibility map gave outlet X a score of 0.45" in
  -- context. Shape: { url: { outlet_id, name, score, country, known_issues:[...] }, ... }
  matched_outlet_findings JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Verifier output (same shape the agent already returns):
  -- { claims:[{claim, verdict, confidence, evidence, sources}], ai_likelihood,
  --   ai_indicators:[], overall_assessment }
  output JSONB NOT NULL DEFAULT '{}'::jsonb,
  edited_output JSONB,
  notes TEXT,

  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'verified', 'edited', 'failed')),
  duration_ms INTEGER,
  cost_usd NUMERIC(10, 6),
  error TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX verifier_runs_newsroom_id_idx ON verifier_runs (newsroom_id);
CREATE INDEX verifier_runs_source_idx ON verifier_runs (source_kind, source_id);
CREATE INDEX verifier_runs_status_idx ON verifier_runs (status);

COMMIT;
