import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { verifyPassword, signToken, COOKIE_NAME } from '@/lib/auth';

const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: 60 * 60 * 24 * 7, // 7 days
  path: '/',
};

export async function POST(req: Request) {
  let body: { email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { email, password } = body;
  if (!email || !password) {
    return NextResponse.json({ error: 'email and password required' }, { status: 400 });
  }

  const result = await pool.query(
    `SELECT id, newsroom_id, password_hash, role, is_active
     FROM users WHERE email = $1`,
    [email.toLowerCase()]
  );

  // Generic error to prevent user enumeration. Same response for "no such user"
  // and "wrong password".
  const fail = () => NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });

  if (result.rowCount === 0) return fail();
  const user = result.rows[0];
  if (!user.is_active) return fail();

  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) return fail();

  await pool.query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

  const token = signToken({
    userId: user.id,
    newsroomId: user.newsroom_id,
    role: user.role,
  });

  const res = NextResponse.json({
    userId: user.id,
    newsroomId: user.newsroom_id,
    role: user.role,
  });
  res.cookies.set(COOKIE_NAME, token, COOKIE_OPTS);
  return res;
}
