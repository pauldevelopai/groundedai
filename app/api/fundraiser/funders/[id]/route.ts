// /api/fundraiser/funders/:id — GET + PATCH + DELETE

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function load(id: string, newsroomId: string) {
  const { rows } = await pool.query(
    `SELECT id, newsroom_id, is_default FROM funders WHERE id = $1`,
    [id]
  );
  const r = rows[0];
  if (!r || r.newsroom_id !== newsroomId) return null;
  return r;
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  const { rows } = await pool.query(
    `SELECT * FROM funders WHERE id = $1 AND newsroom_id = $2`,
    [id, session.newsroomId]
  );
  if (rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ funder: rows[0] });
}

const SCALAR_FIELDS = ['name', 'type', 'description', 'typical_grant_range', 'application_url', 'notes'];
const ARRAY_FIELDS = ['focus_areas', 'geography'];
const JSONB_FIELDS = ['application_structure', 'deadlines'];

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (session.role !== 'builder' && session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — builder role required' }, { status: 403 });
  }
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  if (!(await load(id, session.newsroomId))) {
    return NextResponse.json({ error: 'Funder not found' }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const updates: string[] = [];
  const values: unknown[] = [];
  for (const f of SCALAR_FIELDS) {
    if (!(f in body)) continue;
    const v = body[f];
    if (f === 'name' && (!v || !String(v).trim())) {
      return NextResponse.json({ error: 'name cannot be empty' }, { status: 400 });
    }
    values.push(v === null || v === '' ? null : String(v).trim());
    updates.push(`${f} = $${values.length}`);
  }
  for (const f of ARRAY_FIELDS) {
    if (!(f in body)) continue;
    values.push(Array.isArray(body[f]) ? body[f] : []);
    updates.push(`${f} = $${values.length}`);
  }
  for (const f of JSONB_FIELDS) {
    if (!(f in body)) continue;
    values.push(JSON.stringify(Array.isArray(body[f]) ? body[f] : []));
    updates.push(`${f} = $${values.length}::jsonb`);
  }
  if (updates.length === 0) return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  updates.push(`updated_at = NOW()`);
  values.push(id);

  const { rows } = await pool.query(
    `UPDATE funders SET ${updates.join(', ')} WHERE id = $${values.length} RETURNING *`,
    values
  );
  return NextResponse.json({ funder: rows[0] });
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
    return NextResponse.json({ error: 'Funder not found' }, { status: 404 });
  }
  await pool.query(`DELETE FROM funders WHERE id = $1`, [id]);
  return NextResponse.json({ ok: true });
}
