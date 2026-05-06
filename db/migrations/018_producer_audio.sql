-- Producer audio assembly — assets and transcripts.
--
-- producer_assets        — generated binary outputs (audio at slice 12,
--                          video at slice 13). One row per file. Files are
--                          stored on disk under storage/producer/<id>.<ext>;
--                          this table just holds metadata + ownership +
--                          newsroom isolation.
-- producer_transcripts   — Whisper outputs from one-off audio uploads
--                          (interview tape, actuality clips, etc). Decoupled
--                          from productions because newsrooms transcribe
--                          tape long before they assemble a final piece.

BEGIN;

CREATE TABLE producer_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  newsroom_id UUID NOT NULL REFERENCES newsrooms(id) ON DELETE CASCADE,
  production_id UUID REFERENCES producer_productions(id) ON DELETE CASCADE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,

  kind TEXT NOT NULL CHECK (kind IN ('audio', 'video', 'image')),
  format TEXT NOT NULL,                          -- 'wav' | 'mp3' | 'mp4' | 'mov' | 'png' | ...
  storage_path TEXT NOT NULL,                    -- relative to project root, e.g. 'storage/producer/<uuid>.wav'
  bytes BIGINT,
  duration_seconds NUMERIC(10, 3),
  sha256 TEXT,

  -- Pipeline metadata: which TTS engine, sample rate, channel count, etc.
  -- For audio_assembly assets this records the engine fallback chain that
  -- actually ran (e.g. {"tts": "macos_say", "sample_rate": 22050}).
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX producer_assets_newsroom_id_idx ON producer_assets (newsroom_id);
CREATE INDEX producer_assets_production_id_idx ON producer_assets (production_id);
CREATE INDEX producer_assets_kind_idx ON producer_assets (kind);

CREATE TABLE producer_transcripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  newsroom_id UUID NOT NULL REFERENCES newsrooms(id) ON DELETE CASCADE,
  uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,

  filename TEXT,                                 -- original upload name
  source_storage_path TEXT,                      -- the audio file we transcribed (kept for re-runs)
  duration_seconds NUMERIC(10, 3),
  language TEXT,                                 -- detected or requested ISO code
  model TEXT NOT NULL DEFAULT 'whisper-base',    -- which whisper variant produced this

  text TEXT NOT NULL DEFAULT '',                 -- flattened transcript
  -- Timecoded segments: [{ start, end, text }, ...] — Whisper-base default chunking.
  segments JSONB NOT NULL DEFAULT '[]'::jsonb,

  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'transcribed', 'failed')),
  duration_ms INTEGER,                           -- wall-clock processing time
  error TEXT,
  notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX producer_transcripts_newsroom_id_idx ON producer_transcripts (newsroom_id);
CREATE INDEX producer_transcripts_status_idx ON producer_transcripts (status);

COMMIT;
