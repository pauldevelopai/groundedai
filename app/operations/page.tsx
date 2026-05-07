// /operations — Operations workspace. Five regions on one screen:
// editorial calendar, freelancers, community contributors, finance,
// metric snapshots. Plus operations briefs (the agent's outputs) at the
// top, since that's the "what should I be looking at?" entry point.

import { redirect } from 'next/navigation';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';
import OperationsWorkspace from './OperationsWorkspace';
const cal = require('@/lib/operations/calendar');
const fl = require('@/lib/operations/freelancers');
const cc = require('@/lib/operations/contributors');
const fin = require('@/lib/operations/finance');
const met = require('@/lib/operations/metrics');

export default async function OperationsPage() {
  const session = await getCurrentSession();
  if (!session) redirect('/login?next=/operations');

  const [items, freelancers, contributors, financeEntries, financeTotals, snapshots, briefsRes] = await Promise.all([
    cal.listAll(session.newsroomId, { limit: 100 }),
    fl.outstandingPayments(session.newsroomId),
    cc.listContributors(session.newsroomId),
    fin.listEntries(session.newsroomId, { limit: 60 }),
    fin.totals(session.newsroomId, { sinceDays: 90 }),
    met.listSnapshots(session.newsroomId, { limit: 12 }),
    pool.query(
      `SELECT id, title, kind, status, duration_ms, cost_usd, error, created_at, updated_at
         FROM ops_briefs WHERE newsroom_id = $1 ORDER BY created_at DESC LIMIT 30`,
      [session.newsroomId]
    ),
  ]);

  const canEdit = session.role === 'builder' || session.role === 'admin';
  return (
    <OperationsWorkspace
      initialItems={items}
      initialFreelancers={freelancers}
      initialContributors={contributors}
      initialFinanceEntries={financeEntries}
      initialFinanceTotals={financeTotals}
      initialSnapshots={snapshots}
      initialBriefs={briefsRes.rows}
      canEdit={canEdit}
      role={session.role}
    />
  );
}
