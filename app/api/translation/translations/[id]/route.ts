// /api/translation/translations/:id
//
// PATCH — save an editor's edit to the translation. Body: { edited_text }.
//         Status flips to 'edited'. We diff edited_text vs translated_text
//         and persist the resulting glossary proposals on the row.
//
// Builder/admin only.

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';
const { buildProposalsFromEdit } = require('@/lib/translation/edit-feedback');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (session.role !== 'builder' && session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — builder role required' }, { status: 403 });
  }
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const rowRes = await pool.query(
    `SELECT id, newsroom_id, translated_text FROM translations WHERE id = $1`,
    [id]
  );
  const row = rowRes.rows[0];
  if (!row || row.newsroom_id !== session.newsroomId) {
    return NextResponse.json({ error: 'Translation not found' }, { status: 404 });
  }

  let body: { edited_text?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const editedText = (body.edited_text ?? '').trim();
  if (!editedText) return NextResponse.json({ error: 'edited_text is required' }, { status: 400 });

  const proposals = buildProposalsFromEdit(row.translated_text || '', editedText);

  const { rows: updated } = await pool.query(
    `UPDATE translations
        SET edited_text = $2,
            proposals = $3,
            status = 'edited',
            updated_at = NOW()
      WHERE id = $1
     RETURNING id, source_language, target_language, source_text, translated_text, edited_text,
               status, model_id, glossary_terms_seen, segments, proposals, duration_ms, error,
               created_at, updated_at`,
    [id, editedText, JSON.stringify(proposals)]
  );

  await pool.query(
    `INSERT INTO audit_log (newsroom_id, user_id, event_type, payload)
     VALUES ($1, $2, 'translation.edited', $3)`,
    [
      session.newsroomId,
      session.userId,
      JSON.stringify({ translation_id: id, proposals_count: proposals.length }),
    ]
  );

  return NextResponse.json({ translation: updated[0] });
}
