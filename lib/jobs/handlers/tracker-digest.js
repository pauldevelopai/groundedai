// pg-boss handler — weekly cohort digest of the Legal/Ethics Tracker.
//
// Pulls live learning_updates entries from the past `windowDays` days
// (default 7), severity-weighted, calls Haiku once to summarise into a
// markdown digest, persists the result into tracker_digests with
// newsroom_id NULL (cohort-wide). The Home tab on the Tracker surfaces
// the most recent digest at the top.
//
// Idempotent: a second run within the same period overwrites the existing
// digest for that period rather than spawning duplicates.
//
// Cost: ~ $0.002 per run (Haiku 4.5, ~3k input / 800 output).
//
// Enqueue from anywhere:
//   const { enqueue } = require('../../jobs/boss');
//   await enqueue('tracker.weekly-digest', { windowDays: 7 });

const { pool } = require('../../db');
const { chat } = require('../../claude');

const QUEUE = 'tracker.weekly-digest';

const SYSTEM_PROMPT = `You write a concise weekly digest of new AI law / ethics / regulation /
press-freedom developments for African newsrooms. You receive a JSON
array of entries; produce a Markdown digest with this exact shape:

## What changed this week
A 2-3 sentence top-line summary of the week's most consequential development.

## Highlights
- **<entry title>** — one sentence on why it matters.
- (3-6 bullets total, prioritising severity=urgent then advisory.)

## What to watch
1-2 sentences naming what next week's read-out should track.

Write tightly. Use British English. No emojis. No salutation. No sign-off.
If an entry's body has explicit jurisdictional scope, mention the country
codes inline.`;

async function handler(job) {
  const windowDays = Math.max(1, Math.min(30, parseInt(job.data?.windowDays, 10) || 7));
  const periodEnd = new Date();
  const periodStart = new Date(periodEnd.getTime() - windowDays * 86400_000);

  const { rows: entries } = await pool.query(
    `SELECT id, title, body, kind, severity, source_publisher, source_url,
            published_at, country_scope
       FROM learning_updates
      WHERE status = 'live'
        AND newsroom_id IS NULL
        AND COALESCE(published_at::timestamptz, created_at) >= $1
   ORDER BY
        CASE severity WHEN 'urgent' THEN 3 WHEN 'advisory' THEN 2 ELSE 1 END DESC,
        COALESCE(published_at::timestamptz, created_at) DESC
      LIMIT 40`,
    [periodStart.toISOString()]
  );

  // Nothing happened this week — record an empty digest row so the
  // dashboard knows we ran rather than silently skipping.
  if (entries.length === 0) {
    const empty = await pool.query(
      `INSERT INTO tracker_digests
         (newsroom_id, period_start, period_end, summary_md, top_entry_ids,
          entry_count, generated_by_model, cost_usd)
       VALUES (NULL, $1, $2, $3, $4, 0, NULL, 0)
       RETURNING id`,
      [periodStart, periodEnd, `_No new Tracker entries in the past ${windowDays} days._`, []]
    );
    return { digestId: empty.rows[0].id, entryCount: 0, costUsd: 0 };
  }

  const compact = entries.slice(0, 20).map((e) => ({
    title: e.title,
    severity: e.severity,
    kind: e.kind,
    countries: e.country_scope || [],
    source: e.source_publisher,
    body: (e.body || '').slice(0, 800),
  }));

  const userMessage = `Window: past ${windowDays} days. ${entries.length} new entries (top ${compact.length} shown).\n\nEntries:\n${JSON.stringify(compact, null, 2)}\n\nWrite the digest now.`;

  const { text: summaryMd, cost } = await chat({
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
    maxTokens: 1200,
    context: {
      agent: 'tracker_digest',
      endpoint: 'job:tracker.weekly-digest',
    },
  });

  // Top entries the UI will highlight inline with the digest — same
  // severity ranking, capped at 8 so the Home tab masthead stays compact.
  const topEntryIds = entries
    .slice(0, 8)
    .map((e) => e.id);

  // Idempotency: replace any existing digest whose period overlaps this
  // one, then insert the fresh row.
  await pool.query(
    `DELETE FROM tracker_digests
      WHERE newsroom_id IS NULL
        AND period_end >= $1
        AND period_start <= $2`,
    [periodStart, periodEnd]
  );
  const { rows: inserted } = await pool.query(
    `INSERT INTO tracker_digests
       (newsroom_id, period_start, period_end, summary_md, top_entry_ids,
        entry_count, generated_by_model, cost_usd)
     VALUES (NULL, $1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [
      periodStart, periodEnd, summaryMd, topEntryIds, entries.length,
      cost?.model || null, cost?.costUsd || 0,
    ]
  );

  return {
    digestId: inserted[0].id,
    entryCount: entries.length,
    costUsd: cost?.costUsd || 0,
  };
}

module.exports = { queue: QUEUE, handler };
