import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';

export async function GET() {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const result = await pool.query(
    `SELECT u.id, u.email, u.role, u.newsroom_id, u.last_login_at,
            n.name AS newsroom_name, n.country AS newsroom_country
     FROM users u
     JOIN newsrooms n ON n.id = u.newsroom_id
     WHERE u.id = $1 AND u.is_active = TRUE`,
    [session.userId]
  );

  if (result.rowCount === 0) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  return NextResponse.json(result.rows[0]);
}
