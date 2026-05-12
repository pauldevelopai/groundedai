// POST /api/archive/entities/:keepId/merge — merge another entity INTO this
// one. Used by the workspace UI to combine acronym/expansion pairs (e.g.
// "ANC" → "African National Congress") that the auto-resolver can't catch.
//
// Body: { mergeId: "<uuid>" }

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
const { mergeEntities } = require('@/lib/archive/resolve');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (session.role !== 'builder' && session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — builder role required' }, { status: 403 });
  }
  const { id: keepId } = await ctx.params;
  if (!UUID_RE.test(keepId)) return NextResponse.json({ error: 'Invalid keep id' }, { status: 400 });

  let body: { mergeId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const mergeId = (body.mergeId || '').trim();
  if (!UUID_RE.test(mergeId)) {
    return NextResponse.json({ error: 'mergeId required (uuid)' }, { status: 400 });
  }
  if (keepId === mergeId) {
    return NextResponse.json({ error: 'Cannot merge an entity into itself' }, { status: 400 });
  }

  try {
    const result = await mergeEntities({
      newsroomId: session.newsroomId,
      keepId,
      mergeId,
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 422 }
    );
  }
}
