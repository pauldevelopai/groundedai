// GET /api/learning/sources — directory of publishers feeding the Tracker.
//
// Rolls up learning_updates by source_publisher: entry count, last update
// date, distinct country scope, severity distribution. Powers the
// Sources tab on the Tracker.

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';

export async function GET(_req: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { rows } = await pool.query(
    `SELECT
        source_publisher,
        COUNT(*)::int                                              AS entry_count,
        MAX(COALESCE(published_at::timestamptz, created_at))       AS last_update,
        (ARRAY_AGG(DISTINCT unnest_country))
          FILTER (WHERE unnest_country IS NOT NULL)                AS countries,
        SUM(CASE WHEN severity = 'urgent'   THEN 1 ELSE 0 END)::int AS urgent,
        SUM(CASE WHEN severity = 'advisory' THEN 1 ELSE 0 END)::int AS advisory,
        SUM(CASE WHEN severity = 'info'     THEN 1 ELSE 0 END)::int AS info
       FROM (
         SELECT u.source_publisher, u.published_at, u.created_at, u.severity,
                unnest(CASE WHEN cardinality(u.country_scope) = 0
                            THEN ARRAY[NULL]::text[]
                            ELSE u.country_scope END) AS unnest_country
           FROM learning_updates u
          WHERE (u.newsroom_id IS NULL OR u.newsroom_id = $1)
            AND u.status = 'live'
            AND u.source_publisher IS NOT NULL
       ) s
   GROUP BY source_publisher
   ORDER BY entry_count DESC, last_update DESC NULLS LAST
      LIMIT 100`,
    [session.newsroomId]
  );

  return NextResponse.json({ rows });
}
