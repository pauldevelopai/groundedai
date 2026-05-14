// PATCH /api/learning/use-cases/:id   — edit a use case (own newsroom only)
// DELETE /api/learning/use-cases/:id   — remove a use case (own newsroom only)

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  // Tenant scope: must belong to caller's newsroom.
  const own = await pool.query(`SELECT newsroom_id FROM tracker_use_cases WHERE id = $1`, [id]);
  if (own.rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (own.rows[0].newsroom_id !== session.newsroomId) {
    return NextResponse.json({ error: 'Not in your newsroom' }, { status: 403 });
  }

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  // Only mutable fields. Newsroom_id + submitted_by are immutable.
  const sets: string[] = [];
  const params: unknown[] = [];
  function push(col: string, val: unknown) { params.push(val); sets.push(`${col} = $${params.length}`); }
  if (typeof body.title === 'string') push('title', body.title.trim().slice(0, 200));
  if (typeof body.summary === 'string') push('summary', body.summary.trim().slice(0, 5000));
  if (typeof body.outcome === 'string' && ['positive','negative','mixed'].includes(body.outcome)) push('outcome', body.outcome);
  if (Array.isArray(body.agents_involved)) push('agents_involved', body.agents_involved.filter((x: unknown): x is string => typeof x === 'string').slice(0, 20));
  if (Array.isArray(body.tags)) push('tags', body.tags.filter((x: unknown): x is string => typeof x === 'string').slice(0, 20));
  if (Array.isArray(body.attachment_urls)) push('attachment_urls', body.attachment_urls.filter((x: unknown): x is string => typeof x === 'string' && /^https?:\/\//.test(x)).slice(0, 10));
  if (typeof body.shared_with_cohort === 'boolean') push('shared_with_cohort', body.shared_with_cohort);

  if (sets.length === 0) return NextResponse.json({ error: 'No editable fields supplied' }, { status: 400 });
  params.push(id);
  await pool.query(
    `UPDATE tracker_use_cases SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${params.length}`,
    params
  );
  return NextResponse.json({ id, updated: sets.length });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  const own = await pool.query(`SELECT newsroom_id FROM tracker_use_cases WHERE id = $1`, [id]);
  if (own.rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (own.rows[0].newsroom_id !== session.newsroomId) {
    return NextResponse.json({ error: 'Not in your newsroom' }, { status: 403 });
  }
  await pool.query(`DELETE FROM tracker_use_cases WHERE id = $1`, [id]);
  return NextResponse.json({ id, deleted: true });
}
