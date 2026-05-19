// Tests for the Digital Security Audit jurisdiction scorer.
// Deterministic, no DB, no Claude.

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  loadPacks,
  packFor,
  mergePackWithOverrides,
  scoreTool,
  scoreInventory,
} = require('../../lib/security/jurisdiction');

// Force a re-read so test order doesn't matter.
function reload() { loadPacks({ reload: true }); }

// ── loadPacks + packFor ──────────────────────────────────────────────────

test('loadPacks returns parsed YAML with a default section', () => {
  reload();
  const packs = loadPacks();
  assert.ok(packs.default, 'must have a default pack');
  assert.ok(packs.ZA, 'must have a ZA pack');
});

test('packFor falls back to default on unknown jurisdiction', () => {
  reload();
  const p = packFor('XX');
  assert.equal(typeof p.data_law_summary, 'string');
  // default has EU + GB on the safe list
  assert.ok(p.safe_residencies.includes('EU'));
});

test('packFor returns the matching pack for a known jurisdiction', () => {
  reload();
  const p = packFor('ZA');
  assert.ok(p.data_law_summary.includes('POPIA'));
  assert.ok(p.safe_residencies.includes('ZA'));
  assert.ok(p.risky_residencies.includes('US'));
});

// ── scoreTool — residency logic ──────────────────────────────────────────

test('safe residency for ZA newsroom → low risk', () => {
  reload();
  const r = scoreTool({ vendor: 'Develop AI', tool_name: 'Grounded', data_residency: 'ZA' }, 'ZA');
  assert.equal(r.risk_band, 'low');
  assert.ok(r.reasons.some((x) => x.kind === 'safe_residency'));
});

test('risky residency (US) for ZA newsroom → at least medium', () => {
  reload();
  const r = scoreTool({ vendor: 'Acme', tool_name: 'AcmeChat', data_residency: 'US' }, 'ZA');
  assert.ok(r.risk_band === 'medium' || r.risk_band === 'high' || r.risk_band === 'critical');
  assert.ok(r.reasons.some((x) => x.kind === 'risky_residency'));
});

test('unknown residency → medium', () => {
  reload();
  const r = scoreTool({ vendor: 'Acme', tool_name: 'AcmeChat', data_residency: 'BR' }, 'ZA');
  assert.equal(r.risk_band, 'medium');
  assert.ok(r.reasons.some((x) => x.kind === 'unknown_residency'));
});

test('missing residency → medium with no_residency_declared reason', () => {
  reload();
  const r = scoreTool({ vendor: 'Acme', tool_name: 'AcmeChat' }, 'ZA');
  assert.equal(r.risk_band, 'medium');
  assert.ok(r.reasons.some((x) => x.kind === 'no_residency_declared'));
});

// ── scoreTool — tool_avoid_list ──────────────────────────────────────────

test('DeepSeek vs ZA pack → high (severity=avoid)', () => {
  reload();
  const r = scoreTool({ vendor: 'DeepSeek', tool_name: 'DeepSeek-V3', data_residency: 'CN' }, 'ZA');
  assert.equal(r.risk_band, 'high');
  assert.ok(r.reasons.some((x) => x.kind === 'avoid_listed' && x.severity === 'avoid'));
});

test('TikTok vs default pack → medium (severity=warn)', () => {
  reload();
  const r = scoreTool({ vendor: 'ByteDance', tool_name: 'TikTok', data_residency: 'CN' }, 'default');
  assert.equal(r.risk_band, 'medium');
  assert.ok(r.reasons.some((x) => x.kind === 'avoid_listed' && x.severity === 'warn'));
});

test('OpenAI / ChatGPT vs ZA pack → medium warn (US-resident + avoid_listed)', () => {
  reload();
  const r = scoreTool({ vendor: 'OpenAI', tool_name: 'ChatGPT', data_residency: 'US' }, 'ZA');
  // Both risky_residency (US) + avoid_listed (warn) apply → medium.
  assert.equal(r.risk_band, 'medium');
});

// ── scoreTool — sensitive data kinds escalation ──────────────────────────

test('source_contacts in unsafe residency escalates one band', () => {
  reload();
  const r = scoreTool({
    vendor: 'Acme', tool_name: 'AcmeChat', data_residency: 'US',
    data_kinds_exposed: ['source_contacts'],
  }, 'ZA');
  // US in ZA pack = medium baseline; source_contacts bumps to high.
  assert.equal(r.risk_band, 'high');
  assert.ok(r.reasons.some((x) => x.kind === 'sensitive_data_exposed'));
});

test('source_contacts in safe residency does NOT escalate', () => {
  reload();
  const r = scoreTool({
    vendor: 'Acme', tool_name: 'AcmeChat', data_residency: 'ZA',
    data_kinds_exposed: ['source_contacts'],
  }, 'ZA');
  assert.equal(r.risk_band, 'low');
});

// ── overrides ────────────────────────────────────────────────────────────

test('per-newsroom allow_list caps risk at medium for an otherwise-high tool', () => {
  reload();
  const overrides = {
    tool_allow_list: [
      { vendor: 'DeepSeek', reason: 'sandbox-only use under approved policy' },
    ],
  };
  const r = scoreTool({ vendor: 'DeepSeek', tool_name: 'DeepSeek-V3', data_residency: 'CN' }, 'ZA', overrides);
  assert.notEqual(r.risk_band, 'high');
  assert.notEqual(r.risk_band, 'critical');
  assert.ok(r.reasons.some((x) => x.kind === 'allow_listed'));
});

test('per-newsroom additional avoid_list flags a vendor the pack does not know', () => {
  reload();
  const overrides = {
    tool_avoid_list: [
      { vendor: 'TotallyMadeUp', severity: 'prohibit', reason: 'internal policy' },
    ],
  };
  const r = scoreTool({ vendor: 'TotallyMadeUp', tool_name: 'X', data_residency: 'EU' }, 'ZA', overrides);
  assert.equal(r.risk_band, 'critical');
});

test('per-newsroom safe_residency override flips a pack-risky residency', () => {
  reload();
  const overrides = { safe_residencies: ['US'] };
  const r = scoreTool({ vendor: 'Acme', tool_name: 'AcmeChat', data_residency: 'US' }, 'ZA', overrides);
  assert.equal(r.risk_band, 'low');
  assert.ok(r.reasons.some((x) => x.kind === 'safe_residency'));
});

// ── matching ────────────────────────────────────────────────────────────

test('entry matching is case-insensitive on vendor', () => {
  reload();
  const r = scoreTool({ vendor: 'deepseek', tool_name: 'DeepSeek-V3', data_residency: 'CN' }, 'ZA');
  assert.equal(r.risk_band, 'high');
});

test('vendor-only avoid entry does not match a different vendor', () => {
  reload();
  // DeepSeek entry matches by vendor only. A tool from "OtherCo" with the
  // same product name should NOT be flagged by the DeepSeek entry.
  const r = scoreTool({ vendor: 'OtherCo', tool_name: 'DeepSeek-V3-Clone', data_residency: 'ZA' }, 'ZA');
  // Safe ZA residency, no avoid match → low.
  assert.equal(r.risk_band, 'low');
});

// ── mergePackWithOverrides ──────────────────────────────────────────────

test('mergePackWithOverrides: override avoid entry replaces same-key pack entry', () => {
  reload();
  const pack = packFor('ZA');
  const overrides = {
    tool_avoid_list: [
      { vendor: 'OpenAI', severity: 'prohibit', reason: 'internal escalation' },
    ],
  };
  const merged = mergePackWithOverrides(pack, overrides);
  // Should appear exactly once, with the override severity.
  const openai = merged.tool_avoid_list.filter((e) => (e.vendor || '').toLowerCase() === 'openai');
  assert.equal(openai.length, 1);
  assert.equal(openai[0].severity, 'prohibit');
});

// ── scoreInventory ──────────────────────────────────────────────────────

test('scoreInventory rolls up overall band to the highest per-tool band', () => {
  reload();
  const tools = [
    { id: 't1', vendor: 'Develop AI', tool_name: 'Grounded', data_residency: 'ZA' },
    { id: 't2', vendor: 'OpenAI', tool_name: 'ChatGPT', data_residency: 'US' },
    { id: 't3', vendor: 'DeepSeek', tool_name: 'DeepSeek-V3', data_residency: 'CN' },
  ];
  const r = scoreInventory(tools, 'ZA');
  assert.equal(r.overall_risk_band, 'high'); // DeepSeek = high
  assert.equal(r.counts.low, 1);
  assert.ok(r.counts.medium + r.counts.high + r.counts.critical === 2);
});

test('scoreInventory empty inventory → low overall', () => {
  reload();
  const r = scoreInventory([], 'ZA');
  assert.equal(r.overall_risk_band, 'low');
  assert.deepEqual(r.counts, { low: 0, medium: 0, high: 0, critical: 0 });
});

// ── 2026-05-18 research-grade additions ─────────────────────────────────

test('ZA pack has audit_depth=deep and at least one primary-legislation source', () => {
  reload();
  const p = packFor('ZA');
  assert.equal(p.audit_depth, 'deep');
  assert.ok(p.last_verified, 'last_verified must be set');
  assert.ok(p.data_law_sources.length > 0, 'data_law_sources must be populated');
  assert.ok(
    p.data_law_sources.some((s) => s.evidence_kind === 'primary_legislation'),
    'at least one primary_legislation citation expected on the ZA summary',
  );
});

test('ZA OpenAI/ChatGPT avoid-list entry carries sources through to scoreTool reasons', () => {
  reload();
  const r = scoreTool({ vendor: 'OpenAI', tool_name: 'ChatGPT', data_residency: 'US' }, 'ZA');
  const avoidReason = r.reasons.find((x) => x.kind === 'avoid_listed');
  assert.ok(avoidReason, 'avoid_listed reason must be present');
  assert.ok(Array.isArray(avoidReason.sources) && avoidReason.sources.length > 0,
    'avoid_listed reason must carry sources from the YAML');
  assert.ok(
    avoidReason.sources.some((s) => s.evidence_kind === 'primary_legislation'),
    'sources should include a primary_legislation reference (POPIA s.72 / RISAA)',
  );
  assert.ok(avoidReason.last_verified, 'last_verified must be passed through');
});

test('Nigeria (NG) pack is registered, light depth, with NDPA primary source', () => {
  reload();
  const p = packFor('NG');
  assert.equal(p.audit_depth, 'light');
  assert.ok(p.data_law_sources.some((s) => s.evidence_kind === 'primary_legislation'),
    'NDPA 2023 must be cited as primary_legislation');
});

test('Tanzania, Uganda, Ghana all registered as light packs', () => {
  reload();
  for (const j of ['TZ', 'UG', 'GH']) {
    const p = packFor(j);
    assert.equal(p.audit_depth, 'light', `${j} should be light depth`);
    assert.ok(p.data_law_sources.length > 0, `${j} should cite its data-protection act`);
  }
});

test('vendor-only override replaces vendor+tool_name pack entry (loose match)', () => {
  reload();
  // ZA pack has { vendor: 'OpenAI', tool_name: 'ChatGPT', severity: 'warn' }.
  // A vendor-only override should fully replace it.
  const { mergePackWithOverrides } = require('../../lib/security/jurisdiction');
  const pack = packFor('ZA');
  const merged = mergePackWithOverrides(pack, {
    tool_avoid_list: [{ vendor: 'OpenAI', severity: 'prohibit', reason: 'tightened policy' }],
  });
  const openai = merged.tool_avoid_list.filter((e) => (e.vendor || '').toLowerCase() === 'openai');
  assert.equal(openai.length, 1, 'exactly one OpenAI entry after merge');
  assert.equal(openai[0].severity, 'prohibit');
});
