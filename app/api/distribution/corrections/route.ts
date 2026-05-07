// /api/distribution/corrections — list + POST open

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';
const { listCorrections, openCorrection } = require('@/lib/distribution/corrections');

const SOURCE_KINDS = ['production', 'draft', 'translation', 'manual'];
const SEVERITIES = ['typo', 'minor', 'material', 'critical'];

export async function GET() {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const corrections = await listCorrections(session.newsroomId);
  return NextResponse.json({ corrections });
}

export async function POST(req: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (session.role !== 'builder' && session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — builder role required' }, { status: 403 });
  }
  let body: {
    source_kind?: string; source_id?: string;
    reason?: string; correction_text?: string; severity?: string;
  };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  if (!body.source_kind || !SOURCE_KINDS.includes(body.source_kind)) {
    return NextResponse.json({ error: `source_kind must be one of ${SOURCE_KINDS.join(', ')}` }, { status: 400 });
  }
  if (!body.reason?.trim()) return NextResponse.json({ error: 'reason is required' }, { status: 400 });
  if (!body.correction_text?.trim()) return NextResponse.json({ error: 'correction_text is required' }, { status: 400 });
  const severity = body.severity && SEVERITIES.includes(body.severity) ? body.severity : 'minor';

  const correction = await openCorrection({
    newsroomId: session.newsroomId,
    raisedBy: session.userId,
    sourceKind: body.source_kind,
    sourceId: body.source_id,
    reason: body.reason,
    correctionText: body.correction_text,
    severity,
  });
  return NextResponse.json({ correction }, { status: 201 });
}
