// /producer/productions/:id — production detail. Server-renders the row;
// client component handles status changes + delete + display.

import { notFound, redirect } from 'next/navigation';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';
import ProductionDetail from './ProductionDetail';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ProductionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getCurrentSession();
  if (!session) redirect(`/login?next=/producer/productions/${id}`);
  if (!UUID_RE.test(id)) notFound();

  const { rows } = await pool.query(
    `SELECT id, newsroom_id, title, format, source_text, archive_context, output, edited_output,
            duration_estimate_seconds, notes, status, duration_ms, cost_usd, error,
            created_at, updated_at
       FROM producer_productions WHERE id = $1`,
    [id]
  );
  const production = rows[0];
  if (!production || production.newsroom_id !== session.newsroomId) notFound();

  const canEdit = session.role === 'builder' || session.role === 'admin';
  return <ProductionDetail production={production} canEdit={canEdit} role={session.role} />;
}
