// /api/social/analyze — single-shot structural analysis without persisting.
// Useful for the "paste a post and see what we'd attribute" preview flow.

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
const { analyseSignal } = require('@/lib/social/analyze');

export async function POST(req: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  let body: { text?: string; post_url?: string; author_handle?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  if (!body.text?.trim()) return NextResponse.json({ error: 'text is required' }, { status: 400 });
  try {
    const analysis = await analyseSignal({
      text: body.text,
      postUrl: body.post_url,
      authorHandle: body.author_handle,
      newsroomId: session.newsroomId,
    });
    return NextResponse.json({ analysis });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
