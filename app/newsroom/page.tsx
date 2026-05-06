// /newsroom — newsroom profile editor. Server-renders the current profile
// (null on first visit) and mounts the client form.

import { redirect } from 'next/navigation';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';
import NewsroomProfileForm from './NewsroomProfileForm';
const { loadProfile } = require('@/lib/newsroom-profile');

export default async function NewsroomPage() {
  const session = await getCurrentSession();
  if (!session) redirect('/login?next=/newsroom');

  const profile = await loadProfile(session.newsroomId);
  const { rows: nrRows } = await pool.query(
    `SELECT id, name, country FROM newsrooms WHERE id = $1`,
    [session.newsroomId]
  );
  const newsroom = nrRows[0];

  const canEdit = session.role === 'builder' || session.role === 'admin';

  return (
    <NewsroomProfileForm
      newsroom={newsroom}
      initialProfile={profile}
      canEdit={canEdit}
      role={session.role}
    />
  );
}
