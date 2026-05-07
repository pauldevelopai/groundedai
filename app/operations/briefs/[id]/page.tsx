// /operations/briefs/:id — server-rendered detail; client component handles
// editing. Renders the kind-specific structured output as readable sections.

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';
import OpsBriefDetail from './OpsBriefDetail';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function OpsBriefPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getCurrentSession();
  if (!session) redirect(`/login?next=/operations/briefs/${id}`);
  if (!UUID_RE.test(id)) notFound();

  const { rows } = await pool.query(
    `SELECT * FROM ops_briefs WHERE id = $1 AND newsroom_id = $2`,
    [id, session.newsroomId]
  );
  const brief = rows[0];
  if (!brief) notFound();

  const canEdit = session.role === 'builder' || session.role === 'admin';
  return <OpsBriefDetail brief={brief} canEdit={canEdit} />;
}
