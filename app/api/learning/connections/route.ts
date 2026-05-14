// GET /api/learning/connections — Tracker Connections-map data.
//
// Returns nodes (live learning_updates visible to the newsroom) and
// edges (tracker_relationships rows in scope). The Connections-map tab
// renders this as a force-directed SVG client-side — no extra deps.
//
// Edge scope: cohort-wide (newsroom_id NULL) plus per-newsroom rows for
// the caller. Nodes restricted to entries actually referenced by an
// edge OR a recent live entry, capped at MAX_NODES so the rendering
// stays usable on a laptop.

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';

const MAX_NODES = 80;

export async function GET(_req: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  // 1. Edges in scope (cohort-wide + newsroom).
  const edges = await pool.query(
    `SELECT id, from_entry_id, to_entry_id, kind, notes,
            newsroom_id IS NULL AS cohort_wide
       FROM tracker_relationships
      WHERE newsroom_id IS NULL OR newsroom_id = $1
   ORDER BY created_at DESC
      LIMIT 400`,
    [session.newsroomId]
  );

  // 2. Anchor node ids: anything that participates in an edge, plus
  // the N most-recent live entries to seed the graph when relationships
  // are sparse.
  const anchorIds = new Set<string>();
  for (const e of edges.rows) {
    anchorIds.add(e.from_entry_id);
    anchorIds.add(e.to_entry_id);
  }
  const recents = await pool.query(
    `SELECT id FROM learning_updates
      WHERE (newsroom_id IS NULL OR newsroom_id = $1)
        AND status = 'live'
   ORDER BY COALESCE(published_at::timestamptz, created_at) DESC
      LIMIT $2`,
    [session.newsroomId, MAX_NODES]
  );
  for (const r of recents.rows) anchorIds.add(r.id);

  if (anchorIds.size === 0) {
    return NextResponse.json({ nodes: [], edges: [], max_nodes: MAX_NODES });
  }

  const ids = [...anchorIds].slice(0, MAX_NODES);
  const nodes = await pool.query(
    `SELECT id, title, kind, severity, country_scope, source_publisher,
            COALESCE(published_at::timestamptz, created_at) AS at
       FROM learning_updates
      WHERE id = ANY($1::uuid[]) AND status = 'live'
        AND (newsroom_id IS NULL OR newsroom_id = $2)`,
    [ids, session.newsroomId]
  );
  // Filter edges so we don't ship dangling references.
  const renderedIds = new Set(nodes.rows.map((n: any) => n.id));
  const filteredEdges = edges.rows.filter(
    (e: any) => renderedIds.has(e.from_entry_id) && renderedIds.has(e.to_entry_id),
  );

  return NextResponse.json({
    nodes: nodes.rows,
    edges: filteredEdges,
    max_nodes: MAX_NODES,
  });
}
