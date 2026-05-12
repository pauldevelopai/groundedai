// POST /api/archive/documents/:id/ingest — run the knowledge-graph extraction
// pipeline on this document. Idempotent: each pass updates archive_ingestion_runs
// in place; pass ?force=1 to re-run completed passes.
//
// Returns per-pass status + row counts + cost. Synchronous for the pilot —
// a typical 5-chunk document takes 10-30s on Anthropic, longer on Ollama
// fallback. Async background processing can come later.

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';
const { ingestDocument } = require('@/lib/archive/ingest');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_PASSES = new Set(['metadata', 'ner', 'relations', 'claims']);

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (session.role !== 'builder' && session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — builder role required' }, { status: 403 });
  }
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  // Enforce tenant isolation: 404 if the doc isn't in this newsroom
  const { rows } = await pool.query(
    'SELECT id FROM archive_documents WHERE id = $1 AND newsroom_id = $2',
    [id, session.newsroomId]
  );
  if (rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Optional: subset of passes + force flag
  const url = new URL(req.url);
  const force = url.searchParams.get('force') === '1';
  const passesParam = url.searchParams.get('passes');
  let passes: string[] | undefined;
  if (passesParam) {
    passes = passesParam.split(',').map((s) => s.trim()).filter(Boolean);
    for (const p of passes) {
      if (!VALID_PASSES.has(p)) {
        return NextResponse.json({ error: `Invalid pass "${p}"` }, { status: 400 });
      }
    }
  }

  try {
    const result = await ingestDocument({
      documentId: id,
      passes,
      force,
      context: { newsroomId: session.newsroomId, userId: session.userId, endpoint: '/api/archive/documents/[id]/ingest' },
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 422 }
    );
  }
}

// GET /api/archive/documents/:id/ingest — fetch current per-pass state for
// this document. Used by the UI to show ingestion progress and last-run cost.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const { rows: docRows } = await pool.query(
    'SELECT id FROM archive_documents WHERE id = $1 AND newsroom_id = $2',
    [id, session.newsroomId]
  );
  if (docRows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { rows: runs } = await pool.query(
    `SELECT pass, status, rows_added, cost_usd, error, started_at, completed_at, updated_at
       FROM archive_ingestion_runs
      WHERE document_id = $1
      ORDER BY pass`,
    [id]
  );

  // Also return per-pass row counts that exist in the destination tables, so
  // the UI can show "47 mentions / 12 relationships / 8 claims" even when
  // the run row has been deleted.
  const counts = await pool.query(
    `SELECT
       (SELECT COUNT(*) FROM archive_entity_mentions WHERE document_id = $1) AS mentions,
       (SELECT COUNT(*) FROM archive_relationships WHERE document_id = $1) AS relationships,
       (SELECT COUNT(*) FROM archive_claims WHERE document_id = $1) AS claims`,
    [id]
  );
  return NextResponse.json({ documentId: id, runs, counts: counts.rows[0] });
}
