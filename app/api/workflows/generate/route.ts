// POST /api/workflows/generate
//
// Builder/admin only. Takes a plain-English description and returns a
// generated workflow definition (nodes, edges, inputs, output) plus a
// suggested name and trigger phrase. The Builder client paints these
// into the canvas; nothing is persisted here — Save remains explicit.
//
// Body: { description: string }
// Response (200): { name, trigger_phrase, definition, cost, durationMs }
// Response (4xx/5xx): { error }

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
import { generateFromDescription } from '@/lib/workflows/generate';

export async function POST(req: Request) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  if (session.role !== 'builder' && session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — builder role required' }, { status: 403 });
  }

  let body: { description?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const description = body.description?.trim();
  if (!description || description.length < 10) {
    return NextResponse.json(
      { error: 'description must be at least 10 characters of plain text' },
      { status: 400 }
    );
  }

  try {
    const out = await generateFromDescription({
      description,
      context: {
        newsroomId: session.newsroomId,
        userId: session.userId,
        endpoint: '/api/workflows/generate',
      },
    });
    return NextResponse.json({
      name: out.name,
      trigger_phrase: out.trigger_phrase,
      definition: out.definition,
      suggestedSlug: out.suggestedSlug,
      cost: out.cost,
      durationMs: out.durationMs,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
