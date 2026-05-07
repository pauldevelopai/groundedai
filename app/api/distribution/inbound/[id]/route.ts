// /api/distribution/inbound/:id — PATCH (status / classification / routing) + DELETE
//
// On PATCH we accept a `route_action` shortcut for the editor-confirmed
// material side effects:
//   route_action: 'create_contributor' — promotes the sender into
//                                        community_contributors (if not
//                                        already present), and links the
//                                        submission via routed_to_contributor_id.
//   route_action: 'create_calendar_idea' — creates an editorial_calendar
//                                          row in 'idea' status referencing
//                                          this submission via notes.
//   route_action: 'archive' / 'spam' — sets status accordingly.
// These are intentionally explicit so the agent's suggestions never
// auto-apply silently.

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES = ['new', 'in_triage', 'routed', 'archived', 'spam', 'duplicate'];
const CLASSIFICATIONS = ['news_tip', 'contributor_signup', 'correction', 'feedback', 'spam', 'unrelated'];
const ROUTE_ACTIONS = ['create_contributor', 'create_calendar_idea', 'archive', 'spam'];

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  const { rows } = await pool.query(
    `SELECT * FROM inbound_submissions WHERE id = $1 AND newsroom_id = $2`,
    [id, session.newsroomId]
  );
  if (rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ submission: rows[0] });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (session.role !== 'builder' && session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — builder role required' }, { status: 403 });
  }
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const exist = await pool.query(`SELECT * FROM inbound_submissions WHERE id = $1`, [id]);
  if (exist.rows.length === 0 || exist.rows[0].newsroom_id !== session.newsroomId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const submission = exist.rows[0];

  let body: { status?: string; classification?: string; notes?: string; route_action?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  // Apply route_action first (each action implies a status change too).
  if (body.route_action) {
    if (!ROUTE_ACTIONS.includes(body.route_action)) {
      return NextResponse.json({ error: `route_action must be one of ${ROUTE_ACTIONS.join(', ')}` }, { status: 400 });
    }
    if (body.route_action === 'create_contributor') {
      // Idempotent: re-use an existing contributor with the same contact.
      let contribId: string | null = null;
      if (submission.sender_contact) {
        const f = await pool.query(
          `SELECT id FROM community_contributors WHERE newsroom_id = $1 AND contact = $2 LIMIT 1`,
          [session.newsroomId, submission.sender_contact]
        );
        if (f.rows[0]) contribId = f.rows[0].id;
      }
      if (!contribId) {
        const ins = await pool.query(
          `INSERT INTO community_contributors
             (newsroom_id, added_by, name, contact, contact_kind, vetting_status,
              submissions_count, last_submission_at)
           VALUES ($1, $2, $3, $4, $5, 'in_review', 1, NOW())
           RETURNING id`,
          [
            session.newsroomId, session.userId,
            submission.sender_name || 'Unknown contributor',
            submission.sender_contact, submission.source,
          ]
        );
        contribId = ins.rows[0].id;
      } else {
        // Bump submission counter
        await pool.query(
          `UPDATE community_contributors
              SET submissions_count = submissions_count + 1,
                  last_submission_at = NOW(),
                  updated_at = NOW()
            WHERE id = $1`,
          [contribId]
        );
      }
      await pool.query(
        `UPDATE inbound_submissions
            SET status = 'routed', routed_to_contributor_id = $2,
                routed_at = NOW(), routed_by = $3, updated_at = NOW()
          WHERE id = $1`,
        [id, contribId, session.userId]
      );
    } else if (body.route_action === 'create_calendar_idea') {
      const calIns = await pool.query(
        `INSERT INTO editorial_calendar
           (newsroom_id, created_by, title, summary, status, notes)
         VALUES ($1, $2, $3, $4, 'idea', $5)
         RETURNING id`,
        [
          session.newsroomId, session.userId,
          (submission.subject || submission.body.slice(0, 80) || 'Story idea from inbound').slice(0, 200),
          submission.body || null,
          `Sourced from inbound submission ${id} (${submission.source}, ${submission.sender_name || submission.sender_contact || 'anonymous'})`,
        ]
      );
      await pool.query(
        `UPDATE inbound_submissions
            SET status = 'routed', routed_to_calendar_id = $2,
                routed_at = NOW(), routed_by = $3, updated_at = NOW()
          WHERE id = $1`,
        [id, calIns.rows[0].id, session.userId]
      );
    } else if (body.route_action === 'archive') {
      await pool.query(`UPDATE inbound_submissions SET status = 'archived', updated_at = NOW() WHERE id = $1`, [id]);
    } else if (body.route_action === 'spam') {
      await pool.query(`UPDATE inbound_submissions SET status = 'spam', updated_at = NOW() WHERE id = $1`, [id]);
    }
    const final = await pool.query(`SELECT * FROM inbound_submissions WHERE id = $1`, [id]);
    return NextResponse.json({ submission: final.rows[0] });
  }

  // Plain field updates
  const updates: string[] = [];
  const values: unknown[] = [];
  if (typeof body.status === 'string') {
    if (!STATUSES.includes(body.status)) return NextResponse.json({ error: `status must be one of ${STATUSES.join(', ')}` }, { status: 400 });
    values.push(body.status); updates.push(`status = $${values.length}`);
  }
  if ('classification' in body) {
    if (body.classification !== null && !CLASSIFICATIONS.includes(String(body.classification))) {
      return NextResponse.json({ error: `classification must be one of ${CLASSIFICATIONS.join(', ')} or null` }, { status: 400 });
    }
    values.push(body.classification); updates.push(`classification = $${values.length}`);
  }
  if (typeof body.notes === 'string') { values.push(body.notes); updates.push(`notes = $${values.length}`); }
  if (updates.length === 0) return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  updates.push(`updated_at = NOW()`);
  values.push(id);
  const { rows } = await pool.query(
    `UPDATE inbound_submissions SET ${updates.join(', ')} WHERE id = $${values.length} RETURNING *`,
    values
  );
  return NextResponse.json({ submission: rows[0] });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (session.role !== 'builder' && session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — builder role required' }, { status: 403 });
  }
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  const exist = await pool.query(`SELECT id, newsroom_id FROM inbound_submissions WHERE id = $1`, [id]);
  if (exist.rows.length === 0 || exist.rows[0].newsroom_id !== session.newsroomId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  await pool.query(`DELETE FROM inbound_submissions WHERE id = $1`, [id]);
  return NextResponse.json({ ok: true });
}
