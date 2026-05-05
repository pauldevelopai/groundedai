import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
import { search } from '@/lib/agents/archivist';
import { pool } from '@/lib/db';

export async function POST(req: Request) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  let body: { query?: string; k?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { query, k = 5 } = body;
  if (!query || typeof query !== 'string') {
    return NextResponse.json({ error: 'query is required' }, { status: 400 });
  }

  try {
    // We log the search query to workflow_runs if we consider it an agent execution, 
    // or just leave it as an API call.
    const runInsert = await pool.query(
      `INSERT INTO workflow_runs (newsroom_id, user_id, agent, status, input)
       VALUES ($1, $2, 'archivist', 'running', $3)
       RETURNING id`,
      [session.newsroomId, session.userId, JSON.stringify({ query, k })]
    );
    const runId = runInsert.rows[0].id;

    const results = await search({ newsroomId: session.newsroomId, query, k });

    await pool.query(
      `UPDATE workflow_runs
       SET status = 'completed',
           output = $2,
           completed_at = NOW()
       WHERE id = $1`,
      [runId, JSON.stringify(results)]
    );

    return NextResponse.json({ runId, results });
  } catch (err) {
    console.error('Search error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
