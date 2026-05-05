// /research — Researcher index. Lists dossiers in the caller's newsroom with
// document/entity/finding counts. Newsroom-scoped; any role can read; create
// is gated to builder/admin (since dossiers are research-team work).

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';
import ResearchIndex from './ResearchIndex';

type DossierRow = {
  id: string;
  name: string;
  topic: string | null;
  description: string | null;
  status: 'open' | 'archived' | 'closed';
  document_count: number;
  entity_count: number;
  finding_count: number;
  updated_at: string;
};

export default async function ResearchPage() {
  const session = await getCurrentSession();
  if (!session) redirect('/login?next=/research');

  const { rows } = await pool.query<DossierRow>(
    `SELECT d.id, d.name, d.topic, d.description, d.status,
            (SELECT COUNT(*)::int FROM research_documents WHERE dossier_id = d.id) AS document_count,
            (SELECT COUNT(*)::int FROM research_entities  WHERE dossier_id = d.id) AS entity_count,
            (SELECT COUNT(*)::int FROM research_findings  WHERE dossier_id = d.id) AS finding_count,
            d.updated_at
       FROM research_dossiers d
      WHERE d.newsroom_id = $1
      ORDER BY d.updated_at DESC`,
    [session.newsroomId]
  );

  const canCreate = session.role === 'builder' || session.role === 'admin';
  return <ResearchIndex initialDossiers={rows} canCreate={canCreate} role={session.role} />;
}
