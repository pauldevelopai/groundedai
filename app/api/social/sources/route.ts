// /api/social/sources — list (auto-seeds defaults) + POST add

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';
const { listSources } = require('@/lib/social/sources');

const ID_KINDS = ['domain', 'fb_page', 'twitter_handle', 'tg_channel', 'youtube_channel', 'other'];
const ALIGNMENTS = ['uncategorised', 'state_russia', 'state_china', 'state_other', 'cib_network', 'extremist', 'commercial', 'reputable'];

export async function GET() {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const sources = await listSources(session.newsroomId);
  return NextResponse.json({ sources });
}

export async function POST(req: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (session.role !== 'builder' && session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — builder role required' }, { status: 403 });
  }
  let body: { identifier?: string; identifier_kind?: string; display_name?: string; alignment?: string; alignment_confidence?: number; country?: string; notes?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  if (!body.identifier?.trim()) return NextResponse.json({ error: 'identifier is required' }, { status: 400 });
  const ik = body.identifier_kind && ID_KINDS.includes(body.identifier_kind) ? body.identifier_kind : 'domain';
  const align = body.alignment && ALIGNMENTS.includes(body.alignment) ? body.alignment : 'uncategorised';
  const conf = Number.isFinite(body.alignment_confidence as number)
    ? Math.max(0, Math.min(1, body.alignment_confidence as number))
    : null;
  try {
    const { rows } = await pool.query(
      `INSERT INTO social_sources
         (newsroom_id, identifier, identifier_kind, display_name, alignment, alignment_confidence, country, notes, source, is_default)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'manual', FALSE)
       RETURNING *`,
      [
        session.newsroomId,
        body.identifier.trim().toLowerCase(),
        ik,
        body.display_name?.trim() || null,
        align,
        conf,
        body.country?.trim()?.toUpperCase() || null,
        body.notes?.trim() || null,
      ]
    );
    return NextResponse.json({ source: rows[0] }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('unique')) {
      return NextResponse.json({ error: 'A source with that identifier already exists in your newsroom.' }, { status: 409 });
    }
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
