// /api/learning/workflows/:id/adopt — adopt a promoted workflow into this newsroom.

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
const { adoptPromotion } = require('@/lib/learning/promotions');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (session.role !== 'builder' && session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — builder role required' }, { status: 403 });
  }
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  try {
    const result = await adoptPromotion(session.newsroomId, session.userId, id);
    return NextResponse.json(result, { status: result.created ? 201 : 200 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 422 });
  }
}
