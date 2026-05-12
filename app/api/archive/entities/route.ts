// GET /api/archive/entities — paged list of canonical entities for this
// newsroom, with optional type filter + free-text fuzzy search.
//
// Query params:
//   q?       free-text — uses trgm + cosine via fuzzyEntitySearch
//   type?    slug filter (e.g. 'person', 'organisation', 'mining_company')
//   page?    default 1
//   pageSize? default 50, max 200

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';
const { fuzzyEntitySearch } = require('@/lib/archive/query');

export async function GET(req: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const url = new URL(req.url);
  const q = (url.searchParams.get('q') || '').trim();
  const typeSlug = (url.searchParams.get('type') || '').trim() || undefined;
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
  const pageSize = Math.min(200, Math.max(1, parseInt(url.searchParams.get('pageSize') || '50', 10)));

  // If a search query is supplied, route through the fuzzy primitive
  if (q) {
    const hits = await fuzzyEntitySearch({
      newsroomId: session.newsroomId,
      query: q,
      k: pageSize,
      typeSlug,
    });
    return NextResponse.json({ entities: hits, total: hits.length, mode: 'fuzzy' });
  }

  // Otherwise, paginated listing ordered by mention_count desc
  const params: any[] = [session.newsroomId];
  let typeFilter = '';
  if (typeSlug) {
    typeFilter = `AND t.slug = $2`;
    params.push(typeSlug);
  }
  const offset = (page - 1) * pageSize;
  params.push(pageSize, offset);

  const { rows: entities } = await pool.query(
    `SELECT e.id, e.canonical_name, e.surface_forms, e.mention_count,
            e.first_seen_at, e.last_seen_at,
            t.slug AS type_slug, t.label AS type_label, t.kind AS type_kind
       FROM archive_entities e
       JOIN archive_entity_types t ON t.id = e.type_id
      WHERE e.newsroom_id = $1
        ${typeFilter}
      ORDER BY e.mention_count DESC, e.canonical_name ASC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  const countParams: any[] = [session.newsroomId];
  let countTypeFilter = '';
  if (typeSlug) {
    countTypeFilter = `AND t.slug = $2`;
    countParams.push(typeSlug);
  }
  const { rows: [totalRow] } = await pool.query(
    `SELECT COUNT(*)::int AS n
       FROM archive_entities e
       JOIN archive_entity_types t ON t.id = e.type_id
      WHERE e.newsroom_id = $1 ${countTypeFilter}`,
    countParams
  );

  return NextResponse.json({ entities, total: totalRow.n, page, pageSize, mode: 'list' });
}
