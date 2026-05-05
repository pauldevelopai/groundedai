// /builder — Builder workspace, no workflow active. The shell handles
// "+ New" inline and renders an empty-state when nothing is open.

import { redirect } from 'next/navigation';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';
import { list as listAgents } from '@/lib/agents/registry';
import BuilderShell, { WorkflowSummary } from './BuilderShell';

export default async function BuilderRoot() {
  const session = await getCurrentSession();
  if (!session) redirect('/login?next=/builder');

  const { rows: workflowRows } = await pool.query<WorkflowSummary>(
    `SELECT w.id, w.newsroom_id, n.name AS newsroom_name, w.name, w.slug,
            w.is_shared, w.trigger_phrase, w.description, w.updated_at
       FROM workflows w
       JOIN newsrooms n ON n.id = w.newsroom_id
      WHERE w.newsroom_id = $1 OR w.is_shared = TRUE
      ORDER BY (w.newsroom_id = $1) DESC, w.updated_at DESC`,
    [session.newsroomId]
  );

  const { rows: userRows } = await pool.query(
    `SELECT u.id, u.email, u.role, n.name AS newsroom_name, n.id AS newsroom_id
       FROM users u JOIN newsrooms n ON n.id = u.newsroom_id
      WHERE u.id = $1`,
    [session.userId]
  );
  const u = userRows[0];

  return (
    <BuilderShell
      initialWorkflows={workflowRows}
      initialWorkflow={null}
      agents={listAgents()}
      currentUser={{
        id: u.id,
        email: u.email,
        role: u.role,
        newsroom_id: u.newsroom_id,
        newsroom_name: u.newsroom_name,
      }}
    />
  );
}
