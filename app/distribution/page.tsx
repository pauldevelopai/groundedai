// /distribution — Distributor workspace. Five regions on one screen:
// inbound queue, channels (with credentials), outbound sends, corrections,
// and Distributor agent briefs at the top.

import { redirect } from 'next/navigation';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';
import DistributionWorkspace from './DistributionWorkspace';
const inb = require('@/lib/distribution/inbound');
const ch = require('@/lib/distribution/channels');
const corr = require('@/lib/distribution/corrections');

export default async function DistributionPage() {
  const session = await getCurrentSession();
  if (!session) redirect('/login?next=/distribution');

  const [submissions, credentials, channels, sendsRes, corrections, briefsRes, productionsRes] = await Promise.all([
    inb.listSubmissions(session.newsroomId),
    ch.listCredentials(session.newsroomId),
    ch.listChannels(session.newsroomId),
    pool.query(
      `SELECT s.id, s.channel_id, c.name AS channel_name, c.channel_kind,
              s.source_kind, s.source_id, s.source_calendar_id,
              s.status, s.external_id, s.permalink, s.scheduled_for, s.dispatched_at, s.error,
              s.created_at, s.updated_at
         FROM distribution_sends s
         JOIN distribution_channels c ON c.id = s.channel_id
        WHERE s.newsroom_id = $1
        ORDER BY s.created_at DESC LIMIT 40`,
      [session.newsroomId]
    ),
    corr.listCorrections(session.newsroomId),
    pool.query(
      `SELECT id, title, kind, status, inbound_id, send_id, correction_id,
              source_kind, source_id, duration_ms, cost_usd, error,
              created_at, updated_at
         FROM distributor_briefs
        WHERE newsroom_id = $1
        ORDER BY created_at DESC LIMIT 30`,
      [session.newsroomId]
    ),
    pool.query(
      `SELECT id, title, format, status FROM producer_productions
        WHERE newsroom_id = $1 AND status IN ('generated', 'edited', 'approved', 'published')
        ORDER BY updated_at DESC LIMIT 30`,
      [session.newsroomId]
    ),
  ]);

  const canEdit = session.role === 'builder' || session.role === 'admin';
  const isAdmin = session.role === 'admin';

  return (
    <DistributionWorkspace
      initialSubmissions={submissions}
      initialCredentials={credentials}
      initialChannels={channels}
      initialSends={sendsRes.rows}
      initialCorrections={corrections}
      initialBriefs={briefsRes.rows}
      productions={productionsRes.rows}
      canEdit={canEdit}
      isAdmin={isAdmin}
      role={session.role}
    />
  );
}
