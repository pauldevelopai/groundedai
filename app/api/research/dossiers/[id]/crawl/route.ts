// POST /api/research/dossiers/:id/crawl — start a deep crawl into this dossier.
// Body: { homepageUrl: string, maxLinks?: number }
// Returns: { crawlJobId, status: 'pending' }
//
// Builder + admin only. The crawl runs async via pg-boss; the UI polls
// /api/research/crawl/:id/status for progress.

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';
const { enqueue } = require('@/lib/jobs/boss');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (session.role !== 'builder' && session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — builder role required' }, { status: 403 });
  }

  const { id: dossierId } = await ctx.params;
  if (!UUID_RE.test(dossierId)) return NextResponse.json({ error: 'Invalid dossier id' }, { status: 400 });

  // Tenant isolation
  const { rows: dosRows } = await pool.query(
    'SELECT id FROM research_dossiers WHERE id = $1 AND newsroom_id = $2',
    [dossierId, session.newsroomId]
  );
  if (dosRows.length === 0) return NextResponse.json({ error: 'Dossier not found' }, { status: 404 });

  let body: { homepageUrl?: string; maxLinks?: number };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const homepageUrl = (body.homepageUrl || '').trim();
  if (!homepageUrl) return NextResponse.json({ error: 'homepageUrl required' }, { status: 400 });
  try { new URL(homepageUrl); } catch { return NextResponse.json({ error: 'homepageUrl is not a valid URL' }, { status: 400 }); }

  const maxLinks = Number.isInteger(body.maxLinks) ? Math.max(1, Math.min(100, Number(body.maxLinks))) : null;

  // Insert pending row first so the UI can show it before the worker picks it up
  const { rows: [row] } = await pool.query(
    `INSERT INTO research_crawl_jobs
       (newsroom_id, dossier_id, started_by, homepage_url, rules, status)
     VALUES ($1, $2, $3, $4, $5::jsonb, 'pending')
     RETURNING id`,
    [session.newsroomId, dossierId, session.userId, homepageUrl,
     JSON.stringify(maxLinks ? { max_links_per_crawl: maxLinks } : {})]
  );
  const crawlJobId = row.id;

  // Enqueue the fan-out job
  await enqueue('research.crawl', {
    jobId: crawlJobId, newsroomId: session.newsroomId, homepageUrl,
  });

  return NextResponse.json({ crawlJobId, status: 'pending' }, { status: 201 });
}
