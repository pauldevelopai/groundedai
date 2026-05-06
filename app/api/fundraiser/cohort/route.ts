// /api/fundraiser/cohort
//
// GET ?funder_id=...   — rank candidate partner newsrooms for a joint app to that funder.
//                        Pure read-only — does NOT persist.
// POST { funder_id, partner_newsroom_id }
//                      — materialise a candidate as a fundraiser_cohort_matches row.
// PATCH { id, status } — accept / decline a previously proposed match.

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';
const { rankCandidates, persistMatch } = require('@/lib/fundraiser/cohort');
const { loadFunder } = require('@/lib/fundraiser/funders');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const url = new URL(req.url);
  const funderId = url.searchParams.get('funder_id');
  if (!funderId || !UUID_RE.test(funderId)) {
    return NextResponse.json({ error: 'funder_id (uuid) is required' }, { status: 400 });
  }
  const funder = await loadFunder(session.newsroomId, funderId);
  if (!funder) return NextResponse.json({ error: 'Funder not found' }, { status: 404 });

  const { error, candidates } = await rankCandidates(session.newsroomId, funder, 5);
  if (error === 'no_anchor_profile') {
    return NextResponse.json({
      error: 'no_anchor_profile',
      message: 'Set up your newsroom profile first — cohort matching needs your beats, strengths, and geography to find partners.',
    }, { status: 400 });
  }

  // Hydrate any existing match rows for these candidates so the UI can show
  // "already proposed" / "accepted" without a second roundtrip.
  const partnerIds = candidates.map((c: { partnerNewsroomId: string }) => c.partnerNewsroomId);
  let existing: Record<string, { id: string; status: string }> = {};
  if (partnerIds.length > 0) {
    const ex = await pool.query(
      `SELECT id, partner_newsroom_id, status FROM fundraiser_cohort_matches
        WHERE anchor_newsroom_id = $1 AND funder_id = $2 AND partner_newsroom_id = ANY($3::uuid[])`,
      [session.newsroomId, funderId, partnerIds]
    );
    for (const row of ex.rows) {
      existing[row.partner_newsroom_id] = { id: row.id, status: row.status };
    }
  }

  return NextResponse.json({
    funder: { id: funder.id, name: funder.name },
    candidates: candidates.map((c: { partnerNewsroomId: string }) => ({
      ...c,
      existingMatch: existing[c.partnerNewsroomId] || null,
    })),
  });
}

export async function POST(req: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (session.role !== 'builder' && session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — builder role required' }, { status: 403 });
  }
  let body: { funder_id?: string; partner_newsroom_id?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  if (!body.funder_id || !UUID_RE.test(body.funder_id)) {
    return NextResponse.json({ error: 'funder_id is required' }, { status: 400 });
  }
  if (!body.partner_newsroom_id || !UUID_RE.test(body.partner_newsroom_id)) {
    return NextResponse.json({ error: 'partner_newsroom_id is required' }, { status: 400 });
  }
  if (body.partner_newsroom_id === session.newsroomId) {
    return NextResponse.json({ error: 'Cannot match a newsroom to itself' }, { status: 400 });
  }
  const funder = await loadFunder(session.newsroomId, body.funder_id);
  if (!funder) return NextResponse.json({ error: 'Funder not found' }, { status: 404 });

  const { candidates } = await rankCandidates(session.newsroomId, funder, 50);
  const candidate = candidates.find((c: { partnerNewsroomId: string }) => c.partnerNewsroomId === body.partner_newsroom_id);
  if (!candidate) return NextResponse.json({ error: 'Partner not in candidate set for this funder' }, { status: 400 });

  const result = await persistMatch(session.newsroomId, funder, candidate);
  return NextResponse.json({ match: result }, { status: result.created ? 201 : 200 });
}

export async function PATCH(req: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (session.role !== 'builder' && session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — builder role required' }, { status: 403 });
  }
  let body: { id?: string; status?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  if (!body.id || !UUID_RE.test(body.id)) return NextResponse.json({ error: 'id required' }, { status: 400 });
  if (!body.status || !['accepted', 'declined', 'expired'].includes(body.status)) {
    return NextResponse.json({ error: 'status must be accepted | declined | expired' }, { status: 400 });
  }
  const { rows } = await pool.query(
    `UPDATE fundraiser_cohort_matches
        SET status = $2, responded_by = $3, responded_at = NOW()
      WHERE id = $1 AND anchor_newsroom_id = $4
      RETURNING *`,
    [body.id, body.status, session.userId, session.newsroomId]
  );
  if (rows.length === 0) return NextResponse.json({ error: 'Match not found' }, { status: 404 });
  return NextResponse.json({ match: rows[0] });
}
