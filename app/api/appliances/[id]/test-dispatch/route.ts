// POST /api/appliances/:id/test-dispatch  — fire a no-op dispatch.
//
// V2 Step 6. Admin clicks "Test dispatch" from /team; we sign + POST a
// minimal payload to the appliance's /test endpoint. Returns whether
// the appliance accepted the request, plus the dispatch_id for the
// audit trail.

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';
const { getActiveAppliance, dispatchToAppliance, HEALTHZ_TIMEOUT_MS } = require('@/lib/appliance/dispatch');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Admin role required' }, { status: 403 });
  }
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  // Confirm tenant + that this is the active appliance.
  const own = await pool.query(
    `SELECT newsroom_id, status FROM newsroom_appliances WHERE id = $1`,
    [id]
  );
  if (own.rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (own.rows[0].newsroom_id !== session.newsroomId) {
    return NextResponse.json({ error: 'Not in your newsroom' }, { status: 403 });
  }
  if (own.rows[0].status !== 'active') {
    return NextResponse.json({ error: `Appliance is ${own.rows[0].status}, not active` }, { status: 409 });
  }

  const appliance = await getActiveAppliance(session.newsroomId);
  if (!appliance) return NextResponse.json({ error: 'No active appliance' }, { status: 404 });

  try {
    const { payload, dispatchId, durationMs } = await dispatchToAppliance({
      appliance,
      endpoint: 'test',
      body: { ping: 'hello', from: 'central', at: new Date().toISOString() },
      timeoutMs: HEALTHZ_TIMEOUT_MS,
      audit: { newsroomId: session.newsroomId, agentSlug: 'test' },
    });
    return NextResponse.json({ ok: true, dispatch_id: dispatchId, duration_ms: durationMs, response: payload });
  } catch (err: any) {
    return NextResponse.json({
      ok: false,
      error: err.message,
      dispatch_id: err.dispatchId || null,
      http_status: err.httpStatus || null,
    }, { status: 502 });
  }
}
