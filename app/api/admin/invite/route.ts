// POST /api/admin/invite
//
// Admin-only. Creates a new user in the caller's own newsroom (cross-newsroom
// invites are intentionally not exposed). The newly-created user gets a
// generated temporary password which is returned ONCE to the inviting admin
// in the response — the admin shares it with the invitee out-of-band (over
// WhatsApp once that surface lands; for now manually).
//
// Body: { email, whatsapp_number?, display_name?, role: 'builder' | 'user' | 'admin' }
// Response (201): { user, temp_password }
// Response (4xx): { error }

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';
import { hashPassword } from '@/lib/auth';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const E164_RE = /^\+[1-9]\d{6,14}$/;
const VALID_ROLES = new Set(['builder', 'user', 'admin']);

function generateTempPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = new Uint8Array(14);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += chars[bytes[i] % chars.length];
  return out;
}

export async function POST(req: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — admin role required' }, { status: 403 });
  }

  let body: {
    email?: string;
    whatsapp_number?: string;
    display_name?: string;
    role?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  const role = body.role?.trim();
  const whatsapp = body.whatsapp_number?.trim() || null;
  const displayName = body.display_name?.trim() || null;

  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'Valid email required' }, { status: 400 });
  }
  if (!role || !VALID_ROLES.has(role)) {
    return NextResponse.json({ error: 'role must be builder, user, or admin' }, { status: 400 });
  }
  if (whatsapp && !E164_RE.test(whatsapp)) {
    return NextResponse.json(
      { error: 'whatsapp_number must be in E.164 format (e.g. +260977123456)' },
      { status: 400 }
    );
  }

  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);

  try {
    const { rows } = await pool.query(
      `INSERT INTO users (newsroom_id, email, password_hash, role, whatsapp_number, display_name)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, newsroom_id, email, role, whatsapp_number, display_name, is_active, created_at`,
      [session.newsroomId, email, passwordHash, role, whatsapp, displayName]
    );

    await pool.query(
      `INSERT INTO audit_log (newsroom_id, user_id, event_type, payload)
       VALUES ($1, $2, 'user.invited', $3)`,
      [
        session.newsroomId,
        session.userId,
        JSON.stringify({ invited_user_id: rows[0].id, email, role, has_whatsapp: !!whatsapp }),
      ]
    );

    return NextResponse.json({ user: rows[0], temp_password: tempPassword }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message.includes('users_newsroom_id_email_key')) {
      return NextResponse.json(
        { error: 'A user with that email already exists in this newsroom' },
        { status: 409 }
      );
    }
    if (message.includes('users_whatsapp_number_key')) {
      return NextResponse.json(
        { error: 'That WhatsApp number is already in use' },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
