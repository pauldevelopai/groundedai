// pg-boss wrapper — Postgres-backed background-job runner.
//
// pg-boss creates a `pgboss` schema on first start (isolated from public.*),
// and uses Postgres rows + LISTEN/NOTIFY for queue mechanics. No Redis, no
// separate broker — same database as everything else, which keeps the
// platform single-host for the pilot.
//
// Used by:
//   Step 3 — Researcher deep crawler fan-out (research:crawl, research:scrape-one)
//   Step 4 — Style-fingerprint extractor (newsroom-profile:compute-fingerprint)
//   Future — Social listener polling, long-running Producer mixes, etc.
//
// Multi-tenant by convention: every job's data payload MUST carry newsroomId.
// Handlers check it before doing work, exactly like HTTP routes do.
//
// In the web process, callers use enqueue() — pg-boss connects, sends the
// job, returns. In a separate worker process (npm run worker → scripts/
// jobs/worker.js), `work()` registers handlers that pull jobs off the queue.

// pg-boss v12 ships its constructor as a named export, not the module's default.
const { PgBoss } = require('pg-boss');
require('dotenv').config();

let _boss = null;
let _started = null;  // Promise to dedupe parallel start() calls

/**
 * Returns a started pg-boss singleton. Starts pg-boss on first call (which
 * creates the pgboss schema if needed). Safe to call concurrently — the
 * second caller awaits the same start promise.
 */
async function getBoss() {
  if (_boss) return _boss;
  if (_started) return _started;

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set — pg-boss needs it.');
  }

  _started = (async () => {
    const boss = new PgBoss({
      connectionString: process.env.DATABASE_URL,
      // Friendly defaults; tune in production.
      max: 5,                          // pool size per process
      retryLimit: 3,
      retryDelay: 30,                  // seconds — gives transient failures time
      retryBackoff: true,
      expireInHours: 12,               // a job that never starts gets reaped
      archiveCompletedAfterSeconds: 24 * 3600,
      deleteAfterDays: 14,
    });
    boss.on('error', (err) => {
      console.error('[pg-boss]', err);
    });
    await boss.start();
    _boss = boss;
    return boss;
  })();

  return _started;
}

/**
 * Enqueue a job. The data payload should always include newsroomId so
 * handlers can scope work correctly. opts forward straight to pg-boss
 * (see pg-boss docs: priority, startAfter, singletonKey, etc).
 *
 * Returns the job id (or null if pg-boss deduped a singleton).
 */
// Track which queues we've already ensured exist, so we don't pay a CREATE
// round-trip on every enqueue/work.
const _ensuredQueues = new Set();

async function ensureQueue(name) {
  if (_ensuredQueues.has(name)) return;
  const boss = await getBoss();
  try {
    await boss.createQueue(name);
  } catch (e) {
    // createQueue may throw if the queue already exists — fine.
    if (!/already exists/i.test(e.message || '')) {
      // surface other errors but don't crash callers — work() will retry
      console.warn(`[pg-boss] createQueue(${name}):`, e.message);
    }
  }
  _ensuredQueues.add(name);
}

async function enqueue(name, data, opts = {}) {
  if (!name || typeof name !== 'string') {
    throw new Error('enqueue: name (queue) required');
  }
  if (!data || typeof data !== 'object') {
    throw new Error('enqueue: data object required');
  }
  if (!data.newsroomId) {
    // Soft guardrail. Some platform-wide jobs (e.g. smoke tests, cohort-level
    // tasks) won't have a newsroomId — those can pass an explicit
    // `newsroomId: '__platform__'`. Anything else is a multi-tenant footgun.
    console.warn(`[pg-boss] enqueue(${name}) missing data.newsroomId — handlers should refuse it`);
  }
  await ensureQueue(name);
  const boss = await getBoss();
  return boss.send(name, data, opts);
}

/**
 * Register a handler for a queue. The worker process calls this. Returns
 * the worker id so callers can teardown if needed.
 *
 * Handler signature: async (job) => any
 *   - job.id      pg-boss job id
 *   - job.name    queue name
 *   - job.data    the payload from enqueue()
 *
 * pg-boss retries failed handlers up to retryLimit (default 3) with
 * backoff. Throw to fail; return normally (or resolve) to mark complete.
 */
async function work(name, handler, opts = {}) {
  await ensureQueue(name);
  const boss = await getBoss();
  // pg-boss v12 always invokes the callback with an array of jobs (batched
  // fetch). Most of our handlers are happier with one job at a time, so we
  // unwrap here and call the user's handler once per job. Errors thrown from
  // any single job bubble up — pg-boss will retry that job per retryLimit.
  const wrapped = async (jobs) => {
    if (!Array.isArray(jobs)) return handler(jobs);
    const results = [];
    for (const j of jobs) results.push(await handler(j));
    return results;
  };
  return boss.work(name, opts, wrapped);
}

/** Graceful shutdown — flushes in-flight handlers, then disconnects. */
async function stop() {
  if (_boss) {
    await _boss.stop();
    _boss = null;
    _started = null;
  }
}

module.exports = { getBoss, enqueue, work, stop };
