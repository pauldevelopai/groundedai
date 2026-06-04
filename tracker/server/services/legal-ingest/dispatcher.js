// Source dispatcher: iterates sources that are due for a run, invokes the
// right scraper kind, writes raw items to ai_legal_raw_items with ON CONFLICT
// DO NOTHING (dedup by source_id + external_id), and records an audit row in
// ai_legal_source_runs.
//
// Usage:
//   await dispatchDueSources();           // run every source whose schedule is due
//   await dispatchSource(sourceId);       // force-run one source regardless of schedule

import pool from '../../db/pool.js';
import { scrapeRss } from './rss-scraper.js';
import { scrapeBluesky } from './bluesky-scraper.js';
import { scrapeMastodon } from './mastodon-scraper.js';
import { scrapeHtml } from './html-scraper.js';
import { scrapePuppeteer, closeBrowser as closePuppeteer } from './puppeteer-scraper.js';

// Registry of scraper functions per source.kind.
// New kinds are added here. Each function takes the full source row and returns
// Promise<Array<{ external_id, url, title, content, author, published_at, raw_payload }>>.
const SCRAPERS = {
  rss:       scrapeRss,
  html:      scrapeHtml,
  bluesky:   scrapeBluesky,
  mastodon:  scrapeMastodon,
  puppeteer: scrapePuppeteer, // for SPA regulator pages (ICO UK, OECD, etc.)
  // Reddit handled via its built-in RSS endpoints (kind='rss').
};

// Export so batch runners can explicitly tear down Chromium when done.
export { closePuppeteer };

// ── Public entry points ──────────────────────────────────────────────────────
export async function dispatchDueSources({ limit = 10 } = {}) {
  const { rows: due } = await pool.query(
    `SELECT * FROM ai_legal_sources
      WHERE active = true
        AND (last_run_at IS NULL OR last_run_at + (run_frequency_hours || ' hours')::interval <= NOW())
      ORDER BY last_run_at ASC NULLS FIRST
      LIMIT $1`,
    [limit]
  );

  const summaries = [];
  for (const source of due) {
    const summary = await runSourceSafe(source);
    summaries.push(summary);
  }
  return summaries;
}

export async function dispatchSource(sourceId) {
  const { rows } = await pool.query('SELECT * FROM ai_legal_sources WHERE id = $1', [sourceId]);
  if (rows.length === 0) throw new Error('Source not found');
  return runSourceSafe(rows[0]);
}

// ── Per-source runner ────────────────────────────────────────────────────────
async function runSourceSafe(source) {
  const scraper = SCRAPERS[source.kind];
  if (!scraper) {
    return recordFailure(source, new Error(`No scraper registered for kind '${source.kind}'`));
  }

  const runId = await startRun(source.id);
  try {
    const items = await scraper(source);
    const { inserted, duplicates } = await persistItems(source.id, items);
    await finishRun(runId, {
      items_seen: items.length,
      items_new: inserted,
      items_duplicate: duplicates,
      status: 'success',
    });
    await pool.query(
      `UPDATE ai_legal_sources
          SET last_run_at = NOW(),
              last_success_at = NOW(),
              last_error = NULL,
              items_seen = items_seen + $1,
              items_new  = items_new  + $2,
              updated_at = NOW()
        WHERE id = $3`,
      [items.length, inserted, source.id]
    );
    return { source: source.name, status: 'success', items_seen: items.length, items_new: inserted, items_duplicate: duplicates };
  } catch (err) {
    return recordFailure(source, err, runId);
  }
}

async function recordFailure(source, err, runId) {
  const message = (err && err.message) || String(err);
  if (runId) {
    await finishRun(runId, { status: 'error', error: message });
  }
  await pool.query(
    `UPDATE ai_legal_sources
        SET last_run_at = NOW(),
            last_error = $1,
            updated_at = NOW()
      WHERE id = $2`,
    [message.slice(0, 2000), source.id]
  );
  console.error(`[legal-ingest] ${source.name}: ${message}`);
  return { source: source.name, status: 'error', error: message };
}

async function startRun(sourceId) {
  const { rows } = await pool.query(
    `INSERT INTO ai_legal_source_runs (source_id) VALUES ($1) RETURNING id`,
    [sourceId]
  );
  return rows[0].id;
}

async function finishRun(runId, { items_seen = 0, items_new = 0, items_duplicate = 0, status, error = null }) {
  await pool.query(
    `UPDATE ai_legal_source_runs
        SET finished_at = NOW(),
            items_seen = $1,
            items_new = $2,
            items_duplicate = $3,
            status = $4,
            error = $5
      WHERE id = $6`,
    [items_seen, items_new, items_duplicate, status, error, runId]
  );
}

// ── Persistence ──────────────────────────────────────────────────────────────
async function persistItems(sourceId, items) {
  let inserted = 0;
  let duplicates = 0;
  for (const it of items) {
    const externalId = it.external_id || it.url || `${sourceId}:${it.title || 'unknown'}`;
    const res = await pool.query(
      `INSERT INTO ai_legal_raw_items
         (source_id, external_id, url, title, content, author, published_at, raw_payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz, $8::jsonb)
       ON CONFLICT (source_id, external_id) DO NOTHING
       RETURNING id`,
      [
        sourceId,
        externalId.slice(0, 2000),
        it.url || null,
        it.title ? it.title.slice(0, 500) : null,
        it.content || null,
        it.author ? it.author.slice(0, 300) : null,
        it.published_at || null,
        it.raw_payload ? JSON.stringify(it.raw_payload) : null,
      ]
    );
    if (res.rowCount > 0) inserted++;
    else duplicates++;
  }
  return { inserted, duplicates };
}
