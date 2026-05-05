// DELETE /api/workflows/:id/assignments/:userId
//
// Builder/admin in the workflow's owning newsroom only.

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string; userId: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (session.role !== 'builder' && session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — builder role required' }, { status: 403 });
  }

  const { id, userId } = await ctx.params;
  if (!UUID_RE.test(id) || !UUID_RE.test(userId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const wf = await pool.query(`SELECT newsroom_id FROM workflows WHERE id = $1`, [id]);
  if (wf.rows.length === 0) return NextResponse.json({ error: 'Workflow not found' }, { status: 404 });
  if (wf.rows[0].newsroom_id !== session.newsroomId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await pool.query(
    `DELETE FROM workflow_assignments WHERE workflow_id = $1 AND user_id = $2`,
    [id, userId]
  );

  await pool.query(
    `INSERT INTO audit_log (newsroom_id, user_id, event_type, payload)
     VALUES ($1, $2, 'workflow.unassigned', $3)`,
    [session.newsroomId, session.userId, JSON.stringify({ workflow_id: id, removed_user_id: userId })]
  );

  return NextResponse.json({ ok: true });
}
