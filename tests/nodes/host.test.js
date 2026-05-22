// Unit tests for the integrated Node host facade (lib/nodes/host.js).
// Hermetic: the pg pool, Claude wrapper, and docx parser are injected via the
// `deps` seam, so these run under `node --test` with no database or API key.

const { test } = require('node:test');
const assert = require('node:assert');
const { createNodeHost } = require('../../lib/nodes/host');

const SESSION = { newsroomId: 'nr-1', userId: 'u-1', role: 'builder' };

// A fake pg pool that records every query and returns a canned result.
function fakePool(result = { rows: [], rowCount: 0 }) {
  const calls = [];
  return {
    calls,
    async query(sql, params) { calls.push({ sql, params }); return result; },
    async connect() {
      return {
        async query(sql, params) { calls.push({ sql, params }); return result; },
        release() { calls.push({ released: true }); },
      };
    },
  };
}

test('requires slug and a session with newsroomId', () => {
  assert.throws(() => createNodeHost({ session: SESSION }), /slug is required/);
  assert.throws(() => createNodeHost({ slug: 'x' }), /newsroomId is required/);
});

test('tablePrefix and ctx derive from slug + session', () => {
  const host = createNodeHost({ slug: 'makanday-analytics', session: SESSION, deps: { pool: fakePool() } });
  assert.strictEqual(host.tablePrefix, 'node_makanday_analytics_');
  assert.deepStrictEqual(host.ctx, { newsroomId: 'nr-1', userId: 'u-1', role: 'builder' });
  try { host.ctx.newsroomId = 'evil'; } catch { /* throws under strict, no-ops otherwise */ }
  assert.strictEqual(host.ctx.newsroomId, 'nr-1'); // frozen: mutation has no effect
});

test('db.query auto-binds newsroom_id as $1 and prepends user params', async () => {
  const pool = fakePool({ rows: [{ n: 1 }], rowCount: 1 });
  const host = createNodeHost({ slug: 'makanday-analytics', session: SESSION, deps: { pool } });
  const t = `${host.tablePrefix}stories`;
  const res = await host.db.query(t, `SELECT * FROM ${t} WHERE newsroom_id = $1 AND source_label = $2`, ['matrix']);
  assert.deepStrictEqual(res.rows, [{ n: 1 }]);
  assert.deepStrictEqual(pool.calls[0].params, ['nr-1', 'matrix']); // newsroom_id first
});

test('db.query refuses tables outside the Node namespace', async () => {
  const host = createNodeHost({ slug: 'makanday-analytics', session: SESSION, deps: { pool: fakePool() } });
  await assert.rejects(
    () => host.db.query('users', 'SELECT * FROM users WHERE newsroom_id = $1'),
    /outside this Node's namespace/
  );
});

test('db.tx commits and exposes a scoped query', async () => {
  const pool = fakePool();
  const host = createNodeHost({ slug: 'n', session: SESSION, deps: { pool } });
  const t = `${host.tablePrefix}t`;
  await host.db.tx(async ({ query }) => {
    await query(t, `INSERT INTO ${t} (newsroom_id, x) VALUES ($1, $2)`, [42]);
  });
  const sqls = pool.calls.map((c) => c.sql).filter(Boolean);
  assert.ok(sqls.includes('BEGIN'));
  assert.ok(sqls.includes('COMMIT'));
  const insert = pool.calls.find((c) => (c.sql || '').startsWith('INSERT'));
  assert.deepStrictEqual(insert.params, ['nr-1', 42]);
});

test('db.tx rolls back on error and re-throws', async () => {
  const pool = fakePool();
  const host = createNodeHost({ slug: 'n', session: SESSION, deps: { pool } });
  await assert.rejects(() => host.db.tx(async () => { throw new Error('boom'); }), /boom/);
  const sqls = pool.calls.map((c) => c.sql).filter(Boolean);
  assert.ok(sqls.includes('ROLLBACK'));
  assert.ok(!sqls.includes('COMMIT'));
});

test('ai.chat maps input, tags the node, ignores model, returns host-lite shape', async () => {
  let received;
  const chat = async (args) => { received = args; return { text: 'hi', raw: { model: 'claude-haiku-4-5-20251001' }, cost: { model: 'claude-haiku-4-5-20251001' }, usedFallback: false }; };
  const host = createNodeHost({ slug: 'capitalfm-verifier', session: SESSION, deps: { pool: fakePool(), chat } });
  const out = await host.ai.chat('verify this', { system: 'sys', maxTokens: 500, model: 'gpt-4' });
  assert.deepStrictEqual(received.messages, [{ role: 'user', content: 'verify this' }]);
  assert.strictEqual(received.system, 'sys');
  assert.strictEqual(received.maxTokens, 500);
  assert.strictEqual(received.context.agent, 'node:capitalfm-verifier');
  assert.strictEqual(received.context.newsroomId, 'nr-1');
  assert.ok(!('model' in received)); // Haiku lock: no model passed through
  assert.deepStrictEqual(out, { text: 'hi', provider: 'anthropic', model: 'claude-haiku-4-5-20251001', usedFallback: false });
});

test('parse.docxToHtml delegates to the injected parser', async () => {
  const host = createNodeHost({ slug: 'n', session: SESSION, deps: { pool: fakePool(), parseDocx: async () => '<p>ok</p>' } });
  assert.strictEqual(await host.parse.docxToHtml(Buffer.from('x')), '<p>ok</p>');
});

test('log.run writes to the namespaced activity table with JSONB details', async () => {
  const pool = fakePool();
  const host = createNodeHost({ slug: 'makanday-analytics', session: SESSION, deps: { pool } });
  await host.log.run({ op: 'ingest', story_count: 120, success: true });
  const ins = pool.calls.find((c) => (c.sql || '').includes('node_makanday_analytics_activity'));
  assert.ok(ins, 'inserted into activity table');
  assert.strictEqual(ins.params[0], 'nr-1');          // newsroom_id
  assert.strictEqual(ins.params[2], 'run');           // kind
  assert.strictEqual(ins.params[3], 'ingest');        // op
  assert.deepStrictEqual(JSON.parse(ins.params[4]), { story_count: 120, success: true });
});

test('log/feedback degrade gracefully when the table is missing', async () => {
  const pool = {
    async query() { const e = new Error('relation does not exist'); e.code = '42P01'; throw e; },
    async connect() { throw new Error('unused'); },
  };
  const host = createNodeHost({ slug: 'n', session: SESSION, deps: { pool } });
  await assert.doesNotReject(() => host.log.run({ op: 'x' }));          // no throw
  const fb = await host.feedback.submit({ type: 'bug', message: 'broken' });
  assert.strictEqual(fb.ok, false);                                     // reported, not thrown
});

test('feedback.submit rejects empty messages', async () => {
  const host = createNodeHost({ slug: 'n', session: SESSION, deps: { pool: fakePool() } });
  await assert.rejects(() => host.feedback.submit({ type: 'bug', message: '   ' }), /Empty feedback/);
});
