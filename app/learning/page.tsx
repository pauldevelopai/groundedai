// /learning — Learning layer workspace. Three regions:
//   1. Updates digest (curated AI-ethics / data-law / security feed)
//   2. Cohort meta-analytics (anonymised cross-newsroom aggregates)
//   3. Promoted workflows (workflows the cohort has adopted at scale)

import { redirect } from 'next/navigation';
import { getCurrentSession } from '@/app/lib/session';
import LearningWorkspace from './LearningWorkspace';
const { listUpdates } = require('@/lib/learning/updates');
const { cohortMetrics } = require('@/lib/learning/cohort');
const { listPromotions } = require('@/lib/learning/promotions');

export default async function LearningPage() {
  const session = await getCurrentSession();
  if (!session) redirect('/login?next=/learning');

  const [updates, metrics, promotions] = await Promise.all([
    listUpdates(session.newsroomId),
    cohortMetrics(),
    listPromotions(session.newsroomId),
  ]);

  const canEdit = session.role === 'builder' || session.role === 'admin';
  const isAdmin = session.role === 'admin';
  return (
    <LearningWorkspace
      initialUpdates={updates}
      initialMetrics={metrics}
      initialPromotions={promotions}
      canEdit={canEdit}
      isAdmin={isAdmin}
      role={session.role}
    />
  );
}
