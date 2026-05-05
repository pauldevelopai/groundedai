// /run/[id] — User mode runner. Mounts the shared WorkflowRunner against
// a workflow the signed-in user is assigned to. Visibility check is strict:
// must have a row in workflow_assignments. (Admins/builders included — the
// User-mode lens is "things assigned to me".)

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';
import WorkflowRunner from '@/app/builder/WorkflowRunner';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function RunWorkflowPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getCurrentSession();
  if (!session) redirect(`/login?next=/run/${id}`);
  if (!UUID_RE.test(id)) notFound();

  const { rows } = await pool.query(
    `SELECT w.id, w.name, w.problem_statement, w.problem_category,
            w.user_instructions, w.definition
       FROM workflow_assignments a
       JOIN workflows w ON w.id = a.workflow_id
      WHERE a.workflow_id = $1 AND a.user_id = $2`,
    [id, session.userId]
  );
  const workflow = rows[0];
  if (!workflow) notFound();

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', minHeight: '100vh', background: '#f7f8fa' }}>
      <header
        style={{
          background: 'white',
          borderBottom: '1px solid #e5e5e5',
          padding: '12px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <Link href="/run" style={{ fontSize: 14, color: '#0066cc', textDecoration: 'none' }}>
          ← All workflows
        </Link>
      </header>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '20px', background: 'white', minHeight: 'calc(100vh - 60px)', borderLeft: '1px solid #e5e5e5', borderRight: '1px solid #e5e5e5' }}>
        <WorkflowRunner workflow={workflow} />
      </div>
    </main>
  );
}
