// /api/operations/freelancers — list (with payable totals) + POST add.

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';
const { listFreelancers, outstandingPayments } = require('@/lib/operations/freelancers');

export async function GET(req: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const url = new URL(req.url);
  if (url.searchParams.get('with_payables') === '1') {
    const rows = await outstandingPayments(session.newsroomId);
    return NextResponse.json({ freelancers: rows });
  }
  const rows = await listFreelancers(session.newsroomId);
  return NextResponse.json({ freelancers: rows });
}

export async function POST(req: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (session.role !== 'builder' && session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — builder role required' }, { status: 403 });
  }
  let body: {
    name?: string; email?: string; phone?: string; city?: string; country?: string;
    beats?: string[]; languages?: string[];
    rate_per_piece_cents?: number; rate_per_word_cents?: number; preferred_currency?: string;
    status?: string; notes?: string;
  };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  if (!body.name?.trim()) return NextResponse.json({ error: 'name is required' }, { status: 400 });

  const status = body.status && ['active', 'paused', 'archived'].includes(body.status) ? body.status : 'active';

  const { rows } = await pool.query(
    `INSERT INTO freelancers
       (newsroom_id, added_by, name, email, phone, city, country,
        beats, languages, rate_per_piece_cents, rate_per_word_cents,
        preferred_currency, status, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     RETURNING *`,
    [
      session.newsroomId, session.userId,
      body.name.trim(),
      body.email?.trim() || null,
      body.phone?.trim() || null,
      body.city?.trim() || null,
      body.country?.trim() || null,
      Array.isArray(body.beats) ? body.beats : [],
      Array.isArray(body.languages) ? body.languages : [],
      Number.isFinite(body.rate_per_piece_cents as number) ? body.rate_per_piece_cents : null,
      Number.isFinite(body.rate_per_word_cents as number) ? body.rate_per_word_cents : null,
      body.preferred_currency?.trim() || 'USD',
      status,
      body.notes?.trim() || null,
    ]
  );
  return NextResponse.json({ freelancer: rows[0] }, { status: 201 });
}
