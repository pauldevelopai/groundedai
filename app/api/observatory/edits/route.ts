// POST /api/observatory/edits
//
// Records one human-in-the-loop signal about an agent's output: accepted,
// edited, rejected, or forked. Called by the edit pills on agent output
// panels (Drafter, Translator, Producer for V2 Step 1; more agents over
// time).
//
// Body shape:
//   {
//     workflow_run_id: UUID,           // workflow_runs.id (returned by /api/agents/<slug>)
//     edit_kind: 'accepted' | 'edited' | 'rejected' | 'forked',
//     original_text: string,           // the agent output verbatim
//     edited_text?: string,            // required for 'edited' and 'forked'
//     notes?: string                   // optional user note
//   }
//
// Auth: any role. Tenant-scoped: the workflow_run must belong to the
// caller's newsroom or the request is 403'd.

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';
const { recordEdit } = require('@/lib/observatory/log');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_KINDS = new Set(['accepted', 'edited', 'rejected', 'forked']);
const MAX_TEXT_BYTES = 200_000;

export async function POST(req: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  let body: {
    workflow_run_id?: unknown;
    edit_kind?: unknown;
    original_text?: unknown;
    edited_text?: unknown;
    notes?: unknown;
  };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const workflowRunId = body.workflow_run_id;
  const editKind = body.edit_kind;
  const originalText = body.original_text;
  const editedText = body.edited_text;
  const notes = body.notes;

  if (typeof workflowRunId !== 'string' || !UUID_RE.test(workflowRunId)) {
    return NextResponse.json({ error: 'workflow_run_id required (UUID)' }, { status: 400 });
  }
  if (typeof editKind !== 'string' || !VALID_KINDS.has(editKind)) {
    return NextResponse.json({ error: `edit_kind must be one of ${[...VALID_KINDS].join(', ')}` }, { status: 400 });
  }
  if (typeof originalText !== 'string') {
    return NextResponse.json({ error: 'original_text required (string)' }, { status: 400 });
  }
  if (originalText.length > MAX_TEXT_BYTES) {
    return NextResponse.json({ error: `original_text exceeds ${MAX_TEXT_BYTES} chars` }, { status: 400 });
  }
  if ((editKind === 'edited' || editKind === 'forked')) {
    if (typeof editedText !== 'string') {
      return NextResponse.json({ error: `edited_text required for edit_kind="${editKind}"` }, { status: 400 });
    }
    if (editedText.length > MAX_TEXT_BYTES) {
      return NextResponse.json({ error: `edited_text exceeds ${MAX_TEXT_BYTES} chars` }, { status: 400 });
    }
  }
  if (notes !== undefined && notes !== null && typeof notes !== 'string') {
    return NextResponse.json({ error: 'notes must be a string if present' }, { status: 400 });
  }

  // Tenant scope: the workflow_run must belong to the caller's newsroom.
  const { rows } = await pool.query(
    `SELECT newsroom_id, workflow_execution_id FROM workflow_runs WHERE id = $1`,
    [workflowRunId]
  );
  if (rows.length === 0) {
    return NextResponse.json({ error: 'workflow_run not found' }, { status: 404 });
  }
  if (rows[0].newsroom_id !== session.newsroomId) {
    return NextResponse.json({ error: 'workflow_run not in your newsroom' }, { status: 403 });
  }

  const editId: string | null = await recordEdit({
    newsroomId: session.newsroomId,
    userId: session.userId,
    workflowRunId,
    workflowExecutionId: rows[0].workflow_execution_id || null,
    editKind,
    originalText,
    editedText: typeof editedText === 'string' ? editedText : null,
    notes: typeof notes === 'string' ? notes : null,
  });

  if (!editId) {
    return NextResponse.json({ error: 'Failed to record edit' }, { status: 500 });
  }
  return NextResponse.json({ id: editId, edit_kind: editKind });
}
