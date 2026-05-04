-- API cost tracking. Every Claude call (and future Google/ElevenLabs/etc.) gets
-- one row here. Used for per-newsroom budgeting, per-user fair-share, and
-- pilot-period cost forecasting.
--
-- Distinct from audit_log (workflow-level events) — this is per-API-call.

CREATE TABLE api_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service TEXT NOT NULL,                      -- 'anthropic', 'google', 'elevenlabs', etc.
  model TEXT NOT NULL,                        -- 'claude-opus-4-7', etc.
  endpoint TEXT,                              -- Anchor route that triggered this
  agent TEXT,                                 -- 'verifier' | 'archivist' | 'drafter' | NULL
  newsroom_id UUID REFERENCES newsrooms(id) ON DELETE RESTRICT,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd NUMERIC(10, 6) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX api_costs_newsroom_id_idx ON api_costs (newsroom_id);
CREATE INDEX api_costs_created_at_idx ON api_costs (created_at DESC);
CREATE INDEX api_costs_service_model_idx ON api_costs (service, model);
CREATE INDEX api_costs_agent_idx ON api_costs (agent);
