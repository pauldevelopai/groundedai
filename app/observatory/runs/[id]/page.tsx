// /observatory/runs/:id — V2 Step 4 trace viewer.
//
// Shows the full breakdown of one workflow execution OR one agent
// invocation: top-level agents, agentic tool-call tree under each,
// timing + cost rollups, edit feedback rows.

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentSession } from '@/app/lib/session';
import RunTraceViewer from './RunTraceViewer';

export default async function RunTracePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) redirect('/login?next=/observatory');
  const { id } = await params;
  return (
    <div style={{ padding: '24px 32px', maxWidth: 1200, margin: '0 auto', fontFamily: 'system-ui' }}>
      <div style={{ marginBottom: 16 }}>
        <Link href="/observatory" style={{ fontSize: 13, color: '#0a5' }}>← Observatory</Link>
      </div>
      <RunTraceViewer id={id} />
    </div>
  );
}
