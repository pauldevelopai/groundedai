// /api/audience/focus-groups/:id — fetch full transcript

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const { rows } = await pool.query(
    `SELECT id, newsroom_id, title, test_material, test_material_kind, context_brief,
            persona_ids, transcript, summary, recommendations, status,
            duration_ms, cost_usd, error, created_at, updated_at
       FROM focus_group_sessions WHERE id = $1`,
    [id]
  );
  const r = rows[0];
  if (!r || r.newsroom_id !== session.newsroomId) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  // Hydrate persona names so the UI can display them.
  if (Array.isArray(r.persona_ids) && r.persona_ids.length > 0) {
    const pRes = await pool.query(
      `SELECT id, name, archetype FROM audience_personas WHERE id = ANY($1::uuid[])`,
      [r.persona_ids]
    );
    r.personas = pRes.rows;
  } else {
    r.personas = [];
  }
  return NextResponse.json({ session: r });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (session.role !== 'builder' && session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — builder role required' }, { status: 403 });
  }
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  const { rows } = await pool.query(
    `SELECT newsroom_id FROM focus_group_sessions WHERE id = $1`,
    [id]
  );
  if (!rows[0] || rows[0].newsroom_id !== session.newsroomId) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }
  await pool.query(`DELETE FROM focus_group_sessions WHERE id = $1`, [id]);
  return NextResponse.json({ ok: true });
}
