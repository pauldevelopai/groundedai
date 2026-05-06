-- Researcher × Archivist cross-reference. After Researcher extracts entities
-- from a dossier's documents, we run the Archivist's pgvector search for
-- each significant person/organisation and persist hits as findings of a
-- new kind 'archive_match'. This widens the existing CHECK constraint.

BEGIN;

ALTER TABLE research_findings DROP CONSTRAINT IF EXISTS research_findings_kind_check;
ALTER TABLE research_findings
  ADD CONSTRAINT research_findings_kind_check
  CHECK (kind IN ('claim', 'question', 'record_to_pull', 'gap', 'summary', 'archive_match'));

-- Speed up "show me all archive matches for entity X in this dossier".
-- The metadata column already exists; we add a JSONB GIN index for it
-- because archive_match rows store the entity's id + name in metadata.
CREATE INDEX IF NOT EXISTS research_findings_metadata_idx
  ON research_findings USING gin (metadata jsonb_path_ops);

COMMIT;
