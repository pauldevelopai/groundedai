// /api/research/dossiers/:id
//
// GET    — fetch dossier with documents, entities, relationships, findings.
// PATCH  — rename / change topic / status.
// DELETE — drop the dossier (cascades to docs/entities/relationships/findings).

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function loadDossierForSession(id: string, newsroomId: string) {
  const { rows } = await pool.query(
    `SELECT id, newsroom_id, created_by, name, topic, description, status, created_at, updated_at
       FROM research_dossiers WHERE id = $1`,
    [id]
  );
  const d = rows[0];
  if (!d) return null;
  if (d.newsroom_id !== newsroomId) return null;
  return d;
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const dossier = await loadDossierForSession(id, session.newsroomId);
  if (!dossier) return NextResponse.json({ error: 'Dossier not found' }, { status: 404 });

  const [docs, entities, relationships, findings] = await Promise.all([
    pool.query(
      `SELECT id, filename, mime_type, size_bytes, source_url, status, parse_error,
              uploaded_at, analyzed_at,
              CASE WHEN raw_text IS NULL THEN 0 ELSE LENGTH(raw_text) END AS text_length
         FROM research_documents
        WHERE dossier_id = $1
        ORDER BY uploaded_at DESC`,
      [id]
    ),
    pool.query(
      `SELECT id, kind, name, role, metadata, mention_count, first_seen_doc_id, created_at
         FROM research_entities
        WHERE dossier_id = $1
        ORDER BY mention_count DESC, name ASC`,
      [id]
    ),
    pool.query(
      `SELECT r.id, r.kind, r.evidence, r.source_doc_id, r.created_at,
              fr.name AS from_name, fr.kind AS from_kind, fr.id AS from_entity_id,
              tt.name AS to_name,   tt.kind AS to_kind,   tt.id AS to_entity_id
         FROM research_relationships r
         JOIN research_entities fr ON fr.id = r.from_entity_id
         JOIN research_entities tt ON tt.id = r.to_entity_id
        WHERE r.dossier_id = $1
        ORDER BY r.created_at DESC`,
      [id]
    ),
    pool.query(
      `SELECT id, kind, body, rationale, source_doc_id, confidence, metadata, created_at
         FROM research_findings
        WHERE dossier_id = $1
        ORDER BY kind, created_at DESC`,
      [id]
    ),
  ]);

  return NextResponse.json({
    dossier,
    documents: docs.rows,
    entities: entities.rows,
    relationships: relationships.rows,
    findings: findings.rows,
  });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const dossier = await loadDossierForSession(id, session.newsroomId);
  if (!dossier) return NextResponse.json({ error: 'Dossier not found' }, { status: 404 });

  let body: { name?: string; topic?: string | null; description?: string | null; status?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const updates: string[] = [];
  const values: unknown[] = [];
  if (body.name !== undefined) {
    const n = String(body.name).trim();
    if (!n) return NextResponse.json({ error: 'name cannot be empty' }, { status: 400 });
    values.push(n);
    updates.push(`name = $${values.length}`);
  }
  if (body.topic !== undefined) {
    values.push(body.topic ? String(body.topic).trim() : null);
    updates.push(`topic = $${values.length}`);
  }
  if (body.description !== undefined) {
    values.push(body.description ? String(body.description).trim() : null);
    updates.push(`description = $${values.length}`);
  }
  if (body.status !== undefined) {
    if (!['open', 'archived', 'closed'].includes(body.status)) {
      return NextResponse.json({ error: 'invalid status' }, { status: 400 });
    }
    values.push(body.status);
    updates.push(`status = $${values.length}`);
  }
  if (updates.length === 0) return NextResponse.json({ error: 'No fields to update' }, { status: 400 });

  updates.push('updated_at = NOW()');
  values.push(id);

  const { rows } = await pool.query(
    `UPDATE research_dossiers SET ${updates.join(', ')}
      WHERE id = $${values.length}
     RETURNING id, name, topic, description, status, created_at, updated_at`,
    values
  );

  return NextResponse.json({ dossier: rows[0] });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const dossier = await loadDossierForSession(id, session.newsroomId);
  if (!dossier) return NextResponse.json({ error: 'Dossier not found' }, { status: 404 });

  await pool.query(`DELETE FROM research_dossiers WHERE id = $1`, [id]);
  await pool.query(
    `INSERT INTO audit_log (newsroom_id, user_id, event_type, payload)
     VALUES ($1, $2, 'research.dossier.deleted', $3)`,
    [session.newsroomId, session.userId, JSON.stringify({ dossier_id: id, name: dossier.name })]
  );

  return NextResponse.json({ ok: true });
}
