// /api/social/networks — list (auto-seeds defaults) + POST add

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';
const { listNetworks } = require('@/lib/social/networks');

const ALIGNMENTS = ['state_russia', 'state_china', 'state_other', 'cib_network', 'extremist'];

export async function GET(req: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const url = new URL(req.url);
  const africaOnly = url.searchParams.get('africa_only') === '1';
  const networks = await listNetworks(session.newsroomId, { africaOnly });
  return NextResponse.json({ networks });
}

export async function POST(req: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (session.role !== 'builder' && session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — builder role required' }, { status: 403 });
  }
  let body: {
    name?: string; aliases?: string[];
    attributed_to?: string; attribution_country?: string;
    description?: string; alignment?: string;
    confidence?: number; targets_africa?: boolean;
    known_handles?: string[]; known_domains?: string[];
    known_phrases?: string[]; pattern_notes?: string[];
    public_reports?: Array<Record<string, unknown>>;
  };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  if (!body.name?.trim()) return NextResponse.json({ error: 'name is required' }, { status: 400 });
  const align = body.alignment && ALIGNMENTS.includes(body.alignment) ? body.alignment : 'cib_network';
  const conf = Number.isFinite(body.confidence as number)
    ? Math.max(0, Math.min(1, body.confidence as number))
    : null;
  try {
    const { rows } = await pool.query(
      `INSERT INTO social_known_networks
         (newsroom_id, added_by, name, aliases, attributed_to, attribution_country,
          description, alignment, confidence, targets_africa,
          known_handles, known_domains, known_phrases, pattern_notes,
          public_reports, source, is_default)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb, 'manual', FALSE)
       RETURNING *`,
      [
        session.newsroomId, session.userId,
        body.name.trim(),
        Array.isArray(body.aliases) ? body.aliases : [],
        body.attributed_to?.trim() || null,
        body.attribution_country?.trim()?.toUpperCase() || null,
        body.description?.trim() || null,
        align,
        conf,
        !!body.targets_africa,
        Array.isArray(body.known_handles) ? body.known_handles : [],
        Array.isArray(body.known_domains) ? body.known_domains : [],
        Array.isArray(body.known_phrases) ? body.known_phrases : [],
        Array.isArray(body.pattern_notes) ? body.pattern_notes : [],
        JSON.stringify(Array.isArray(body.public_reports) ? body.public_reports : []),
      ]
    );
    return NextResponse.json({ network: rows[0] }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('unique')) {
      return NextResponse.json({ error: 'A network with that name already exists.' }, { status: 409 });
    }
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
