// Unit tests for the Digital Security Audit pipeline (Slice C agent).
// Mocks pool.query + lib/claude.chat so the tests are deterministic and
// DB-free. The full integration validation still requires running the
// audit on a real DB, but these tests cover:
//   - the row lifecycle (running → completed / failed)
//   - that runAudit reads inventory + jurisdiction + history correctly
//   - that the scored inventory feeds the Claude prompt
//   - that the parsed fix list lands on the persisted summary
//   - tenant scoping in every SQL call (newsroom_id is parameterised)
//   - the failure path (chat throws → row marked failed + reportId on err)

const test = require('node:test');
const assert = require('node:assert/strict');

// ── Mock pool ────────────────────────────────────────────────────────────
//
// runAudit hits pool.query in this exact order:
//   1. INSERT INTO security_audit_reports ... RETURNING id      → { id }
//   2. SELECT ... FROM security_external_tools                  → inventory rows
//   3. SELECT ... FROM newsroom_profiles                        → jurisdiction + overrides
//   4. SELECT ... FROM workflow_executions GROUP BY ...         → routing rows
//   5. UPDATE security_audit_reports SET status='completed' ... → result
//
// We script the answers in order and capture every (sql, params) for
// assertions.

const calls = [];
let scriptedResponses = [];

function pushResponse(rows, rowCount) {
  scriptedResponses.push({ rows, rowCount: rowCount ?? rows.length });
}

const dbPath = require.resolve('../../lib/db');
require.cache[dbPath] = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: {
    pool: {
      query: async (sql, params) => {
        calls.push({ sql, params });
        const next = scriptedResponses.shift();
        if (!next) throw new Error(`unscripted pool.query call:\n${sql.slice(0, 200)}…`);
        if (next.__throw) throw next.__throw;
        return next;
      },
    },
  },
};

// ── Mock claude ─────────────────────────────────────────────────────────
let scriptedChat = null;
const claudePath = require.resolve('../../lib/claude');
require.cache[claudePath] = {
  id: claudePath,
  filename: claudePath,
  loaded: true,
  exports: {
    GROUNDED_MODEL: 'claude-haiku-4-5-20251001',
    isFallbackModel: () => false,
    chat: async () => {
      if (!scriptedChat) throw new Error('unscripted chat() call');
      const r = scriptedChat;
      if (r.__throw) throw r.__throw;
      return r;
    },
  },
};

const { runAudit } = require('../../lib/agents/security_audit');

function reset() {
  calls.length = 0;
  scriptedResponses = [];
  scriptedChat = null;
}

// ── Tests ───────────────────────────────────────────────────────────────

test('runAudit happy path persists completed report with fix list', async () => {
  reset();
  // 1. INSERT (open row)
  pushResponse([{ id: 'report-1' }]);
  // 2. SELECT inventory (one tool: ChatGPT, US-resident)
  pushResponse([{
    id: 'tool-1',
    vendor: 'OpenAI',
    tool_name: 'ChatGPT',
    data_residency: 'US',
    declared_use: 'Drafting social copy',
    data_kinds_exposed: ['unpublished_drafts'],
    data_kinds_other: null,
    notes: null,
    added_by: 'user-1',
    created_at: new Date(),
    updated_at: new Date(),
  }]);
  // 3. SELECT newsroom_profiles (ZA jurisdiction, no overrides)
  pushResponse([{ jurisdiction: 'ZA', overrides: null }]);
  // 4. SELECT workflow_executions (one routing row)
  pushResponse([{
    workflow_slug: 'verify-and-tweet',
    sensitivity_label: 'public',
    executed_on: 'cloud',
    runs: 5, completed: 5, failed: 0,
  }]);
  // 5. UPDATE (persist completion)
  pushResponse([]);

  scriptedChat = {
    text: JSON.stringify({
      summary_narrative: 'One US-resident tool processing unpublished drafts. Move source-protection work off ChatGPT.',
      fix_list: [
        { priority: 'high', title: 'Stop pasting source contacts into ChatGPT', action: 'Reroute via internal Grounded workflow', evidence: 'OpenAI/ChatGPT US-resident; data_kinds_exposed includes unpublished_drafts' },
      ],
      concerns_noted: ['No appliance registered yet — sensitive jobs cannot run locally'],
    }),
    cost: { costUsd: 0.0021 },
  };

  const r = await runAudit({ newsroomId: 'nr-1', userId: 'user-1' });

  assert.equal(r.reportId, 'report-1');
  assert.equal(r.overallRiskBand, 'high'); // ChatGPT US + unpublished_drafts in ZA escalates to high
  assert.equal(r.output.fix_list.length, 1);
  assert.equal(r.output.fix_list[0].priority, 'high');
  assert.match(r.output.summary_narrative, /ChatGPT/);

  // Each SQL call must include the newsroom_id parameter for tenant scoping.
  const newsroomScopedCalls = calls.slice(1, 4); // inventory, profile, history
  for (const c of newsroomScopedCalls) {
    assert.ok(c.params.includes('nr-1'), `expected newsroom-id param on SQL:\n${c.sql.slice(0, 100)}…`);
  }
});

test('runAudit failure path marks report failed and attaches reportId to error', async () => {
  reset();
  pushResponse([{ id: 'report-failed' }]); // INSERT opens row
  pushResponse([]); // inventory empty
  pushResponse([{ jurisdiction: 'ZA', overrides: null }]); // profile
  pushResponse([]); // history empty
  // 5. UPDATE (mark failed) — only fires after the catch
  pushResponse([]);

  scriptedChat = { __throw: new Error('Anthropic timeout') };

  let threw = null;
  try {
    await runAudit({ newsroomId: 'nr-1' });
  } catch (e) {
    threw = e;
  }

  assert.ok(threw, 'runAudit must rethrow on chat failure');
  assert.equal(threw.message, 'Anthropic timeout');
  assert.equal(threw.reportId, 'report-failed', 'error must carry the report id so UI can deep-link');

  const updateCall = calls.find((c) => c.sql.includes('UPDATE security_audit_reports') && c.sql.includes("'failed'"));
  assert.ok(updateCall, 'must persist status=failed before rethrowing');
  assert.equal(updateCall.params[0], 'report-failed');
});

test('runAudit honours custom routingWindowDays and clamps absurd values', async () => {
  reset();
  pushResponse([{ id: 'r-windowed' }]);
  pushResponse([]); pushResponse([{ jurisdiction: 'default', overrides: null }]); pushResponse([]);
  pushResponse([]);
  scriptedChat = { text: JSON.stringify({ fix_list: [], concerns_noted: [], summary_narrative: '' }), cost: { costUsd: 0 } };

  await runAudit({ newsroomId: 'nr-1', routingWindowDays: 30 });

  const insert = calls.find((c) => c.sql.includes('INSERT INTO security_audit_reports'));
  assert.ok(insert.params.includes(30), 'inserted routing_window_days must be 30');

  const historyCall = calls.find((c) => c.sql.includes('workflow_executions'));
  assert.ok(historyCall.params.includes('30'), 'history SQL must filter to 30-day window');
});

test('runAudit clamps an over-large window down to the MAX', async () => {
  reset();
  pushResponse([{ id: 'r-clamp' }]);
  pushResponse([]); pushResponse([{ jurisdiction: 'default', overrides: null }]); pushResponse([]);
  pushResponse([]);
  scriptedChat = { text: JSON.stringify({ fix_list: [], concerns_noted: [], summary_narrative: '' }), cost: { costUsd: 0 } };

  await runAudit({ newsroomId: 'nr-1', routingWindowDays: 99999 });

  const insert = calls.find((c) => c.sql.includes('INSERT INTO security_audit_reports'));
  const inserted = insert.params.find((p) => typeof p === 'number');
  assert.ok(inserted <= 365, `window must be clamped <= MAX (got ${inserted})`);
});

test('runAudit handles unparseable Claude output gracefully', async () => {
  reset();
  pushResponse([{ id: 'r-bad-json' }]);
  pushResponse([]); pushResponse([{ jurisdiction: 'default', overrides: null }]); pushResponse([]);
  pushResponse([]);
  // Claude returns garbage — parseClaudeJson will throw, which lib should
  // catch and either fail cleanly OR persist defensible defaults. Either
  // way: the test should not crash silently.
  scriptedChat = { text: 'This is not JSON at all.', cost: { costUsd: 0.001 } };

  let threw = null;
  try {
    await runAudit({ newsroomId: 'nr-1' });
  } catch (e) {
    threw = e;
  }
  // We accept either: throws (caught by outer catch, row marked failed) or
  // succeeds with empty fix_list. The currently-correct behaviour is throw,
  // because parseClaudeJson throws on invalid JSON; the catch in runAudit
  // re-throws after marking the row failed.
  assert.ok(threw, 'unparseable JSON should bubble up via the failed-row path');
  const failedUpdate = calls.find((c) => c.sql.includes('UPDATE security_audit_reports') && c.sql.includes("'failed'"));
  assert.ok(failedUpdate, 'must persist status=failed');
});

test('runAudit with empty inventory still produces a completed report (low band)', async () => {
  reset();
  pushResponse([{ id: 'r-empty' }]);
  pushResponse([]); // empty inventory
  pushResponse([{ jurisdiction: 'ZA', overrides: null }]);
  pushResponse([]); // empty history
  pushResponse([]); // UPDATE

  scriptedChat = {
    text: JSON.stringify({
      summary_narrative: 'No external tools logged. Add inventory entries to get a meaningful audit.',
      fix_list: [],
      concerns_noted: ['Empty inventory'],
    }),
    cost: { costUsd: 0.0008 },
  };

  const r = await runAudit({ newsroomId: 'nr-1' });
  assert.equal(r.overallRiskBand, 'low');
  assert.equal(r.output.fix_list.length, 0);
});

test('runAudit per-newsroom overrides flow through to scoring', async () => {
  reset();
  pushResponse([{ id: 'r-over' }]);
  // A US tool that would normally be 'medium' in ZA → safe via override.
  pushResponse([{
    id: 'tool-allow',
    vendor: 'OpenAI', tool_name: 'ChatGPT', data_residency: 'US',
    declared_use: 'Drafting', data_kinds_exposed: [], data_kinds_other: null,
    notes: null, added_by: null, created_at: new Date(), updated_at: new Date(),
  }]);
  // Override that allow-lists OpenAI:
  pushResponse([{
    jurisdiction: 'ZA',
    overrides: { tool_allow_list: [{ vendor: 'OpenAI', reason: 'enterprise contract' }] },
  }]);
  pushResponse([]);
  pushResponse([]);

  scriptedChat = { text: JSON.stringify({ summary_narrative: '', fix_list: [], concerns_noted: [] }), cost: { costUsd: 0 } };

  const r = await runAudit({ newsroomId: 'nr-1' });
  // Allow-list caps at medium; the tool's per-tool scoring lives in the
  // persisted summary inventory_with_scoring entry.
  const inv = r.output.inventory_with_scoring.find((t) => t.tool_name === 'ChatGPT');
  assert.ok(inv, 'tool must appear in persisted summary');
  assert.notEqual(inv.risk_band, 'high', 'allow-list should keep it below high');
  assert.ok(inv.reasons.some((reason) => reason.kind === 'allow_listed'),
    'reasons must record that the override fired');
});
