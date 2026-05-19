// /api/security/reports/:id — read one audit report (any role within newsroom).

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const { rows } = await pool.query(
    `SELECT r.id, r.status, r.overall_risk_band, r.routing_window_days,
            r.summary_json, r.inventory_snapshot_json,
            r.started_at, r.finished_at, r.cost_usd, r.error,
            u.email AS initiated_by_email
       FROM security_audit_reports r
       LEFT JOIN users u ON u.id = r.initiated_by
      WHERE r.id = $1 AND r.newsroom_id = $2`,
    [id, session.newsroomId]
  );
  if (rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ report: rows[0] });
}
