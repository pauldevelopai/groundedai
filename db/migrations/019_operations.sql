-- Operations agent backbone — five tables.
--
-- editorial_calendar    — story ideas, in-production pieces, deadlines, and
--                          scheduled publishes. The shared planning surface
--                          editors and producers use day-to-day.
-- freelancers           — paid contributor roster (rates, beats, payment
--                          status). Distinct from community_contributors.
-- community_contributors — unpaid / light-pay community sources from the
--                          Distributor inbound triage queue. Operations
--                          owns vetting + moderation routing per AGENTS.md.
-- ops_finance_entries   — light cash-in / cash-out ledger (freelancer
--                          payouts, sponsor / grant income, subscriptions).
--                          Not a full accounting system — operational
--                          visibility only.
-- ops_metric_snapshots  — periodic snapshots of org-level performance
--                          metrics (stories published, reach, revenue,
--                          freelancer spend). Newsroom records its own.
--
-- All per-newsroom isolated. ops_finance_entries amounts are stored as
-- INTEGER cents to avoid float drift on totals.

BEGIN;

CREATE TABLE editorial_calendar (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  newsroom_id UUID NOT NULL REFERENCES newsrooms(id) ON DELETE CASCADE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,

  title TEXT NOT NULL,
  summary TEXT,
  beat TEXT,                                     -- 'investigations' | 'culture' | 'politics' | etc. — newsroom-defined
  format TEXT,                                   -- 'article' | 'radio' | 'podcast' | 'video' | 'newsletter'
  priority TEXT NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  status TEXT NOT NULL DEFAULT 'idea'
    CHECK (status IN ('idea', 'commissioned', 'in_progress', 'in_review', 'scheduled', 'published', 'killed')),

  -- The person primarily responsible. Can be a staff user, a freelancer, or
  -- left null while still in the idea stage.
  assigned_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  assigned_freelancer_id UUID,                   -- forward ref; FK added after freelancers table
  assigned_contributor_id UUID,                  -- forward ref; FK added after contributors table

  deadline_at TIMESTAMPTZ,                       -- when copy is due
  scheduled_publish_at TIMESTAMPTZ,              -- when it ships

  -- Cross-agent links (nullable). Producer / Drafter / Translator outputs
  -- can be attached to a calendar item so the editor sees what's actually
  -- in production for this story.
  draft_id UUID,
  production_id UUID REFERENCES producer_productions(id) ON DELETE SET NULL,
  translation_id UUID,
  notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX editorial_calendar_newsroom_id_idx ON editorial_calendar (newsroom_id);
CREATE INDEX editorial_calendar_status_idx ON editorial_calendar (status);
CREATE INDEX editorial_calendar_deadline_idx ON editorial_calendar (deadline_at);
CREATE INDEX editorial_calendar_publish_idx ON editorial_calendar (scheduled_publish_at);

CREATE TABLE freelancers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  newsroom_id UUID NOT NULL REFERENCES newsrooms(id) ON DELETE CASCADE,
  added_by UUID REFERENCES users(id) ON DELETE SET NULL,

  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  city TEXT,
  country TEXT,

  beats TEXT[] NOT NULL DEFAULT '{}',
  languages TEXT[] NOT NULL DEFAULT '{}',
  rate_per_piece_cents INTEGER,                  -- representative rate; specifics live on assignments
  rate_per_word_cents INTEGER,
  preferred_currency TEXT NOT NULL DEFAULT 'USD',

  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'archived')),
  notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX freelancers_newsroom_id_idx ON freelancers (newsroom_id);
CREATE INDEX freelancers_status_idx ON freelancers (status);

CREATE TABLE community_contributors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  newsroom_id UUID NOT NULL REFERENCES newsrooms(id) ON DELETE CASCADE,
  added_by UUID REFERENCES users(id) ON DELETE SET NULL,

  name TEXT NOT NULL,
  contact TEXT,                                  -- WhatsApp number, email, social handle
  contact_kind TEXT,                             -- 'whatsapp' | 'email' | 'twitter' | 'fb' | etc.
  location TEXT,

  -- Vetting + moderation: this contributor passed our checks (id, prior
  -- accuracy track record), is currently being assessed, or has been
  -- blocked. Newsrooms can refine these states; the CHECK keeps it sane.
  vetting_status TEXT NOT NULL DEFAULT 'unvetted'
    CHECK (vetting_status IN ('unvetted', 'in_review', 'vetted', 'blocked')),
  trust_score NUMERIC(3, 2),                     -- 0..1, derived from prior submissions
  attribution_name TEXT,                         -- public byline / "as told to" credit form
  payment_kind TEXT NOT NULL DEFAULT 'unpaid'
    CHECK (payment_kind IN ('unpaid', 'small_stipend', 'per_tip', 'per_piece')),
  total_paid_cents INTEGER NOT NULL DEFAULT 0,

  -- Inbound submissions counter so the editor sees who's reliable.
  submissions_count INTEGER NOT NULL DEFAULT 0,
  submissions_published INTEGER NOT NULL DEFAULT 0,
  last_submission_at TIMESTAMPTZ,

  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX community_contributors_newsroom_id_idx ON community_contributors (newsroom_id);
CREATE INDEX community_contributors_vetting_idx ON community_contributors (vetting_status);

-- Now that freelancers and community_contributors exist, attach the FKs
-- on editorial_calendar that we left forward-referenced.
ALTER TABLE editorial_calendar
  ADD CONSTRAINT editorial_calendar_assigned_freelancer_fkey
  FOREIGN KEY (assigned_freelancer_id) REFERENCES freelancers(id) ON DELETE SET NULL;
ALTER TABLE editorial_calendar
  ADD CONSTRAINT editorial_calendar_assigned_contributor_fkey
  FOREIGN KEY (assigned_contributor_id) REFERENCES community_contributors(id) ON DELETE SET NULL;

CREATE TABLE ops_finance_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  newsroom_id UUID NOT NULL REFERENCES newsrooms(id) ON DELETE CASCADE,
  recorded_by UUID REFERENCES users(id) ON DELETE SET NULL,

  occurred_on DATE NOT NULL DEFAULT CURRENT_DATE,
  direction TEXT NOT NULL CHECK (direction IN ('income', 'expense')),
  category TEXT NOT NULL,                        -- 'freelancer_payout' | 'subscription' | 'sponsor' | 'grant' | 'rent' | etc.
  description TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  currency TEXT NOT NULL DEFAULT 'USD',

  -- Optional links to who/what this entry settles
  freelancer_id UUID REFERENCES freelancers(id) ON DELETE SET NULL,
  contributor_id UUID REFERENCES community_contributors(id) ON DELETE SET NULL,
  calendar_id UUID REFERENCES editorial_calendar(id) ON DELETE SET NULL,
  funder_id UUID,                                -- soft ref to fundraiser.funders without a hard FK; funder may not exist yet

  status TEXT NOT NULL DEFAULT 'recorded'
    CHECK (status IN ('recorded', 'pending', 'paid', 'reconciled', 'cancelled')),
  notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ops_finance_entries_newsroom_id_idx ON ops_finance_entries (newsroom_id);
CREATE INDEX ops_finance_entries_direction_idx ON ops_finance_entries (direction);
CREATE INDEX ops_finance_entries_occurred_idx ON ops_finance_entries (occurred_on);

CREATE TABLE ops_metric_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  newsroom_id UUID NOT NULL REFERENCES newsrooms(id) ON DELETE CASCADE,
  recorded_by UUID REFERENCES users(id) ON DELETE SET NULL,

  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  label TEXT,                                    -- 'Week 19', 'Q2 2026', etc.

  -- Free-form metric blob — newsrooms record what they care about. Common
  -- keys: stories_published, total_reach, unique_visitors, subscribers,
  -- revenue_cents, freelancer_spend_cents, audience_growth_pct.
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ops_metric_snapshots_newsroom_id_idx ON ops_metric_snapshots (newsroom_id);
CREATE INDEX ops_metric_snapshots_period_idx ON ops_metric_snapshots (period_start, period_end);

-- Operations briefs: structured Claude outputs (weekly plan, contributor
-- triage, finance summary, performance review). One row per brief; output
-- is the structured JSON the agent produced.
CREATE TABLE ops_briefs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  newsroom_id UUID NOT NULL REFERENCES newsrooms(id) ON DELETE CASCADE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,

  title TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN (
    'weekly_planning', 'freelancer_check_in', 'contributor_triage',
    'finance_summary', 'performance_review'
  )),

  brief_input TEXT,                              -- editor's prompt / framing
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
CREATE INDEX ops_briefs_newsroom_id_idx ON ops_briefs (newsroom_id);
CREATE INDEX ops_briefs_kind_idx ON ops_briefs (kind);
CREATE INDEX ops_briefs_status_idx ON ops_briefs (status);

COMMIT;
