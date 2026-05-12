// POST /api/research/scrape — fetch one URL, extract the article, return.
// Does not persist. Builder + admin only (scraping has cost, rate-limits the
// host, and we don't want random users hitting other people's servers from
// our IP).

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
const { scrapeUrl } = require('@/lib/research/scrape');

export async function POST(req: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (session.role !== 'builder' && session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — builder role required' }, { status: 403 });
  }

  let body: { url?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const url = (body.url || '').trim();
  if (!url) return NextResponse.json({ error: 'url required' }, { status: 400 });

  try {
    const result = await scrapeUrl(url, { newsroomId: session.newsroomId });
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Network / scrape errors are user-facing — 422 with the message
    return NextResponse.json({ error: msg }, { status: 422 });
  }
}
