// Central app → newsroom appliance dispatcher. V2 Step 6.
//
// Given a registered newsroom_appliances row and a job, signs + POSTs to
// the appliance. Writes an appliance_dispatches row for the audit trail
// (dispatched/responded/timeout/failed) and returns the appliance's
// response payload or throws.
//
// IMPORTANT: this is the federated-execution boundary. The body sent
// here LEAVES the central app and enters the newsroom's perimeter.
// Callers must already have classified the input as 'sensitive' and
// confirmed the newsroom has a registered appliance.

const { pool } = require('../db');
const { decryptJson } = require('../distribution/crypto');
const { signRequest } = require('./sign');

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;     // 5 min — sensitive jobs can run long
const HEALTHZ_TIMEOUT_MS = 10 * 1000;         // 10s — health checks must be quick

/**
 * Find the active appliance for this newsroom and decrypt its signing
 * secret. Returns null if none registered.
 *
 * @param {string} newsroomId
 * @returns {Promise<null | {
 *   id: string, newsroom_id: string, display_name: string,
 *   dispatch_url: string, status: string, signing_secret: string,
 * }>}
 */
async function getActiveAppliance(newsroomId) {
  const { rows } = await pool.query(
    `SELECT id, newsroom_id, display_name, dispatch_url, status,
            signing_secret_ciphertext, signing_secret_iv, signing_secret_auth_tag
       FROM newsroom_appliances
      WHERE newsroom_id = $1 AND status = 'active'
      LIMIT 1`,
    [newsroomId]
  );
  if (rows.length === 0) return null;
  const row = rows[0];
  // The signing secret is stored encrypted via lib/distribution/crypto's
  // encryptJson({ secret }) — unwrap.
  let secret;
  try {
    const decoded = decryptJson({
      ciphertext: row.signing_secret_ciphertext,
      iv: row.signing_secret_iv,
      auth_tag: row.signing_secret_auth_tag,
    });
    secret = typeof decoded === 'string' ? decoded : decoded.secret;
  } catch (err) {
    throw new Error(`failed to decrypt appliance signing secret: ${err.message}`);
  }
  return {
    id: row.id,
    newsroom_id: row.newsroom_id,
    display_name: row.display_name,
    dispatch_url: row.dispatch_url,
    status: row.status,
    signing_secret: secret,
  };
}

/**
 * Dispatch a job to the appliance over signed HTTPS. Records an
 * appliance_dispatches row throughout the lifecycle. On success returns
 * `{ payload, dispatchId }` where payload is the parsed JSON response.
 *
 * @param {object} args
 * @param {object} args.appliance              from getActiveAppliance()
 * @param {string} args.endpoint               path on the appliance (e.g. 'agents/run')
 * @param {object} args.body                   JSON-serialisable payload
 * @param {object} [args.audit]                { newsroomId, workflowExecutionId,
 *                                               workflowRunId, agentSlug }
 * @param {number} [args.timeoutMs]
 */
async function dispatchToAppliance({
  appliance, endpoint, body, audit = {}, timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  const url = joinUrl(appliance.dispatch_url, endpoint);
  const path = new URL(url).pathname;
  const method = 'POST';
  const bodyStr = JSON.stringify(body || {});

  // Open the audit row up front.
  const { rows } = await pool.query(
    `INSERT INTO appliance_dispatches
       (newsroom_id, appliance_id, workflow_execution_id, workflow_run_id,
        endpoint, agent_slug, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'dispatched')
     RETURNING id`,
    [
      audit.newsroomId || appliance.newsroom_id,
      appliance.id,
      audit.workflowExecutionId || null,
      audit.workflowRunId || null,
      endpoint,
      audit.agentSlug || null,
    ]
  );
  const dispatchId = rows[0].id;

  const { signature, timestamp, nonce } = signRequest({
    secret: appliance.signing_secret,
    method, path, body: bodyStr,
  });

  const headers = {
    'Content-Type': 'application/json',
    'X-Grounded-Timestamp': timestamp,
    'X-Grounded-Nonce': nonce,
    'X-Grounded-Signature': signature,
  };

  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(url, { method, headers, body: bodyStr, signal: controller.signal });
  } catch (err) {
    clearTimeout(timer);
    const isTimeout = err.name === 'AbortError';
    await pool.query(
      `UPDATE appliance_dispatches
          SET status = $2, error = $3, duration_ms = $4, responded_at = NOW()
        WHERE id = $1`,
      [dispatchId, isTimeout ? 'timeout' : 'failed', err.message, Date.now() - startedAt]
    );
    throw err;
  }
  clearTimeout(timer);

  const durationMs = Date.now() - startedAt;
  const text = await res.text();
  let payload;
  try { payload = JSON.parse(text); }
  catch { payload = { raw: text }; }

  if (!res.ok) {
    await pool.query(
      `UPDATE appliance_dispatches
          SET status = 'failed', http_status = $2, duration_ms = $3,
              error = $4, responded_at = NOW()
        WHERE id = $1`,
      [dispatchId, res.status, durationMs, payload?.error || `HTTP ${res.status}`]
    );
    const err = new Error(`appliance dispatch failed: HTTP ${res.status} — ${payload?.error || 'unknown'}`);
    err.dispatchId = dispatchId;
    err.httpStatus = res.status;
    err.payload = payload;
    throw err;
  }

  await pool.query(
    `UPDATE appliance_dispatches
        SET status = 'completed', http_status = $2, duration_ms = $3, responded_at = NOW()
      WHERE id = $1`,
    [dispatchId, res.status, durationMs]
  );

  // Mark the appliance as seen.
  await pool.query(
    `UPDATE newsroom_appliances SET last_seen_at = NOW(), updated_at = NOW() WHERE id = $1`,
    [appliance.id]
  );

  return { payload, dispatchId, durationMs };
}

function joinUrl(base, suffix) {
  const b = base.endsWith('/') ? base.slice(0, -1) : base;
  const s = suffix.startsWith('/') ? suffix.slice(1) : suffix;
  return `${b}/${s}`;
}

module.exports = {
  getActiveAppliance,
  dispatchToAppliance,
  DEFAULT_TIMEOUT_MS,
  HEALTHZ_TIMEOUT_MS,
};
