// /api/research/dossiers
//
// GET  — list dossiers in the caller's newsroom (with counts).
// POST — create a dossier. Body: { name, topic?, description? }

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';

export async function GET() {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { rows } = await pool.query(
    `SELECT d.id, d.name, d.topic, d.description, d.status, d.created_at, d.updated_at,
            (SELECT COUNT(*)::int FROM research_documents WHERE dossier_id = d.id) AS document_count,
            (SELECT COUNT(*)::int FROM research_entities  WHERE dossier_id = d.id) AS entity_count,
            (SELECT COUNT(*)::int FROM research_findings  WHERE dossier_id = d.id) AS finding_count
       FROM research_dossiers d
      WHERE d.newsroom_id = $1
      ORDER BY d.updated_at DESC`,
    [session.newsroomId]
  );

  return NextResponse.json({ dossiers: rows });
}

export async function POST(req: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  let body: { name?: string; topic?: string; description?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const name = body.name?.trim();
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });

  const { rows } = await pool.query(
    `INSERT INTO research_dossiers (newsroom_id, created_by, name, topic, description)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, name, topic, description, status, created_at, updated_at`,
    [
      session.newsroomId,
      session.userId,
      name,
      body.topic?.trim() || null,
      body.description?.trim() || null,
    ]
  );

  await pool.query(
    `INSERT INTO audit_log (newsroom_id, user_id, event_type, payload)
     VALUES ($1, $2, 'research.dossier.created', $3)`,
    [session.newsroomId, session.userId, JSON.stringify({ dossier_id: rows[0].id, name })]
  );

  return NextResponse.json({ dossier: rows[0] }, { status: 201 });
}
