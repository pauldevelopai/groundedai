// lib/nodes/host.js
// ─────────────────────────────────────────────────────────────────────────
// The INTEGRATED host facade — the Postgres-backed, session-scoped twin of
// the runtime's createLiteHost (grounded-node-runtime/src/host-lite.js).
//
// A Node ships in two forms with IDENTICAL application code:
//   STANDALONE  — laptop fork, host = createLiteHost (JSON files, direct SDK).
//   INTEGRATED  — lifted into GROUNDED, host = createNodeHost (this file):
//                 scoped Postgres, Haiku-locked AI, real session newsroom_id.
//
// Node handlers (lib/handlers.js etc.) target the host *interface* and never
// know which implementation is underneath. This file must therefore mirror
// host-lite's shape and semantics exactly:
//
//   host.ctx          { newsroomId, userId, role }  (frozen)
//   host.tablePrefix  node_<slug>_  — every query must stay inside it
//   host.meta         install/version identity (parity object)
//   host.db.query(table, sql, params)   $1 = newsroom_id (auto-bound), $2..= user
//   host.db.tx(fn)    real transaction; fn({ query })
//   host.ai.chat(input, opts)           Haiku-locked via lib/claude.js, cost-logged
//   host.parse.docxToHtml(buffer)
//   host.log.run/edit/error
//   host.feedback.submit({ type, message, page })
//
// SQL convention (same as host-lite): handlers write real SQL with $1 =
// newsroom_id and pass ONLY their user params ($2..$N). The host prepends
// newsroom_id. Every table name must start with host.tablePrefix.
//
// Telemetry (log.*, feedback.submit) writes to the Node's own namespaced
// tables, created per-Node by its migration (standard shape documented at the
// bottom of this file). Telemetry is best-effort: a missing table or shape
// mismatch degrades to a console warning and never breaks a handler.

// lib/db and lib/claude are required LAZILY inside createNodeHost (only when
// the caller doesn't inject them via deps). Both transitively require lib/db,
// which throws unless DATABASE_URL is set — lazy require keeps the deps seam
// dependency-free for unit tests and any non-DB importer.

const HAIKU_MODEL = 'claude-haiku-4-5-20251001'; // parity fallback for the returned model name

// Optional: best-effort runtime version for the parity meta object. The Node
// runtime is a dependency once Nodes are vendored; absence is fine.
function readRuntimeVersion() {
  try {
    return require('@developai/grounded-node-runtime/package.json').version || null;
  } catch {
    return null;
  }
}

const FEEDBACK_TYPES = ['bug', 'suggestion', 'praise', 'question'];

// Same sanitiser posture as host-lite: drop keys that look like they carry
// sensitive content, cap strings, allow only short scalars.
function sanitiseContext(ctx) {
  if (!ctx || typeof ctx !== 'object') return null;
  const blocked = /text|content|body|claim|post|image|key|token|password|secret|email/i;
  const out = {};
  for (const [k, v] of Object.entries(ctx)) {
    if (blocked.test(k)) continue;
    if (v == null) { out[k] = null; continue; }
    if (typeof v === 'boolean' || typeof v === 'number') { out[k] = v; continue; }
    if (typeof v === 'string') { out[k] = v.length > 200 ? v.slice(0, 200) + '…' : v; continue; }
    // skip objects/arrays/functions
  }
  return out;
}

/**
 * Build an integrated host bound to a GROUNDED session.
 *
 * @param {object}  args
 * @param {string}  args.slug         Node slug, e.g. "makanday-analytics".
 * @param {object}  args.session      { newsroomId, userId, role } from getCurrentSession().
 * @param {string} [args.nodeVersion] Node package version, for the meta object.
 * @param {string} [args.newsroom]    Newsroom display name, for the meta object.
 * @param {object} [args.deps]        Test seam: { pool, chat, parseDocx } overrides.
 * @returns host object matching the createLiteHost interface.
 */
function createNodeHost({ slug, session, nodeVersion, newsroom, deps = {} } = {}) {
  if (!slug) throw new Error('createNodeHost: slug is required');
  if (!session || !session.newsroomId) {
    throw new Error('createNodeHost: a session with newsroomId is required');
  }

  const db = deps.pool || require('../db').pool;
  const chatFn = deps.chat || require('../claude').chat;
  const parseDocx = deps.parseDocx
    || (async (buffer) => (await require('mammoth').convertToHtml({ buffer })).value);

  const prefix = `node_${slug.replace(/-/g, '_')}_`;

  const ctx = Object.freeze({
    newsroomId: session.newsroomId,
    userId: session.userId,
    role: session.role,
  });

  const meta = Object.freeze({
    slug,
    host_id: `integrated:${ctx.newsroomId}`,
    node_version: nodeVersion || 'integrated',
    runtime_version: readRuntimeVersion(),
    newsroom: newsroom || null,
    platform: `grounded-integrated node ${process.version}`,
  });

  function assertOwned(table) {
    if (typeof table !== 'string' || !table.startsWith(prefix)) {
      throw new Error(`nodes/host: table "${table}" is outside this Node's namespace "${prefix}*"`);
    }
  }

  // Core scoped query. `client` lets tx() reuse a single connection.
  async function runQuery(client, table, sql, userParams = []) {
    assertOwned(table);
    return client.query(sql, [ctx.newsroomId, ...userParams]);
  }

  const query = (table, sql, params) => runQuery(db, table, sql, params);

  async function tx(fn) {
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const scoped = { query: (table, sql, params) => runQuery(client, table, sql, params) };
      const result = await fn(scoped);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      try { await client.query('ROLLBACK'); } catch { /* ignore rollback error */ }
      throw err;
    } finally {
      client.release();
    }
  }

  // AI: locked to Haiku via lib/claude.js. opts.model is intentionally ignored
  // (parity with the GROUNDED LOCK). Cost is logged to api_costs by lib/claude.js
  // through the context we pass. Returns the host-lite chat() shape.
  async function chat(input, opts = {}) {
    const messages = typeof input === 'string' ? [{ role: 'user', content: input }] : input;
    const r = await chatFn({
      system: opts.system,
      messages,
      maxTokens: opts.maxTokens || 1000,
      context: {
        newsroomId: ctx.newsroomId,
        userId: ctx.userId,
        agent: `node:${slug}`,
        endpoint: opts.endpoint || `node:${slug}`,
      },
    });
    return {
      text: r.text,
      provider: r.usedFallback ? 'fallback' : 'anthropic',
      model: (r.cost && r.cost.model) || (r.raw && r.raw.model) || HAIKU_MODEL,
      usedFallback: !!r.usedFallback,
    };
  }

  // ── Telemetry — best-effort writes to the Node's namespaced tables.
  async function tryInsert(table, sql, params) {
    try {
      await db.query(sql, params);
      return true;
    } catch (err) {
      // 42P01 = undefined_table (Node telemetry tables not migrated yet), or a
      // shape mismatch. Degrade to console; never break the handler.
      console.warn(`[nodes/host] telemetry insert skipped for ${table}: ${err.code || err.message}`);
      return false;
    }
  }

  async function appendActivity(kind, metaArg = {}) {
    const { op = null, ...rest } = metaArg;
    const table = `${prefix}activity`;
    return tryInsert(
      table,
      `INSERT INTO ${table} (newsroom_id, host_id, kind, op, details)
         VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [ctx.newsroomId, meta.host_id, kind, op, JSON.stringify(rest)]
    );
  }

  async function appendError({ op, error, context } = {}) {
    const table = `${prefix}errors`;
    return tryInsert(
      table,
      `INSERT INTO ${table}
         (newsroom_id, host_id, op, message, name, stack_first_line, context)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
      [
        ctx.newsroomId,
        meta.host_id,
        op || 'unknown',
        error?.message || String(error || '(no message)'),
        error?.name || null,
        error?.stack ? (String(error.stack).split('\n')[1]?.trim() || null) : null,
        JSON.stringify(sanitiseContext(context)),
      ]
    );
  }

  return {
    ctx,
    tablePrefix: prefix,
    meta,

    db: { query, tx },

    ai: { chat },

    parse: {
      docxToHtml: (buffer) => parseDocx(buffer),
    },

    log: {
      run: (metaArg) => appendActivity('run', metaArg),
      edit: (metaArg) => appendActivity('edit', metaArg),
      error: (arg) => appendError(arg),
    },

    // Feedback is the one channel that intentionally carries user free-text.
    feedback: {
      submit: async ({ type, message, page } = {}) => {
        const cleanType = FEEDBACK_TYPES.includes(type) ? type : 'other';
        const cleanMessage = String(message || '').slice(0, 4000).trim();
        if (!cleanMessage) throw new Error('Empty feedback message');
        const table = `${prefix}feedback`;
        const ok = await tryInsert(
          table,
          `INSERT INTO ${table} (newsroom_id, host_id, type, message, page)
             VALUES ($1, $2, $3, $4, $5)`,
          [ctx.newsroomId, meta.host_id, cleanType, cleanMessage,
            String(page || '').slice(0, 200) || null]
        );
        return { ok, type: cleanType };
      },
    },
  };
}

module.exports = { createNodeHost };

// ── Standard telemetry table shape (each Node's migration creates these three,
//    prefixed node_<slug>_; this is what log.* / feedback.submit expect):
//
//   CREATE TABLE node_<slug>_activity (
//     id          BIGSERIAL PRIMARY KEY,
//     newsroom_id UUID NOT NULL REFERENCES newsrooms(id) ON DELETE CASCADE,
//     host_id     TEXT,
//     kind        TEXT,                       -- 'run' | 'edit'
//     op          TEXT,                       -- operation name, e.g. 'ingest'
//     details     JSONB NOT NULL DEFAULT '{}'::jsonb,
//     created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
//   );
//   CREATE TABLE node_<slug>_errors (
//     id          BIGSERIAL PRIMARY KEY,
//     newsroom_id UUID NOT NULL REFERENCES newsrooms(id) ON DELETE CASCADE,
//     host_id     TEXT, op TEXT, message TEXT, name TEXT, stack_first_line TEXT,
//     context     JSONB,
//     created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
//   );
//   CREATE TABLE node_<slug>_feedback (
//     id          BIGSERIAL PRIMARY KEY,
//     newsroom_id UUID NOT NULL REFERENCES newsrooms(id) ON DELETE CASCADE,
//     host_id     TEXT, type TEXT, message TEXT, page TEXT,
//     created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
//   );
