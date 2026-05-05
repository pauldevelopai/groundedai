-- Researcher backbone — a real research database, not a Claude wrapper.
-- Per-newsroom isolation everywhere via newsroom_id FK.
--
-- A research_dossier groups documents + extracted findings under one
-- investigation, story, or topic. Documents are uploaded by journalists
-- (PDFs, DOCX, plain text). Entities, relationships, claims, suggested
-- questions, and suggested follow-up records get extracted by the
-- Researcher agent (slice 6b) and persisted here.

BEGIN;

CREATE TABLE research_dossiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  newsroom_id UUID NOT NULL REFERENCES newsrooms(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  topic TEXT,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'archived', 'closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX research_dossiers_newsroom_id_idx ON research_dossiers (newsroom_id);
CREATE INDEX research_dossiers_status_idx ON research_dossiers (status);

CREATE TABLE research_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dossier_id UUID NOT NULL REFERENCES research_dossiers(id) ON DELETE CASCADE,
  newsroom_id UUID NOT NULL REFERENCES newsrooms(id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  s3_key TEXT,
  source_url TEXT,
  raw_text TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'parsed', 'analyzed', 'failed')),
  parse_error TEXT,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  analyzed_at TIMESTAMPTZ
);
CREATE INDEX research_documents_dossier_id_idx ON research_documents (dossier_id);
CREATE INDEX research_documents_newsroom_id_idx ON research_documents (newsroom_id);
CREATE INDEX research_documents_status_idx ON research_documents (status);

-- Extracted entities. `kind` is open-vocab to allow the agent to invent
-- specifics (court_case, registration_number, …) without a migration each
-- time, but the canonical kinds are: person, organisation, place, date,
-- amount, event.
CREATE TABLE research_entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dossier_id UUID NOT NULL REFERENCES research_dossiers(id) ON DELETE CASCADE,
  newsroom_id UUID NOT NULL REFERENCES newsrooms(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,                  -- lower, trimmed; for dedup within a dossier
  role TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,    -- per-kind extras (e.g. amount.currency, person.title)
  mention_count INTEGER NOT NULL DEFAULT 1,
  first_seen_doc_id UUID REFERENCES research_documents(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (dossier_id, kind, normalized_name)
);
CREATE INDEX research_entities_dossier_id_idx ON research_entities (dossier_id);
CREATE INDEX research_entities_newsroom_id_idx ON research_entities (newsroom_id);
CREATE INDEX research_entities_kind_idx ON research_entities (kind);

CREATE TABLE research_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dossier_id UUID NOT NULL REFERENCES research_dossiers(id) ON DELETE CASCADE,
  newsroom_id UUID NOT NULL REFERENCES newsrooms(id) ON DELETE CASCADE,
  from_entity_id UUID NOT NULL REFERENCES research_entities(id) ON DELETE CASCADE,
  to_entity_id UUID NOT NULL REFERENCES research_entities(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,                             -- director_of, paid, owns, member_of, ...
  evidence TEXT,
  source_doc_id UUID REFERENCES research_documents(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX research_relationships_dossier_id_idx ON research_relationships (dossier_id);
CREATE INDEX research_relationships_from_idx ON research_relationships (from_entity_id);
CREATE INDEX research_relationships_to_idx ON research_relationships (to_entity_id);

-- Findings = key claims, suggested follow-up questions, suggested records
-- to pull, and noted gaps. All keyed back to a source document where possible.
CREATE TABLE research_findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dossier_id UUID NOT NULL REFERENCES research_dossiers(id) ON DELETE CASCADE,
  newsroom_id UUID NOT NULL REFERENCES newsrooms(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('claim', 'question', 'record_to_pull', 'gap', 'summary')),
  body TEXT NOT NULL,
  rationale TEXT,
  source_doc_id UUID REFERENCES research_documents(id) ON DELETE SET NULL,
  confidence NUMERIC(3, 2),                       -- 0.00–1.00
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX research_findings_dossier_id_idx ON research_findings (dossier_id);
CREATE INDEX research_findings_kind_idx ON research_findings (kind);

COMMIT;
