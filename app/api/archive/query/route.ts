// POST /api/archive/query — structured Q&A over the newsroom's knowledge graph.
//
// Body: { question: string, maxEvidence?: number }
// Returns: { answer, citations[], matched_entities[], intent, fallback_used, cost }
//
// Direct entry point that bypasses the Archivist agent registration (the
// agent uses the same answerQuestion() under the hood, but this surface is
// for the workspace UI's "ask the archive" affordance — leaner response,
// no workflow-runner overhead).

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
const { answerQuestion } = require('@/lib/archive/answer');

export async function POST(req: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  let body: { question?: string; maxEvidence?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const question = (body.question || '').trim();
  if (!question) return NextResponse.json({ error: 'question is required' }, { status: 400 });

  let maxEvidence = Number(body.maxEvidence ?? 12);
  if (!Number.isInteger(maxEvidence) || maxEvidence < 1 || maxEvidence > 30) {
    return NextResponse.json(
      { error: 'maxEvidence must be an integer between 1 and 30' },
      { status: 400 }
    );
  }

  try {
    const result = await answerQuestion({
      newsroomId: session.newsroomId,
      question,
      maxEvidence,
      context: { newsroomId: session.newsroomId, userId: session.userId, endpoint: '/api/archive/query' },
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 422 }
    );
  }
}
