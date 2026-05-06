// /fundraiser/briefs/:id — full brief view, server-rendered.
// Renders sections, budget scaffold, outstanding questions. Editor edits
// happen via PATCH (handled in BriefDetail client component).

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';
import BriefDetail from './BriefDetail';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function BriefPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getCurrentSession();
  if (!session) redirect(`/login?next=/fundraiser/briefs/${id}`);
  if (!UUID_RE.test(id)) notFound();

  const { rows } = await pool.query(
    `SELECT b.*, f.name AS funder_name, f.application_url AS funder_url
       FROM fundraiser_briefs b
       LEFT JOIN funders f ON f.id = b.funder_id
      WHERE b.id = $1 AND b.newsroom_id = $2`,
    [id, session.newsroomId]
  );
  const brief = rows[0];
  if (!brief) notFound();

  const canEdit = session.role === 'builder' || session.role === 'admin';

  return <BriefDetail brief={brief} canEdit={canEdit} role={session.role} />;
}
