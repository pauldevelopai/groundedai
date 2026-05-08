// /verifier/runs/:id

import { notFound, redirect } from 'next/navigation';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';
import RunDetail from './RunDetail';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getCurrentSession();
  if (!session) redirect(`/login?next=/verifier/runs/${id}`);
  if (!UUID_RE.test(id)) notFound();
  const { rows } = await pool.query(
    `SELECT * FROM verifier_runs WHERE id = $1 AND newsroom_id = $2`,
    [id, session.newsroomId]
  );
  const run = rows[0];
  if (!run) notFound();
  const canEdit = session.role === 'builder' || session.role === 'admin';
  return <RunDetail run={run} canEdit={canEdit} />;
}
