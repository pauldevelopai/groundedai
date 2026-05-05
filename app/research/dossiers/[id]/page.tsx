// /research/dossiers/:id — dossier detail. Shows uploaded documents,
// extracted entities (slice 6b will populate), relationships, findings.
// Server pre-fetches everything; the client component handles upload/delete.

import { notFound, redirect } from 'next/navigation';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';
import DossierDetail from './DossierDetail';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function DossierPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getCurrentSession();
  if (!session) redirect(`/login?next=/research/dossiers/${id}`);
  if (!UUID_RE.test(id)) notFound();

  const dossierRes = await pool.query(
    `SELECT id, newsroom_id, name, topic, description, status, created_at, updated_at
       FROM research_dossiers WHERE id = $1`,
    [id]
  );
  const dossier = dossierRes.rows[0];
  if (!dossier || dossier.newsroom_id !== session.newsroomId) notFound();

  const [docs, entities, relationships, findings] = await Promise.all([
    pool.query(
      `SELECT id, filename, mime_type, size_bytes, source_url, status, parse_error,
              uploaded_at, analyzed_at,
              CASE WHEN raw_text IS NULL THEN 0 ELSE LENGTH(raw_text) END AS text_length
         FROM research_documents WHERE dossier_id = $1
        ORDER BY uploaded_at DESC`,
      [id]
    ),
    pool.query(
      `SELECT id, kind, name, role, metadata, mention_count, first_seen_doc_id
         FROM research_entities WHERE dossier_id = $1
        ORDER BY mention_count DESC, name ASC`,
      [id]
    ),
    pool.query(
      `SELECT r.id, r.kind, r.evidence,
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
      `SELECT id, kind, body, rationale, source_doc_id, confidence, metadata
         FROM research_findings WHERE dossier_id = $1
        ORDER BY kind, created_at DESC`,
      [id]
    ),
  ]);

  const canEdit = session.role === 'builder' || session.role === 'admin';

  return (
    <DossierDetail
      dossier={dossier}
      initialDocuments={docs.rows}
      initialEntities={entities.rows}
      initialRelationships={relationships.rows}
      initialFindings={findings.rows}
      canEdit={canEdit}
      role={session.role}
    />
  );
}
