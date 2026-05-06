// /api/producer/productions/:id
//
// GET    — fetch a single production with full output + edited_output + source.
// PATCH  — update title / edited_output / status / notes (builder/admin only).
// DELETE — remove the production (builder/admin only).

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function loadOwn(id: string, newsroomId: string) {
  const { rows } = await pool.query(
    `SELECT id, newsroom_id, created_by, title, format, source_text, archive_context,
            output, edited_output, duration_estimate_seconds, notes, status,
            duration_ms, cost_usd, error, created_at, updated_at
       FROM producer_productions WHERE id = $1`,
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
  const row = await loadOwn(id, session.newsroomId);
  if (!row) return NextResponse.json({ error: 'Production not found' }, { status: 404 });
  return NextResponse.json({ production: row });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (session.role !== 'builder' && session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — builder role required' }, { status: 403 });
  }
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  const row = await loadOwn(id, session.newsroomId);
  if (!row) return NextResponse.json({ error: 'Production not found' }, { status: 404 });

  let body: { title?: string; edited_output?: unknown; status?: string; notes?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const updates: string[] = [];
  const values: unknown[] = [];
  if (body.title !== undefined) {
    const t = String(body.title).trim();
    if (!t) return NextResponse.json({ error: 'title cannot be empty' }, { status: 400 });
    values.push(t);
    updates.push(`title = $${values.length}`);
  }
  if (body.edited_output !== undefined) {
    if (body.edited_output && typeof body.edited_output !== 'object') {
      return NextResponse.json({ error: 'edited_output must be an object' }, { status: 400 });
    }
    values.push(body.edited_output ? JSON.stringify(body.edited_output) : null);
    updates.push(`edited_output = $${values.length}`);
    // Auto-flip status to 'edited' when an edit lands, unless the body forces otherwise.
    if (body.status === undefined) {
      values.push('edited');
      updates.push(`status = $${values.length}`);
    }
  }
  if (body.status !== undefined) {
    const allowed = ['pending', 'generated', 'edited', 'approved', 'published', 'failed'];
    if (!allowed.includes(body.status)) {
      return NextResponse.json({ error: 'invalid status' }, { status: 400 });
    }
    values.push(body.status);
    updates.push(`status = $${values.length}`);
  }
  if (body.notes !== undefined) {
    values.push(body.notes ? String(body.notes).trim() : null);
    updates.push(`notes = $${values.length}`);
  }
  if (updates.length === 0) return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  updates.push('updated_at = NOW()');
  values.push(id);

  const { rows } = await pool.query(
    `UPDATE producer_productions SET ${updates.join(', ')}
      WHERE id = $${values.length}
     RETURNING id, title, format, source_text, archive_context, output, edited_output,
               duration_estimate_seconds, notes, status, duration_ms, cost_usd, error,
               created_at, updated_at`,
    values
  );
  return NextResponse.json({ production: rows[0] });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (session.role !== 'builder' && session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — builder role required' }, { status: 403 });
  }
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  const row = await loadOwn(id, session.newsroomId);
  if (!row) return NextResponse.json({ error: 'Production not found' }, { status: 404 });
  await pool.query(`DELETE FROM producer_productions WHERE id = $1`, [id]);
  return NextResponse.json({ ok: true });
}
