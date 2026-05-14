// /mentorship — V2 Step 2.
//
// Admin + builder only. Three tabs (Team / Workflow performance / Cohort
// signals). Built as a leadership view, not a peer one — the per-user
// table is here so AI champions can spot stuck team members, not so
// anyone-and-everyone can rank each other.

import { redirect } from 'next/navigation';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';
import MentorshipWorkspace from './MentorshipWorkspace';

export default async function MentorshipPage() {
  const session = await getCurrentSession();
  if (!session) redirect('/login?next=/mentorship');
  if (session.role !== 'builder' && session.role !== 'admin') {
    redirect('/?error=mentorship_requires_builder');
  }

  const optIn = await pool.query(
    `SELECT (metadata->'cohort_signals_enabled')::text AS flag
       FROM newsroom_profiles
      WHERE newsroom_id = $1`,
    [session.newsroomId]
  );

  return (
    <MentorshipWorkspace
      role={session.role as 'builder' | 'admin'}
      cohortEnabled={optIn.rows[0]?.flag === 'true'}
    />
  );
}
