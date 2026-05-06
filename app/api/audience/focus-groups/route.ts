// /api/audience/focus-groups — list + start a new focus-group session

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';
const { runFocusGroup } = require('@/lib/agents/audience');

const KINDS = ['headline', 'lede', 'angle', 'full_draft'];

export async function GET() {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { rows } = await pool.query(
    `SELECT id, title, test_material, test_material_kind, context_brief,
            persona_ids, summary, recommendations, status,
            duration_ms, cost_usd, error, created_at, updated_at
       FROM focus_group_sessions
      WHERE newsroom_id = $1
      ORDER BY created_at DESC
      LIMIT 50`,
    [session.newsroomId]
  );
  return NextResponse.json({ sessions: rows });
}

export async function POST(req: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  let body: {
    title?: string;
    test_material?: string;
    test_material_kind?: string;
    context_brief?: string;
    persona_ids?: string[];
  };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  if (!body.test_material) return NextResponse.json({ error: 'test_material is required' }, { status: 400 });
  if (!body.test_material_kind || !KINDS.includes(body.test_material_kind)) {
    return NextResponse.json({ error: `test_material_kind must be one of: ${KINDS.join(', ')}` }, { status: 400 });
  }
  if (!Array.isArray(body.persona_ids) || body.persona_ids.length === 0) {
    return NextResponse.json({ error: 'persona_ids must be a non-empty array' }, { status: 400 });
  }

  try {
    const out = await runFocusGroup({
      title: body.title,
      testMaterial: body.test_material,
      testMaterialKind: body.test_material_kind,
      contextBrief: body.context_brief,
      personaIds: body.persona_ids,
      context: { newsroomId: session.newsroomId, userId: session.userId, endpoint: '/api/audience/focus-groups' },
    });
    return NextResponse.json(out, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
