// /api/translation/glossary
//
// GET  — list glossary entries for the caller's newsroom (optional ?pair=en-zu).
// POST — add an entry. Body: { term, translation, source_language, target_language, notes? }
//        Conflict on (term, pair) → 409.

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';

const LANG_RE = /^[a-z]{2,3}$/;

export async function GET(req: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const url = new URL(req.url);
  const pair = url.searchParams.get('pair');
  let where = `newsroom_id = $1`;
  const params: unknown[] = [session.newsroomId];
  if (pair) {
    const [s, t] = pair.split('-');
    if (s && t && LANG_RE.test(s) && LANG_RE.test(t)) {
      params.push(s, t);
      where += ` AND source_language = $${params.length - 1} AND target_language = $${params.length}`;
    }
  }
  const { rows } = await pool.query(
    `SELECT id, term, translation, source_language, target_language, notes, source, use_count,
            created_at, updated_at
       FROM translation_glossary
      WHERE ${where}
      ORDER BY source_language, target_language, lower(term)`,
    params
  );
  return NextResponse.json({ entries: rows });
}

export async function POST(req: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (session.role !== 'builder' && session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — builder role required' }, { status: 403 });
  }

  let body: { term?: string; translation?: string; source_language?: string; target_language?: string; notes?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const term = body.term?.trim();
  const translation = body.translation?.trim();
  const sourceLang = body.source_language?.trim().toLowerCase();
  const targetLang = body.target_language?.trim().toLowerCase();
  if (!term || !translation || !sourceLang || !targetLang) {
    return NextResponse.json({ error: 'term, translation, source_language, target_language are required' }, { status: 400 });
  }
  if (!LANG_RE.test(sourceLang) || !LANG_RE.test(targetLang)) {
    return NextResponse.json({ error: 'language codes must be ISO 639-1 (e.g. en, zu, xh, af)' }, { status: 400 });
  }
  if (sourceLang === targetLang) {
    return NextResponse.json({ error: 'source and target must differ' }, { status: 400 });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO translation_glossary
         (newsroom_id, term, translation, source_language, target_language, notes, added_by, source)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'manual')
       RETURNING id, term, translation, source_language, target_language, notes, source, use_count,
                 created_at, updated_at`,
      [session.newsroomId, term, translation, sourceLang, targetLang, body.notes?.trim() || null, session.userId]
    );
    await pool.query(
      `INSERT INTO audit_log (newsroom_id, user_id, event_type, payload)
       VALUES ($1, $2, 'translation.glossary.added', $3)`,
      [
        session.newsroomId,
        session.userId,
        JSON.stringify({ entry_id: rows[0].id, term, pair: `${sourceLang}-${targetLang}` }),
      ]
    );
    return NextResponse.json({ entry: rows[0] }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message.includes('translation_glossary_newsroom_id_source_language_target_language_term_key') ||
        message.includes('duplicate key')) {
      return NextResponse.json(
        { error: `"${term}" already has an approved translation for ${sourceLang}→${targetLang}.` },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
