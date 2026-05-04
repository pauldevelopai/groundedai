// Smoke test endpoint: confirms the Claude wrapper, cost logger, and auth chain
// all work together. Auth required. POST with no body.
//
// On success, returns { ok: true, text, cost } and inserts a row into api_costs
// with agent='smoke-test'. Run this after `npm run migrate` + `npm run seed`
// + `npm run dev` to verify Step 4 Pass A end-to-end.

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
import { chat } from '@/lib/claude';

export async function POST() {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const { text, cost } = await chat({
      system: 'You are a smoke-test responder. Reply with exactly: ANCHOR_SMOKE_OK',
      messages: [{ role: 'user', content: 'ping' }],
      maxTokens: 50,
      context: {
        newsroomId: session.newsroomId,
        userId: session.userId,
        agent: 'smoke-test',
        endpoint: '/api/agents/smoke-test',
      },
    });
    return NextResponse.json({ ok: true, text, cost });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
