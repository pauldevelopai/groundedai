// /api/audience/personas — list (auto-seeds defaults on first call) + create

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';
const { listPersonas } = require('@/lib/audience/personas');

export async function GET() {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const personas = await listPersonas(session.newsroomId);
  return NextResponse.json({ personas });
}

export async function POST(req: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (session.role !== 'builder' && session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — builder role required' }, { status: 403 });
  }
  let body: {
    name?: string;
    archetype?: string;
    description?: string;
    age_range?: string;
    location?: string;
    languages?: string[];
    device?: string;
    reading_habits?: string;
    primary_platforms?: string[];
    trust_signals?: string;
    interests?: string[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!body.name?.trim()) return NextResponse.json({ error: 'name is required' }, { status: 400 });

  const { rows } = await pool.query(
    `INSERT INTO audience_personas
       (newsroom_id, created_by, name, archetype, description, age_range, location,
        languages, device, reading_habits, primary_platforms, trust_signals, interests, source, is_default)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'manual', FALSE)
     RETURNING *`,
    [
      session.newsroomId,
      session.userId,
      body.name.trim(),
      (body.archetype || 'custom').trim(),
      body.description?.trim() || null,
      body.age_range?.trim() || null,
      body.location?.trim() || null,
      Array.isArray(body.languages) ? body.languages : [],
      body.device?.trim() || null,
      body.reading_habits?.trim() || null,
      Array.isArray(body.primary_platforms) ? body.primary_platforms : [],
      body.trust_signals?.trim() || null,
      Array.isArray(body.interests) ? body.interests : [],
    ]
  );
  return NextResponse.json({ persona: rows[0] }, { status: 201 });
}
