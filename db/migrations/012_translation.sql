-- Translator backbone — per-newsroom glossary + translation jobs.
-- The glossary is the newsroom's house terminology / approved place names /
-- idiom that the editor signs off on. The translations table records each
-- translation job: source text in, model output, editor-corrected version
-- (slice 7d), and which glossary terms applied.
--
-- Languages stored as ISO 639-1 lower-case codes ('en', 'af', 'zu', 'xh',
-- 'st', 'tn', 'ss', 'nr', 'nso'). Slice 7a ships en↔af, en↔zu, en↔xh via
-- Helsinki-NLP opus-mt; 7b adds NLLB-200 / Masakhane routing.

BEGIN;

CREATE TABLE translation_glossary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  newsroom_id UUID NOT NULL REFERENCES newsrooms(id) ON DELETE CASCADE,
  term TEXT NOT NULL,                       -- source-language form
  translation TEXT NOT NULL,                -- approved target-language form
  source_language TEXT NOT NULL,
  target_language TEXT NOT NULL,
  notes TEXT,
  source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'edit_feedback', 'imported')),
  use_count INTEGER NOT NULL DEFAULT 0,
  added_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (newsroom_id, source_language, target_language, term)
);
CREATE INDEX translation_glossary_newsroom_id_idx ON translation_glossary (newsroom_id);
CREATE INDEX translation_glossary_pair_idx ON translation_glossary (newsroom_id, source_language, target_language);
CREATE INDEX translation_glossary_term_lower_idx ON translation_glossary (newsroom_id, source_language, target_language, lower(term));

CREATE TABLE translations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  newsroom_id UUID NOT NULL REFERENCES newsrooms(id) ON DELETE CASCADE,
  requested_by UUID REFERENCES users(id) ON DELETE SET NULL,
  source_language TEXT NOT NULL,
  target_language TEXT NOT NULL,
  source_text TEXT NOT NULL,
  translated_text TEXT,                     -- raw model output
  edited_text TEXT,                         -- editor sign-off, slice 7d
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'translated', 'edited', 'published', 'failed')),
  model_id TEXT,                            -- e.g. 'Xenova/opus-mt-en-zu'
  glossary_terms_seen JSONB NOT NULL DEFAULT '[]'::jsonb,
                                            -- entries whose source term appeared in input
  duration_ms INTEGER,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX translations_newsroom_id_idx ON translations (newsroom_id);
CREATE INDEX translations_status_idx ON translations (status);
CREATE INDEX translations_pair_idx ON translations (newsroom_id, source_language, target_language);

COMMIT;
