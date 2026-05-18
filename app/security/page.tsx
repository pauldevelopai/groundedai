// /security — Digital Security Audit (Slice A: inventory only).
//
// Builder + admin role. Lists the newsroom's external-tool inventory.
// Slices B-D add jurisdiction scoring, the audit run pipeline, the
// report viewer, and export.

import { redirect } from 'next/navigation';
import { getCurrentSession } from '@/app/lib/session';
import SecurityInventory from './SecurityInventory';

export default async function SecurityPage() {
  const session = await getCurrentSession();
  if (!session) redirect('/login?next=/security');
  if (session.role !== 'builder' && session.role !== 'admin') {
    redirect('/');
  }
  return <SecurityInventory role={session.role} />;
}
