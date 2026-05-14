// POST /api/appliances/:id/ping  — appliance heartbeat callback.
//
// V2 Step 6. The appliance posts here on startup + every N minutes so
// the central app knows it's reachable. The body is signed with the
// appliance's shared secret (same HMAC scheme as outbound dispatches).
//
// Body shape: { version?, ollama_models?: string[] }
//
// On success we bump last_seen_at + last_seen_version. No session cookie
// required — auth is the HMAC signature.

import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
const { decryptJson } = require('@/lib/distribution/crypto');
const { verifyRequest } = require('@/lib/appliance/sign');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const { rows } = await pool.query(
    `SELECT id, newsroom_id, signing_secret_ciphertext, signing_secret_iv, signing_secret_auth_tag
       FROM newsroom_appliances
      WHERE id = $1`,
    [id]
  );
  if (rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let secret;
  try {
    const decoded = decryptJson({
      ciphertext: rows[0].signing_secret_ciphertext,
      iv: rows[0].signing_secret_iv,
      auth_tag: rows[0].signing_secret_auth_tag,
    });
    secret = typeof decoded === 'string' ? decoded : decoded.secret;
  } catch {
    return NextResponse.json({ error: 'server-side secret corrupted' }, { status: 500 });
  }

  const bodyText = await req.text();
  const headers: Record<string, string> = {};
  req.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });

  const url = new URL(req.url);
  const verdict = verifyRequest({
    secret,
    method: 'POST',
    path: url.pathname,
    body: bodyText,
    headers,
  });
  if (!verdict.ok) {
    return NextResponse.json({ error: `signature check failed: ${verdict.reason}` }, { status: 401 });
  }

  let payload: { version?: string } = {};
  try { payload = bodyText ? JSON.parse(bodyText) : {}; }
  catch { /* tolerate empty body */ }

  await pool.query(
    `UPDATE newsroom_appliances
        SET last_seen_at = NOW(),
            last_seen_version = COALESCE($2, last_seen_version),
            updated_at = NOW()
      WHERE id = $1`,
    [id, payload.version || null]
  );

  return NextResponse.json({ ok: true, server_time: new Date().toISOString() });
}
