// /api/workflows/:id
//
// GET    — fetch a single workflow (own newsroom OR is_shared).
// PATCH  — update (builder/admin in the workflow's owning newsroom).
// DELETE — delete (builder/admin in the workflow's owning newsroom).

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';
import { list as listAgents } from '@/lib/agents/registry';
import { validateDefinitionShape, normaliseSlug } from '@/lib/workflows/validate';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function loadWorkflow(id: string) {
  const { rows } = await pool.query(
    `SELECT w.id, w.newsroom_id, w.created_by, w.name, w.slug, w.trigger_phrase,
            w.description, w.problem_statement, w.problem_category, w.user_instructions,
            w.definition, w.is_shared, w.created_at, w.updated_at,
            n.name AS newsroom_name
       FROM workflows w
       JOIN newsrooms n ON n.id = w.newsroom_id
      WHERE w.id = $1`,
    [id]
  );
  return rows[0] || null;
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Invalid workflow id' }, { status: 400 });
  }

  const workflow = await loadWorkflow(id);
  if (!workflow) {
    return NextResponse.json({ error: 'Workflow not found' }, { status: 404 });
  }
  if (workflow.newsroom_id !== session.newsroomId && !workflow.is_shared) {
    return NextResponse.json({ error: 'Workflow not found' }, { status: 404 });
  }

  return NextResponse.json({ workflow });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  if (session.role !== 'builder' && session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — builder role required' }, { status: 403 });
  }
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Invalid workflow id' }, { status: 400 });
  }

  const workflow = await loadWorkflow(id);
  if (!workflow) {
    return NextResponse.json({ error: 'Workflow not found' }, { status: 404 });
  }
  if (workflow.newsroom_id !== session.newsroomId) {
    return NextResponse.json({ error: 'Forbidden — cannot edit another newsroom\'s workflow' }, { status: 403 });
  }

  let body: {
    name?: string;
    slug?: string;
    trigger_phrase?: string | null;
    description?: string | null;
    problem_statement?: string | null;
    problem_category?: string | null;
    user_instructions?: string | null;
    definition?: unknown;
    is_shared?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const updates: string[] = [];
  const values: unknown[] = [];

  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || body.name.trim().length === 0) {
      return NextResponse.json({ error: 'name must be a non-empty string' }, { status: 400 });
    }
    values.push(body.name.trim());
    updates.push(`name = $${values.length}`);
  }
  if (body.slug !== undefined) {
    values.push(normaliseSlug(body.slug));
    updates.push(`slug = $${values.length}`);
  }
  if (body.trigger_phrase !== undefined) {
    values.push(body.trigger_phrase ? String(body.trigger_phrase).trim() : null);
    updates.push(`trigger_phrase = $${values.length}`);
  }
  if (body.description !== undefined) {
    values.push(body.description ? String(body.description).trim() : null);
    updates.push(`description = $${values.length}`);
  }
  if (body.problem_statement !== undefined) {
    values.push(body.problem_statement ? String(body.problem_statement).trim() : null);
    updates.push(`problem_statement = $${values.length}`);
  }
  if (body.problem_category !== undefined) {
    values.push(body.problem_category ? String(body.problem_category).trim() : null);
    updates.push(`problem_category = $${values.length}`);
  }
  if (body.user_instructions !== undefined) {
    values.push(body.user_instructions ? String(body.user_instructions).trim() : null);
    updates.push(`user_instructions = $${values.length}`);
  }
  if (body.definition !== undefined) {
    if (!body.definition || typeof body.definition !== 'object') {
      return NextResponse.json({ error: 'definition must be an object' }, { status: 400 });
    }
    const knownSlugs = new Set(listAgents().map((a) => a.slug));
    const validation = validateDefinitionShape(body.definition, knownSlugs);
    if (!validation.ok) {
      return NextResponse.json({ error: `Invalid definition: ${validation.error}` }, { status: 400 });
    }
    values.push(JSON.stringify(body.definition));
    updates.push(`definition = $${values.length}`);
  }
  if (body.is_shared !== undefined) {
    values.push(Boolean(body.is_shared));
    updates.push(`is_shared = $${values.length}`);
  }

  if (updates.length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  updates.push('updated_at = NOW()');
  values.push(id);

  try {
    const { rows } = await pool.query(
      `UPDATE workflows SET ${updates.join(', ')}
        WHERE id = $${values.length}
       RETURNING id, newsroom_id, created_by, name, slug, trigger_phrase,
                 description, problem_statement, problem_category, user_instructions,
                 definition, is_shared, created_at, updated_at`,
      values
    );

    await pool.query(
      `INSERT INTO audit_log (newsroom_id, user_id, event_type, payload)
       VALUES ($1, $2, 'workflow.updated', $3)`,
      [session.newsroomId, session.userId, JSON.stringify({ workflow_id: id, fields: Object.keys(body) })]
    );

    return NextResponse.json({ workflow: rows[0] });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message.includes('duplicate key')) {
      return NextResponse.json(
        { error: 'A workflow with that slug already exists in this newsroom.' },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  if (session.role !== 'builder' && session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — builder role required' }, { status: 403 });
  }
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Invalid workflow id' }, { status: 400 });
  }

  const workflow = await loadWorkflow(id);
  if (!workflow) {
    return NextResponse.json({ error: 'Workflow not found' }, { status: 404 });
  }
  if (workflow.newsroom_id !== session.newsroomId) {
    return NextResponse.json({ error: 'Forbidden — cannot delete another newsroom\'s workflow' }, { status: 403 });
  }

  await pool.query('DELETE FROM workflows WHERE id = $1', [id]);
  await pool.query(
    `INSERT INTO audit_log (newsroom_id, user_id, event_type, payload)
     VALUES ($1, $2, 'workflow.deleted', $3)`,
    [session.newsroomId, session.userId, JSON.stringify({ workflow_id: id, name: workflow.name, slug: workflow.slug })]
  );

  return NextResponse.json({ ok: true });
}
