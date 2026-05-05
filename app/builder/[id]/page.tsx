// /builder/:id — same Builder workspace as /builder, but with a specific
// workflow pre-loaded. Server pre-fetches the workflow + workflows-list
// + session user; client takes over from there.

import { notFound, redirect } from 'next/navigation';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';
import { list as listAgents } from '@/lib/agents/registry';
import BuilderShell, { Workflow, WorkflowSummary } from '../BuilderShell';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function BuilderEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getCurrentSession();
  if (!session) redirect(`/login?next=/builder/${id}`);
  if (!UUID_RE.test(id)) notFound();

  const { rows: wfRows } = await pool.query<Workflow>(
    `SELECT w.id, w.newsroom_id, w.name, w.slug, w.trigger_phrase, w.description,
            w.definition, w.is_shared, n.name AS newsroom_name
       FROM workflows w
       JOIN newsrooms n ON n.id = w.newsroom_id
      WHERE w.id = $1`,
    [id]
  );
  const workflow = wfRows[0];
  if (!workflow) notFound();

  const ownsIt = workflow.newsroom_id === session.newsroomId;
  if (!ownsIt && !workflow.is_shared) notFound();

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
      initialWorkflow={workflow}
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
