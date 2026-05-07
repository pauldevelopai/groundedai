-- Distributor agent backbone — six tables.
--
-- Two-way per AGENTS.md + project memory:
--   inbound:   tips / submissions / contributor signups land in
--              inbound_submissions and get triaged → Verifier (for
--              fact-checking) or Operations (for contributor vetting).
--   outbound:  approved pieces go OUT through configured channels.
--              Credentials live encrypted in distribution_credentials
--              (AES-256-GCM per-newsroom). Each actual destination is a
--              distribution_channels row (e.g. "newsroom WP blog",
--              "Twitter @newsroom").
--   sends:     one row per outbound dispatch attempt, with external id /
--              permalink / status. Pilot uses 'dispatched_simulated' as
--              the safe-by-default state — real per-channel adapters land
--              post-pilot. Schema is forward-compatible.
--   corrections: corrections to a published send. Tracked separately so
--              we can propagate them across the channels the original
--              piece went out to.
--   briefs:    Distributor agent's structured outputs (inbound triage,
--              outbound plan, correction draft).

BEGIN;

CREATE TABLE inbound_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  newsroom_id UUID NOT NULL REFERENCES newsrooms(id) ON DELETE CASCADE,

  -- Where it came from. 'web_form' for in-app submissions, 'whatsapp' /
  -- 'email' / 'sms' for ingestion via gateways.
  source TEXT NOT NULL DEFAULT 'web_form'
    CHECK (source IN ('web_form', 'whatsapp', 'email', 'sms', 'twitter', 'fb', 'manual', 'other')),
  sender_name TEXT,
  sender_contact TEXT,                           -- WhatsApp number, email, handle
  subject TEXT,
  body TEXT NOT NULL DEFAULT '',
  attachments JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{ filename, storage_path, mime, bytes }]

  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'in_triage', 'routed', 'archived', 'spam', 'duplicate')),

  -- Editor-set classification + agent's suggested classification.
  classification TEXT
    CHECK (classification IN (NULL, 'news_tip', 'contributor_signup', 'correction', 'feedback', 'spam', 'unrelated')),
  agent_triage JSONB NOT NULL DEFAULT '{}'::jsonb,
                                              -- { suggested_classification, suggested_route, rationale, urgency_score }

  -- Where it was routed. Soft refs — the underlying row may be deleted
  -- without orphaning a triage record.
  routed_to_contributor_id UUID REFERENCES community_contributors(id) ON DELETE SET NULL,
  routed_to_calendar_id UUID REFERENCES editorial_calendar(id) ON DELETE SET NULL,
  routed_to_verifier_run_id UUID,              -- soft ref to a verifier run when one is dispatched
  routed_at TIMESTAMPTZ,
  routed_by UUID REFERENCES users(id) ON DELETE SET NULL,

  notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX inbound_submissions_newsroom_id_idx ON inbound_submissions (newsroom_id);
CREATE INDEX inbound_submissions_status_idx ON inbound_submissions (status);
CREATE INDEX inbound_submissions_source_idx ON inbound_submissions (source);
CREATE INDEX inbound_submissions_created_idx ON inbound_submissions (created_at DESC);

CREATE TABLE distribution_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  newsroom_id UUID NOT NULL REFERENCES newsrooms(id) ON DELETE CASCADE,
  added_by UUID REFERENCES users(id) ON DELETE SET NULL,

  label TEXT NOT NULL,                           -- editor-friendly label
  channel_kind TEXT NOT NULL                     -- which platform
    CHECK (channel_kind IN ('twitter', 'fb', 'instagram', 'linkedin', 'threads',
                            'wordpress', 'ghost', 'custom_cms',
                            'whatsapp_business', 'whatsapp_channel',
                            'email_smtp', 'newsletter')),

  -- Encrypted credential blob — opaque ciphertext (base64) + AES-GCM IV +
  -- auth tag. The plaintext is a JSON object whose shape is per-channel
  -- (api_key, oauth_token, page_id, smtp_host, etc). NEVER stored in the
  -- clear and NEVER returned over the API.
  ciphertext TEXT NOT NULL,
  iv TEXT NOT NULL,
  auth_tag TEXT NOT NULL,
  cipher_version SMALLINT NOT NULL DEFAULT 1,

  -- Non-sensitive metadata that's safe to display in the UI.
  display_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
                                              -- { handle, page_name, blog_url, ... }

  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'revoked', 'expired')),
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX distribution_credentials_newsroom_id_idx ON distribution_credentials (newsroom_id);
CREATE INDEX distribution_credentials_channel_kind_idx ON distribution_credentials (channel_kind);
CREATE INDEX distribution_credentials_status_idx ON distribution_credentials (status);

CREATE TABLE distribution_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  newsroom_id UUID NOT NULL REFERENCES newsrooms(id) ON DELETE CASCADE,
  credential_id UUID REFERENCES distribution_credentials(id) ON DELETE SET NULL,
  added_by UUID REFERENCES users(id) ON DELETE SET NULL,

  name TEXT NOT NULL,                            -- editor-friendly: "Newsroom WP blog"
  channel_kind TEXT NOT NULL,                    -- mirrors credentials.channel_kind for fast filtering
  external_handle TEXT,                          -- @newsroom, page id, blog id, etc
  external_url TEXT,                             -- the public URL of the destination

  -- Per-channel publishing defaults (max length, hashtag style, ...) that
  -- the agent should respect when drafting per-channel copy.
  defaults JSONB NOT NULL DEFAULT '{}'::jsonb,

  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'archived')),
  notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX distribution_channels_newsroom_id_idx ON distribution_channels (newsroom_id);
CREATE INDEX distribution_channels_kind_idx ON distribution_channels (channel_kind);

CREATE TABLE distribution_sends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  newsroom_id UUID NOT NULL REFERENCES newsrooms(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL REFERENCES distribution_channels(id) ON DELETE CASCADE,
  initiated_by UUID REFERENCES users(id) ON DELETE SET NULL,

  -- What's being sent (soft refs — the source might live in
  -- producer_productions, drafts (future), translations).
  source_kind TEXT NOT NULL CHECK (source_kind IN ('production', 'draft', 'translation', 'manual')),
  source_id UUID,
  source_calendar_id UUID REFERENCES editorial_calendar(id) ON DELETE SET NULL,

  -- The actual payload that was (or would be) sent. Per-channel shape:
  -- twitter → { text, media_urls? }; wp → { title, html_body, slug, tags };
  -- whatsapp → { text, template_name? }.
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,

  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'dispatching', 'dispatched', 'dispatched_simulated', 'failed', 'retracted')),
  external_id TEXT,                              -- platform-side id (tweet id, post id, etc)
  permalink TEXT,
  scheduled_for TIMESTAMPTZ,
  dispatched_at TIMESTAMPTZ,
  error TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX distribution_sends_newsroom_id_idx ON distribution_sends (newsroom_id);
CREATE INDEX distribution_sends_channel_id_idx ON distribution_sends (channel_id);
CREATE INDEX distribution_sends_status_idx ON distribution_sends (status);
CREATE INDEX distribution_sends_source_idx ON distribution_sends (source_kind, source_id);

CREATE TABLE distribution_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  newsroom_id UUID NOT NULL REFERENCES newsrooms(id) ON DELETE CASCADE,
  raised_by UUID REFERENCES users(id) ON DELETE SET NULL,

  -- The original piece this corrects. Use source_kind/source_id parity
  -- with distribution_sends so the correction can be propagated.
  source_kind TEXT NOT NULL CHECK (source_kind IN ('production', 'draft', 'translation', 'manual')),
  source_id UUID,

  reason TEXT NOT NULL,                          -- what was wrong
  correction_text TEXT NOT NULL,                 -- the correction copy (may be edited per channel)
  severity TEXT NOT NULL DEFAULT 'minor'
    CHECK (severity IN ('typo', 'minor', 'material', 'critical')),

  -- Per-channel propagation: { send_id: status }, where status ∈
  -- pending | drafted | dispatched | dispatched_simulated | failed | skipped
  channel_propagation JSONB NOT NULL DEFAULT '{}'::jsonb,

  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'drafted', 'partially_dispatched', 'dispatched', 'closed')),
  notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX distribution_corrections_newsroom_id_idx ON distribution_corrections (newsroom_id);
CREATE INDEX distribution_corrections_status_idx ON distribution_corrections (status);

CREATE TABLE distributor_briefs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  newsroom_id UUID NOT NULL REFERENCES newsrooms(id) ON DELETE CASCADE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,

  title TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('inbound_triage', 'outbound_plan', 'correction_draft')),
  brief_input TEXT,
  -- Optional links so the brief can be tied to a specific submission /
  -- send / correction it concerns.
  inbound_id UUID REFERENCES inbound_submissions(id) ON DELETE SET NULL,
  send_id UUID REFERENCES distribution_sends(id) ON DELETE SET NULL,
  correction_id UUID REFERENCES distribution_corrections(id) ON DELETE SET NULL,
  source_kind TEXT,                              -- production / draft / translation when planning outbound
  source_id UUID,

  output JSONB NOT NULL DEFAULT '{}'::jsonb,
  edited_output JSONB,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'generated', 'edited', 'applied', 'failed')),
  duration_ms INTEGER,
  cost_usd NUMERIC(10, 6),
  error TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX distributor_briefs_newsroom_id_idx ON distributor_briefs (newsroom_id);
CREATE INDEX distributor_briefs_kind_idx ON distributor_briefs (kind);

COMMIT;
