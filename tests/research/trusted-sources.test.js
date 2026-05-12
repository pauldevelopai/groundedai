// Unit tests for trusted-sources allowlist + scrape HTML extraction.
// Run: npm test (or node --test tests/research/trusted-sources.test.js)

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadDefault, checkUrl, normaliseHost, _resetCache } = require('../../lib/research/trusted-sources');
const { extractFromHtml, parseRobots } = require('../../lib/research/scrape');

test('loadDefault: YAML parses with expected categories', () => {
  _resetCache();
  const list = loadDefault();
  for (const cat of ['pan_continental', 'south_africa', 'zimbabwe', 'zambia', 'kenya', 'official_records', 'global_reference']) {
    assert.ok(Array.isArray(list[cat]) && list[cat].length > 0, `${cat} populated`);
  }
});

test('normaliseHost: strips www and lowercases', () => {
  assert.equal(normaliseHost('WWW.Reuters.COM'), 'reuters.com');
  assert.equal(normaliseHost('news24.com'), 'news24.com');
  assert.equal(normaliseHost(''), '');
});

test('checkUrl: Reuters Africa URL matches pan_continental', async () => {
  const r = await checkUrl({ url: 'https://www.reuters.com/world/africa/some-story' });
  assert.equal(r.trustedSource, true);
  assert.equal(r.trustedReason, 'pan_continental');
});

test('checkUrl: Daily Maverick matches south_africa', async () => {
  const r = await checkUrl({ url: 'https://www.dailymaverick.co.za/article/2024-10-15-foo' });
  assert.equal(r.trustedSource, true);
  assert.equal(r.trustedReason, 'south_africa');
});

test('checkUrl: News Diggers (Zambia) matches zambia', async () => {
  const r = await checkUrl({ url: 'https://diggers.news/something/' });
  assert.equal(r.trustedSource, true);
  assert.equal(r.trustedReason, 'zambia');
});

test('checkUrl: WHO matches official_records', async () => {
  const r = await checkUrl({ url: 'https://www.who.int/news/some-bulletin' });
  assert.equal(r.trustedSource, true);
  assert.equal(r.trustedReason, 'official_records');
});

test('checkUrl: random blog returns false', async () => {
  const r = await checkUrl({ url: 'https://random-blog.example.com/post/1' });
  assert.equal(r.trustedSource, false);
  assert.equal(r.trustedReason, null);
});

test('checkUrl: pre-supplied allowlist (no DB hit) works', async () => {
  const allowlist = { custom_category: ['mydomain.test'] };
  const r = await checkUrl({ url: 'https://mydomain.test/page', allowlist });
  assert.equal(r.trustedSource, true);
  assert.equal(r.trustedReason, 'custom_category');
});

test('checkUrl: bogus URL returns false without throwing', async () => {
  const r = await checkUrl({ url: 'not-a-url' });
  assert.equal(r.trustedSource, false);
});

test('extractFromHtml: <article> selector wins', () => {
  const html = `<!doctype html><html><head><title>Test article</title></head>
    <body>
      <nav>navnavnav navnavnav navnavnav navnavnav navnavnav navnavnav navnavnav navnavnav</nav>
      <article>
        <h1>The headline</h1>
        <p>This is the first paragraph of the article body. Lots of substance here. Many words to make it the longest container in the document so the article selector wins out.</p>
        <p>This is the second paragraph. More substance. ${'word '.repeat(80)}</p>
      </article>
      <footer>footer footer footer footer footer footer footer footer footer footer footer footer footer</footer>
    </body></html>`;
  const { title, text } = extractFromHtml(html);
  assert.equal(title, 'Test article');
  assert.ok(text.length > 300, `text length ${text.length}`);
  assert.ok(text.includes('first paragraph'));
  assert.ok(!text.includes('navnavnav'), 'nav stripped');
  assert.ok(!text.includes('footer footer'), 'footer stripped');
});

test('extractFromHtml: og:title takes priority', () => {
  const html = `<!doctype html><html><head>
    <meta property="og:title" content="OG title wins" />
    <title>fallback title</title>
    </head><body><article><p>${'foo '.repeat(80)}</p></article></body></html>`;
  const { title } = extractFromHtml(html);
  assert.equal(title, 'OG title wins');
});

test('extractFromHtml: falls back to longest <p>-rich container', () => {
  const html = `<!doctype html><html><head><title>X</title></head>
    <body>
      <div class="some-weird-wrapper">
        <p>${'words '.repeat(50)}</p>
        <p>${'more words '.repeat(50)}</p>
        <p>${'yet more '.repeat(50)}</p>
      </div>
    </body></html>`;
  const { text } = extractFromHtml(html);
  assert.ok(text.length > 200);
});

test('parseRobots: User-agent: * disallow', () => {
  const text = `User-agent: *
Disallow: /private/
Disallow: /admin

User-agent: GoogleBot
Disallow: /
`;
  const rules = parseRobots(text);
  const paths = rules.map((r) => r.path);
  assert.ok(paths.includes('/private/'));
  assert.ok(paths.includes('/admin'));
  // GoogleBot block ignored — we only honour `*`
  assert.ok(!paths.includes('/'));
});
