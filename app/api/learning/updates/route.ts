// /api/learning/updates — list (auto-seeds defaults) + POST add (admin only for cohort updates).

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';
const { listUpdates } = require('@/lib/learning/updates');

const KINDS = ['ethics', 'data_law', 'security', 'governance', 'model_change', 'platform_takedown', 'press_freedom'];
const SEVERITIES = ['info', 'advisory', 'urgent'];

export async function GET(req: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const url = new URL(req.url);
  const kind = url.searchParams.get('kind') || undefined;
  const updates = await listUpdates(session.newsroomId, kind ? { kind } : {});
  return NextResponse.json({ updates });
}

export async function POST(req: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (session.role !== 'builder' && session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — builder role required' }, { status: 403 });
  }
  let body: {
    title?: string; body?: string; kind?: string; severity?: string;
    source_publisher?: string; source_url?: string; published_at?: string;
    applies_to_agents?: string[]; country_scope?: string[];
    cohort?: boolean;
  };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  if (!body.title?.trim()) return NextResponse.json({ error: 'title is required' }, { status: 400 });
  if (!body.body?.trim()) return NextResponse.json({ error: 'body is required' }, { status: 400 });
  if (body.kind && !KINDS.includes(body.kind)) {
    return NextResponse.json({ error: `kind must be one of ${KINDS.join(', ')}` }, { status: 400 });
  }
  if (body.severity && !SEVERITIES.includes(body.severity)) {
    return NextResponse.json({ error: `severity must be one of ${SEVERITIES.join(', ')}` }, { status: 400 });
  }
  // Cohort-shared updates (newsroom_id NULL) are admin-only.
  const cohort = !!body.cohort;
  if (cohort && session.role !== 'admin') {
    return NextResponse.json({ error: 'Cohort-shared updates require admin role' }, { status: 403 });
  }

  const { rows } = await pool.query(
    `INSERT INTO learning_updates
       (newsroom_id, added_by, title, body, kind, severity,
        source_publisher, source_url, published_at,
        applies_to_agents, country_scope, source, is_default)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::date, $10, $11, $12, FALSE)
     RETURNING *`,
    [
      cohort ? null : session.newsroomId,
      session.userId,
      body.title.trim(),
      body.body.trim(),
      body.kind || 'governance',
      body.severity || 'info',
      body.source_publisher?.trim() || null,
      body.source_url?.trim() || null,
      body.published_at || null,
      Array.isArray(body.applies_to_agents) ? body.applies_to_agents : [],
      Array.isArray(body.country_scope) ? body.country_scope : [],
      cohort ? 'cohort_admin' : 'manual',
    ]
  );
  return NextResponse.json({ update: rows[0] }, { status: 201 });
}
