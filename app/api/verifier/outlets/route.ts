// /api/verifier/outlets — list (auto-seeds 44 defaults across SA/ZW/ZM/KE) + POST add

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';
const { listOutlets } = require('@/lib/verifier/outlets');

const COUNTRIES = ['ZA', 'ZW', 'ZM', 'KE', 'other'];

export async function GET(req: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const url = new URL(req.url);
  const country = url.searchParams.get('country');
  const outlets = await listOutlets(session.newsroomId, country ? { country } : {});
  return NextResponse.json({ outlets });
}

export async function POST(req: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (session.role !== 'builder' && session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — builder role required' }, { status: 403 });
  }
  let body: {
    name?: string; country?: string; url?: string; alt_urls?: string[];
    ownership?: string; alignment_notes?: string;
    credibility_score?: number;
    beat_strengths?: string[]; beat_weaknesses?: string[]; known_issues?: string[];
    notes?: string; public_sources?: Array<Record<string, unknown>>;
  };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  if (!body.name?.trim()) return NextResponse.json({ error: 'name is required' }, { status: 400 });
  const country = body.country && COUNTRIES.includes(body.country) ? body.country : 'other';
  const score = Number.isFinite(body.credibility_score as number)
    ? Math.max(0, Math.min(1, body.credibility_score as number))
    : null;
  try {
    const { rows } = await pool.query(
      `INSERT INTO verifier_outlets
         (newsroom_id, added_by, name, country, url, alt_urls, ownership,
          alignment_notes, credibility_score, beat_strengths, beat_weaknesses,
          known_issues, notes, public_sources, source, is_default)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, 'manual', FALSE)
       RETURNING *`,
      [
        session.newsroomId, session.userId,
        body.name.trim(),
        country,
        body.url?.trim()?.toLowerCase() || null,
        Array.isArray(body.alt_urls) ? body.alt_urls : [],
        body.ownership?.trim() || null,
        body.alignment_notes?.trim() || null,
        score,
        Array.isArray(body.beat_strengths) ? body.beat_strengths : [],
        Array.isArray(body.beat_weaknesses) ? body.beat_weaknesses : [],
        Array.isArray(body.known_issues) ? body.known_issues : [],
        body.notes?.trim() || null,
        JSON.stringify(Array.isArray(body.public_sources) ? body.public_sources : []),
      ]
    );
    return NextResponse.json({ outlet: rows[0] }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('unique')) {
      return NextResponse.json({ error: 'An outlet with that URL already exists in your newsroom.' }, { status: 409 });
    }
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
