BEGIN;

CREATE TABLE IF NOT EXISTS archive_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  newsroom_id UUID NOT NULL REFERENCES newsrooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  s3_key TEXT,
  drive_file_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('uploading', 'processing', 'ready', 'failed')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_archive_documents_newsroom_id ON archive_documents(newsroom_id);

COMMIT;
