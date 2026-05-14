// GET /api/appliances    — list (admin/builder) appliances for this newsroom
// POST /api/appliances   — register a new appliance (admin only)
//
// V2 Step 6. One appliance per newsroom for now (UNIQUE on
// newsroom_appliances.newsroom_id). Registering returns the freshly
// generated signing_secret ONCE so the admin can configure their
// appliance with it. The secret is then encrypted at rest via
// lib/distribution/crypto and unrecoverable thereafter.

import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';
const { encryptJson } = require('@/lib/distribution/crypto');

export async function GET(_req: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (session.role !== 'builder' && session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — builder or admin role required' }, { status: 403 });
  }

  const { rows } = await pool.query(
    `SELECT a.id, a.newsroom_id, a.display_name, a.dispatch_url, a.status,
            a.last_seen_at, a.last_seen_version, a.registered_at,
            u.email AS registered_by_email
       FROM newsroom_appliances a
  LEFT JOIN users u ON u.id = a.registered_by_user_id
      WHERE a.newsroom_id = $1
   ORDER BY a.registered_at DESC`,
    [session.newsroomId]
  );
  return NextResponse.json({ appliances: rows });
}

export async function POST(req: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Admin role required to register an appliance' }, { status: 403 });
  }

  let body: { display_name?: unknown; dispatch_url?: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  if (typeof body.display_name !== 'string' || body.display_name.trim().length === 0) {
    return NextResponse.json({ error: 'display_name required' }, { status: 400 });
  }
  if (typeof body.dispatch_url !== 'string' || !/^https?:\/\//i.test(body.dispatch_url)) {
    return NextResponse.json({ error: 'dispatch_url must be an http(s) URL' }, { status: 400 });
  }
  try { new URL(body.dispatch_url); }
  catch { return NextResponse.json({ error: 'dispatch_url is not a valid URL' }, { status: 400 }); }

  // Refuse if one already exists — V2 is one-per-newsroom.
  const existing = await pool.query(
    `SELECT id FROM newsroom_appliances WHERE newsroom_id = $1`,
    [session.newsroomId]
  );
  if (existing.rows.length > 0) {
    return NextResponse.json({
      error: 'Appliance already registered for this newsroom. Delete the existing one to re-register.',
      existing_id: existing.rows[0].id,
    }, { status: 409 });
  }

  // Generate a fresh 32-byte signing secret. Return it to the admin
  // ONCE; we only persist its AES-GCM ciphertext.
  const signingSecret = crypto.randomBytes(32).toString('base64');
  const enc = encryptJson(signingSecret);

  const { rows } = await pool.query(
    `INSERT INTO newsroom_appliances
       (newsroom_id, display_name, dispatch_url,
        signing_secret_ciphertext, signing_secret_iv, signing_secret_auth_tag,
        registered_by_user_id, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'active')
     RETURNING id, display_name, dispatch_url, status, registered_at`,
    [
      session.newsroomId, body.display_name.trim(), body.dispatch_url.trim(),
      enc.ciphertext, enc.iv, enc.auth_tag,
      session.userId,
    ]
  );

  return NextResponse.json({
    ...rows[0],
    signing_secret: signingSecret,
    warning: 'Copy this signing_secret now — it will not be shown again. Configure your appliance with it; the central app stores only an encrypted version.',
  }, { status: 201 });
}
