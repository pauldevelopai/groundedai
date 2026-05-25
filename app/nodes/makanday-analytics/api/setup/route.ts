// GET /nodes/makanday-analytics/api/setup
// Online, AI is platform-managed: host.ai.chat routes through the Haiku-locked
// lib/claude.js using GROUNDED's key. The node's standalone per-.env API-key
// setup is therefore N/A here — we report "configured" so the dashboard skips
// the welcome form, and we intentionally do NOT expose the key-writing POST
// (postSetup) that the standalone server mounts.
import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';

export async function GET() {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  return NextResponse.json({ configured: true, activeProvider: 'anthropic', managed: 'platform' });
}
