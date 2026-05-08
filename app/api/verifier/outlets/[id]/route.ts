// /api/verifier/outlets/:id — PATCH + DELETE (default rows are editable)

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COUNTRIES = ['ZA', 'ZW', 'ZM', 'KE', 'other'];

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (session.role !== 'builder' && session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — builder role required' }, { status: 403 });
  }
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  const exist = await pool.query(`SELECT id, newsroom_id FROM verifier_outlets WHERE id = $1`, [id]);
  if (exist.rows.length === 0 || exist.rows[0].newsroom_id !== session.newsroomId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const updates: string[] = [];
  const values: unknown[] = [];
  for (const f of ['name', 'url', 'ownership', 'alignment_notes', 'notes'] as const) {
    if (!(f in body)) continue;
    values.push(body[f] === null || body[f] === '' ? null : String(body[f]).trim());
    updates.push(`${f} = $${values.length}`);
  }
  if (typeof body.country === 'string') {
    if (!COUNTRIES.includes(body.country)) return NextResponse.json({ error: 'country invalid' }, { status: 400 });
    values.push(body.country); updates.push(`country = $${values.length}`);
  }
  if ('credibility_score' in body) {
    const v = body.credibility_score;
    const n = v === null ? null : Number(v);
    if (n !== null && (!Number.isFinite(n) || n < 0 || n > 1)) {
      return NextResponse.json({ error: 'credibility_score must be 0..1 or null' }, { status: 400 });
    }
    values.push(n); updates.push(`credibility_score = $${values.length}`);
  }
  for (const f of ['alt_urls', 'beat_strengths', 'beat_weaknesses', 'known_issues'] as const) {
    if (!(f in body)) continue;
    values.push(Array.isArray(body[f]) ? body[f] : []);
    updates.push(`${f} = $${values.length}`);
  }
  if ('public_sources' in body) {
    values.push(JSON.stringify(Array.isArray(body.public_sources) ? body.public_sources : []));
    updates.push(`public_sources = $${values.length}::jsonb`);
  }
  if (updates.length === 0) return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  updates.push(`updated_at = NOW()`);
  values.push(id);
  const { rows } = await pool.query(
    `UPDATE verifier_outlets SET ${updates.join(', ')} WHERE id = $${values.length} RETURNING *`,
    values
  );
  return NextResponse.json({ outlet: rows[0] });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (session.role !== 'builder' && session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — builder role required' }, { status: 403 });
  }
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  const exist = await pool.query(`SELECT id, newsroom_id FROM verifier_outlets WHERE id = $1`, [id]);
  if (exist.rows.length === 0 || exist.rows[0].newsroom_id !== session.newsroomId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  await pool.query(`DELETE FROM verifier_outlets WHERE id = $1`, [id]);
  return NextResponse.json({ ok: true });
}
