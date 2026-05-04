-- Anchor — initial schema (multi-tenancy backbone).
-- Three tables: newsrooms (synced from Airtable), users, audit_log.
-- Per-newsroom isolation enforced by newsroom_id foreign keys on all per-newsroom rows.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Newsrooms ─ synced on demand from Airtable Develop AI base, table tblUCJtQvYFcSIdxP.
-- Local cache; Airtable is source of truth for metadata.
CREATE TABLE newsrooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  airtable_record_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  country TEXT,
  status TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX newsrooms_airtable_record_id_idx ON newsrooms (airtable_record_id);

-- Users ─ per-newsroom auth identities.
-- Roles: builder (AI champion composes workflows), user (newsroom team runs them), admin (platform-wide moderation).
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  newsroom_id UUID NOT NULL REFERENCES newsrooms(id) ON DELETE RESTRICT,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('builder', 'user', 'admin')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (newsroom_id, email)
);

CREATE INDEX users_newsroom_id_idx ON users (newsroom_id);
CREATE INDEX users_email_idx ON users (email);

-- Audit log ─ every workflow run, agent invocation, governance flag, admin action.
-- JSONB payload allows extension without migrations. Per-newsroom isolation via newsroom_id.
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  newsroom_id UUID NOT NULL REFERENCES newsrooms(id) ON DELETE RESTRICT,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX audit_log_newsroom_id_idx ON audit_log (newsroom_id);
CREATE INDEX audit_log_event_type_idx ON audit_log (event_type);
CREATE INDEX audit_log_created_at_idx ON audit_log (created_at DESC);
