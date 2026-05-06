// /api/translation/glossary/:id
// PATCH — update term/translation/notes
// DELETE — remove the entry

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function loadEntry(id: string, newsroomId: string) {
  const { rows } = await pool.query(
    `SELECT id, newsroom_id FROM translation_glossary WHERE id = $1`,
    [id]
  );
  const e = rows[0];
  if (!e || e.newsroom_id !== newsroomId) return null;
  return e;
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (session.role !== 'builder' && session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — builder role required' }, { status: 403 });
  }
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  if (!(await loadEntry(id, session.newsroomId))) {
    return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
  }
  let body: { term?: string; translation?: string; notes?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const updates: string[] = [];
  const values: unknown[] = [];
  if (body.term !== undefined) {
    const t = String(body.term).trim();
    if (!t) return NextResponse.json({ error: 'term cannot be empty' }, { status: 400 });
    values.push(t);
    updates.push(`term = $${values.length}`);
  }
  if (body.translation !== undefined) {
    const t = String(body.translation).trim();
    if (!t) return NextResponse.json({ error: 'translation cannot be empty' }, { status: 400 });
    values.push(t);
    updates.push(`translation = $${values.length}`);
  }
  if (body.notes !== undefined) {
    values.push(body.notes ? String(body.notes).trim() : null);
    updates.push(`notes = $${values.length}`);
  }
  if (updates.length === 0) return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  updates.push('updated_at = NOW()');
  values.push(id);
  const { rows } = await pool.query(
    `UPDATE translation_glossary SET ${updates.join(', ')}
      WHERE id = $${values.length}
     RETURNING id, term, translation, source_language, target_language, notes, source, use_count, created_at, updated_at`,
    values
  );
  return NextResponse.json({ entry: rows[0] });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (session.role !== 'builder' && session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — builder role required' }, { status: 403 });
  }
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  if (!(await loadEntry(id, session.newsroomId))) {
    return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
  }
  await pool.query(`DELETE FROM translation_glossary WHERE id = $1`, [id]);
  return NextResponse.json({ ok: true });
}
