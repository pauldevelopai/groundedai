// GET /api/learning/use-cases   — list newsroom's own + cohort-shared
// POST /api/learning/use-cases   — submit a new use case for this newsroom
//
// V2 Step 3 — Use Cases tab on the Tracker. Newsrooms write up what
// happened when they used Grounded for X (positive / negative / mixed)
// and optionally share with the cohort.

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';

const VALID_OUTCOMES = new Set(['positive', 'negative', 'mixed']);
const MAX_TITLE = 200;
const MAX_SUMMARY = 5000;

export async function GET(req: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const url = new URL(req.url);
  const scope = url.searchParams.get('scope') || 'all'; // 'mine' | 'cohort' | 'all'

  let where = '';
  if (scope === 'mine') where = 'tuc.newsroom_id = $1';
  else if (scope === 'cohort') where = 'tuc.shared_with_cohort = TRUE AND tuc.newsroom_id <> $1';
  else where = '(tuc.newsroom_id = $1 OR tuc.shared_with_cohort = TRUE)';

  const { rows } = await pool.query(
    `SELECT tuc.id, tuc.newsroom_id, tuc.submitted_by_user_id,
            tuc.title, tuc.summary, tuc.outcome, tuc.agents_involved, tuc.tags,
            tuc.attachment_urls, tuc.shared_with_cohort, tuc.created_at, tuc.updated_at,
            n.name AS newsroom_name,
            u.email AS submitted_by_email
       FROM tracker_use_cases tuc
       JOIN newsrooms n ON n.id = tuc.newsroom_id
  LEFT JOIN users u ON u.id = tuc.submitted_by_user_id
      WHERE ${where}
   ORDER BY tuc.created_at DESC
      LIMIT 200`,
    [session.newsroomId]
  );
  // Non-own cohort-shared rows are anonymised at the API edge for privacy:
  // strip newsroom_name + submitted_by_email unless it's the caller's own.
  const list = rows.map((r: any) => {
    if (r.newsroom_id === session.newsroomId) return r;
    return { ...r, newsroom_name: null, submitted_by_email: null };
  });
  return NextResponse.json({ rows: list, scope });
}

export async function POST(req: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  let body: {
    title?: unknown; summary?: unknown; outcome?: unknown;
    agents_involved?: unknown; tags?: unknown; attachment_urls?: unknown;
    shared_with_cohort?: unknown;
  };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  if (typeof body.title !== 'string' || body.title.trim().length === 0) {
    return NextResponse.json({ error: 'title required' }, { status: 400 });
  }
  if (typeof body.summary !== 'string' || body.summary.trim().length === 0) {
    return NextResponse.json({ error: 'summary required' }, { status: 400 });
  }
  if (body.title.length > MAX_TITLE) {
    return NextResponse.json({ error: `title exceeds ${MAX_TITLE} chars` }, { status: 400 });
  }
  if (body.summary.length > MAX_SUMMARY) {
    return NextResponse.json({ error: `summary exceeds ${MAX_SUMMARY} chars` }, { status: 400 });
  }
  const outcome = typeof body.outcome === 'string' && VALID_OUTCOMES.has(body.outcome) ? body.outcome : 'positive';
  const agents = Array.isArray(body.agents_involved) ? body.agents_involved.filter((x): x is string => typeof x === 'string').slice(0, 20) : [];
  const tags = Array.isArray(body.tags) ? body.tags.filter((x): x is string => typeof x === 'string').slice(0, 20) : [];
  const urls = Array.isArray(body.attachment_urls) ? body.attachment_urls.filter((x): x is string => typeof x === 'string' && /^https?:\/\//.test(x)).slice(0, 10) : [];
  const shared = body.shared_with_cohort === true;

  const { rows } = await pool.query(
    `INSERT INTO tracker_use_cases
       (newsroom_id, submitted_by_user_id, title, summary, outcome,
        agents_involved, tags, attachment_urls, shared_with_cohort)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id, created_at`,
    [session.newsroomId, session.userId, body.title.trim(), body.summary.trim(),
     outcome, agents, tags, urls, shared]
  );
  return NextResponse.json({ id: rows[0].id, created_at: rows[0].created_at }, { status: 201 });
}
