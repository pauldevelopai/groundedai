// /api/workflows/:id/assignments
//
// GET  — list users assigned to this workflow.
// POST — assign a user (builder/admin in the workflow's owning newsroom).
//        Body: { user_id }. The assigned user must belong to the workflow's
//        newsroom (no cross-newsroom assignment, even for shared workflows).
// DELETE goes to /api/workflows/:id/assignments/:userId.

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function loadWorkflow(id: string) {
  const { rows } = await pool.query(
    `SELECT id, newsroom_id, name, slug, is_shared FROM workflows WHERE id = $1`,
    [id]
  );
  return rows[0] || null;
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid workflow id' }, { status: 400 });

  const workflow = await loadWorkflow(id);
  if (!workflow) return NextResponse.json({ error: 'Workflow not found' }, { status: 404 });
  if (workflow.newsroom_id !== session.newsroomId && !workflow.is_shared) {
    return NextResponse.json({ error: 'Workflow not found' }, { status: 404 });
  }

  const { rows } = await pool.query(
    `SELECT u.id, u.email, u.role, a.assigned_at, a.assigned_by
       FROM workflow_assignments a
       JOIN users u ON u.id = a.user_id
      WHERE a.workflow_id = $1
      ORDER BY u.email`,
    [id]
  );
  return NextResponse.json({ assignments: rows });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (session.role !== 'builder' && session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — builder role required' }, { status: 403 });
  }
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid workflow id' }, { status: 400 });

  const workflow = await loadWorkflow(id);
  if (!workflow) return NextResponse.json({ error: 'Workflow not found' }, { status: 404 });
  if (workflow.newsroom_id !== session.newsroomId) {
    return NextResponse.json({ error: 'Forbidden — cannot assign on another newsroom\'s workflow' }, { status: 403 });
  }

  let body: { user_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!body.user_id || !UUID_RE.test(body.user_id)) {
    return NextResponse.json({ error: 'user_id is required' }, { status: 400 });
  }

  const userCheck = await pool.query(
    `SELECT id FROM users WHERE id = $1 AND newsroom_id = $2 AND is_active = TRUE`,
    [body.user_id, workflow.newsroom_id]
  );
  if (userCheck.rows.length === 0) {
    return NextResponse.json({ error: 'User not found in this newsroom' }, { status: 404 });
  }

  await pool.query(
    `INSERT INTO workflow_assignments (workflow_id, user_id, assigned_by)
     VALUES ($1, $2, $3)
     ON CONFLICT (workflow_id, user_id) DO NOTHING`,
    [id, body.user_id, session.userId]
  );

  await pool.query(
    `INSERT INTO audit_log (newsroom_id, user_id, event_type, payload)
     VALUES ($1, $2, 'workflow.assigned', $3)`,
    [session.newsroomId, session.userId, JSON.stringify({ workflow_id: id, assigned_user_id: body.user_id })]
  );

  return NextResponse.json({ ok: true });
}
