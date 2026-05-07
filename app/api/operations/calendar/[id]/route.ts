// /api/operations/calendar/:id — PATCH update + DELETE.

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SCALAR = ['title', 'summary', 'beat', 'format', 'priority', 'status', 'notes'];
const REFS = ['assigned_user_id', 'assigned_freelancer_id', 'assigned_contributor_id', 'production_id', 'draft_id', 'translation_id'];
const DATETIMES = ['deadline_at', 'scheduled_publish_at'];

const ALLOWED_PRIORITIES = ['low', 'normal', 'high', 'urgent'];
const ALLOWED_STATUSES = ['idea', 'commissioned', 'in_progress', 'in_review', 'scheduled', 'published', 'killed'];

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (session.role !== 'builder' && session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — builder role required' }, { status: 403 });
  }
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  const exist = await pool.query(`SELECT id, newsroom_id FROM editorial_calendar WHERE id = $1`, [id]);
  if (exist.rows.length === 0 || exist.rows[0].newsroom_id !== session.newsroomId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const updates: string[] = [];
  const values: unknown[] = [];
  for (const f of SCALAR) {
    if (!(f in body)) continue;
    const v = body[f];
    if (f === 'priority' && v && !ALLOWED_PRIORITIES.includes(String(v))) {
      return NextResponse.json({ error: `priority must be one of ${ALLOWED_PRIORITIES.join(', ')}` }, { status: 400 });
    }
    if (f === 'status' && v && !ALLOWED_STATUSES.includes(String(v))) {
      return NextResponse.json({ error: `status must be one of ${ALLOWED_STATUSES.join(', ')}` }, { status: 400 });
    }
    if (f === 'title' && (!v || !String(v).trim())) {
      return NextResponse.json({ error: 'title cannot be empty' }, { status: 400 });
    }
    values.push(v === null || v === '' ? null : String(v).trim());
    updates.push(`${f} = $${values.length}`);
  }
  for (const f of REFS) {
    if (!(f in body)) continue;
    values.push(body[f] || null);
    updates.push(`${f} = $${values.length}`);
  }
  for (const f of DATETIMES) {
    if (!(f in body)) continue;
    values.push(body[f] || null);
    updates.push(`${f} = $${values.length}`);
  }
  if (updates.length === 0) return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  updates.push(`updated_at = NOW()`);
  values.push(id);

  const { rows } = await pool.query(
    `UPDATE editorial_calendar SET ${updates.join(', ')} WHERE id = $${values.length} RETURNING *`,
    values
  );
  return NextResponse.json({ item: rows[0] });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (session.role !== 'builder' && session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — builder role required' }, { status: 403 });
  }
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  const exist = await pool.query(`SELECT id, newsroom_id FROM editorial_calendar WHERE id = $1`, [id]);
  if (exist.rows.length === 0 || exist.rows[0].newsroom_id !== session.newsroomId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  await pool.query(`DELETE FROM editorial_calendar WHERE id = $1`, [id]);
  return NextResponse.json({ ok: true });
}
