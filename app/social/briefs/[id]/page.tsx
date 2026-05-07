// /social/briefs/:id

import { notFound, redirect } from 'next/navigation';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';
import SocialBriefDetail from './SocialBriefDetail';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getCurrentSession();
  if (!session) redirect(`/login?next=/social/briefs/${id}`);
  if (!UUID_RE.test(id)) notFound();

  const { rows } = await pool.query(
    `SELECT * FROM social_listener_briefs WHERE id = $1 AND newsroom_id = $2`,
    [id, session.newsroomId]
  );
  const brief = rows[0];
  if (!brief) notFound();

  let signals = [];
  if (Array.isArray(brief.signal_ids) && brief.signal_ids.length > 0) {
    const sr = await pool.query(
      `SELECT id, platform, post_url, author_handle, author_display_name,
              raw_text, posted_at, source_domain, analysis, status
         FROM social_signals WHERE id = ANY($1::uuid[]) AND newsroom_id = $2`,
      [brief.signal_ids, session.newsroomId]
    );
    signals = sr.rows;
  }
  const canEdit = session.role === 'builder' || session.role === 'admin';
  return <SocialBriefDetail brief={brief} signals={signals} canEdit={canEdit} />;
}
