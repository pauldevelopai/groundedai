// /api/research/dossiers/:id/documents
//
// POST — upload a document into the dossier (PDF/DOCX/TXT/MD). Stores the file
// via the local-disk S3 mock (same as the Archivist), extracts raw text via
// pdf-parse / mammoth / utf-8, persists a research_documents row with
// status='parsed' on success or 'failed' on extraction error. Returns the row.
//
// Slice 6b will add `POST /:id/analyze` that runs the Researcher agent across
// the dossier's parsed documents and persists entities/relationships/findings.

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';
import { uploadToS3 } from '@/lib/storage/s3';
import { extractText } from '@/lib/storage/extract';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const VALID_MIME = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'text/plain',
  'text/markdown',
]);
const MAX_BYTES = 25 * 1024 * 1024; // 25 MB

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid dossier id' }, { status: 400 });

  // Confirm dossier belongs to session newsroom
  const dossierRows = await pool.query(
    `SELECT id, newsroom_id FROM research_dossiers WHERE id = $1`,
    [id]
  );
  if (dossierRows.rows.length === 0) {
    return NextResponse.json({ error: 'Dossier not found' }, { status: 404 });
  }
  if (dossierRows.rows[0].newsroom_id !== session.newsroomId) {
    return NextResponse.json({ error: 'Dossier not found' }, { status: 404 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 });
  }
  const file = formData.get('file') as File | null;
  const sourceUrl = (formData.get('source_url') as string | null)?.trim() || null;
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

  const looksLikeMarkdown = file.name.toLowerCase().endsWith('.md');
  if (!VALID_MIME.has(file.type) && !looksLikeMarkdown) {
    return NextResponse.json(
      { error: `Unsupported file type "${file.type}". Use PDF, DOCX, TXT, or MD.` },
      { status: 400 }
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: `File exceeds ${MAX_BYTES} bytes.` }, { status: 413 });
  }

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const mimeType = file.type || (looksLikeMarkdown ? 'text/markdown' : 'application/octet-stream');

  const s3Key = `research/${session.newsroomId}/${id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
  let storedKey: string | null = null;
  try {
    const stored = await uploadToS3({ buffer, key: s3Key, contentType: mimeType });
    storedKey = stored.key;
  } catch (e) {
    console.error('research storage write failed:', e);
    // continue — we can still record the document with raw_text only
  }

  const insert = await pool.query(
    `INSERT INTO research_documents
       (dossier_id, newsroom_id, uploaded_by, filename, mime_type, size_bytes, s3_key, source_url, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')
     RETURNING id`,
    [id, session.newsroomId, session.userId, file.name, mimeType, file.size, storedKey, sourceUrl]
  );
  const documentId: string = insert.rows[0].id;

  // Try extraction; persist text on success, parse_error on failure.
  try {
    const text = await extractText(buffer, mimeType);
    await pool.query(
      `UPDATE research_documents
          SET raw_text = $2, status = 'parsed', parse_error = NULL
        WHERE id = $1`,
      [documentId, text]
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await pool.query(
      `UPDATE research_documents
          SET status = 'failed', parse_error = $2
        WHERE id = $1`,
      [documentId, message]
    );
    return NextResponse.json(
      { error: `Stored, but text extraction failed: ${message}`, document_id: documentId },
      { status: 422 }
    );
  }

  await pool.query(
    `UPDATE research_dossiers SET updated_at = NOW() WHERE id = $1`,
    [id]
  );
  await pool.query(
    `INSERT INTO audit_log (newsroom_id, user_id, event_type, payload)
     VALUES ($1, $2, 'research.document.uploaded', $3)`,
    [
      session.newsroomId,
      session.userId,
      JSON.stringify({ dossier_id: id, document_id: documentId, filename: file.name, size_bytes: file.size }),
    ]
  );

  const { rows } = await pool.query(
    `SELECT id, filename, mime_type, size_bytes, source_url, status,
            uploaded_at, CASE WHEN raw_text IS NULL THEN 0 ELSE LENGTH(raw_text) END AS text_length
       FROM research_documents WHERE id = $1`,
    [documentId]
  );
  return NextResponse.json({ document: rows[0] }, { status: 201 });
}
