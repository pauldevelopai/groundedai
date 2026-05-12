// Unit tests for the link-discovery filter logic in lib/research/crawl.js
// (without the network round-trip — we stub axios via the cache).

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

// Stub axios BEFORE requiring crawl.js, so the require('axios') inside
// crawl.js picks up our stub instead of the real module.
const stubHtml = `<!doctype html><html><body>
  <a href="/articles/cyril-ramaphosa-meeting">A</a>
  <a href="/articles/anc-conference">B</a>
  <a href="/podcasts/episode-12">Podcast (excluded)</a>
  <a href="/sponsored/foo">Sponsored (excluded)</a>
  <a href="https://OTHER-HOST.example/news">Other host (excluded by same_host_only)</a>
  <a href="/articles/anc-conference">Dupe of B</a>
  <a href="/investigations/state-capture">Priority</a>
  <a href="/login">Login (NEVER_CRAWL)</a>
  <a href="/file.pdf">PDF (NEVER_CRAWL)</a>
  <a href="mailto:hello@example.com">Email</a>
  <a href="javascript:void(0)">JS</a>
</body></html>`;

const axiosPath = require.resolve('axios');
require.cache[axiosPath] = {
  exports: { get: async () => ({ data: stubHtml, status: 200 }) },
  loaded: true,
};

const { discoverLinks, DEFAULT_RULES } = require('../../lib/research/crawl');

test('discoverLinks: same-host filter on by default', async () => {
  const { links } = await discoverLinks('https://example.com/');
  assert.ok(links.every((u) => u.startsWith('https://example.com')));
  assert.ok(!links.find((u) => u.includes('OTHER-HOST')));
});

test('discoverLinks: NEVER_CRAWL kills login + pdf + mailto', async () => {
  const { links } = await discoverLinks('https://example.com/');
  assert.ok(!links.find((u) => u.includes('/login')));
  assert.ok(!links.find((u) => u.endsWith('.pdf')));
  assert.ok(!links.find((u) => u.startsWith('mailto:')));
});

test('discoverLinks: exclude_paths rule', async () => {
  const { links } = await discoverLinks('https://example.com/', {
    rules: { ...DEFAULT_RULES, exclude_paths: ['/podcasts/', '/sponsored/'] },
  });
  assert.ok(!links.find((u) => u.includes('/podcasts/')));
  assert.ok(!links.find((u) => u.includes('/sponsored/')));
});

test('discoverLinks: dedupes', async () => {
  const { links } = await discoverLinks('https://example.com/');
  const set = new Set(links);
  assert.equal(set.size, links.length);
});

test('discoverLinks: priority_paths sort first', async () => {
  const { links } = await discoverLinks('https://example.com/', {
    rules: { ...DEFAULT_RULES, priority_paths: ['/investigations/'] },
  });
  assert.ok(links[0].includes('/investigations/'), `expected investigations first, got ${links[0]}`);
});

test('discoverLinks: maxLinks clamps result', async () => {
  const { links } = await discoverLinks('https://example.com/', { maxLinks: 2 });
  assert.equal(links.length, 2);
});

test('discoverLinks: include_paths_only restricts', async () => {
  const { links } = await discoverLinks('https://example.com/', {
    rules: { ...DEFAULT_RULES, include_paths_only: ['/investigations/'] },
  });
  assert.ok(links.every((u) => u.includes('/investigations/')));
});
