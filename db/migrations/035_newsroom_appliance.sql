-- Newsroom appliance + federated execution — V2 Step 6.
--
-- The cornerstone of V2: each newsroom can optionally register a small
-- appliance (Mac mini, NUC, VM) running locally. Sensitive jobs (per
-- Step 5's classifier) get HMAC-signed POSTs dispatched to the
-- appliance instead of being refused. Cloud jobs continue to use
-- Anthropic. The newsroom's sensitive payloads never leave its own
-- hardware.
--
-- One appliance per newsroom for V2 (pool support is a future slice).
-- The signing_secret is stored encrypted via lib/distribution/crypto.js
-- (AES-256-GCM, ANCHOR_DISTRIBUTION_KEY) — shown to the admin once at
-- registration time and unrecoverable thereafter.

CREATE TABLE newsroom_appliances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- One appliance per newsroom for V2. Future: drop UNIQUE for a pool.
  newsroom_id UUID NOT NULL UNIQUE REFERENCES newsrooms(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  -- The fully-qualified URL the central app POSTs to. Typically a
  -- Tailscale or Cloudflare Tunnel URL like
  -- https://envpress-appliance.ts.net:8443 or a public reverse proxy.
  dispatch_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'failed')),
  -- Encrypted shared secret. AES-256-GCM via lib/distribution/crypto.js.
  signing_secret_ciphertext TEXT NOT NULL,
  signing_secret_iv TEXT NOT NULL,
  signing_secret_auth_tag TEXT NOT NULL,
  -- Heartbeat from the appliance's /healthz callback.
  last_seen_at TIMESTAMPTZ,
  last_seen_version TEXT,
  registered_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX newsroom_appliances_status_idx ON newsroom_appliances (status);

CREATE TABLE appliance_dispatches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  newsroom_id UUID NOT NULL REFERENCES newsrooms(id) ON DELETE CASCADE,
  appliance_id UUID NOT NULL REFERENCES newsroom_appliances(id) ON DELETE CASCADE,
  -- Both nullable: a dispatch may correspond to a workflow execution OR a
  -- direct agent invocation (workflow_runs row) OR neither (a test ping).
  workflow_execution_id UUID REFERENCES workflow_executions(id) ON DELETE SET NULL,
  workflow_run_id UUID REFERENCES workflow_runs(id) ON DELETE SET NULL,
  endpoint TEXT NOT NULL,                        -- 'agents/run' | 'workflows/run' | 'healthz'
  agent_slug TEXT,                               -- when applicable
  status TEXT NOT NULL DEFAULT 'dispatched'
    CHECK (status IN ('dispatched', 'running', 'completed', 'failed', 'timeout')),
  http_status INTEGER,
  duration_ms INTEGER,
  error TEXT,
  dispatched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at TIMESTAMPTZ
);

CREATE INDEX appliance_dispatches_newsroom_idx ON appliance_dispatches (newsroom_id);
CREATE INDEX appliance_dispatches_appliance_idx ON appliance_dispatches (appliance_id);
CREATE INDEX appliance_dispatches_dispatched_at_idx ON appliance_dispatches (dispatched_at DESC);
CREATE INDEX appliance_dispatches_status_idx ON appliance_dispatches (status);

-- Tag each workflow_execution with where it actually ran. NULL = legacy
-- rows pre-V2-Step-6; readers treat as 'cloud'.
ALTER TABLE workflow_executions
  ADD COLUMN executed_on TEXT CHECK (executed_on IN ('cloud', 'appliance'));

CREATE INDEX workflow_executions_executed_on_idx
  ON workflow_executions (executed_on) WHERE executed_on IS NOT NULL;
