// /api/distribution/credentials — list (metadata only) + POST add (encrypts).

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';
const { listCredentials } = require('@/lib/distribution/channels');
const { encryptJson } = require('@/lib/distribution/crypto');

const CHANNEL_KINDS = [
  'twitter', 'fb', 'instagram', 'linkedin', 'threads',
  'wordpress', 'ghost', 'custom_cms',
  'whatsapp_business', 'whatsapp_channel',
  'email_smtp', 'newsletter',
];

export async function GET() {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const credentials = await listCredentials(session.newsroomId);
  return NextResponse.json({ credentials });
}

export async function POST(req: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  // admin-only — credentials are sensitive.
  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — admin role required' }, { status: 403 });
  }

  let body: {
    label?: string;
    channel_kind?: string;
    secrets?: Record<string, unknown>;
    display_metadata?: Record<string, unknown>;
    expires_at?: string;
  };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  if (!body.label?.trim()) return NextResponse.json({ error: 'label is required' }, { status: 400 });
  if (!body.channel_kind || !CHANNEL_KINDS.includes(body.channel_kind)) {
    return NextResponse.json({ error: `channel_kind must be one of ${CHANNEL_KINDS.join(', ')}` }, { status: 400 });
  }
  if (!body.secrets || typeof body.secrets !== 'object' || Array.isArray(body.secrets)) {
    return NextResponse.json({ error: 'secrets must be a non-empty object' }, { status: 400 });
  }
  if (Object.keys(body.secrets).length === 0) {
    return NextResponse.json({ error: 'secrets must contain at least one field' }, { status: 400 });
  }

  const enc = encryptJson(body.secrets);
  const { rows } = await pool.query(
    `INSERT INTO distribution_credentials
       (newsroom_id, added_by, label, channel_kind,
        ciphertext, iv, auth_tag, cipher_version,
        display_metadata, expires_at, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 1, $8::jsonb, $9, 'active')
     RETURNING id, label, channel_kind, display_metadata, status, last_used_at, expires_at, created_at, updated_at`,
    [
      session.newsroomId, session.userId, body.label.trim(), body.channel_kind,
      enc.ciphertext, enc.iv, enc.auth_tag,
      JSON.stringify(body.display_metadata || {}),
      body.expires_at || null,
    ]
  );
  return NextResponse.json({ credential: rows[0] }, { status: 201 });
}
