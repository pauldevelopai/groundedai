// /api/translation/translations/:id/proposals/:proposalId
//
// POST { action: 'accept', source_term } — promote the proposal into a
//     translation_glossary row with source='edit_feedback'. The editor
//     supplies the source-language term (the engine knows what the model
//     said and what the editor changed it to, but figuring out which
//     source phrase originally produced the wrong translation reliably
//     would require alignment work; the editor providing the source term
//     is the safest path).
// POST { action: 'reject' } — mark proposal rejected; we don't propose it
//     again on subsequent edits to the same translation.

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Proposal = { id: string; from: string; to: string; occurrences: number; status: string };

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string; proposalId: string }> }
) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (session.role !== 'builder' && session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — builder role required' }, { status: 403 });
  }
  const { id, proposalId } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid translation id' }, { status: 400 });

  const rowRes = await pool.query(
    `SELECT id, newsroom_id, source_language, target_language, proposals
       FROM translations WHERE id = $1`,
    [id]
  );
  const row = rowRes.rows[0];
  if (!row || row.newsroom_id !== session.newsroomId) {
    return NextResponse.json({ error: 'Translation not found' }, { status: 404 });
  }

  const proposals: Proposal[] = Array.isArray(row.proposals) ? row.proposals : [];
  const proposal = proposals.find((p) => p.id === proposalId);
  if (!proposal) return NextResponse.json({ error: 'Proposal not found' }, { status: 404 });
  if (proposal.status !== 'proposed') {
    return NextResponse.json({ error: `Proposal already ${proposal.status}` }, { status: 409 });
  }

  let body: { action?: 'accept' | 'reject'; source_term?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const action = body.action;
  if (action !== 'accept' && action !== 'reject') {
    return NextResponse.json({ error: 'action must be "accept" or "reject"' }, { status: 400 });
  }

  if (action === 'accept') {
    const sourceTerm = body.source_term?.trim();
    if (!sourceTerm) {
      return NextResponse.json(
        { error: 'source_term is required when accepting a proposal — type the source-language term you want this translation to apply to' },
        { status: 400 }
      );
    }
    try {
      await pool.query(
        `INSERT INTO translation_glossary
           (newsroom_id, term, translation, source_language, target_language, notes, source, added_by)
         VALUES ($1, $2, $3, $4, $5, $6, 'edit_feedback', $7)
         ON CONFLICT (newsroom_id, source_language, target_language, term)
         DO UPDATE SET translation = EXCLUDED.translation,
                       source = 'edit_feedback',
                       notes = COALESCE(translation_glossary.notes, '') || E'\n' || EXCLUDED.notes,
                       updated_at = NOW()`,
        [
          session.newsroomId,
          sourceTerm,
          proposal.to,
          row.source_language,
          row.target_language,
          `Auto-learned from translation ${id}: model said "${proposal.from}", editor changed to "${proposal.to}".`,
          session.userId,
        ]
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  // Mark the proposal accepted/rejected on the translation row.
  const next = proposals.map((p) =>
    p.id === proposalId
      ? {
          ...p,
          status: action === 'accept' ? 'accepted' : 'rejected',
          accepted_source_term: action === 'accept' ? body.source_term?.trim() : undefined,
          resolved_at: new Date().toISOString(),
        }
      : p
  );
  await pool.query(`UPDATE translations SET proposals = $2, updated_at = NOW() WHERE id = $1`, [
    id,
    JSON.stringify(next),
  ]);

  return NextResponse.json({ ok: true, proposal: next.find((p) => p.id === proposalId) });
}
