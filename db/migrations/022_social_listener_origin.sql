-- Social Listener — origin-attribution beyond text.
--
-- The actual threat newsrooms face isn't Russian-language posts from
-- rt.com URLs. It's English-language posts written by bots based out of
-- Russia (or proxies) targeting African audiences as fake "local"
-- voices — the IRA / Doppelganger / African Initiative playbook. To
-- catch that, language detection is the WEAKEST signal. Stronger
-- signals, in order, are:
--
--   1. Facebook Page Transparency country mismatch (admins disclosed as
--      based in country X but the Page claims to represent country Y)
--   2. Match against a documented IO network in social_known_networks
--   3. Text-fingerprint siblings posted by other accounts within a tight
--      time window (coordinated copy-paste)
--   4. Outbound URLs registered / hosted in a country that doesn't match
--      the claimed identity
--   5. Account-creation recency vs claimed institutional history
--
-- This migration adds the columns that carry those signals and the
-- known-networks registry the agent matches against.

BEGIN;

-- ─── New attribution columns on social_signals ───────────────────────────
ALTER TABLE social_signals
  -- Page Transparency country declared by Meta — the gold-standard signal
  -- for "who actually runs this account?". e.g. "Russia", "Belarus", "ZA".
  -- Stored as the literal string the editor sees on Facebook (Meta uses
  -- country names, not ISO codes), so prompts can render it verbatim.
  ADD COLUMN account_country TEXT,
  -- ISO-3166-1 alpha-2 form when the editor knows it (auto-derived from
  -- account_country when possible). Used for clean comparisons + map.
  ADD COLUMN account_country_iso TEXT,
  ADD COLUMN account_created_at TIMESTAMPTZ,
  ADD COLUMN posting_cadence_note TEXT,
  ADD COLUMN profile_photo_url TEXT,
  -- Page-name change log. Meta's Page Transparency exposes the full
  -- history; an account that's been renamed three times is a tell.
  -- Shape: [{ name, changed_at }, ...]
  ADD COLUMN name_change_history JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Outbound URLs extracted from the post body, deduped to the apex
  -- domain when possible. Used to fetch per-domain forensics.
  ADD COLUMN outbound_urls TEXT[] NOT NULL DEFAULT '{}',
  -- Per-domain forensics: { "rrn-news.com": { ssl_not_before, whois_country, registrar, age_days } }
  ADD COLUMN outbound_url_findings JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- 64-bit simhash of the post body. Stored as BIGINT — Hamming distance
  -- against this column flags coordinated copy-paste networks even when
  -- the text is paraphrased slightly. NULL if the text was too short to
  -- shingle.
  ADD COLUMN text_simhash BIGINT,
  -- IDs of social_known_networks rows this signal matched against.
  ADD COLUMN matched_networks UUID[] NOT NULL DEFAULT '{}';

CREATE INDEX social_signals_account_country_idx ON social_signals (account_country_iso);
CREATE INDEX social_signals_text_simhash_idx ON social_signals (text_simhash) WHERE text_simhash IS NOT NULL;

-- ─── Documented IO-network registry ──────────────────────────────────────
CREATE TABLE social_known_networks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  newsroom_id UUID NOT NULL REFERENCES newsrooms(id) ON DELETE CASCADE,
  added_by UUID REFERENCES users(id) ON DELETE SET NULL,

  name TEXT NOT NULL,                                  -- 'Doppelganger', 'African Initiative', etc
  aliases TEXT[] NOT NULL DEFAULT '{}',                -- alternate names this network is known by
  attributed_to TEXT,                                   -- 'Russia (Social Design Agency)' / 'Russia (Wagner-aligned)' / 'China'
  attribution_country TEXT,                             -- ISO-3166-1 alpha-2 of the operator
  description TEXT,                                     -- short editor-readable description

  alignment TEXT NOT NULL DEFAULT 'cib_network'
    CHECK (alignment IN ('state_russia', 'state_china', 'state_other', 'cib_network', 'extremist')),
  confidence NUMERIC(3, 2),                             -- 0..1 confidence the public attribution is accurate

  -- Fingerprints used to match a fresh signal against this network.
  -- known_handles are exact / wildcarded handles (e.g. '@AfricaInitiative_news', 'reliable*news').
  known_handles TEXT[] NOT NULL DEFAULT '{}',
  known_domains TEXT[] NOT NULL DEFAULT '{}',
  -- known_phrases are exact strings or short patterns that appear in
  -- network output. Editors add these as they spot them.
  known_phrases TEXT[] NOT NULL DEFAULT '{}',
  -- Loose pattern hints: 'names ending in random digits', 'profile photo
  -- is AI-generated', etc. The agent uses these to reason; we don't
  -- pattern-match programmatically because they're fuzzy.
  pattern_notes TEXT[] NOT NULL DEFAULT '{}',
  -- Africa-targeted? Lets the agent sort relevance for an African newsroom.
  targets_africa BOOLEAN NOT NULL DEFAULT FALSE,
  -- Public takedown / research reports underpinning the attribution.
  -- Shape: [{ publisher, title, url, year }]
  public_reports JSONB NOT NULL DEFAULT '[]'::jsonb,

  source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('default', 'manual')),
  is_default BOOLEAN NOT NULL DEFAULT FALSE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX social_known_networks_newsroom_id_idx ON social_known_networks (newsroom_id);
CREATE INDEX social_known_networks_alignment_idx ON social_known_networks (alignment);
CREATE INDEX social_known_networks_targets_africa_idx ON social_known_networks (targets_africa);
-- One network per name per newsroom (case-insensitive).
CREATE UNIQUE INDEX social_known_networks_name_uniq
  ON social_known_networks (newsroom_id, lower(name));

COMMIT;
