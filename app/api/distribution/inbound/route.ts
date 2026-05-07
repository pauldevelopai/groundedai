// /api/distribution/inbound — list submissions + POST add (webhook-friendly).
//
// POST is intentionally permissive: any signed-in user can submit; this is
// also the endpoint webhooks (WhatsApp gateway, mail-to-API, web form
// proxy) will hit. Add API-key auth on a future per-newsroom basis if /
// when external webhooks need it without a session cookie.

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';
const { listSubmissions } = require('@/lib/distribution/inbound');

const SOURCES = ['web_form', 'whatsapp', 'email', 'sms', 'twitter', 'fb', 'manual', 'other'];
const STATUSES = ['new', 'in_triage', 'routed', 'archived', 'spam', 'duplicate'];

export async function GET(req: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const url = new URL(req.url);
  const status = url.searchParams.get('status') || undefined;
  const submissions = await listSubmissions(session.newsroomId, status ? { status } : {});
  return NextResponse.json({ submissions });
}

export async function POST(req: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  let body: {
    source?: string;
    sender_name?: string;
    sender_contact?: string;
    subject?: string;
    body?: string;
    attachments?: Array<{ filename?: string; storage_path?: string; mime?: string; bytes?: number }>;
  };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  if (!body.body && !body.subject) {
    return NextResponse.json({ error: 'subject or body is required' }, { status: 400 });
  }
  const source = body.source && SOURCES.includes(body.source) ? body.source : 'manual';

  const { rows } = await pool.query(
    `INSERT INTO inbound_submissions
       (newsroom_id, source, sender_name, sender_contact, subject, body, attachments, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, 'new')
     RETURNING *`,
    [
      session.newsroomId, source,
      body.sender_name?.trim() || null,
      body.sender_contact?.trim() || null,
      body.subject?.trim() || null,
      body.body || '',
      JSON.stringify(Array.isArray(body.attachments) ? body.attachments : []),
    ]
  );
  return NextResponse.json({ submission: rows[0] }, { status: 201 });
}

