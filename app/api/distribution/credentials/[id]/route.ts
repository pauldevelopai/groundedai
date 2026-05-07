// /api/distribution/credentials/:id — PATCH (re-encrypts on secrets change) + DELETE
//
// Plaintext credentials are NEVER returned. PATCHing the label / status /
// display_metadata is allowed for any builder; PATCHing secrets is admin-only
// because that means decrypting + re-encrypting and we want a tighter audit
// surface around that.

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';
const { encryptJson } = require('@/lib/distribution/crypto');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES = ['active', 'revoked', 'expired'];

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (session.role !== 'builder' && session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — builder role required' }, { status: 403 });
  }
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  const exist = await pool.query(`SELECT id, newsroom_id FROM distribution_credentials WHERE id = $1`, [id]);
  if (exist.rows.length === 0 || exist.rows[0].newsroom_id !== session.newsroomId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  let body: {
    label?: string; status?: string;
    display_metadata?: Record<string, unknown>;
    secrets?: Record<string, unknown>;
    expires_at?: string | null;
  };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const updates: string[] = [];
  const values: unknown[] = [];
  if (typeof body.label === 'string') {
    if (!body.label.trim()) return NextResponse.json({ error: 'label cannot be empty' }, { status: 400 });
    values.push(body.label.trim()); updates.push(`label = $${values.length}`);
  }
  if (typeof body.status === 'string') {
    if (!STATUSES.includes(body.status)) return NextResponse.json({ error: `status must be one of ${STATUSES.join(', ')}` }, { status: 400 });
    values.push(body.status); updates.push(`status = $${values.length}`);
  }
  if (body.display_metadata && typeof body.display_metadata === 'object') {
    values.push(JSON.stringify(body.display_metadata)); updates.push(`display_metadata = $${values.length}::jsonb`);
  }
  if ('expires_at' in body) {
    values.push(body.expires_at || null); updates.push(`expires_at = $${values.length}`);
  }
  if (body.secrets && typeof body.secrets === 'object' && !Array.isArray(body.secrets)) {
    if (session.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden — only admins can update secrets' }, { status: 403 });
    }
    const enc = encryptJson(body.secrets);
    values.push(enc.ciphertext); updates.push(`ciphertext = $${values.length}`);
    values.push(enc.iv); updates.push(`iv = $${values.length}`);
    values.push(enc.auth_tag); updates.push(`auth_tag = $${values.length}`);
  }
  if (updates.length === 0) return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  updates.push(`updated_at = NOW()`);
  values.push(id);

  const { rows } = await pool.query(
    `UPDATE distribution_credentials SET ${updates.join(', ')} WHERE id = $${values.length}
     RETURNING id, label, channel_kind, display_metadata, status, last_used_at, expires_at, updated_at`,
    values
  );
  return NextResponse.json({ credential: rows[0] });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — admin role required' }, { status: 403 });
  }
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  const exist = await pool.query(`SELECT id, newsroom_id FROM distribution_credentials WHERE id = $1`, [id]);
  if (exist.rows.length === 0 || exist.rows[0].newsroom_id !== session.newsroomId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  await pool.query(`DELETE FROM distribution_credentials WHERE id = $1`, [id]);
  return NextResponse.json({ ok: true });
}
