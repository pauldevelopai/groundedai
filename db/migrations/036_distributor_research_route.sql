-- Three-way Digital News Gatherer routing (concept-note reconciliation
-- 2026-05-15). Adds Researcher as a third triage destination alongside
-- Verifier and Operations (contributor / calendar). The editor now picks
-- one or more of:
--   → Verifier   (fact-check the claim)        — routed_to_verifier_run_id
--   → Researcher (deepen with public records)  — routed_to_research_dossier_id  (new, this migration)
--   → Operations (contributor / story idea)    — routed_to_contributor_id, routed_to_calendar_id

BEGIN;

ALTER TABLE inbound_submissions
  ADD COLUMN routed_to_research_dossier_id UUID
    REFERENCES research_dossiers(id) ON DELETE SET NULL;

CREATE INDEX inbound_submissions_research_dossier_idx
  ON inbound_submissions (routed_to_research_dossier_id)
  WHERE routed_to_research_dossier_id IS NOT NULL;

COMMIT;
