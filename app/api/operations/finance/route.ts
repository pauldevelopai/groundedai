// /api/operations/finance — list entries (+ aggregate totals) + POST entry.

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';
const { listEntries, totals } = require('@/lib/operations/finance');

const DIRECTIONS = ['income', 'expense'];
const STATUSES = ['recorded', 'pending', 'paid', 'reconciled', 'cancelled'];

export async function GET(req: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const url = new URL(req.url);
  const direction = url.searchParams.get('direction') || undefined;
  const [entries, totalsRows] = await Promise.all([
    listEntries(session.newsroomId, { direction }),
    totals(session.newsroomId, { sinceDays: 90 }),
  ]);
  return NextResponse.json({ entries, totals: totalsRows });
}

export async function POST(req: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (session.role !== 'builder' && session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — builder role required' }, { status: 403 });
  }
  let body: {
    occurred_on?: string; direction?: string; category?: string; description?: string;
    amount_cents?: number; currency?: string; status?: string; notes?: string;
    freelancer_id?: string; contributor_id?: string; calendar_id?: string; funder_id?: string;
  };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  if (!DIRECTIONS.includes(String(body.direction))) {
    return NextResponse.json({ error: `direction must be one of ${DIRECTIONS.join(', ')}` }, { status: 400 });
  }
  if (!body.category?.trim()) return NextResponse.json({ error: 'category is required' }, { status: 400 });
  if (!body.description?.trim()) return NextResponse.json({ error: 'description is required' }, { status: 400 });
  const amt = Number(body.amount_cents);
  if (!Number.isFinite(amt) || amt < 0) {
    return NextResponse.json({ error: 'amount_cents must be a non-negative integer' }, { status: 400 });
  }
  const status = body.status && STATUSES.includes(body.status) ? body.status : 'recorded';

  const { rows } = await pool.query(
    `INSERT INTO ops_finance_entries
       (newsroom_id, recorded_by, occurred_on, direction, category, description,
        amount_cents, currency, status, notes,
        freelancer_id, contributor_id, calendar_id, funder_id)
     VALUES ($1, $2, COALESCE($3::date, CURRENT_DATE), $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     RETURNING *`,
    [
      session.newsroomId, session.userId,
      body.occurred_on || null,
      body.direction,
      body.category.trim(),
      body.description.trim(),
      Math.round(amt),
      body.currency?.trim() || 'USD',
      status,
      body.notes?.trim() || null,
      body.freelancer_id || null,
      body.contributor_id || null,
      body.calendar_id || null,
      body.funder_id || null,
    ]
  );
  return NextResponse.json({ entry: rows[0] }, { status: 201 });
}
