// Headless-browser scraper for SPA regulator sites whose news pages don't
// exist in initial HTML (React/Next.js/Nuxt clients).
//
// Unblocks sources like ICO UK and OECD AI Observatory that the plain html
// scraper couldn't see. Once a page is fully rendered, we hand the DOM to the
// same cheerio-based selector pipeline so configs stay consistent.
//
// Config schema (stored in ai_legal_sources.config JSONB):
// {
//   "item_selector":      ".news-item",      // required — repeating list item
//   "title_selector":     "h2, h3",          // required — title inside each item
//   "url_selector":       "a",               // default = title_selector
//   "url_attribute":      "href",            // default 'href'
//   "date_selector":      "time",            // optional
//   "date_attribute":     "datetime",        // default innerText
//   "summary_selector":   ".summary",        // optional
//   "base_url":           "https://ico.org.uk",
//   "wait_for_selector":  ".news-item",      // wait until this appears before scraping — defaults to item_selector
//   "wait_timeout_ms":    15000,             // page.waitForSelector timeout
//   "extra_wait_ms":      0,                 // optional fixed sleep after selector appears (for async hydration)
//   "scroll_to_load":     false              // scroll to bottom before scraping (for infinite-scroll listings)
// }
//
// Implementation notes:
// - We reuse a single Chromium process across a batch of scrapes (closeBrowser()
//   when done) so startup cost (~1s) isn't paid per source.
// - headless: 'new' = modern Chrome headless (not the legacy --headless=old).
// - Launched with stability flags recommended for Docker/Linux servers so this
//   works on Lightsail without tweaks.
// - On a barebones Linux box the first run will need apt-get install of
//   libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0
//   libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2.
//   Puppeteer bundles Chromium itself; only the shared libs are missing.

import * as cheerio from 'cheerio';
import puppeteer from 'puppeteer';

const DEFAULT_TIMEOUT      = 25000;
const DEFAULT_WAIT_TIMEOUT = 15000;
const DEFAULT_EXTRA_WAIT   = 0;
const MAX_ITEMS            = 60;
const UA                   = 'AI Legal Tracker / ailegal.co.za (bot; puppeteer)';

// Rendered-DOM dates on news sites are often mixed with suffixes ("10 April
// 2026, News") or preceded by labels ("Published: 10 April 2026"). Try the
// full string first; if that fails, pick off common date patterns from the
// raw text and reparse. Returns ISO string or null.
function parseLooseDate(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  // First attempt — works for ISO, RFC 2822, and "10 April 2026" alone.
  let d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString();
  // Strip everything from the first comma/pipe/semicolon — catches "10 April 2026, News"
  const before = s.split(/[,|;]/)[0].trim();
  if (before !== s) {
    d = new Date(before);
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  // Extract "DD Month YYYY" anywhere in the string
  const m1 = s.match(/\b(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})\b/);
  if (m1) {
    d = new Date(`${m1[1]} ${m1[2]} ${m1[3]}`);
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  // Extract "Month DD, YYYY"
  const m2 = s.match(/\b([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})\b/);
  if (m2) {
    d = new Date(`${m2[1]} ${m2[2]} ${m2[3]}`);
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  // ISO-ish YYYY-MM-DD anywhere
  const m3 = s.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (m3) {
    d = new Date(`${m3[1]}-${m3[2]}-${m3[3]}`);
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  return null;
}

let browserPromise = null;

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--hide-scrollbars',
        '--mute-audio',
      ],
    }).catch(err => { browserPromise = null; throw err; });
  }
  return browserPromise;
}

export async function closeBrowser() {
  if (browserPromise) {
    try {
      const b = await browserPromise;
      await b.close();
    } catch { /* ignore */ }
    browserPromise = null;
  }
}

// ensure the browser is torn down when the node process exits — otherwise
// orphan Chromium processes accumulate during `node --watch` reloads.
for (const signal of ['exit', 'SIGINT', 'SIGTERM']) {
  process.once(signal, () => { closeBrowser().catch(() => {}); });
}

export async function scrapePuppeteer(source) {
  const config = source.config || {};
  const itemSel = config.item_selector;
  const titleSel = config.title_selector;
  if (!itemSel || !titleSel) {
    throw new Error('puppeteer source requires config.item_selector and config.title_selector');
  }
  const urlSel      = config.url_selector || titleSel;
  const urlAttr     = config.url_attribute || 'href';
  const dateSel     = config.date_selector || null;
  const dateAttr    = config.date_attribute || null;
  const sumSel      = config.summary_selector || null;
  const waitForSel  = config.wait_for_selector || itemSel;
  const waitTimeout = Math.min(60000, parseInt(config.wait_timeout_ms, 10) || DEFAULT_WAIT_TIMEOUT);
  const extraWait   = Math.min(10000, parseInt(config.extra_wait_ms, 10)   || DEFAULT_EXTRA_WAIT);
  const scrollToLoad = !!config.scroll_to_load;
  const baseUrl = config.base_url || (() => {
    try { const u = new URL(source.url); return u.origin; } catch { return null; }
  })();

  const browser = await getBrowser();
  const page = await browser.newPage();
  let html;
  try {
    await page.setUserAgent(UA);
    await page.setViewport({ width: 1280, height: 900 });
    await page.setRequestInterception(true);
    page.on('request', req => {
      // Speed up by blocking images, fonts, and media — we only need DOM text.
      const t = req.resourceType();
      if (t === 'image' || t === 'font' || t === 'media' || t === 'stylesheet') {
        req.abort().catch(() => {});
      } else {
        req.continue().catch(() => {});
      }
    });

    await page.goto(source.url, { waitUntil: 'domcontentloaded', timeout: DEFAULT_TIMEOUT });
    try {
      await page.waitForSelector(waitForSel, { timeout: waitTimeout });
    } catch (err) {
      // Soft-fail: we still capture whatever rendered so the caller can see why
      // the selector never appeared (useful when iterating on config).
      // Falls through to cheerio parsing with whatever HTML we have.
    }
    if (extraWait > 0) await new Promise(r => setTimeout(r, extraWait));
    if (scrollToLoad) {
      await page.evaluate(async () => {
        await new Promise(resolve => {
          let total = 0;
          const step = () => {
            window.scrollBy(0, 500);
            total += 500;
            if (total >= document.body.scrollHeight || total > 20000) resolve();
            else setTimeout(step, 200);
          };
          step();
        });
      });
      await new Promise(r => setTimeout(r, 500));
    }

    html = await page.content();
  } finally {
    try { await page.close(); } catch { /* ignore */ }
  }

  // Same extraction path as the plain html scraper — any selector set that
  // works for one also works for the other once the DOM is rendered.
  const $ = cheerio.load(html);
  const items = [];
  $(itemSel).each((i, el) => {
    if (items.length >= MAX_ITEMS) return false;
    const $el = $(el);

    const title = ($el.find(titleSel).first().text() || '').replace(/\s+/g, ' ').trim();
    if (!title) return;

    let url = $el.find(urlSel).first().attr(urlAttr);
    if (url && baseUrl && !/^https?:\/\//i.test(url)) {
      try { url = new URL(url, baseUrl).toString(); } catch { /* leave raw */ }
    }

    let published_at = null;
    if (dateSel) {
      const dateEl = $el.find(dateSel).first();
      const raw = (dateAttr ? dateEl.attr(dateAttr) : dateEl.text()) || null;
      if (raw) {
        published_at = parseLooseDate(raw);
      }
    }

    const summary = sumSel ? ($el.find(sumSel).first().text() || '').replace(/\s+/g, ' ').trim() : '';

    items.push({
      external_id: url || `${source.id}:${title}`,
      url: url || null,
      title: title.slice(0, 500),
      content: (summary || title).slice(0, 4000),
      author: null,
      published_at,
      raw_payload: { title, url, published_at, summary, selector_hit: itemSel, via: 'puppeteer' },
    });
  });

  return items;
}
