// POST /api/learning/submit  — submit a new learning_updates entry as
// status='pending'. Reviewed by admin via /team queue before going live.
//
// Any role can submit. Tenancy: rows are recorded as cohort-shared
// (newsroom_id = NULL) once approved; the submitter is captured on
// `added_by` so the reviewer knows who proposed it.

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';

const VALID_KINDS = new Set([
  'ethics', 'data_law', 'security', 'governance',
  'model_change', 'platform_takedown', 'press_freedom',
]);
const VALID_SEVERITY = new Set(['info', 'advisory', 'urgent']);
const MAX_TITLE = 240;
const MAX_BODY = 8000;

export async function POST(req: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  let body: any;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  if (typeof body.title !== 'string' || body.title.trim().length === 0) {
    return NextResponse.json({ error: 'title required' }, { status: 400 });
  }
  if (typeof body.body !== 'string' || body.body.trim().length === 0) {
    return NextResponse.json({ error: 'body required' }, { status: 400 });
  }
  if (body.title.length > MAX_TITLE) {
    return NextResponse.json({ error: `title exceeds ${MAX_TITLE} chars` }, { status: 400 });
  }
  if (body.body.length > MAX_BODY) {
    return NextResponse.json({ error: `body exceeds ${MAX_BODY} chars` }, { status: 400 });
  }
  const kind = typeof body.kind === 'string' && VALID_KINDS.has(body.kind) ? body.kind : 'governance';
  const severity = typeof body.severity === 'string' && VALID_SEVERITY.has(body.severity) ? body.severity : 'info';
  const sourceUrl = typeof body.source_url === 'string' && /^https?:\/\//.test(body.source_url) ? body.source_url : null;
  const sourcePublisher = typeof body.source_publisher === 'string' ? body.source_publisher.slice(0, 200) : null;
  const publishedAt = typeof body.published_at === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.published_at) ? body.published_at : null;
  const appliesToAgents = Array.isArray(body.applies_to_agents)
    ? body.applies_to_agents.filter((x: unknown): x is string => typeof x === 'string').slice(0, 12) : [];
  const countryScope = Array.isArray(body.country_scope)
    ? body.country_scope.filter((x: unknown): x is string => typeof x === 'string' && x.length <= 8).slice(0, 12) : [];

  const { rows } = await pool.query(
    `INSERT INTO learning_updates
       (newsroom_id, added_by, title, body, kind, severity,
        source_publisher, source_url, published_at,
        applies_to_agents, country_scope, source, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'manual', 'pending')
     RETURNING id`,
    [
      session.newsroomId,                  // attribution: caller's newsroom owns the pending row
      session.userId,
      body.title.trim(),
      body.body.trim(),
      kind, severity,
      sourcePublisher, sourceUrl, publishedAt,
      appliesToAgents, countryScope,
    ]
  );
  return NextResponse.json({ id: rows[0].id, status: 'pending' }, { status: 201 });
}
