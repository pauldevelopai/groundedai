// GET /api/appliances/:id/health  — most-recent ping + recent dispatch stats
//
// V2 Step 6. Admin/builder. Reads the appliance row + the last 10
// dispatches so the /team panel can show health-at-a-glance.

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (session.role !== 'builder' && session.role !== 'admin') {
    return NextResponse.json({ error: 'Builder or admin role required' }, { status: 403 });
  }
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const { rows } = await pool.query(
    `SELECT id, newsroom_id, display_name, dispatch_url, status,
            last_seen_at, last_seen_version, registered_at
       FROM newsroom_appliances
      WHERE id = $1`,
    [id]
  );
  if (rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const appliance = rows[0];
  if (appliance.newsroom_id !== session.newsroomId) {
    return NextResponse.json({ error: 'Not in your newsroom' }, { status: 403 });
  }

  const dispatches = await pool.query(
    `SELECT id, endpoint, agent_slug, status, http_status, duration_ms,
            dispatched_at, responded_at, error
       FROM appliance_dispatches
      WHERE appliance_id = $1
   ORDER BY dispatched_at DESC
      LIMIT 10`,
    [id]
  );

  const counts = await pool.query(
    `SELECT
       SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END)::int AS completed,
       SUM(CASE WHEN status = 'failed'    THEN 1 ELSE 0 END)::int AS failed,
       SUM(CASE WHEN status = 'timeout'   THEN 1 ELSE 0 END)::int AS timeout,
       SUM(CASE WHEN status = 'dispatched' OR status = 'running' THEN 1 ELSE 0 END)::int AS in_flight
       FROM appliance_dispatches
      WHERE appliance_id = $1
        AND dispatched_at >= NOW() - INTERVAL '7 days'`,
    [id]
  );

  return NextResponse.json({
    appliance,
    recent_dispatches: dispatches.rows,
    last_7_days: counts.rows[0],
    online: appliance.last_seen_at
      ? Date.now() - new Date(appliance.last_seen_at).getTime() < 10 * 60 * 1000
      : false,
  });
}
