// /api/social/signals — list + POST ingest (with structural analysis attached).
//
// Three POST flavours:
//   { raw_text, post_url?, ... }                                — single signal
//   { signals: [{...}, {...}] }                                  — bulk import
//   csv_text via /api/social/signals?format=csv (text/csv body) — CSV bulk import
// All call analyseSignal under the hood so language detection + NER +
// source-reputation match are populated immediately.

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';
const { analyseSignal, extractDomain } = require('@/lib/social/analyze');
const { listKeywords, matchKeywords } = require('@/lib/social/keywords');

const PLATFORMS = ['facebook', 'twitter', 'instagram', 'tiktok', 'telegram', 'whatsapp', 'web', 'other'];
const INGESTION_KINDS = ['manual', 'webhook', 'csv'];

export async function GET(req: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const url = new URL(req.url);
  const status = url.searchParams.get('status');
  const platform = url.searchParams.get('platform');
  const params: unknown[] = [session.newsroomId];
  let where = 'newsroom_id = $1';
  if (status) { params.push(status); where += ` AND status = $${params.length}`; }
  if (platform) { params.push(platform); where += ` AND platform = $${params.length}`; }
  const { rows } = await pool.query(
    `SELECT id, ingestion_kind, platform, post_url, author_handle, author_display_name,
            author_metadata, source_domain, raw_text, posted_at, matched_keywords,
            analysis, status, flagged_at, notes, created_at, updated_at
       FROM social_signals
      WHERE ${where}
      ORDER BY
        CASE status WHEN 'flagged' THEN 0 WHEN 'new' THEN 1 WHEN 'analysed' THEN 2 ELSE 3 END,
        created_at DESC
      LIMIT 100`,
    params
  );
  return NextResponse.json({ signals: rows });
}

export async function POST(req: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  let body: {
    raw_text?: string; post_url?: string;
    author_handle?: string; author_display_name?: string;
    author_metadata?: Record<string, unknown>;
    posted_at?: string;
    platform?: string;
    ingestion_kind?: string;
    signals?: Array<{
      raw_text?: string; post_url?: string;
      author_handle?: string; author_display_name?: string;
      author_metadata?: Record<string, unknown>;
      posted_at?: string; platform?: string;
    }>;
  };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  // Bulk import path
  if (Array.isArray(body.signals)) {
    if (body.signals.length === 0) return NextResponse.json({ error: 'signals array is empty' }, { status: 400 });
    if (body.signals.length > 200) return NextResponse.json({ error: 'max 200 signals per request' }, { status: 413 });
    const ingested: unknown[] = [];
    const errors: { i: number; error: string }[] = [];
    const keywords = await listKeywords(session.newsroomId, { status: 'active' }).catch(() => []);
    for (let i = 0; i < body.signals.length; i++) {
      try {
        const s = body.signals[i];
        const row = await ingestOne(session.newsroomId, session.userId, body.ingestion_kind || 'webhook', s, keywords);
        ingested.push({ id: row.id, post_url: row.post_url });
      } catch (err) {
        errors.push({ i, error: err instanceof Error ? err.message : String(err) });
      }
    }
    return NextResponse.json({ ingested_count: ingested.length, error_count: errors.length, ingested, errors }, { status: 201 });
  }

  // Single-signal path
  if (!body.raw_text || !body.raw_text.trim()) {
    return NextResponse.json({ error: 'raw_text is required' }, { status: 400 });
  }
  const keywords = await listKeywords(session.newsroomId, { status: 'active' }).catch(() => []);
  const row = await ingestOne(session.newsroomId, session.userId, body.ingestion_kind || 'manual', body, keywords);
  return NextResponse.json({ signal: row }, { status: 201 });
}

type IngestInput = {
  raw_text?: string; post_url?: string;
  author_handle?: string; author_display_name?: string;
  author_metadata?: Record<string, unknown>;
  posted_at?: string; platform?: string;
};
type KeywordRow = { id: string; status: string; term: string; match_kind: string };

async function ingestOne(newsroomId: string, userId: string, ingestionKind: string, s: IngestInput, keywords: KeywordRow[]) {
  const platform = s.platform && PLATFORMS.includes(s.platform) ? s.platform : 'facebook';
  const ik = INGESTION_KINDS.includes(ingestionKind) ? ingestionKind : 'manual';

  const analysis = await analyseSignal({
    text: s.raw_text || '',
    postUrl: s.post_url,
    authorHandle: s.author_handle,
    newsroomId,
  });
  const entityNames = analysis.entity_names || [];
  const matched = matchKeywords(keywords, s.raw_text || '', entityNames);
  const matchedIds = matched.map((k: KeywordRow) => k.id);

  const sourceDomain = extractDomain(s.post_url) || null;

  const { rows } = await pool.query(
    `INSERT INTO social_signals
       (newsroom_id, ingested_by, ingestion_kind, platform,
        post_url, author_handle, author_display_name, author_metadata,
        source_domain, raw_text, posted_at, matched_keywords,
        analysis, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12::uuid[], $13::jsonb, 'analysed')
     RETURNING *`,
    [
      newsroomId, userId, ik, platform,
      s.post_url || null,
      s.author_handle || null,
      s.author_display_name || null,
      JSON.stringify(s.author_metadata || {}),
      sourceDomain,
      s.raw_text || '',
      s.posted_at || null,
      matchedIds,
      JSON.stringify(analysis),
    ]
  );
  return rows[0];
}
