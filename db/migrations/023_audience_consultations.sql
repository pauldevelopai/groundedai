-- Audience refactor (2026-05-07): drops synthetic-personas as primary
-- surface, adds analytics-grounded consultations as the new primary
-- interaction. Editor asks a question (or pastes a headline / angle);
-- agent reads recent audience_signals + newsroom profile and returns
-- a structured response.
--
-- The slice-10 audience_personas + focus_group_sessions tables are
-- intentionally NOT dropped — they're soft-deprecated. Existing rows
-- stay queryable via the backward-compat API routes; the workspace UI
-- just stops surfacing them.

BEGIN;

CREATE TABLE audience_consultations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  newsroom_id UUID NOT NULL REFERENCES newsrooms(id) ON DELETE CASCADE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,

  title TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('headline_test', 'angle_check', 'analytics_query')),

  -- The editor's input. For headline_test it's the proposed headline;
  -- for angle_check the pitched angle / lede / framing; for
  -- analytics_query a free-form question.
  input_text TEXT NOT NULL,
  -- Optional secondary input — e.g. a draft body that goes with the
  -- headline being tested, or context the editor wants the agent to
  -- weigh.
  context_brief TEXT,

  -- Which audience_signals rows informed the response. The agent
  -- selects them when it composes the prompt; we persist them so
  -- the editor can audit "what did this answer actually rest on?".
  referenced_signal_ids UUID[] NOT NULL DEFAULT '{}',

  output JSONB NOT NULL DEFAULT '{}'::jsonb,
  edited_output JSONB,
  notes TEXT,

  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'generated', 'edited', 'shared', 'failed')),
  duration_ms INTEGER,
  cost_usd NUMERIC(10, 6),
  error TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX audience_consultations_newsroom_id_idx ON audience_consultations (newsroom_id);
CREATE INDEX audience_consultations_kind_idx ON audience_consultations (kind);
CREATE INDEX audience_consultations_status_idx ON audience_consultations (status);

COMMIT;
