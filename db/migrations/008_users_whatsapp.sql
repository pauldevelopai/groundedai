-- Add WhatsApp number to users so admins can invite team members by phone,
-- not just email. Stored in E.164 (e.g. "+260977123456"). Nullable — the
-- bootstrap admin (admin@anchor.local) has no WhatsApp number, and email
-- remains the auth credential.
--
-- Globally UNIQUE (when present) — one human per number across the whole
-- platform. Partial unique index, so multiple NULLs are allowed.

BEGIN;

ALTER TABLE users
  ADD COLUMN whatsapp_number TEXT,
  ADD COLUMN display_name TEXT;

CREATE UNIQUE INDEX users_whatsapp_number_key
  ON users (whatsapp_number)
  WHERE whatsapp_number IS NOT NULL;

CREATE INDEX users_whatsapp_number_idx ON users (whatsapp_number);

COMMIT;
