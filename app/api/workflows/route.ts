// /api/workflows
//
// GET  — list workflows visible to the user (own newsroom + cross-newsroom shared).
// POST — create a workflow (builder/admin role only).
//
// The graph definition is validated for basic shape only here — deep validation
// (edge type-compat, topological soundness) lives in the workflow runner (Slice 3).

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';
import { list as listAgents } from '@/lib/agents/registry';
import { validateDefinitionShape, normaliseSlug } from '@/lib/workflows/validate';

export async function GET() {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { rows } = await pool.query(
    `SELECT w.id, w.newsroom_id, w.created_by, w.name, w.slug, w.trigger_phrase,
            w.description, w.definition, w.is_shared, w.created_at, w.updated_at,
            n.name AS newsroom_name
       FROM workflows w
       JOIN newsrooms n ON n.id = w.newsroom_id
      WHERE w.newsroom_id = $1 OR w.is_shared = TRUE
      ORDER BY (w.newsroom_id = $1) DESC, w.updated_at DESC`,
    [session.newsroomId]
  );

  return NextResponse.json({ workflows: rows });
}

export async function POST(req: Request) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  if (session.role !== 'builder' && session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — builder role required' }, { status: 403 });
  }

  let body: {
    name?: string;
    slug?: string;
    trigger_phrase?: string;
    description?: string;
    definition?: unknown;
    is_shared?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { name, definition, is_shared } = body;
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }
  if (!definition || typeof definition !== 'object') {
    return NextResponse.json({ error: 'definition is required' }, { status: 400 });
  }

  const knownSlugs = new Set(listAgents().map((a) => a.slug));
  const validation = validateDefinitionShape(definition, knownSlugs);
  if (!validation.ok) {
    return NextResponse.json({ error: `Invalid definition: ${validation.error}` }, { status: 400 });
  }

  const slug = normaliseSlug(body.slug || name);
  const triggerPhrase = body.trigger_phrase?.trim() || null;
  const description = body.description?.trim() || null;

  try {
    const { rows } = await pool.query(
      `INSERT INTO workflows
         (newsroom_id, created_by, name, slug, trigger_phrase, description, definition, is_shared)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, newsroom_id, created_by, name, slug, trigger_phrase,
                 description, definition, is_shared, created_at, updated_at`,
      [
        session.newsroomId,
        session.userId,
        name.trim(),
        slug,
        triggerPhrase,
        description,
        JSON.stringify(definition),
        Boolean(is_shared),
      ]
    );

    await pool.query(
      `INSERT INTO audit_log (newsroom_id, user_id, event_type, payload)
       VALUES ($1, $2, 'workflow.created', $3)`,
      [session.newsroomId, session.userId, JSON.stringify({ workflow_id: rows[0].id, name, slug })]
    );

    return NextResponse.json({ workflow: rows[0] }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message.includes('workflows_newsroom_id_slug_key') || message.includes('duplicate key')) {
      return NextResponse.json(
        { error: `A workflow with slug "${slug}" already exists in this newsroom.` },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
