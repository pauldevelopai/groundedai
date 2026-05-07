-- Social Listener — four tables.
--
-- social_keywords         per-newsroom watchlist (terms, scope, severity)
-- social_sources          per-newsroom origin reputation rows. Default seed
--                          covers documented Russian-aligned + Chinese-aligned
--                          state-media domains and their Africa-targeting
--                          sub-brands; editable per newsroom afterwards.
-- social_signals          posts ingested for analysis with raw text, URL,
--                          author handle, source domain, posted_at, and the
--                          structured analysis we attach (lang detected, NER
--                          entities, origin signals, severity, etc).
-- social_listener_briefs  agent outputs (signal_analysis / keyword_sweep /
--                          coordinated_pattern), parity with operations and
--                          distributor brief shapes.

BEGIN;

CREATE TABLE social_keywords (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  newsroom_id UUID NOT NULL REFERENCES newsrooms(id) ON DELETE CASCADE,
  added_by UUID REFERENCES users(id) ON DELETE SET NULL,

  term TEXT NOT NULL,
  -- 'phrase' = exact phrase (case-insensitive substring)
  -- 'regex'  = JS-ish regex (we ignore exotic flags; use sparingly)
  -- 'name'   = a person / org / place — try NER as well as substring
  match_kind TEXT NOT NULL DEFAULT 'phrase'
    CHECK (match_kind IN ('phrase', 'regex', 'name')),
  scope TEXT NOT NULL DEFAULT 'all'
    CHECK (scope IN ('all', 'facebook', 'twitter', 'instagram', 'tiktok', 'telegram', 'whatsapp', 'web', 'other')),
  severity_floor TEXT NOT NULL DEFAULT 'low'
    CHECK (severity_floor IN ('low', 'medium', 'high', 'critical')),
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'archived')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX social_keywords_newsroom_id_idx ON social_keywords (newsroom_id);
CREATE INDEX social_keywords_status_idx ON social_keywords (status);

CREATE TABLE social_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  newsroom_id UUID NOT NULL REFERENCES newsrooms(id) ON DELETE CASCADE,

  -- Identifier of the source. Domain is canonical when known (rt.com,
  -- sputnikafrica.com); fall back to a handle for accounts (e.g. @CGTNAfrica).
  identifier TEXT NOT NULL,
  identifier_kind TEXT NOT NULL DEFAULT 'domain'
    CHECK (identifier_kind IN ('domain', 'fb_page', 'twitter_handle', 'tg_channel', 'youtube_channel', 'other')),
  display_name TEXT,
  alignment TEXT NOT NULL DEFAULT 'uncategorised'
    CHECK (alignment IN ('uncategorised', 'state_russia', 'state_china', 'state_other', 'cib_network', 'extremist', 'commercial', 'reputable')),
  alignment_confidence NUMERIC(3, 2),                     -- 0..1
  country TEXT,                                           -- ISO 3166-1 alpha-2 where known
  notes TEXT,

  source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('default', 'manual')),
  is_default BOOLEAN NOT NULL DEFAULT FALSE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT social_sources_unique_per_newsroom UNIQUE (newsroom_id, identifier_kind, identifier)
);
CREATE INDEX social_sources_newsroom_id_idx ON social_sources (newsroom_id);
CREATE INDEX social_sources_alignment_idx ON social_sources (alignment);

CREATE TABLE social_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  newsroom_id UUID NOT NULL REFERENCES newsrooms(id) ON DELETE CASCADE,
  ingested_by UUID REFERENCES users(id) ON DELETE SET NULL,

  -- Where the signal came from. 'manual' = an editor pasted it in,
  -- 'webhook' = a third-party scraper / Content Library export pushed it,
  -- 'csv' = bulk import.
  ingestion_kind TEXT NOT NULL DEFAULT 'manual'
    CHECK (ingestion_kind IN ('manual', 'webhook', 'csv')),
  platform TEXT NOT NULL DEFAULT 'facebook'
    CHECK (platform IN ('facebook', 'twitter', 'instagram', 'tiktok', 'telegram', 'whatsapp', 'web', 'other')),

  post_url TEXT,
  author_handle TEXT,
  author_display_name TEXT,
  -- Free-form metadata captured at ingestion (page id, follower count,
  -- page-transparency country, share count, language reported by source, etc).
  author_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_domain TEXT,                                     -- extracted from post_url

  raw_text TEXT NOT NULL DEFAULT '',
  posted_at TIMESTAMPTZ,                                  -- when the post was made (if known)

  matched_keywords UUID[] NOT NULL DEFAULT '{}',          -- social_keywords.id refs

  -- Structured analysis attached after run. Shape:
  -- {
  --   lang: { code, name, confidence, secondary?: { code, confidence } },
  --   entities: { persons:[], orgs:[], locations:[], misc:[] },
  --   origin_signals: {
  --     source_match: { source_id, alignment, confidence },
  --     domain_match: { domain, alignment },
  --     translation_artefacts: [...],
  --     country_hints: [...]
  --   },
  --   severity: 'low'|'medium'|'high'|'critical',
  --   recommended_response: '...',
  --   reasoning: '...'
  -- }
  analysis JSONB NOT NULL DEFAULT '{}'::jsonb,

  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'analysing', 'analysed', 'flagged', 'cleared', 'reported', 'failed')),
  flagged_by UUID REFERENCES users(id) ON DELETE SET NULL,
  flagged_at TIMESTAMPTZ,

  -- Cross-agent linkage when an editor escalates a signal.
  routed_to_verifier_run_id UUID,
  routed_to_distribution_correction_id UUID REFERENCES distribution_corrections(id) ON DELETE SET NULL,
  routed_to_calendar_id UUID REFERENCES editorial_calendar(id) ON DELETE SET NULL,

  notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX social_signals_newsroom_id_idx ON social_signals (newsroom_id);
CREATE INDEX social_signals_status_idx ON social_signals (status);
CREATE INDEX social_signals_platform_idx ON social_signals (platform);
CREATE INDEX social_signals_source_domain_idx ON social_signals (source_domain);
CREATE INDEX social_signals_posted_at_idx ON social_signals (posted_at DESC NULLS LAST);

CREATE TABLE social_listener_briefs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  newsroom_id UUID NOT NULL REFERENCES newsrooms(id) ON DELETE CASCADE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,

  title TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('signal_analysis', 'keyword_sweep', 'coordinated_pattern')),
  brief_input TEXT,
  signal_ids UUID[] NOT NULL DEFAULT '{}',                -- which signals this brief reasons about

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
CREATE INDEX social_listener_briefs_newsroom_id_idx ON social_listener_briefs (newsroom_id);
CREATE INDEX social_listener_briefs_kind_idx ON social_listener_briefs (kind);

COMMIT;
