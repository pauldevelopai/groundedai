// /api/research/dossiers/:id/documents/:documentId
//
// GET    — fetch document metadata + raw_text (for the dossier UI's "view text").
// DELETE — drop the document (cascades nothing — entities/findings stay; their
//          source_doc_id becomes NULL via ON DELETE SET NULL).

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function loadDocForSession(documentId: string, dossierId: string, newsroomId: string) {
  const { rows } = await pool.query(
    `SELECT d.id, d.dossier_id, d.newsroom_id, d.filename, d.mime_type, d.size_bytes,
            d.source_url, d.raw_text, d.status, d.parse_error, d.uploaded_at, d.analyzed_at
       FROM research_documents d
      WHERE d.id = $1 AND d.dossier_id = $2`,
    [documentId, dossierId]
  );
  const row = rows[0];
  if (!row) return null;
  if (row.newsroom_id !== newsroomId) return null;
  return row;
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string; documentId: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { id, documentId } = await ctx.params;
  if (!UUID_RE.test(id) || !UUID_RE.test(documentId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }
  const doc = await loadDocForSession(documentId, id, session.newsroomId);
  if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  return NextResponse.json({ document: doc });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string; documentId: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { id, documentId } = await ctx.params;
  if (!UUID_RE.test(id) || !UUID_RE.test(documentId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }
  const doc = await loadDocForSession(documentId, id, session.newsroomId);
  if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 });

  await pool.query(`DELETE FROM research_documents WHERE id = $1`, [documentId]);
  await pool.query(
    `INSERT INTO audit_log (newsroom_id, user_id, event_type, payload)
     VALUES ($1, $2, 'research.document.deleted', $3)`,
    [
      session.newsroomId,
      session.userId,
      JSON.stringify({ dossier_id: id, document_id: documentId, filename: doc.filename }),
    ]
  );
  return NextResponse.json({ ok: true });
}
