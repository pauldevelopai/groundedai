-- Archive dataset export — signed JSON bundles a newsroom can share or
-- license. Two tables:
--
--   archive_newsroom_keys     ed25519 signing keypair, one per newsroom.
--                             Public key is plaintext (for downstream
--                             verification). Private key is AES-256-GCM
--                             encrypted using ANCHOR_DISTRIBUTION_KEY
--                             (same wrapping as distribution credentials).
--                             Generated on first export; stable thereafter.
--
--   archive_dataset_exports   one row per export. Records filters, counts,
--                             content hash + signature, status, manifest
--                             metadata. Bundle itself is generated on
--                             demand from the recorded filters — we don't
--                             store the (potentially large) JSON in the DB.

BEGIN;

CREATE TABLE archive_newsroom_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  newsroom_id UUID NOT NULL UNIQUE REFERENCES newsrooms(id) ON DELETE CASCADE,
  public_key TEXT NOT NULL,                                  -- base64-encoded raw 32-byte ed25519 public key
  private_key_encrypted JSONB NOT NULL,                      -- { ciphertext, iv, auth_tag } (AES-256-GCM)
  fingerprint TEXT NOT NULL,                                 -- SHA-256(public_key) base64, displayed for identification
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  rotated_at TIMESTAMPTZ                                     -- nullable; bumped if/when a newsroom rotates
);

CREATE INDEX idx_archive_newsroom_keys_newsroom_id ON archive_newsroom_keys(newsroom_id);


CREATE TABLE archive_dataset_exports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  newsroom_id UUID NOT NULL REFERENCES newsrooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  title TEXT NOT NULL,                                       -- editor-facing label
  filters JSONB NOT NULL DEFAULT '{}'::jsonb,                -- { beat?, fromDate?, toDate?, includeClaims?, includeRelationships?, anonymiseByline?, ... }
  counts JSONB NOT NULL DEFAULT '{}'::jsonb,                 -- { documents, entities, mentions, relationships, claims }
  content_hash TEXT,                                         -- SHA-256 of the canonical-JSON data block
  signature TEXT,                                            -- base64 ed25519 signature over content_hash bytes
  public_key TEXT,                                           -- denormalised from archive_newsroom_keys at generation time
  manifest JSONB,                                            -- the full manifest object stored verbatim
  size_bytes INTEGER,                                        -- final bundle byte size (best-effort)
  status TEXT NOT NULL CHECK (status IN ('pending', 'generating', 'ready', 'failed')),
  error TEXT,
  bundle_path TEXT,                                          -- path on the filesystem where the bundle is cached (pilot: /tmp)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ                                     -- when the cached bundle is OK to delete
);

CREATE INDEX idx_archive_dataset_exports_newsroom_id ON archive_dataset_exports(newsroom_id);
CREATE INDEX idx_archive_dataset_exports_status ON archive_dataset_exports(status);
CREATE INDEX idx_archive_dataset_exports_created_at ON archive_dataset_exports(created_at DESC);

COMMIT;
