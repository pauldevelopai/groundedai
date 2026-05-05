// GET /api/agents
//
// Auth-required. Returns the agent registry — the catalog of agents available
// to the Builder UI's drag-and-drop palette and the chat router. Strips
// internal `run` functions; only metadata leaves the server.

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
import { list } from '@/lib/agents/registry';

export async function GET() {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  return NextResponse.json({ agents: list() });
}
