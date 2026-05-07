// /api/operations/contributors — list + POST add.

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';
const { listContributors } = require('@/lib/operations/contributors');

const VETTING_STATES = ['unvetted', 'in_review', 'vetted', 'blocked'];
const PAYMENT_KINDS = ['unpaid', 'small_stipend', 'per_tip', 'per_piece'];

export async function GET(req: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const url = new URL(req.url);
  const vetting = url.searchParams.get('vetting');
  const rows = await listContributors(session.newsroomId, vetting ? { vetting } : {});
  return NextResponse.json({ contributors: rows });
}

export async function POST(req: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (session.role !== 'builder' && session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — builder role required' }, { status: 403 });
  }
  let body: {
    name?: string; contact?: string; contact_kind?: string; location?: string;
    vetting_status?: string; trust_score?: number; attribution_name?: string;
    payment_kind?: string; notes?: string;
  };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  if (!body.name?.trim()) return NextResponse.json({ error: 'name is required' }, { status: 400 });

  const vetting = body.vetting_status && VETTING_STATES.includes(body.vetting_status) ? body.vetting_status : 'unvetted';
  const payment = body.payment_kind && PAYMENT_KINDS.includes(body.payment_kind) ? body.payment_kind : 'unpaid';

  const { rows } = await pool.query(
    `INSERT INTO community_contributors
       (newsroom_id, added_by, name, contact, contact_kind, location,
        vetting_status, trust_score, attribution_name, payment_kind, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING *`,
    [
      session.newsroomId, session.userId,
      body.name.trim(),
      body.contact?.trim() || null,
      body.contact_kind?.trim() || null,
      body.location?.trim() || null,
      vetting,
      Number.isFinite(body.trust_score as number) ? body.trust_score : null,
      body.attribution_name?.trim() || null,
      payment,
      body.notes?.trim() || null,
    ]
  );
  return NextResponse.json({ contributor: rows[0] }, { status: 201 });
}
