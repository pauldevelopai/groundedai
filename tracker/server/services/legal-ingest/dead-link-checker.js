// Dead-link checker — re-verifies every source_url we hold across
// ai_lawsuit_events, ai_regulation_events, ai_legal_source_mentions, and
// ai_legal_usecases.source_url. URLs that no longer resolve have their
// `source_verified_at` cleared (events) or get an error marker (mentions),
// so the public UI can surface an "unverified" state consistently.
//
// Runs weekly. Fully independent of Claude.

import pool from '../../db/pool.js';
import { urlResolves } from './url-verify.js';

const BATCH_CONCURRENCY = 4;

async function checkInParallel(urls) {
  const results = new Map();
  const queue = [...urls];
  async function worker() {
    while (queue.length) {
      const url = queue.shift();
      results.set(url, await urlResolves(url));
    }
  }
  await Promise.all(Array(BATCH_CONCURRENCY).fill(null).map(worker));
  return results;
}

export async function checkDeadLinks({ limit = 1000 } = {}) {
  const summary = {
    lawsuit_events:    { seen: 0, dead: 0, restored: 0 },
    regulation_events: { seen: 0, dead: 0, restored: 0 },
    source_mentions:   { seen: 0, dead: 0, restored: 0 },
    usecases:          { seen: 0, dead: 0, restored: 0 },
  };

  // Collect unique URLs to check.
  const [law, reg, mentions, usecases] = await Promise.all([
    pool.query(`SELECT id, source_url, source_verified_at FROM ai_lawsuit_events WHERE source_url IS NOT NULL LIMIT $1`, [limit]),
    pool.query(`SELECT id, source_url, source_verified_at FROM ai_regulation_events WHERE source_url IS NOT NULL LIMIT $1`, [limit]),
    pool.query(`SELECT id, url, error FROM ai_legal_source_mentions WHERE url IS NOT NULL LIMIT $1`, [limit]),
    pool.query(`SELECT id, source_url, verified_at FROM ai_legal_usecases WHERE source_url IS NOT NULL AND is_published LIMIT $1`, [limit]),
  ]);

  const urlSet = new Set();
  for (const r of law.rows) urlSet.add(r.source_url);
  for (const r of reg.rows) urlSet.add(r.source_url);
  for (const r of mentions.rows) urlSet.add(r.url);
  for (const r of usecases.rows) urlSet.add(r.source_url);

  const verdicts = await checkInParallel([...urlSet]);
  const ok = url => verdicts.get(url) === true;

  // Lawsuit events: flip source_verified_at based on current verdict.
  for (const r of law.rows) {
    summary.lawsuit_events.seen++;
    const good = ok(r.source_url);
    if (good && !r.source_verified_at) {
      await pool.query(`UPDATE ai_lawsuit_events SET source_verified_at = NOW() WHERE id = $1`, [r.id]);
      summary.lawsuit_events.restored++;
    } else if (!good && r.source_verified_at) {
      await pool.query(`UPDATE ai_lawsuit_events SET source_verified_at = NULL WHERE id = $1`, [r.id]);
      summary.lawsuit_events.dead++;
    }
  }
  for (const r of reg.rows) {
    summary.regulation_events.seen++;
    const good = ok(r.source_url);
    if (good && !r.source_verified_at) {
      await pool.query(`UPDATE ai_regulation_events SET source_verified_at = NOW() WHERE id = $1`, [r.id]);
      summary.regulation_events.restored++;
    } else if (!good && r.source_verified_at) {
      await pool.query(`UPDATE ai_regulation_events SET source_verified_at = NULL WHERE id = $1`, [r.id]);
      summary.regulation_events.dead++;
    }
  }
  // Mentions: set `error` to 'dead_link' or null
  for (const r of mentions.rows) {
    summary.source_mentions.seen++;
    const good = ok(r.url);
    if (good && r.error === 'dead_link') {
      await pool.query(`UPDATE ai_legal_source_mentions SET error = NULL WHERE id = $1`, [r.id]);
      summary.source_mentions.restored++;
    } else if (!good && !r.error) {
      await pool.query(`UPDATE ai_legal_source_mentions SET error = 'dead_link' WHERE id = $1`, [r.id]);
      summary.source_mentions.dead++;
    }
  }
  // Usecases: flip verified_at
  for (const r of usecases.rows) {
    summary.usecases.seen++;
    const good = ok(r.source_url);
    if (good && !r.verified_at) {
      await pool.query(`UPDATE ai_legal_usecases SET verified_at = NOW() WHERE id = $1`, [r.id]);
      summary.usecases.restored++;
    } else if (!good && r.verified_at) {
      await pool.query(`UPDATE ai_legal_usecases SET verified_at = NULL WHERE id = $1`, [r.id]);
      summary.usecases.dead++;
    }
  }

  summary.urls_probed = urlSet.size;
  return summary;
}
