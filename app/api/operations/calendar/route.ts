// /api/operations/calendar — list (with hydrated assignee names) + POST add.

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';
const { listAll } = require('@/lib/operations/calendar');

export async function GET() {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const items = await listAll(session.newsroomId, { limit: 100 });
  return NextResponse.json({ items });
}

const ALLOWED_PRIORITIES = ['low', 'normal', 'high', 'urgent'];
const ALLOWED_STATUSES = ['idea', 'commissioned', 'in_progress', 'in_review', 'scheduled', 'published', 'killed'];

export async function POST(req: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (session.role !== 'builder' && session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — builder role required' }, { status: 403 });
  }
  let body: {
    title?: string; summary?: string; beat?: string; format?: string;
    priority?: string; status?: string;
    assigned_user_id?: string; assigned_freelancer_id?: string; assigned_contributor_id?: string;
    deadline_at?: string | null; scheduled_publish_at?: string | null;
    notes?: string;
  };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  if (!body.title?.trim()) return NextResponse.json({ error: 'title is required' }, { status: 400 });

  const priority = body.priority && ALLOWED_PRIORITIES.includes(body.priority) ? body.priority : 'normal';
  const status = body.status && ALLOWED_STATUSES.includes(body.status) ? body.status : 'idea';

  const { rows } = await pool.query(
    `INSERT INTO editorial_calendar
       (newsroom_id, created_by, title, summary, beat, format, priority, status,
        assigned_user_id, assigned_freelancer_id, assigned_contributor_id,
        deadline_at, scheduled_publish_at, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     RETURNING *`,
    [
      session.newsroomId, session.userId,
      body.title.trim(), body.summary?.trim() || null,
      body.beat?.trim() || null, body.format?.trim() || null,
      priority, status,
      body.assigned_user_id || null,
      body.assigned_freelancer_id || null,
      body.assigned_contributor_id || null,
      body.deadline_at || null, body.scheduled_publish_at || null,
      body.notes?.trim() || null,
    ]
  );
  return NextResponse.json({ item: rows[0] }, { status: 201 });
}
