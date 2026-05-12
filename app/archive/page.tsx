// /archive — Knowledge-graph workspace.
//
// Three regions: Ask the archive (natural-language Q&A), Entities
// (browsable canonical entities + cross-type merge), Documents (with
// ingestion-pass status). Builder/admin can also add newsroom-specific
// entity types that GLiNER/Haiku will pick up on the next ingestion run.

import { redirect } from 'next/navigation';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';
import ArchiveWorkspace from './ArchiveWorkspace';

export default async function ArchivePage() {
  const session = await getCurrentSession();
  if (!session) redirect('/login?next=/archive');

  // Seed universal types so first-time newsrooms see the type list
  const { seedUniversalTypes } = require('@/lib/archive/entity_types');
  await seedUniversalTypes();

  const [entityTypesRes, documentCountRes, entityCountRes, claimCountRes] = await Promise.all([
    pool.query(
      `SELECT id, slug, label, prompt_hint, kind, source_model, description
         FROM archive_entity_types
        WHERE newsroom_id IS NULL OR newsroom_id = $1
        ORDER BY kind, label`,
      [session.newsroomId]
    ),
    pool.query(
      `SELECT COUNT(*)::int AS n FROM archive_documents WHERE newsroom_id = $1`,
      [session.newsroomId]
    ),
    pool.query(
      `SELECT COUNT(*)::int AS n FROM archive_entities WHERE newsroom_id = $1`,
      [session.newsroomId]
    ),
    pool.query(
      `SELECT COUNT(*)::int AS n FROM archive_claims WHERE newsroom_id = $1`,
      [session.newsroomId]
    ),
  ]);

  return (
    <ArchiveWorkspace
      role={session.role}
      entityTypes={entityTypesRes.rows}
      counts={{
        documents: documentCountRes.rows[0].n,
        entities: entityCountRes.rows[0].n,
        claims: claimCountRes.rows[0].n,
      }}
    />
  );
}
