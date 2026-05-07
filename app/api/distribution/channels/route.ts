// /api/distribution/channels — list + POST add (links a credential).

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';
const { listChannels } = require('@/lib/distribution/channels');

const CHANNEL_KINDS = [
  'twitter', 'fb', 'instagram', 'linkedin', 'threads',
  'wordpress', 'ghost', 'custom_cms',
  'whatsapp_business', 'whatsapp_channel',
  'email_smtp', 'newsletter',
];

export async function GET() {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const channels = await listChannels(session.newsroomId);
  return NextResponse.json({ channels });
}

export async function POST(req: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (session.role !== 'builder' && session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — builder role required' }, { status: 403 });
  }

  let body: {
    name?: string; channel_kind?: string;
    credential_id?: string;
    external_handle?: string; external_url?: string;
    defaults?: Record<string, unknown>;
    notes?: string;
  };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  if (!body.name?.trim()) return NextResponse.json({ error: 'name is required' }, { status: 400 });
  if (!body.channel_kind || !CHANNEL_KINDS.includes(body.channel_kind)) {
    return NextResponse.json({ error: `channel_kind must be one of ${CHANNEL_KINDS.join(', ')}` }, { status: 400 });
  }

  // If credential_id supplied, verify it belongs to this newsroom + matches the kind.
  if (body.credential_id) {
    const cr = await pool.query(
      `SELECT channel_kind, newsroom_id FROM distribution_credentials WHERE id = $1`,
      [body.credential_id]
    );
    if (cr.rows.length === 0 || cr.rows[0].newsroom_id !== session.newsroomId) {
      return NextResponse.json({ error: 'credential_id not found in this newsroom' }, { status: 400 });
    }
    if (cr.rows[0].channel_kind !== body.channel_kind) {
      return NextResponse.json({ error: `credential channel_kind (${cr.rows[0].channel_kind}) must match channel kind` }, { status: 400 });
    }
  }

  const { rows } = await pool.query(
    `INSERT INTO distribution_channels
       (newsroom_id, credential_id, added_by, name, channel_kind,
        external_handle, external_url, defaults, status, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, 'active', $9)
     RETURNING *`,
    [
      session.newsroomId, body.credential_id || null, session.userId,
      body.name.trim(), body.channel_kind,
      body.external_handle?.trim() || null,
      body.external_url?.trim() || null,
      JSON.stringify(body.defaults || {}),
      body.notes?.trim() || null,
    ]
  );
  return NextResponse.json({ channel: rows[0] }, { status: 201 });
}
