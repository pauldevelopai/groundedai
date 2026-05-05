BEGIN;

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS archive_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES archive_documents(id) ON DELETE CASCADE,
  newsroom_id UUID NOT NULL REFERENCES newsrooms(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  text TEXT NOT NULL,
  embedding VECTOR(1024),
  token_count INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_archive_chunks_document_id ON archive_chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_archive_chunks_newsroom_id ON archive_chunks(newsroom_id);

-- Create HNSW index on the embedding column for efficient vector search
CREATE INDEX IF NOT EXISTS idx_archive_chunks_embedding 
ON archive_chunks USING hnsw (embedding vector_cosine_ops);

COMMIT;
