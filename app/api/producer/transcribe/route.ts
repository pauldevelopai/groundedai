// /api/producer/transcribe — multipart upload of an audio file → Whisper-base
// transcription, persisted as a producer_transcripts row. Newsroom-scoped.
//
// First call cold-loads ~150 MB of Whisper weights into the HF cache (10–20 s).
// Cached after that. Subsequent calls are real-time-ish on Apple Silicon.
//
// GET lists this newsroom's transcripts (latest 50).

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';
import path from 'path';
const { transcribeFile, persistUpload, MODEL_ID } = require('@/lib/audio/stt');

// 100 MB upload cap — should comfortably hold a 30 minute interview at typical bitrates.
const MAX_BYTES = 100 * 1024 * 1024;

export async function GET() {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { rows } = await pool.query(
    `SELECT id, filename, duration_seconds, language, model, status,
            duration_ms, error, notes, created_at,
            COALESCE(LENGTH(text), 0) AS text_length
       FROM producer_transcripts
      WHERE newsroom_id = $1
      ORDER BY created_at DESC LIMIT 50`,
    [session.newsroomId]
  );
  return NextResponse.json({ transcripts: rows });
}

export async function POST(req: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (session.role !== 'builder' && session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — builder role required' }, { status: 403 });
  }

  const contentType = req.headers.get('content-type') || '';
  if (!contentType.startsWith('multipart/form-data')) {
    return NextResponse.json({ error: 'multipart/form-data required' }, { status: 400 });
  }

  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ error: 'Invalid form data' }, { status: 400 }); }

  const file = form.get('audio');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'audio file is required (multipart field "audio")' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: `File too large (max ${MAX_BYTES / 1024 / 1024} MB)` }, { status: 413 });
  }
  const language = (form.get('language') as string) || 'en';
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const ext = path.extname(file.name || '').toLowerCase() || '.bin';

  const { absPath, relPath, sha256, bytes } = persistUpload(buffer, ext);

  // Insert pending row first so a long-running transcription is visible in the UI.
  const insert = await pool.query(
    `INSERT INTO producer_transcripts
       (newsroom_id, uploaded_by, filename, source_storage_path, language, model, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'pending')
     RETURNING id`,
    [session.newsroomId, session.userId, file.name || null, relPath, language, MODEL_ID]
  );
  const transcriptId = insert.rows[0].id;

  const startedAt = Date.now();
  try {
    const result = await transcribeFile(absPath, { language });
    const durationMs = Date.now() - startedAt;
    await pool.query(
      `UPDATE producer_transcripts
          SET text = $2, segments = $3::jsonb, duration_seconds = $4,
              duration_ms = $5, status = 'transcribed'
        WHERE id = $1`,
      [transcriptId, result.text, JSON.stringify(result.segments), result.durationSeconds, durationMs]
    );
    return NextResponse.json({
      transcriptId,
      text: result.text,
      segments: result.segments,
      durationSeconds: result.durationSeconds,
      durationMs,
      sha256,
      bytes,
      model: MODEL_ID,
    }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await pool.query(
      `UPDATE producer_transcripts SET status = 'failed', error = $2 WHERE id = $1`,
      [transcriptId, message]
    );
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
