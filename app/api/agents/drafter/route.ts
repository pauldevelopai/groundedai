import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';
import { draft } from '@/lib/agents/drafter';

export async function POST(req: Request) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  let body: { articleText?: string; taskType?: string; targetLanguage?: string; numDrafts?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { articleText, taskType, targetLanguage, numDrafts } = body;
  
  if (!articleText || typeof articleText !== 'string') {
    return NextResponse.json({ error: 'articleText is required' }, { status: 400 });
  }
  if (!taskType || typeof taskType !== 'string') {
    return NextResponse.json({ error: 'taskType is required' }, { status: 400 });
  }

  // Open the run up front — gives us a row to update on success or fail.
  const runInsert = await pool.query(
    `INSERT INTO workflow_runs (newsroom_id, user_id, agent, status, input)
     VALUES ($1, $2, 'drafter', 'running', $3)
     RETURNING id`,
    [
      session.newsroomId,
      session.userId,
      JSON.stringify({ articleText, taskType, targetLanguage, numDrafts }),
    ]
  );
  const runId = runInsert.rows[0].id;

  try {
    const { result, cost, durationMs } = await draft({
      articleText,
      taskType,
      targetLanguage,
      numDrafts,
      context: {
        newsroomId: session.newsroomId,
        userId: session.userId,
        endpoint: '/api/agents/drafter',
      },
    });

    await pool.query(
      `UPDATE workflow_runs
       SET status = 'completed',
           output = $2,
           input_tokens = $3,
           output_tokens = $4,
           cost_usd = $5,
           duration_ms = $6,
           completed_at = NOW()
       WHERE id = $1`,
      [runId, JSON.stringify(result), cost.inputTokens, cost.outputTokens, cost.costUsd, durationMs]
    );

    return NextResponse.json({ runId, result, cost, durationMs });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    await pool.query(
      `UPDATE workflow_runs
       SET status = 'failed', error = $2, completed_at = NOW()
       WHERE id = $1`,
      [runId, message]
    );
    return NextResponse.json({ error: message, runId }, { status: 500 });
  }
}
