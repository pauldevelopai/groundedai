// /security/reports/:id — Digital Security Audit report viewer (Slice C).

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentSession } from '@/app/lib/session';
import ReportViewer from './ReportViewer';

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) redirect('/login?next=/security');
  if (session.role !== 'builder' && session.role !== 'admin') redirect('/');
  const { id } = await params;
  return (
    <div style={{ padding: '24px 32px', maxWidth: 1100, margin: '0 auto', fontFamily: 'system-ui' }}>
      <div style={{ marginBottom: 16 }}>
        <Link href="/security" style={{ fontSize: 13, color: '#0a5da0' }}>← Digital Security Audit</Link>
      </div>
      <ReportViewer id={id} />
    </div>
  );
}
