-- Archive knowledge-graph layer. Extends the Archivist from "semantic search
-- over chunks" to "structured dataset" — entities, relationships, and claims
-- extracted from every document, with full provenance back to the source
-- (document_id + char offsets), per-newsroom isolation, and editor-defined
-- entity types layered over universal NER (PER/ORG/LOC/MISC).
--
-- Designed to scale to the pilot's ~50K documents per newsroom on plain pg
-- recursive CTEs — no Apache AGE, no Neo4j, no new extensions.
--
-- Slice 1 (this migration): tables + indexes only. Ingestion (Slice 2) wires
-- wikineural + GLiNER + Haiku for relation/claim extraction. Time/metadata
-- columns on archive_documents are populated by Slice 3.

BEGIN;

-- Trigram extension for fuzzy name match on entity canonical_name.
-- Must be created before any index that uses gin_trgm_ops.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ─── Document metadata extension ────────────────────────────────────────────
-- Pre-knowledge-graph, archive_documents only knew filename / mime / size.
-- For a real dataset we need bibliographic metadata so editors can ask
-- "what did we report about X before Jan 2024" and "which of our journalists
-- has the deepest coverage of beat Y". These columns are NULL-able and back-
-- filled by Slice 3's metadata-extraction pass.

ALTER TABLE archive_documents
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ,           -- story publication date
  ADD COLUMN IF NOT EXISTS byline TEXT[],                       -- author(s); array because co-bylines are real
  ADD COLUMN IF NOT EXISTS beat TEXT,                           -- e.g. 'politics', 'business', 'investigations'
  ADD COLUMN IF NOT EXISTS source_url TEXT,                     -- original URL, if a republish
  ADD COLUMN IF NOT EXISTS canonical_url TEXT,                  -- canonical URL on the newsroom's own site
  ADD COLUMN IF NOT EXISTS story_type TEXT,                     -- 'news' | 'feature' | 'investigation' | 'opinion' | 'review' | 'profile'
  ADD COLUMN IF NOT EXISTS title TEXT,                          -- story headline (filename is often messy)
  ADD COLUMN IF NOT EXISTS metadata_extracted_at TIMESTAMPTZ;   -- when Slice 3 last touched this row; NULL = pending

CREATE INDEX IF NOT EXISTS idx_archive_documents_published_at ON archive_documents(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_archive_documents_beat ON archive_documents(beat);
-- GIN index on byline so "find every story by author X" is fast across an array column
CREATE INDEX IF NOT EXISTS idx_archive_documents_byline ON archive_documents USING GIN (byline);


-- ─── Entity type registry (per-newsroom, with universal defaults) ──────────
-- Universal types are seeded by lib/archive/entity_types.js seedDefaultsIfEmpty()
-- and apply to every newsroom (kind='universal'). Editors can also add their
-- own newsroom-specific types (kind='newsroom') for GLiNER to extract — e.g.
-- "mining company", "tribal authority", "court case". The label is what the
-- editor sees; the prompt_hint is what GLiNER consumes as a zero-shot label.

CREATE TABLE archive_entity_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  newsroom_id UUID REFERENCES newsrooms(id) ON DELETE CASCADE,   -- NULL for universal types (apply to all newsrooms)
  slug TEXT NOT NULL,                                            -- 'person', 'organisation', 'place', 'mining_company'
  label TEXT NOT NULL,                                           -- display name
  prompt_hint TEXT NOT NULL,                                     -- GLiNER zero-shot label (e.g. "mining company headquartered in Africa")
  kind TEXT NOT NULL CHECK (kind IN ('universal', 'newsroom')),
  source_model TEXT NOT NULL CHECK (source_model IN ('wikineural', 'gliner', 'haiku', 'manual')),
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Universal types: one (newsroom_id=NULL, slug) row. Newsroom types: one (newsroom_id, slug) row.
  UNIQUE (newsroom_id, slug)
);

CREATE INDEX idx_archive_entity_types_newsroom_id ON archive_entity_types(newsroom_id);


-- ─── Entities (canonical) ──────────────────────────────────────────────────
-- One row per unique entity in a newsroom's graph. surface_forms holds every
-- variant we've seen ("Cyril Ramaphosa", "President Ramaphosa", "C. Ramaphosa")
-- and the embedding is computed from the canonical_name for similarity-based
-- resolution at ingest. mention_count is denormalised for fast browse.
--
-- wikidata_qid is optional — populated when a future entity-linking pass can
-- match an entity to its Wikidata QID. Useful for cross-corpus joins later.

CREATE TABLE archive_entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  newsroom_id UUID NOT NULL REFERENCES newsrooms(id) ON DELETE CASCADE,
  type_id UUID NOT NULL REFERENCES archive_entity_types(id) ON DELETE RESTRICT,
  canonical_name TEXT NOT NULL,
  surface_forms TEXT[] NOT NULL DEFAULT '{}',
  embedding VECTOR(1024),                                      -- BGE-M3 of canonical_name for resolution
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,                 -- type-specific extras (e.g. for a person: role, born, died; for an org: domain, hq)
  wikidata_qid TEXT,                                           -- 'Q42' style; nullable
  mention_count INTEGER NOT NULL DEFAULT 0,                    -- denormalised; maintained by ingestion
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_archive_entities_newsroom_id ON archive_entities(newsroom_id);
CREATE INDEX idx_archive_entities_type_id ON archive_entities(type_id);
CREATE INDEX idx_archive_entities_canonical_name ON archive_entities(canonical_name);
CREATE INDEX idx_archive_entities_wikidata_qid ON archive_entities(wikidata_qid) WHERE wikidata_qid IS NOT NULL;
-- HNSW vector index for "what entities are similar to X" + similarity-based dedup at ingest
CREATE INDEX idx_archive_entities_embedding ON archive_entities USING hnsw (embedding vector_cosine_ops);
-- Full-text on canonical_name + surface_forms so "search entities by name" works without an LLM
CREATE INDEX idx_archive_entities_name_trgm ON archive_entities USING GIN (canonical_name gin_trgm_ops);

-- ─── Entity mentions ───────────────────────────────────────────────────────
-- Every occurrence of every entity in every document. char_start/char_end are
-- offsets into the source document's full text (reconstructed from chunks at
-- ingest time). surface_text is the exact span; confidence is from the NER
-- model (or 1.0 for editor-confirmed mentions); extracted_by tells us which
-- pipeline produced this mention (so we can re-run / improve later).

CREATE TABLE archive_entity_mentions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  newsroom_id UUID NOT NULL REFERENCES newsrooms(id) ON DELETE CASCADE,
  entity_id UUID NOT NULL REFERENCES archive_entities(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES archive_documents(id) ON DELETE CASCADE,
  chunk_id UUID REFERENCES archive_chunks(id) ON DELETE SET NULL, -- which chunk this mention lives in, if any
  char_start INTEGER NOT NULL,                                    -- offset into full document text
  char_end INTEGER NOT NULL,
  surface_text TEXT NOT NULL,                                     -- exact span at (char_start, char_end)
  confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  extracted_by TEXT NOT NULL CHECK (extracted_by IN ('wikineural', 'gliner', 'haiku', 'editor')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_archive_entity_mentions_entity_id ON archive_entity_mentions(entity_id);
CREATE INDEX idx_archive_entity_mentions_document_id ON archive_entity_mentions(document_id);
CREATE INDEX idx_archive_entity_mentions_newsroom_id ON archive_entity_mentions(newsroom_id);
-- "every mention of entity X in time order" is the timeline view
CREATE INDEX idx_archive_entity_mentions_entity_doc ON archive_entity_mentions(entity_id, document_id);


-- ─── Relationships (typed edges between entities) ──────────────────────────
-- Subject-predicate-object triples extracted by Haiku from each document.
-- predicate is open-vocabulary — Haiku returns natural-language predicates
-- like "acquired", "appointed", "is_subsidiary_of", "denied". evidence_text
-- is the source span Haiku quoted to support the edge (for explainability).
--
-- For graph traversal, recursive CTEs walk (subject_entity_id, object_entity_id)
-- pairs. The composite indexes below make depth-3 walks fast at pilot scale.

CREATE TABLE archive_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  newsroom_id UUID NOT NULL REFERENCES newsrooms(id) ON DELETE CASCADE,
  subject_entity_id UUID NOT NULL REFERENCES archive_entities(id) ON DELETE CASCADE,
  predicate TEXT NOT NULL,                                     -- 'acquired', 'appointed_to', 'denied', etc.
  object_entity_id UUID NOT NULL REFERENCES archive_entities(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES archive_documents(id) ON DELETE CASCADE,
  confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  evidence_text TEXT NOT NULL,                                 -- the source span Haiku quoted; 1-3 sentences
  char_offset INTEGER,                                         -- approximate offset of evidence in source doc
  extracted_by TEXT NOT NULL CHECK (extracted_by IN ('haiku', 'editor')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_archive_relationships_subject ON archive_relationships(subject_entity_id, predicate);
CREATE INDEX idx_archive_relationships_object ON archive_relationships(object_entity_id, predicate);
CREATE INDEX idx_archive_relationships_document_id ON archive_relationships(document_id);
CREATE INDEX idx_archive_relationships_newsroom_id ON archive_relationships(newsroom_id);
-- "all triples involving entity X" — used by the entity-detail UI
CREATE INDEX idx_archive_relationships_either ON archive_relationships(newsroom_id, subject_entity_id, object_entity_id);


-- ─── Claims (atomic assertions extracted from text) ────────────────────────
-- Distinct from relationships: a claim is a complete factual statement the
-- newsroom has reported (e.g. "The company reported a 12% revenue increase
-- in Q3 2024"). It optionally has subject/object entities but also stands on
-- its own as a citable factual unit. asserted_at is set from the document's
-- published_at — useful for "what did we know about X as of date Y" queries.
--
-- embedding lets us do semantic similarity over claims (e.g. "find contradictory
-- claims" or "find supporting claims for proposition Z").

CREATE TABLE archive_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  newsroom_id UUID NOT NULL REFERENCES newsrooms(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES archive_documents(id) ON DELETE CASCADE,
  chunk_id UUID REFERENCES archive_chunks(id) ON DELETE SET NULL,
  claim_text TEXT NOT NULL,                                    -- the assertion in full sentences
  subject_entity_id UUID REFERENCES archive_entities(id) ON DELETE SET NULL,
  predicate TEXT,                                              -- optional structured predicate
  object_entity_id UUID REFERENCES archive_entities(id) ON DELETE SET NULL,
  asserted_at TIMESTAMPTZ,                                     -- inherited from document's published_at
  byline TEXT[],                                               -- inherited from document
  confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  embedding VECTOR(1024),                                      -- BGE-M3 over claim_text
  evidence_text TEXT NOT NULL,                                 -- source span (1-3 sentences)
  char_offset INTEGER,
  extracted_by TEXT NOT NULL CHECK (extracted_by IN ('haiku', 'editor')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_archive_claims_newsroom_id ON archive_claims(newsroom_id);
CREATE INDEX idx_archive_claims_document_id ON archive_claims(document_id);
CREATE INDEX idx_archive_claims_subject_entity_id ON archive_claims(subject_entity_id);
CREATE INDEX idx_archive_claims_asserted_at ON archive_claims(asserted_at DESC);
-- Vector index for "find claims similar to this proposition"
CREATE INDEX idx_archive_claims_embedding ON archive_claims USING hnsw (embedding vector_cosine_ops);


-- ─── Ingestion-state tracking ──────────────────────────────────────────────
-- Lets us answer "which documents have had the knowledge-graph pass run on
-- them yet?" and "what failed last time?". One row per (document, pass).
-- A 'pass' is one stage: 'metadata', 'ner', 'relations', 'claims'.
-- Idempotent: re-running a pass updates the row in place.

CREATE TABLE archive_ingestion_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  newsroom_id UUID NOT NULL REFERENCES newsrooms(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES archive_documents(id) ON DELETE CASCADE,
  pass TEXT NOT NULL CHECK (pass IN ('metadata', 'ner', 'relations', 'claims')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  rows_added INTEGER NOT NULL DEFAULT 0,
  cost_usd NUMERIC(10, 6) NOT NULL DEFAULT 0,
  error TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (document_id, pass)
);

CREATE INDEX idx_archive_ingestion_runs_document_id ON archive_ingestion_runs(document_id);
CREATE INDEX idx_archive_ingestion_runs_status ON archive_ingestion_runs(status);
CREATE INDEX idx_archive_ingestion_runs_pass_status ON archive_ingestion_runs(pass, status);

COMMIT;
