// /api/audience/personas/:id — PATCH (refine) + DELETE

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function load(id: string, newsroomId: string) {
  const { rows } = await pool.query(
    `SELECT id, newsroom_id, is_default FROM audience_personas WHERE id = $1`,
    [id]
  );
  const r = rows[0];
  if (!r || r.newsroom_id !== newsroomId) return null;
  return r;
}

const FIELDS = [
  'name', 'archetype', 'description', 'age_range', 'location',
  'languages', 'device', 'reading_habits', 'primary_platforms',
  'trust_signals', 'interests',
];

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (session.role !== 'builder' && session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — builder role required' }, { status: 403 });
  }
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  if (!(await load(id, session.newsroomId))) {
    return NextResponse.json({ error: 'Persona not found' }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const updates: string[] = [];
  const values: unknown[] = [];
  for (const f of FIELDS) {
    if (!(f in body)) continue;
    const v = body[f];
    if (f === 'languages' || f === 'primary_platforms' || f === 'interests') {
      values.push(Array.isArray(v) ? v : []);
    } else if (v === null || v === '') {
      if (f === 'name' || f === 'archetype') return NextResponse.json({ error: `${f} cannot be empty` }, { status: 400 });
      values.push(null);
    } else {
      values.push(String(v).trim());
    }
    updates.push(`${f} = $${values.length}`);
  }
  if (updates.length === 0) return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  updates.push(`updated_at = NOW()`);
  values.push(id);

  const { rows } = await pool.query(
    `UPDATE audience_personas SET ${updates.join(', ')} WHERE id = $${values.length} RETURNING *`,
    values
  );
  return NextResponse.json({ persona: rows[0] });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (session.role !== 'builder' && session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — builder role required' }, { status: 403 });
  }
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  if (!(await load(id, session.newsroomId))) {
    return NextResponse.json({ error: 'Persona not found' }, { status: 404 });
  }
  await pool.query(`DELETE FROM audience_personas WHERE id = $1`, [id]);
  return NextResponse.json({ ok: true });
}
