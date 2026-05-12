// pg-boss handler for 'research.scrape-one' — one URL → one
// research_documents row.
//
// Calls Step 2's scrapeUrl(), persists the extracted text + metadata into
// research_documents (status='parsed'), and bumps progress counters on the
// parent research_crawl_jobs row. When the parent's processed+failed counts
// equal total_urls, the parent is marked 'completed'.

const { pool } = require('../../db');
const { scrapeUrl } = require('../../research/scrape');

const QUEUE = 'research.scrape-one';

async function handler(job) {
  const { jobId, newsroomId, url } = job.data || {};
  if (!jobId || !newsroomId || !url) {
    throw new Error('research-scrape-one: jobId, newsroomId, url required');
  }

  // Look up the parent job for its dossier_id + started_by (so research_documents
  // gets the right ownership)
  const { rows: parents } = await pool.query(
    `SELECT id, dossier_id, started_by, status, total_urls, processed_urls, failed_urls
       FROM research_crawl_jobs
      WHERE id = $1 AND newsroom_id = $2`,
    [jobId, newsroomId]
  );
  if (parents.length === 0) {
    throw new Error(`Parent crawl job ${jobId} not found for newsroom ${newsroomId}`);
  }
  const parent = parents[0];
  if (parent.status === 'cancelled' || parent.status === 'failed') {
    // Don't run more sub-jobs once the parent is done.
    return { skipped: true, reason: parent.status };
  }

  let scrape = null;
  let failed = false;
  let failReason = null;

  try {
    scrape = await scrapeUrl(url, { newsroomId });
  } catch (err) {
    failed = true;
    failReason = err.message || String(err);
  }

  // Persist regardless — both success + failure are useful traces. On
  // failure we still insert a row marked status='failed' with the error so
  // the editor sees it in the dossier.
  if (parent.dossier_id) {
    if (failed) {
      await pool.query(
        `INSERT INTO research_documents
           (dossier_id, newsroom_id, uploaded_by, filename, mime_type, size_bytes,
            source_url, raw_text, status, parse_error)
         VALUES ($1, $2, $3, $4, 'text/html', 0, $5, NULL, 'failed', $6)`,
        [parent.dossier_id, newsroomId, parent.started_by,
         truncFilename(url), url, failReason]
      );
    } else {
      await pool.query(
        `INSERT INTO research_documents
           (dossier_id, newsroom_id, uploaded_by, filename, mime_type, size_bytes,
            source_url, raw_text, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'parsed')`,
        [parent.dossier_id, newsroomId, parent.started_by,
         scrape.title || truncFilename(url),
         scrape.contentType || 'text/html',
         scrape.byteSize || 0,
         scrape.finalUrl,
         scrape.text]
      );
    }
  }

  // Increment progress + flip parent to 'completed' if all sub-jobs done
  const inc = failed
    ? `failed_urls = failed_urls + 1`
    : `processed_urls = processed_urls + 1`;
  await pool.query(
    `UPDATE research_crawl_jobs SET ${inc}, updated_at = NOW() WHERE id = $1`,
    [jobId]
  );
  // Check finished
  const { rows: [refreshed] } = await pool.query(
    `SELECT total_urls, processed_urls, failed_urls FROM research_crawl_jobs WHERE id = $1`,
    [jobId]
  );
  const done = refreshed.processed_urls + refreshed.failed_urls;
  if (done >= refreshed.total_urls && refreshed.total_urls > 0) {
    await pool.query(
      `UPDATE research_crawl_jobs
          SET status = 'completed', finished_at = NOW(), updated_at = NOW()
        WHERE id = $1 AND status NOT IN ('cancelled', 'failed')`,
      [jobId]
    );
  }

  return { jobId, url, ok: !failed };
}

function truncFilename(url) {
  try {
    const u = new URL(url);
    const last = u.pathname.split('/').filter(Boolean).pop() || u.host;
    return last.slice(0, 200);
  } catch {
    return String(url).slice(0, 200);
  }
}

module.exports = { queue: QUEUE, handler };
