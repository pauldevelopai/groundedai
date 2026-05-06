-- Translator phrase-level segments + edit-feedback loop.
-- Segments: per-sentence source/target pairs persisted alongside the full
-- translated_text. The UI shows them side-by-side so editors see exactly
-- where the model split things and can drill into individual sentences.
-- Proposals: when an editor saves an edit, we diff their version against
-- the model output, extract substitutions, and persist them as glossary
-- proposals on the translation row. The editor reviews, optionally types
-- the source-language term, and accepts → translation_glossary entry with
-- source='edit_feedback'.

BEGIN;

ALTER TABLE translations
  ADD COLUMN IF NOT EXISTS segments JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS proposals JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMIT;
