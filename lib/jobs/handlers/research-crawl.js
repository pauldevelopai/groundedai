// pg-boss handler for 'research.crawl' — the fan-out job.
// (pg-boss v12 rejects colons in queue names; we use dots.)
//
// Reads the research_crawl_jobs row, resolves effective crawl rules, calls
// discoverLinks(), then enqueues one 'research.scrape-one' sub-job per link.
//
// The per-URL fetch + extract happens in research-scrape-one.js. This handler
// is fast — it's just discovery + fan-out.

const { pool } = require('../../db');
const { enqueue } = require('../boss');
const { discoverLinks, getEffectiveCrawlRules } = require('../../research/crawl');

const QUEUE = 'research.crawl';

async function handler(job) {
  const { jobId, newsroomId, homepageUrl } = job.data || {};
  if (!jobId || !newsroomId || !homepageUrl) {
    throw new Error('research-crawl: jobId, newsroomId, homepageUrl required');
  }

  // Mark running + record pg-boss id for traceability. SELECT the per-job
  // rules override at the same time so a caller's API-supplied maxLinks etc.
  // wins over the newsroom-level defaults.
  const { rows: jobRows } = await pool.query(
    `UPDATE research_crawl_jobs
        SET status = 'running', started_at = COALESCE(started_at, NOW()),
            pg_boss_job_id = $2, updated_at = NOW()
      WHERE id = $1 AND newsroom_id = $3
      RETURNING rules`,
    [jobId, job.id || null, newsroomId]
  );
  const perJobRules = jobRows[0]?.rules || {};

  try {
    // Effective = defaults ⊕ newsroom-level ⊕ per-job (per-job wins).
    const newsroomRules = await getEffectiveCrawlRules(newsroomId);
    const rules = { ...newsroomRules, ...perJobRules };

    const { links } = await discoverLinks(homepageUrl, { rules });

    // Stash the snapshot of effective rules + the total count
    await pool.query(
      `UPDATE research_crawl_jobs
          SET rules = $2::jsonb, total_urls = $3, updated_at = NOW()
        WHERE id = $1`,
      [jobId, JSON.stringify(rules), links.length]
    );

    if (links.length === 0) {
      // Nothing to crawl — finalise as completed
      await pool.query(
        `UPDATE research_crawl_jobs
            SET status = 'completed', finished_at = NOW(), updated_at = NOW()
          WHERE id = $1`,
        [jobId]
      );
      return { jobId, totalUrls: 0 };
    }

    // Fan out — one sub-job per URL.
    for (const url of links) {
      await enqueue('research.scrape-one', {
        jobId, newsroomId, url,
      }, {
        // Stagger gently so the per-host rate-limit doesn't bottleneck
        // (in-process tokens are per-worker; multi-worker scale would
        // need a smarter throttle).
      });
    }
    return { jobId, totalUrls: links.length };
  } catch (err) {
    await pool.query(
      `UPDATE research_crawl_jobs
          SET status = 'failed', error = $2, finished_at = NOW(), updated_at = NOW()
        WHERE id = $1`,
      [jobId, err.message || String(err)]
    );
    throw err;
  }
}

module.exports = { queue: QUEUE, handler };
