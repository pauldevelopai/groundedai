// /api/social/keywords — list + POST add

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';
const { listKeywords } = require('@/lib/social/keywords');

const MATCH_KINDS = ['phrase', 'regex', 'name'];
const SCOPES = ['all', 'facebook', 'twitter', 'instagram', 'tiktok', 'telegram', 'whatsapp', 'web', 'other'];
const SEVERITIES = ['low', 'medium', 'high', 'critical'];
const STATUSES = ['active', 'paused', 'archived'];

export async function GET() {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const keywords = await listKeywords(session.newsroomId);
  return NextResponse.json({ keywords });
}

export async function POST(req: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (session.role !== 'builder' && session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — builder role required' }, { status: 403 });
  }
  let body: { term?: string; match_kind?: string; scope?: string; severity_floor?: string; notes?: string; status?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  if (!body.term?.trim()) return NextResponse.json({ error: 'term is required' }, { status: 400 });

  const match_kind = body.match_kind && MATCH_KINDS.includes(body.match_kind) ? body.match_kind : 'phrase';
  const scope = body.scope && SCOPES.includes(body.scope) ? body.scope : 'all';
  const severity = body.severity_floor && SEVERITIES.includes(body.severity_floor) ? body.severity_floor : 'low';
  const status = body.status && STATUSES.includes(body.status) ? body.status : 'active';

  const { rows } = await pool.query(
    `INSERT INTO social_keywords
       (newsroom_id, added_by, term, match_kind, scope, severity_floor, notes, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [session.newsroomId, session.userId, body.term.trim(), match_kind, scope, severity, body.notes?.trim() || null, status]
  );
  return NextResponse.json({ keyword: rows[0] }, { status: 201 });
}
