import cron from 'node-cron';
import pool from '../db/pool.js';
import { JOB_REGISTRY } from './background-jobs.js';

const scheduledTasks = new Map();

async function executeJob(job) {
  const jobFn = JOB_REGISTRY[job.name];
  if (!jobFn) {
    console.error(`[Scheduler] No implementation for job: ${job.name}`);
    return;
  }

  console.log(`[Scheduler] Starting job: ${job.name}`);

  // Create job run record
  const { rows: [run] } = await pool.query(
    "INSERT INTO job_runs (job_id, status, started_at) VALUES ($1, 'running', NOW()) RETURNING id",
    [job.id]
  );

  try {
    const { result, itemsProcessed } = await jobFn();

    // Update run as completed
    await pool.query(
      "UPDATE job_runs SET status = 'completed', completed_at = NOW(), result = $1, items_processed = $2 WHERE id = $3",
      [result, itemsProcessed || 0, run.id]
    );

    // Update job last_run_at
    await pool.query(
      'UPDATE background_jobs SET last_run_at = NOW(), updated_at = NOW() WHERE id = $1',
      [job.id]
    );

    console.log(`[Scheduler] Job completed: ${job.name} (${itemsProcessed || 0} items)`);
  } catch (err) {
    console.error(`[Scheduler] Job failed: ${job.name}`, err.message);

    await pool.query(
      "UPDATE job_runs SET status = 'failed', completed_at = NOW(), error = $1 WHERE id = $2",
      [err.message, run.id]
    );

    await pool.query(
      'UPDATE background_jobs SET last_run_at = NOW(), updated_at = NOW() WHERE id = $1',
      [job.id]
    );
  }
}

export async function startScheduler() {
  try {
    const { rows: jobs } = await pool.query(
      'SELECT * FROM background_jobs WHERE is_enabled = true'
    );

    for (const job of jobs) {
      if (!cron.validate(job.cron_expression)) {
        console.warn(`[Scheduler] Invalid cron for ${job.name}: ${job.cron_expression}`);
        continue;
      }

      const task = cron.schedule(job.cron_expression, () => executeJob(job), {
        timezone: 'Europe/London',
      });

      scheduledTasks.set(job.id, task);
    }

    console.log(`[Scheduler] Started: ${jobs.length} jobs loaded`);
  } catch (err) {
    console.error('[Scheduler] Failed to start:', err.message);
  }
}

export async function stopScheduler() {
  for (const [id, task] of scheduledTasks) {
    task.stop();
  }
  scheduledTasks.clear();
  console.log('[Scheduler] Stopped all jobs');
}

// Manually run a job by ID or name (for "Run Now" button)
export async function runJobNow(jobIdOrName) {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jobIdOrName);
  const { rows } = isUuid
    ? await pool.query('SELECT * FROM background_jobs WHERE id = $1', [jobIdOrName])
    : await pool.query('SELECT * FROM background_jobs WHERE name = $1', [jobIdOrName]);
  if (rows.length === 0) throw new Error('Job not found: ' + jobIdOrName);
  return executeJob(rows[0]);
}

// Reload scheduler (after enabling/disabling jobs)
export async function reloadScheduler() {
  await stopScheduler();
  await startScheduler();
}
