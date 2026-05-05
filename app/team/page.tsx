// /team — admin-only team management. Invite team members by email and
// (optionally) WhatsApp number; the page returns the temporary password
// once on creation so the admin can share it out-of-band.

import { redirect } from 'next/navigation';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';
import TeamPageClient from './TeamPageClient';

export default async function TeamPage() {
  const session = await getCurrentSession();
  if (!session) redirect('/login?next=/team');
  if (session.role !== 'admin') {
    return (
      <main style={{ padding: 24, fontFamily: 'system-ui, sans-serif', maxWidth: 720, margin: '0 auto' }}>
        <h1>Team</h1>
        <p style={{ color: '#666' }}>This page is admin-only. Ask your newsroom admin to invite you.</p>
      </main>
    );
  }

  const { rows: users } = await pool.query(
    `SELECT id, email, role, whatsapp_number, display_name, last_login_at, created_at
       FROM users
      WHERE newsroom_id = $1 AND is_active = TRUE
      ORDER BY COALESCE(display_name, email)`,
    [session.newsroomId]
  );
  const { rows: nrRows } = await pool.query(`SELECT name FROM newsrooms WHERE id = $1`, [session.newsroomId]);

  return <TeamPageClient initialUsers={users} newsroomName={nrRows[0]?.name || 'Your newsroom'} />;
}
