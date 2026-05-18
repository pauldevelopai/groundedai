-- Digital Security Audit — Slice A schema.
--
-- Concept-note Tool #5. The audit (a) inventories external tools the
-- newsroom uses, (b) scores each against a jurisdiction risk pack, (c)
-- reads the existing V2 sensitivity-routing history (workflow_executions
-- + workflow_runs) to show what's already been sent outside, (d) drafts
-- a prioritised fix list via one Haiku call.
--
-- This migration is Slice A only: the two tables. The pipeline + UI +
-- export land in Slices B-D.
--
-- Per-newsroom isolation: every row carries newsroom_id with ON DELETE
-- CASCADE. No cross-newsroom queries possible by construction.
--
-- Reverse: DROP TABLE security_audit_reports; DROP TABLE security_external_tools;

BEGIN;

-- ──────────────────────────────────────────────────────────────────────
-- security_external_tools
--
-- One row per external AI / data tool the newsroom uses (ChatGPT,
-- Gemini, Notion AI, an external CMS, etc.). Self-reported by the
-- newsroom — this is an inventory, not a discovery system.
-- ──────────────────────────────────────────────────────────────────────

CREATE TABLE security_external_tools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  newsroom_id UUID NOT NULL REFERENCES newsrooms(id) ON DELETE CASCADE,
  added_by UUID REFERENCES users(id) ON DELETE SET NULL,

  vendor TEXT NOT NULL,                          -- 'OpenAI', 'Anthropic', 'Notion Labs', 'Develop AI', ...
  tool_name TEXT NOT NULL,                       -- 'ChatGPT', 'Claude.ai', 'Notion AI', 'Grounded', ...
  data_residency TEXT,                           -- ISO country code where the tool stores data: 'US', 'ZA', 'EU', ...
  declared_use TEXT,                             -- free-text: "Drafting social copy", "Transcribing interviews"

  -- Fixed enum + 'other' escape (locked design decision 2026-05-18).
  -- Postgres lacks per-element CHECK on TEXT[]; validation also enforced
  -- at the API layer so the UI gets a friendly error.
  data_kinds_exposed TEXT[] NOT NULL DEFAULT '{}'::text[],
  data_kinds_other TEXT,                         -- populated when 'other' is in data_kinds_exposed

  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX security_external_tools_newsroom_id_idx
  ON security_external_tools (newsroom_id);

CREATE INDEX security_external_tools_vendor_idx
  ON security_external_tools (newsroom_id, vendor);

-- ──────────────────────────────────────────────────────────────────────
-- security_audit_reports
--
-- One row per audit run. summary_json carries the full report payload
-- (inventory scoring, routing-history rollup, Haiku-drafted fix list).
-- inventory_snapshot_json is the inventory as it stood at run time —
-- so an old report keeps its meaning even after the editor edits the
-- live inventory. Slice C populates these; Slice A only ships the
-- table.
-- ──────────────────────────────────────────────────────────────────────

CREATE TABLE security_audit_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  newsroom_id UUID NOT NULL REFERENCES newsrooms(id) ON DELETE CASCADE,
  initiated_by UUID REFERENCES users(id) ON DELETE SET NULL,

  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'failed')),
  overall_risk_band TEXT
    CHECK (overall_risk_band IN ('low', 'medium', 'high', 'critical')),

  summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  inventory_snapshot_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  routing_window_days INTEGER NOT NULL DEFAULT 90,

  cost_usd NUMERIC(10, 6),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  error TEXT
);

CREATE INDEX security_audit_reports_newsroom_id_idx
  ON security_audit_reports (newsroom_id);

CREATE INDEX security_audit_reports_started_at_idx
  ON security_audit_reports (newsroom_id, started_at DESC);

COMMIT;
