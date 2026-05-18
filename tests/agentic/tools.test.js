// Unit tests for the agentic tool-layer guardrails. DB-free.
// Exercises only the pure / shallow paths: tool name presence, recursion
// depth refusal, self-invocation refusal, schema shape.

const test = require('node:test');
const assert = require('node:assert/strict');

const tools = require('../../lib/agents/agentic/tools');
const invokeAgent = require('../../lib/agents/agentic/tools/invoke_agent');

test('tools.all exports the V2 Step 4 tool palette', () => {
  const names = tools.all.map((t) => t.name).sort();
  assert.deepEqual(names, ['archive_search', 'db_read', 'invoke_agent', 'web_fetch']);
});

test('each tool exposes name, description, input_schema, run', () => {
  for (const t of tools.all) {
    assert.equal(typeof t.name, 'string');
    assert.ok(t.description && t.description.length > 10, `${t.name} description too short`);
    assert.equal(typeof t.run, 'function');
    assert.equal(t.input_schema.type, 'object');
    assert.ok(Array.isArray(t.input_schema.required), `${t.name} input_schema.required missing`);
  }
});

test('invoke_agent refuses self-invocation', async () => {
  const result = await invokeAgent.run(
    { slug: 'verifier', input: { articleText: 'x' } },
    { newsroomId: 'n', userId: 'u', parentAgent: 'verifier' },
  );
  assert.match(result.error, /refused.*itself/);
});

test('invoke_agent refuses past MAX_DEPTH', async () => {
  const result = await invokeAgent.run(
    { slug: 'verifier', input: {} },
    { newsroomId: 'n', userId: 'u', parentAgent: 'researcher', _agenticDepth: invokeAgent.MAX_DEPTH },
  );
  assert.match(result.error, /recursion depth/);
});

test('invoke_agent refuses unknown slug', async () => {
  const result = await invokeAgent.run(
    { slug: 'not_a_real_agent', input: {} },
    { newsroomId: 'n', userId: 'u', parentAgent: 'verifier' },
  );
  assert.match(result.error, /unknown agent/);
});

test('invoke_agent demands a slug', async () => {
  const result = await invokeAgent.run({ input: {} }, { newsroomId: 'n', userId: 'u' });
  assert.match(result.error, /slug required/);
});

test('web_fetch rejects non-http URLs', async () => {
  const result = await tools.web_fetch.run(
    { url: 'javascript:alert(1)' },
    { newsroomId: 'n', userId: 'u' },
  );
  assert.match(result.error, /http\(s\)/);
});

test('archive_search demands newsroomId in ctx', async () => {
  const result = await tools.archive_search.run(
    { question: 'anything' },
    { /* no newsroomId */ },
  );
  assert.match(result.error, /newsroomId/);
});
