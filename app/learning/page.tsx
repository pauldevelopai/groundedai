// /learning — V2 Step 3 Tracker workspace. Seven tabs:
//   Home / Lawsuits / Regulations / Connections / Use cases / Sources / Submit
//
// Server pre-loads the updates feed + latest cohort digest. Each tab
// lazy-loads its specific data client-side via /api/learning/* routes.

import { redirect } from 'next/navigation';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';
import LearningWorkspace from './LearningWorkspace';
const { listUpdates } = require('@/lib/learning/updates');

export default async function LearningPage() {
  const session = await getCurrentSession();
  if (!session) redirect('/login?next=/learning');

  // Updates feed is the heart of the Tracker — pre-load.
  const updates = await listUpdates(session.newsroomId);

  // Latest cohort digest (may be null if the worker hasn't run yet).
  const digestRes = await pool.query(
    `SELECT id, period_start, period_end, summary_md, top_entry_ids,
            entry_count, generated_at
       FROM tracker_digests
      WHERE newsroom_id IS NULL
   ORDER BY period_end DESC
      LIMIT 1`
  );

  const canEdit = session.role === 'builder' || session.role === 'admin';
  const isAdmin = session.role === 'admin';

  return (
    <LearningWorkspace
      initialUpdates={updates}
      initialDigest={digestRes.rows[0] || null}
      canEdit={canEdit}
      isAdmin={isAdmin}
      role={session.role}
    />
  );
}
