// /audience/consultations/:id

import { notFound, redirect } from 'next/navigation';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';
import ConsultationDetail from './ConsultationDetail';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getCurrentSession();
  if (!session) redirect(`/login?next=/audience/consultations/${id}`);
  if (!UUID_RE.test(id)) notFound();

  const { rows } = await pool.query(
    `SELECT * FROM audience_consultations WHERE id = $1 AND newsroom_id = $2`,
    [id, session.newsroomId]
  );
  const consultation = rows[0];
  if (!consultation) notFound();

  type SignalRow = {
    id: string; source: string; filename: string | null;
    signals: Record<string, unknown>;
    analysis_summary: string | null;
    created_at: string;
  };
  let referencedSignals: SignalRow[] = [];
  if (Array.isArray(consultation.referenced_signal_ids) && consultation.referenced_signal_ids.length > 0) {
    const sr = await pool.query(
      `SELECT id, source, filename, period_start, period_end, signals,
              total_pageviews, unique_visitors, analysis_summary, created_at
         FROM audience_signals
        WHERE id = ANY($1::uuid[]) AND newsroom_id = $2`,
      [consultation.referenced_signal_ids, session.newsroomId]
    );
    referencedSignals = sr.rows as SignalRow[];
  }
  const canEdit = session.role === 'builder' || session.role === 'admin';
  return <ConsultationDetail consultation={consultation} referencedSignals={referencedSignals} canEdit={canEdit} />;
}
