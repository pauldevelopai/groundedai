// Unit tests for the AI-crawler-policy snippet renderers + default policy.
// Database-free — pure functions over a Policy object.

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  KNOWN_BOTS,
  DEFAULT_POLICY,
  renderRobotsTxt,
  renderAiTxt,
  renderLlmsTxt,
} = require('../../lib/newsroom-profile/ai-crawler-policy');

test('DEFAULT_POLICY: every known bot has an entry, all set to disallow', () => {
  for (const bot of KNOWN_BOTS) {
    assert.equal(typeof DEFAULT_POLICY.bots[bot.name], 'boolean', `missing default for ${bot.name}`);
    assert.equal(DEFAULT_POLICY.bots[bot.name], false, `default for ${bot.name} should be disallow`);
  }
  assert.equal(DEFAULT_POLICY.default_allow, false);
  assert.deepEqual(DEFAULT_POLICY.disallow_paths, []);
});

test('renderRobotsTxt: blocked bot emits Disallow: /', () => {
  const policy = { bots: { GPTBot: false }, default_allow: false, disallow_paths: [] };
  const out = renderRobotsTxt(policy);
  assert.match(out, /User-agent: GPTBot\nDisallow: \//);
});

test('renderRobotsTxt: allowed bot emits Allow: /', () => {
  const policy = { bots: { GPTBot: true }, default_allow: false, disallow_paths: [] };
  const out = renderRobotsTxt(policy);
  assert.match(out, /User-agent: GPTBot\nAllow: \//);
});

test('renderRobotsTxt: allowed bot still honours disallow_paths', () => {
  const policy = {
    bots: { GPTBot: true },
    default_allow: false,
    disallow_paths: ['/investigations/'],
  };
  const out = renderRobotsTxt(policy);
  assert.match(out, /User-agent: GPTBot\nAllow: \/\nDisallow: \/investigations\//);
});

test('renderRobotsTxt: catch-all reflects default_allow', () => {
  const blocked = renderRobotsTxt({ bots: {}, default_allow: false, disallow_paths: [] });
  assert.match(blocked, /User-agent: \*\n# \(Catch-all unspecified/);

  const allowed = renderRobotsTxt({ bots: {}, default_allow: true, disallow_paths: [] });
  assert.match(allowed, /User-agent: \*\nAllow: \//);

  const allowedWithBlocks = renderRobotsTxt({
    bots: {}, default_allow: true, disallow_paths: ['/draft/'],
  });
  assert.match(allowedWithBlocks, /User-agent: \*\nDisallow: \/draft\//);
});

test('renderAiTxt: emits a stanza per known bot', () => {
  const policy = { bots: {}, default_allow: false, disallow_paths: [] };
  const out = renderAiTxt(policy);
  for (const bot of KNOWN_BOTS) {
    assert.ok(out.includes(`User-Agent: ${bot.name}`), `missing ai.txt stanza for ${bot.name}`);
  }
  assert.match(out, /Disallow-AI-Training: disallow/);
});

test('renderAiTxt: per-bot toggle reflected in stanza', () => {
  const policy = { bots: { GPTBot: true }, default_allow: false, disallow_paths: [] };
  const out = renderAiTxt(policy);
  // Find the GPTBot stanza and check it allows
  const stanza = out.split('\n\n').find((s) => s.startsWith('User-Agent: GPTBot'));
  assert.ok(stanza, 'GPTBot stanza missing');
  assert.match(stanza, /Disallow-AI-Training: allow/);
});

test('renderLlmsTxt: includes the newsroom name', () => {
  const out = renderLlmsTxt(DEFAULT_POLICY, { siteName: 'EnviroPress' });
  assert.match(out, /# EnviroPress/);
});

test('renderLlmsTxt: signals opt-out when default_allow is false', () => {
  const out = renderLlmsTxt({ bots: {}, default_allow: false, disallow_paths: [] }, { siteName: 'X' });
  assert.match(out, /not.*licensed for AI training/);
});
