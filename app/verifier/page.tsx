// /verifier — Verifier workspace. Two regions:
//   1. Verification runs (recent verifications, new run form)
//   2. Credibility map (44-outlet default seed across SA/ZW/ZM/KE)

import { redirect } from 'next/navigation';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';
import VerifierWorkspace from './VerifierWorkspace';
const { listOutlets } = require('@/lib/verifier/outlets');

export default async function VerifierPage() {
  const session = await getCurrentSession();
  if (!session) redirect('/login?next=/verifier');

  const [runsRes, outlets] = await Promise.all([
    pool.query(
      `SELECT id, title, claim_text, source_kind, source_id,
              matched_outlet_findings, status, duration_ms, cost_usd, error,
              created_at, updated_at
         FROM verifier_runs WHERE newsroom_id = $1
        ORDER BY created_at DESC LIMIT 50`,
      [session.newsroomId]
    ),
    listOutlets(session.newsroomId),
  ]);

  const canEdit = session.role === 'builder' || session.role === 'admin';
  return (
    <VerifierWorkspace
      initialRuns={runsRes.rows}
      initialOutlets={outlets}
      canEdit={canEdit}
      role={session.role}
    />
  );
}
