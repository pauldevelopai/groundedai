// Tests for the db_read agentic tool. We don't hit a real database — we
// mock pool.query and verify the SQL + params the tool builds.

const test = require('node:test');
const assert = require('node:assert/strict');

// Capture mode for the mocked pool — every call records its (sql, params)
// into this array.
const calls = [];
const dbModulePath = require.resolve('../../lib/db');
require.cache[dbModulePath] = {
  id: dbModulePath,
  filename: dbModulePath,
  loaded: true,
  exports: {
    pool: {
      query: async (sql, params) => {
        calls.push({ sql, params });
        return { rows: [{ id: 'fake' }], rowCount: 1 };
      },
    },
  },
};

const db_read = require('../../lib/agents/agentic/tools/db_read');

function reset() { calls.length = 0; }

test('rejects table not in whitelist', async () => {
  reset();
  const out = await db_read.run({ table: 'users' }, { newsroomId: 'n1' });
  assert.ok(out.error.includes('not in the read whitelist'));
  assert.equal(calls.length, 0);
});

test('rejects when newsroomId missing', async () => {
  reset();
  const out = await db_read.run({ table: 'editorial_calendar' }, {});
  assert.match(out.error, /newsroomId/);
  assert.equal(calls.length, 0);
});

test('auto-scopes by newsroom_id', async () => {
  reset();
  await db_read.run({ table: 'editorial_calendar' }, { newsroomId: 'nr-1' });
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /WHERE newsroom_id = \$1/);
  assert.deepEqual(calls[0].params, ['nr-1']);
});

test('equality filter on user field', async () => {
  reset();
  await db_read.run(
    { table: 'freelancers', where: { status: 'active' } },
    { newsroomId: 'nr-1' },
  );
  assert.match(calls[0].sql, /WHERE newsroom_id = \$1 AND status = \$2/);
  assert.deepEqual(calls[0].params, ['nr-1', 'active']);
});

test('IN filter expands to placeholders', async () => {
  reset();
  await db_read.run(
    { table: 'inbound_submissions', where: { status: { in: ['new', 'in_triage'] } } },
    { newsroomId: 'nr-1' },
  );
  assert.match(calls[0].sql, /status IN \(\$2, \$3\)/);
  assert.deepEqual(calls[0].params, ['nr-1', 'new', 'in_triage']);
});

test('range operator', async () => {
  reset();
  await db_read.run(
    { table: 'workflow_runs', where: { duration_ms: { gte: 1000 } } },
    { newsroomId: 'nr-1' },
  );
  assert.match(calls[0].sql, /duration_ms >= \$2/);
  assert.deepEqual(calls[0].params, ['nr-1', 1000]);
});

test('ILIKE filter', async () => {
  reset();
  await db_read.run(
    { table: 'community_contributors', where: { name: { like: '%mensah%' } } },
    { newsroomId: 'nr-1' },
  );
  assert.match(calls[0].sql, /name::text ILIKE \$2/);
  assert.deepEqual(calls[0].params, ['nr-1', '%mensah%']);
});

test('rejects invalid table identifier (SQL-injection attempt)', async () => {
  reset();
  const out = await db_read.run({ table: 'users; DROP TABLE users;' }, { newsroomId: 'nr-1' });
  assert.ok(out.error.includes('not in the read whitelist'));
  assert.equal(calls.length, 0);
});

test('rejects invalid field name in where', async () => {
  reset();
  const out = await db_read.run(
    { table: 'editorial_calendar', where: { 'bad name; DROP': 'x' } },
    { newsroomId: 'nr-1' },
  );
  assert.match(out.error, /invalid field name/);
  assert.equal(calls.length, 0);
});

test('rejects invalid select column', async () => {
  reset();
  const out = await db_read.run(
    { table: 'editorial_calendar', select: ['title', 'bad; DROP TABLE x'] },
    { newsroomId: 'nr-1' },
  );
  assert.match(out.error, /invalid column name/);
  assert.equal(calls.length, 0);
});

test('order_by validated', async () => {
  reset();
  await db_read.run(
    { table: 'editorial_calendar', order_by: 'created_at desc' },
    { newsroomId: 'nr-1' },
  );
  assert.match(calls[0].sql, /ORDER BY created_at DESC/);

  reset();
  const out = await db_read.run(
    { table: 'editorial_calendar', order_by: 'foo; DROP TABLE x' },
    { newsroomId: 'nr-1' },
  );
  assert.match(out.error, /invalid order_by column/);
});

test('limit capped at MAX_LIMIT', async () => {
  reset();
  await db_read.run(
    { table: 'editorial_calendar', limit: 9999 },
    { newsroomId: 'nr-1' },
  );
  assert.match(calls[0].sql, /LIMIT 50$/);
});

test('IN empty array → FALSE (returns no rows)', async () => {
  reset();
  await db_read.run(
    { table: 'editorial_calendar', where: { status: { in: [] } } },
    { newsroomId: 'nr-1' },
  );
  assert.match(calls[0].sql, /AND FALSE/);
});

test('null value generates IS NULL', async () => {
  reset();
  await db_read.run(
    { table: 'editorial_calendar', where: { assignee_id: null } },
    { newsroomId: 'nr-1' },
  );
  assert.match(calls[0].sql, /assignee_id IS NULL/);
});
