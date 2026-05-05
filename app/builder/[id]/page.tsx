// /builder/:id — server-rendered shell. Loads the workflow + agent registry,
// gates on auth + ownership, then mounts the client-side canvas.

import { notFound } from 'next/navigation';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';
import { list as listAgents } from '@/lib/agents/registry';
import BuilderCanvas from './BuilderCanvas';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function BuilderEditPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) {
    return (
      <main style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>
        <p>Sign in first via <code>POST /api/auth/login</code>.</p>
      </main>
    );
  }

  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const { rows } = await pool.query(
    `SELECT w.id, w.newsroom_id, w.name, w.slug, w.trigger_phrase, w.description,
            w.definition, w.is_shared, w.created_at, w.updated_at,
            n.name AS newsroom_name
       FROM workflows w
       JOIN newsrooms n ON n.id = w.newsroom_id
      WHERE w.id = $1`,
    [id]
  );
  const workflow = rows[0];
  if (!workflow) notFound();

  const ownsIt = workflow.newsroom_id === session.newsroomId;
  if (!ownsIt && !workflow.is_shared) notFound();

  const editable = ownsIt && (session.role === 'builder' || session.role === 'admin');

  const agents = listAgents();

  return <BuilderCanvas workflow={workflow} agents={agents} editable={editable} />;
}
