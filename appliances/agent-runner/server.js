#!/usr/bin/env node
// Grounded newsroom appliance — agent runner.
//
// V2 Step 6 — MVP stub. This is the small Node service that runs on
// each newsroom's appliance (Mac mini, NUC, VM). The central Grounded
// app dispatches sensitive jobs here via signed HTTPS POSTs; this
// process executes them locally and returns results — the newsroom's
// sensitive payloads never leave its perimeter.
//
// Endpoints:
//
//   POST /test            — central app smoke-test. Echoes the payload.
//   POST /workflows/run   — execute a workflow definition locally.
//                            STUB in this MVP: returns the payload back
//                            as a placeholder. Real execution against
//                            Ollama lands as a Step 6.x slice once a
//                            pilot newsroom installs hardware.
//   POST /agents/run      — single-agent run; same stub treatment.
//   GET  /healthz         — local liveness check (not signed).
//
// All POSTs MUST carry the signature triple (X-Grounded-Timestamp,
// X-Grounded-Nonce, X-Grounded-Signature). Verified via the shared
// sign.js helper. Unsigned / invalid requests are 401'd.
//
// Heartbeat: every PING_INTERVAL_MS (default 5 min), we POST to
// CENTRAL_URL/api/appliances/$APPLIANCE_ID/ping so the central app's
// "Appliance online" indicator stays accurate.
//
// Configuration (env vars):
//   APPLIANCE_PORT          listen port (default 8443)
//   APPLIANCE_HOST          listen host (default 0.0.0.0)
//   APPLIANCE_ID            the newsroom_appliances.id from the central app
//   APPLIANCE_SECRET        the signing_secret printed at registration
//   CENTRAL_URL             https://your-grounded-deployment.example
//   PING_INTERVAL_MS        heartbeat cadence (default 300000 = 5 min)
//   APPLIANCE_VERSION       label included in the ping payload

const http = require('node:http');
const { signRequest, verifyRequest } = require('../../lib/appliance/sign');

const PORT = parseInt(process.env.APPLIANCE_PORT || '8443', 10);
const HOST = process.env.APPLIANCE_HOST || '0.0.0.0';
const SECRET = process.env.APPLIANCE_SECRET;
const APPLIANCE_ID = process.env.APPLIANCE_ID;
const CENTRAL_URL = process.env.CENTRAL_URL;
const PING_INTERVAL_MS = parseInt(process.env.PING_INTERVAL_MS || '300000', 10);
const VERSION = process.env.APPLIANCE_VERSION || 'grounded-appliance/0.1.0';

if (!SECRET) {
  console.error('[appliance] APPLIANCE_SECRET is required. Get it from the central /team page when you registered.');
  process.exit(1);
}
if (!APPLIANCE_ID || !CENTRAL_URL) {
  console.warn('[appliance] APPLIANCE_ID + CENTRAL_URL are unset — heartbeat disabled. Set them to enable.');
}

const SIGNED_PATHS = new Set(['/test', '/workflows/run', '/agents/run']);

function readBody(req) {
  return new Promise((resolve, reject) => {
    let buf = '';
    req.on('data', (c) => { buf += c; if (buf.length > 10_000_000) { req.destroy(); reject(new Error('body too large')); } });
    req.on('end', () => resolve(buf));
    req.on('error', reject);
  });
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

async function handle(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const path = url.pathname;

  if (req.method === 'GET' && path === '/healthz') {
    return sendJson(res, 200, { ok: true, version: VERSION, ts: new Date().toISOString() });
  }

  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'method not allowed' });
  }

  const bodyStr = await readBody(req);

  if (SIGNED_PATHS.has(path)) {
    const headers = {};
    for (const [k, v] of Object.entries(req.headers)) {
      headers[k.toLowerCase()] = Array.isArray(v) ? v[0] : v;
    }
    const verdict = verifyRequest({
      secret: SECRET, method: 'POST', path, body: bodyStr, headers,
    });
    if (!verdict.ok) {
      return sendJson(res, 401, { error: `signature: ${verdict.reason}` });
    }
  }

  let payload = {};
  try { payload = bodyStr ? JSON.parse(bodyStr) : {}; }
  catch { return sendJson(res, 400, { error: 'invalid JSON body' }); }

  if (path === '/test') {
    return sendJson(res, 200, { ok: true, echo: payload, version: VERSION, ts: new Date().toISOString() });
  }
  if (path === '/workflows/run') {
    // STUB. Real execution against Ollama + the central app's agent
    // registry lands as Step 6.x. For now, acknowledge so the dispatch
    // protocol can be tested end-to-end.
    return sendJson(res, 200, {
      ok: true,
      executed_on: 'appliance',
      stub: true,
      received: {
        workflow_id: payload.workflow_id,
        workflow_slug: payload.workflow_slug,
        node_count: Array.isArray(payload.definition?.nodes) ? payload.definition.nodes.length : 0,
      },
      output: '(appliance stub — Ollama execution pending Step 6.x)',
      nodeOutputs: {},
      nodeCosts: [],
    });
  }
  if (path === '/agents/run') {
    return sendJson(res, 200, {
      ok: true,
      executed_on: 'appliance',
      stub: true,
      slug: payload.slug || null,
      result: { stub: true, note: 'appliance MVP — Ollama-backed agent execution pending Step 6.x' },
      cost: { costUsd: 0 },
      durationMs: 0,
    });
  }

  return sendJson(res, 404, { error: 'unknown endpoint' });
}

// ─── Heartbeat to the central app ─────────────────────────────────────────
async function pingHome() {
  if (!APPLIANCE_ID || !CENTRAL_URL) return;
  const path = `/api/appliances/${APPLIANCE_ID}/ping`;
  const bodyStr = JSON.stringify({ version: VERSION });
  const { signature, timestamp, nonce } = signRequest({
    secret: SECRET, method: 'POST', path, body: bodyStr,
  });
  try {
    const res = await fetch(joinUrl(CENTRAL_URL, path), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Grounded-Timestamp': timestamp,
        'X-Grounded-Nonce': nonce,
        'X-Grounded-Signature': signature,
      },
      body: bodyStr,
    });
    if (!res.ok) {
      console.warn(`[appliance] ping non-OK: HTTP ${res.status}`);
    }
  } catch (err) {
    console.warn(`[appliance] ping failed: ${err.message}`);
  }
}

function joinUrl(base, suffix) {
  const b = base.endsWith('/') ? base.slice(0, -1) : base;
  const s = suffix.startsWith('/') ? suffix.slice(1) : suffix;
  return `${b}/${s}`;
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((err) => {
    console.error('[appliance] handler error', err);
    sendJson(res, 500, { error: err.message });
  });
});

server.listen(PORT, HOST, () => {
  console.log(`[appliance] listening on ${HOST}:${PORT} (version=${VERSION})`);
  if (APPLIANCE_ID && CENTRAL_URL) {
    pingHome();
    setInterval(pingHome, PING_INTERVAL_MS);
    console.log(`[appliance] heartbeat → ${CENTRAL_URL} every ${PING_INTERVAL_MS}ms`);
  }
});
