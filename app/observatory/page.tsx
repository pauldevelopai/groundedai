// /observatory — V2 Step 1.
//
// Read-only dashboard over workflow_executions + workflow_runs + output_edits.
// Surfaces what's running, what's failing, and where the model performs
// worst (i.e. where humans edit most). Open to any role: every team
// member benefits from seeing their own activity. Cross-newsroom views are
// in /mentorship (Step 2), behind admin role.

import { redirect } from 'next/navigation';
import { getCurrentSession } from '@/app/lib/session';
import ObservatoryWorkspace from './ObservatoryWorkspace';

export default async function ObservatoryPage() {
  const session = await getCurrentSession();
  if (!session) redirect('/login?next=/observatory');
  return <ObservatoryWorkspace role={session.role} />;
}
