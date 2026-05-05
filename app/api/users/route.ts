// GET /api/users
//
// Lists active users in the caller's own newsroom. Used by the Builder's
// member-assignment picker. Cross-newsroom enumeration is intentionally
// not exposed.

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';

export async function GET() {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { rows } = await pool.query(
    `SELECT id, email, role, last_login_at
       FROM users
      WHERE newsroom_id = $1 AND is_active = TRUE
      ORDER BY email`,
    [session.newsroomId]
  );

  return NextResponse.json({ users: rows });
}
