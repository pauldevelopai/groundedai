// /api/fundraiser/funders — list (auto-seeds defaults on first call) + create

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';
const { listFunders } = require('@/lib/fundraiser/funders');

export async function GET() {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const funders = await listFunders(session.newsroomId);
  return NextResponse.json({ funders });
}

export async function POST(req: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (session.role !== 'builder' && session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — builder role required' }, { status: 403 });
  }

  let body: {
    name?: string;
    type?: string;
    description?: string;
    focus_areas?: string[];
    geography?: string[];
    typical_grant_range?: string;
    application_url?: string;
    application_structure?: unknown[];
    deadlines?: unknown[];
    notes?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!body.name?.trim()) return NextResponse.json({ error: 'name is required' }, { status: 400 });

  const validTypes = ['foundation', 'government', 'corporate', 'individual', 'cohort_pool', 'other'];
  const type = body.type && validTypes.includes(body.type) ? body.type : 'foundation';

  const { rows } = await pool.query(
    `INSERT INTO funders
       (newsroom_id, created_by, name, type, description, focus_areas, geography,
        typical_grant_range, application_url, application_structure, deadlines, notes,
        source, is_default)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12, 'manual', FALSE)
     RETURNING *`,
    [
      session.newsroomId,
      session.userId,
      body.name.trim(),
      type,
      body.description?.trim() || null,
      Array.isArray(body.focus_areas) ? body.focus_areas : [],
      Array.isArray(body.geography) ? body.geography : [],
      body.typical_grant_range?.trim() || null,
      body.application_url?.trim() || null,
      JSON.stringify(Array.isArray(body.application_structure) ? body.application_structure : []),
      JSON.stringify(Array.isArray(body.deadlines) ? body.deadlines : []),
      body.notes?.trim() || null,
    ]
  );
  return NextResponse.json({ funder: rows[0] }, { status: 201 });
}
