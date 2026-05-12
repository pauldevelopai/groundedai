// Single-page scrape for the Researcher agent.
//
// Per docs/CONSOLIDATION_PLAN.md §Step 2:
//   - axios for HTTP, cheerio for HTML parsing
//   - article-text extraction via common selectors + sensible fallback
//   - per-host rate limit (1 req / 1s), 20s timeout, 5 MB max body
//   - identifiable User-Agent (not a browser-mimic)
//   - reject non-textual content types
//   - respect robots.txt
//   - trusted-sources allowlist annotation
//
// Async deep-crawl (multi-page) is Step 3; this module is just one URL → one
// extracted article. Result is *not* persisted — caller decides what to do
// with it.

const crypto = require('node:crypto');
const axios = require('axios');
const { load: cheerioLoad } = require('cheerio');
const { checkUrl: trustedCheckUrl } = require('./trusted-sources');

const USER_AGENT = 'Grounded/0.x (+https://developai.co.za) Researcher/1.0';
const DEFAULT_TIMEOUT_MS = 20_000;
const MAX_BODY_BYTES = 5 * 1024 * 1024;        // 5 MB hard cap
const PER_HOST_INTERVAL_MS = 1000;             // 1 req / sec / host
const ALLOWED_CONTENT_TYPES = [
  'text/html',
  'text/plain',
  'application/xhtml+xml',
];

// ─── Per-host rate limit (in-process token bucket) ─────────────────────────
// Single-process. Multi-process scale belongs in Step 3's crawler, where
// pg-boss can serialise per-host work. For pilot single-page scrapes the
// in-memory map is fine.
const _lastFetchByHost = new Map();

async function waitForHost(host) {
  const last = _lastFetchByHost.get(host) || 0;
  const now = Date.now();
  const wait = last + PER_HOST_INTERVAL_MS - now;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  _lastFetchByHost.set(host, Date.now());
}

// ─── robots.txt (best-effort) ──────────────────────────────────────────────
// We fetch /robots.txt once per host and cache the User-agent: * / Disallow
// lines. If the host serves no robots.txt or the fetch fails, we treat
// everything as allowed (the same default as `wget` / most crawlers).
const _robotsCache = new Map();

async function robotsAllow(host, pathname) {
  if (!_robotsCache.has(host)) {
    _robotsCache.set(host, fetchRobots(host));
  }
  const rules = await _robotsCache.get(host);
  if (!rules || rules.length === 0) return true;
  // Pick the most-specific matching rule (longest path prefix).
  let blocked = false;
  let bestLen = -1;
  for (const r of rules) {
    if (pathname.startsWith(r.path) && r.path.length > bestLen) {
      blocked = r.disallow;
      bestLen = r.path.length;
    }
  }
  return !blocked;
}

async function fetchRobots(host) {
  try {
    const res = await axios.get(`https://${host}/robots.txt`, {
      timeout: 5000,
      maxContentLength: 256 * 1024,
      headers: { 'User-Agent': USER_AGENT },
      validateStatus: (s) => s < 400,
      transformResponse: [(d) => d],
    });
    return parseRobots(typeof res.data === 'string' ? res.data : '');
  } catch {
    return [];
  }
}

function parseRobots(text) {
  // Minimal: only honour User-agent: * blocks. Tracks Allow/Disallow paths
  // until the next User-agent declaration.
  const lines = text.split(/\r?\n/);
  const rules = [];
  let inStar = false;
  for (const raw of lines) {
    const line = raw.split('#')[0].trim();
    if (!line) continue;
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.+)$/);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const value = m[2].trim();
    if (key === 'user-agent') {
      inStar = value === '*';
    } else if (inStar && key === 'disallow') {
      rules.push({ path: value || '/', disallow: true });
    } else if (inStar && key === 'allow') {
      rules.push({ path: value || '/', disallow: false });
    }
  }
  return rules;
}

// ─── Main entry ─────────────────────────────────────────────────────────────

/**
 * Scrape one URL. Returns the extracted article + provenance metadata.
 * Throws on hard errors (network, timeout, body too large, content type
 * disallowed). Trust-list lookup never throws — it's annotation only.
 *
 * @param {string} url
 * @param {object} [opts]
 * @param {number} [opts.timeoutMs]      default 20s
 * @param {string} [opts.newsroomId]     for trusted-sources override merge
 * @param {boolean} [opts.respectRobots] default true; set false in tests
 * @returns {Promise<{ url, finalUrl, title, text, fetchedAt, contentHash,
 *   byteSize, contentType, trustedSource, trustedReason }>}
 */
async function scrapeUrl(url, opts = {}) {
  const timeout = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const respectRobots = opts.respectRobots !== false;
  const newsroomId = opts.newsroomId || null;

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Unsupported protocol: ${parsed.protocol}`);
  }
  const host = parsed.host;

  if (respectRobots && !(await robotsAllow(host, parsed.pathname || '/'))) {
    throw new Error(`Blocked by robots.txt: ${url}`);
  }

  await waitForHost(host);

  const res = await axios.get(url, {
    timeout,
    maxRedirects: 5,
    maxContentLength: MAX_BODY_BYTES,
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.1',
    },
    validateStatus: (s) => s >= 200 && s < 300,
    responseType: 'text',
    transformResponse: [(d) => d],
  });

  const contentType = String(res.headers['content-type'] || '').toLowerCase().split(';')[0].trim();
  if (contentType && !ALLOWED_CONTENT_TYPES.includes(contentType)) {
    throw new Error(`Unsupported Content-Type "${contentType}" — scrape supports text/html, text/plain, application/xhtml+xml`);
  }

  const rawBody = typeof res.data === 'string' ? res.data : String(res.data || '');
  const byteSize = Buffer.byteLength(rawBody, 'utf8');
  const finalUrl = res.request?.res?.responseUrl || url;

  // Extract article text + title
  let title = '';
  let text = '';
  if (contentType === 'text/plain') {
    text = rawBody.trim();
    title = parsed.pathname.split('/').filter(Boolean).pop() || host;
  } else {
    const { title: t, text: x } = extractFromHtml(rawBody);
    title = t;
    text = x;
  }

  // Annotate with trusted-sources lookup (non-fatal)
  let trust = { trustedSource: false, trustedReason: null };
  try {
    trust = await trustedCheckUrl({ url: finalUrl, newsroomId });
  } catch (e) {
    console.warn('[scrape] trust-check failed:', e.message);
  }

  const contentHash = crypto.createHash('sha256').update(text).digest('hex');

  return {
    url,
    finalUrl,
    title,
    text,
    fetchedAt: new Date().toISOString(),
    contentHash,
    byteSize,
    contentType: contentType || 'text/html',
    trustedSource: trust.trustedSource,
    trustedReason: trust.trustedReason,
  };
}

// ─── HTML → text extraction ─────────────────────────────────────────────────
// Common-selector approach with a longest-text fallback. Strips script/style/
// nav/aside/footer/header. Normalises whitespace.

const ARTICLE_SELECTORS = [
  'article',
  'main article',
  '[role="article"]',
  '[itemprop="articleBody"]',
  '.entry-content',
  '.post-content',
  '.article-content',
  '.article__body',
  '.story-body',
  '.story__body',
  'main',
  '[role="main"]',
];

function extractFromHtml(html) {
  const $ = cheerioLoad(html);
  // Drop noise globally
  $('script, style, noscript, nav, aside, footer, header, .nav, .sidebar, .ads, .ad, .social-share, .comments').remove();
  const title = ($('meta[property="og:title"]').attr('content') || $('title').first().text() || '').trim();

  // Try each selector; keep the one that produced the most text
  let bestText = '';
  for (const sel of ARTICLE_SELECTORS) {
    const candidate = $(sel).first();
    if (!candidate.length) continue;
    const t = candidate.text().replace(/\s+/g, ' ').trim();
    if (t.length > bestText.length) bestText = t;
  }

  // Fallback: longest <p>-rich container
  if (bestText.length < 400) {
    let fallback = '';
    $('body *').each((_, el) => {
      const $el = $(el);
      const ps = $el.find('p').length;
      if (ps < 3) return;
      const t = $el.text().replace(/\s+/g, ' ').trim();
      if (t.length > fallback.length) fallback = t;
    });
    if (fallback.length > bestText.length) bestText = fallback;
  }

  // Last-resort: body text (rarely useful but better than nothing)
  if (bestText.length < 200) {
    bestText = $('body').text().replace(/\s+/g, ' ').trim();
  }

  return { title, text: bestText };
}

module.exports = {
  scrapeUrl,
  extractFromHtml,
  parseRobots,
  USER_AGENT,
  MAX_BODY_BYTES,
  PER_HOST_INTERVAL_MS,
};
