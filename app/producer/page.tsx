// /producer — Producer index. Lists past productions and offers a "+ New
// production" form (source text + format → kicks off the agent inline).

import { redirect } from 'next/navigation';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';
import ProducerIndex from './ProducerIndex';

export default async function ProducerPage() {
  const session = await getCurrentSession();
  if (!session) redirect('/login?next=/producer');

  const { rows } = await pool.query(
    `SELECT id, title, format, status, duration_estimate_seconds, duration_ms,
            cost_usd, error, created_at, updated_at
       FROM producer_productions
      WHERE newsroom_id = $1
      ORDER BY created_at DESC
      LIMIT 50`,
    [session.newsroomId]
  );

  const canCreate = session.role === 'builder' || session.role === 'admin';
  return <ProducerIndex initialProductions={rows} canCreate={canCreate} role={session.role} />;
}
