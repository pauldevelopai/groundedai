// GET /api/translation/translations — recent translations for the newsroom
// (latest first, capped). Query params: ?status=&pair=

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';

export async function GET(req: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const url = new URL(req.url);
  const status = url.searchParams.get('status');
  const pair = url.searchParams.get('pair');

  let where = 'newsroom_id = $1';
  const params: unknown[] = [session.newsroomId];
  if (status) {
    params.push(status);
    where += ` AND status = $${params.length}`;
  }
  if (pair) {
    const [s, t] = pair.split('-');
    if (s && t) {
      params.push(s, t);
      where += ` AND source_language = $${params.length - 1} AND target_language = $${params.length}`;
    }
  }
  const { rows } = await pool.query(
    `SELECT id, source_language, target_language, source_text, translated_text, edited_text,
            status, model_id, glossary_terms_seen, duration_ms, error, created_at
       FROM translations
      WHERE ${where}
      ORDER BY created_at DESC
      LIMIT 50`,
    params
  );
  return NextResponse.json({ translations: rows });
}
