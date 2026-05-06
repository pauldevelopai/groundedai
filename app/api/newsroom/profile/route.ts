// /api/newsroom/profile
//
// GET   — current newsroom's profile (returns 200 with `null` if not yet
//         created — the UI auto-creates on first PATCH).
// PATCH — upsert. Builder/admin only. Body is any subset of profile fields.

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
const { loadProfile, upsertProfile } = require('@/lib/newsroom-profile');

export async function GET() {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const profile = await loadProfile(session.newsroomId);
  return NextResponse.json({ profile });
}

export async function PATCH(req: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (session.role !== 'builder' && session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — builder role required' }, { status: 403 });
  }
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  try {
    const profile = await upsertProfile(session.newsroomId, session.userId, body);
    return NextResponse.json({ profile });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
