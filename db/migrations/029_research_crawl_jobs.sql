-- Researcher deep-crawl tracking.
--
-- One row per "crawl this homepage and scrape the linked articles" run.
-- The actual job execution lives in pg-boss (queues: research:crawl + research:
-- scrape-one). This table is the durable record the UI polls for status.
--
-- Per-newsroom isolation via newsroom_id. dossier_id is nullable for one-off
-- ad-hoc crawls that aren't tied to an existing investigation.

BEGIN;

CREATE TABLE research_crawl_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  newsroom_id UUID NOT NULL REFERENCES newsrooms(id) ON DELETE CASCADE,
  dossier_id UUID REFERENCES research_dossiers(id) ON DELETE CASCADE,
  started_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,

  homepage_url TEXT NOT NULL,
  rules JSONB NOT NULL DEFAULT '{}'::jsonb,         -- snapshot of effective rules at job start

  -- Progress tracking — handlers update these as sub-jobs complete.
  total_urls INTEGER NOT NULL DEFAULT 0,
  processed_urls INTEGER NOT NULL DEFAULT 0,
  failed_urls INTEGER NOT NULL DEFAULT 0,

  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
  error TEXT,
  -- pg-boss job id for the top-level fan-out job (for traceability)
  pg_boss_job_id TEXT,

  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX research_crawl_jobs_newsroom_id_idx ON research_crawl_jobs (newsroom_id);
CREATE INDEX research_crawl_jobs_dossier_id_idx ON research_crawl_jobs (dossier_id);
CREATE INDEX research_crawl_jobs_status_idx ON research_crawl_jobs (status);
CREATE INDEX research_crawl_jobs_created_at_idx ON research_crawl_jobs (created_at DESC);

COMMIT;
