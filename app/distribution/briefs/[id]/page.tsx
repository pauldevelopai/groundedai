// /distribution/briefs/:id — server-rendered brief detail.

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';
import DistBriefDetail from './DistBriefDetail';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function DistBriefPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getCurrentSession();
  if (!session) redirect(`/login?next=/distribution/briefs/${id}`);
  if (!UUID_RE.test(id)) notFound();
  const { rows } = await pool.query(
    `SELECT * FROM distributor_briefs WHERE id = $1 AND newsroom_id = $2`,
    [id, session.newsroomId]
  );
  const brief = rows[0];
  if (!brief) notFound();
  const canEdit = session.role === 'builder' || session.role === 'admin';
  return <DistBriefDetail brief={brief} canEdit={canEdit} />;
}
