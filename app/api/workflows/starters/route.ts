// GET /api/workflows/starters
//
// Returns the catalog of newsroom problems-and-products the Builder picks
// from when starting a new workflow. Auth-required (any role) — non-builders
// don't strictly need it but exposing it broadly is harmless and lets us
// reuse the catalog in /guide later.

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
const { STARTERS } = require('@/lib/workflows/starters');

export async function GET() {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  return NextResponse.json({ starters: STARTERS });
}
