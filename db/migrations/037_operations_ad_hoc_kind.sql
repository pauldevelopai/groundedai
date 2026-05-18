-- V2 Step 4 close-out: add an ad-hoc-question brief kind so Operations
-- can answer free-form editorial questions ("who's free Tuesday to cover
-- the ConCourt judgment?") via the agentic loop + db_read tool, without
-- the Builder pre-wiring a workflow.

BEGIN;

ALTER TABLE ops_briefs DROP CONSTRAINT IF EXISTS ops_briefs_kind_check;
ALTER TABLE ops_briefs ADD CONSTRAINT ops_briefs_kind_check
  CHECK (kind IN (
    'weekly_planning', 'freelancer_check_in', 'contributor_triage',
    'finance_summary', 'performance_review',
    'ad_hoc_question'
  ));

COMMIT;
