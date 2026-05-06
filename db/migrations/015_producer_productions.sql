-- Producer productions — finished-product compositions across formats.
-- Slice 9 covers TEXT outputs: radio scripts, podcast outlines, video briefs.
-- Slice 12 will add audio_assembly (Whisper + Piper); Slice 13 adds
-- vertical_video and audiograms (ffmpeg + caption renderer). The CHECK
-- constraint already lists every planned format so future slices land
-- without a schema change.

BEGIN;

CREATE TABLE producer_productions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  newsroom_id UUID NOT NULL REFERENCES newsrooms(id) ON DELETE CASCADE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,

  title TEXT NOT NULL,
  format TEXT NOT NULL CHECK (format IN (
    'radio_script',
    'podcast_outline',
    'video_brief',
    'audio_assembly',     -- Slice 12
    'vertical_video',     -- Slice 13
    'audiogram'           -- Slice 13
  )),

  source_text TEXT NOT NULL,                     -- the article / brief the producer works from
  archive_context TEXT,                          -- optional past coverage the producer wove in
  output JSONB NOT NULL DEFAULT '{}'::jsonb,     -- structured per-format output
  edited_output JSONB,                           -- editor-corrected version
  duration_estimate_seconds INTEGER,             -- estimated runtime
  notes TEXT,                                    -- editor notes
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'generated', 'edited', 'approved', 'published', 'failed'
  )),
  duration_ms INTEGER,                           -- generation time
  cost_usd NUMERIC(10, 6),
  error TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX producer_productions_newsroom_id_idx ON producer_productions (newsroom_id);
CREATE INDEX producer_productions_format_idx ON producer_productions (format);
CREATE INDEX producer_productions_status_idx ON producer_productions (status);

COMMIT;
