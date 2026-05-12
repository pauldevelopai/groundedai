#!/usr/bin/env node
// Standalone job-worker process for pg-boss.
//
// Run alongside the web app in dev:
//   Terminal 1: npm run dev      (Next.js on :3002)
//   Terminal 2: npm run worker   (this file)
//
// The web app enqueues jobs via lib/jobs/boss.js → enqueue(name, data). This
// worker picks them up off the same Postgres-backed queue and runs the
// handler registered for that queue name.
//
// Step 1 ships with a single handler: 'smoke' — logs the payload + returns.
// Step 3 will add 'research:crawl' + 'research:scrape-one'.
// Step 4 will add 'newsroom-profile:compute-fingerprint'.
//
// To stop: Ctrl-C. Graceful shutdown waits for in-flight jobs.

const { getBoss, work, stop } = require('../../lib/jobs/boss');

// ─── Handler registration ─────────────────────────────────────────────────
// Each handler lives in its own file under lib/jobs/handlers/ and exports a
// { queue, handler } pair. The worker loads them all here. Adding a new
// handler is a one-line addition to HANDLER_MODULES.

const HANDLER_MODULES = [
  // Step 3 will add:
  //   require('../../lib/jobs/handlers/research-crawl'),
  //   require('../../lib/jobs/handlers/research-scrape-one'),
  // Step 4 will add:
  //   require('../../lib/jobs/handlers/style-fingerprint'),
];

// Built-in smoke handler — proves the wire works end-to-end without any
// real workload. Web app enqueues `{ name: 'smoke', data: { newsroomId,
// hello } }`; this logs the payload and returns.
const BUILTIN_HANDLERS = [
  {
    queue: 'smoke',
    handler: async (job) => {
      console.log(
        `[smoke] job=${job.id} newsroomId=${job.data?.newsroomId ?? '(none)'} payload=`,
        job.data
      );
      return { ok: true, echo: job.data };
    },
  },
];

async function main() {
  console.log('[worker] starting…');
  await getBoss(); // initialise pg-boss schema if first run
  console.log('[worker] pg-boss started (DATABASE_URL hidden)');

  const all = [...BUILTIN_HANDLERS, ...HANDLER_MODULES];
  for (const { queue, handler, opts } of all) {
    await work(queue, handler, opts);
    console.log(`[worker] registered handler: ${queue}`);
  }

  console.log(`[worker] ready — listening on ${all.length} queue(s). Ctrl-C to exit.`);
}

async function shutdown(signal) {
  console.log(`[worker] ${signal} received — shutting down gracefully…`);
  try {
    await stop();
    console.log('[worker] clean shutdown.');
  } catch (e) {
    console.error('[worker] shutdown error:', e);
  }
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

main().catch((err) => {
  console.error('[worker] fatal:', err);
  process.exit(1);
});
