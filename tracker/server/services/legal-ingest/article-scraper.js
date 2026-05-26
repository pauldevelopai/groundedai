// HTML article scraper — pulls title / author / publish_date / body snippet /
// og:image from any URL and caches per (entity, url) pair. Pure cheerio, no
// external deps beyond what Holly already has.
//
// Extraction priority (most reliable first):
//   1. schema.org JSON-LD (NewsArticle / Article / Legislation)
//   2. Open Graph meta tags
//   3. Twitter / article: meta tags
//   4. article-body heuristics
//   5. Plain <title> / <meta name="description">
//
// Works equally well on news sites, regulator pages, court-listener dockets.
// Never runs JavaScript (so SPAs that render via JS come back empty — which
// is fine; those need the HTML/JSON-API scraper kinds, not this generic one).

import axios from 'axios';
import * as cheerio from 'cheerio';
import pool from '../../db/pool.js';

const UA = 'AI Legal Tracker / ailegal.co.za (article scraper; contact via site)';
const TIMEOUT = 15000;
const MAX_BODY = 800;                   // characters of body to store
const MAX_HTML = 2_000_000;             // cap downloaded HTML at ~2 MB
const DESCRIPTION_MAX = 1000;

// ── Public entry points ─────────────────────────────────────────────────────

/** Scrape a single URL for an entity, write a source_mentions row. */
export async function scrapeAndStoreMention({ subjectKind, subjectId, url }) {
  if (!url) return null;
  let parsed;
  try { parsed = new URL(url); }
  catch { return persistError({ subjectKind, subjectId, url, error: 'invalid_url' }); }

  try {
    const res = await axios.get(url, {
      timeout: TIMEOUT,
      maxRedirects: 5,
      responseType: 'text',
      headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1' },
      maxContentLength: MAX_HTML,
      validateStatus: s => s >= 200 && s < 400,
    });
    const html = res.data || '';
    const finalUrl = res.request?.res?.responseUrl || url;
    const extracted = extractArticle(html, finalUrl);
    return persistSuccess({
      subjectKind, subjectId, url,
      canonical: extracted.canonical || finalUrl,
      host: parsed.hostname.replace(/^www\./, ''),
      title: extracted.title,
      author: extracted.author,
      site_name: extracted.site_name,
      description: extracted.description,
      body_excerpt: extracted.body,
      image_url: extracted.image,
      published_at: extracted.published_at,
      http_status: res.status,
    });
  } catch (err) {
    const status = err.response?.status || null;
    const reason = status ? `http_${status}` : (err.code || err.message || 'fetch_failed');
    return persistError({ subjectKind, subjectId, url, http_status: status, error: reason });
  }
}

/**
 * Scrape every URL attached to an entity (source_urls array + source_url +
 * official_url / case_url + every event.source_url). Returns a summary.
 */
export async function scrapeAllUrlsFor(subjectKind, subjectId) {
  const urls = new Set();

  if (subjectKind === 'lawsuit') {
    const { rows } = await pool.query(
      'SELECT source_url, case_url, source_urls FROM ai_lawsuits WHERE id = $1',
      [subjectId]
    );
    if (rows.length === 0) throw new Error('lawsuit not found');
    const r = rows[0];
    if (r.source_url) urls.add(r.source_url);
    if (r.case_url)   urls.add(r.case_url);
    for (const u of (r.source_urls || [])) if (u) urls.add(u);
    const { rows: ev } = await pool.query(
      'SELECT source_url FROM ai_lawsuit_events WHERE lawsuit_id = $1',
      [subjectId]
    );
    for (const e of ev) if (e.source_url) urls.add(e.source_url);
  } else {
    const { rows } = await pool.query(
      'SELECT source_url, official_url, source_urls FROM ai_regulations WHERE id = $1',
      [subjectId]
    );
    if (rows.length === 0) throw new Error('regulation not found');
    const r = rows[0];
    if (r.source_url)   urls.add(r.source_url);
    if (r.official_url) urls.add(r.official_url);
    for (const u of (r.source_urls || [])) if (u) urls.add(u);
    const { rows: ev } = await pool.query(
      'SELECT source_url FROM ai_regulation_events WHERE regulation_id = $1',
      [subjectId]
    );
    for (const e of ev) if (e.source_url) urls.add(e.source_url);
  }

  let ok = 0, fail = 0;
  for (const url of urls) {
    const r = await scrapeAndStoreMention({ subjectKind, subjectId, url });
    if (r?.error) fail++; else ok++;
  }
  return { subjectKind, subjectId, urls: urls.size, ok, fail };
}

/** Backfill across every entity — one pass. */
export async function backfillAllMentions({ limit = 500 } = {}) {
  const lawsuits = await pool.query('SELECT id FROM ai_lawsuits ORDER BY updated_at DESC LIMIT $1', [limit]);
  const regs     = await pool.query('SELECT id FROM ai_regulations ORDER BY updated_at DESC LIMIT $1', [limit]);
  const summary = { lawsuits: { ok: 0, fail: 0 }, regulations: { ok: 0, fail: 0 }, entities: 0, urls: 0 };
  for (const l of lawsuits.rows) {
    const s = await scrapeAllUrlsFor('lawsuit', l.id);
    summary.lawsuits.ok += s.ok;
    summary.lawsuits.fail += s.fail;
    summary.urls += s.urls;
    summary.entities++;
  }
  for (const r of regs.rows) {
    const s = await scrapeAllUrlsFor('regulation', r.id);
    summary.regulations.ok += s.ok;
    summary.regulations.fail += s.fail;
    summary.urls += s.urls;
    summary.entities++;
  }
  return summary;
}

/** Fetch cached mentions for a subject (for detail-page rendering). */
export async function getMentionsFor(subjectKind, subjectId) {
  const { rows } = await pool.query(
    `SELECT url, canonical_url, host, title, author, site_name, description,
            body_excerpt, image_url, published_at, http_status, error
       FROM ai_legal_source_mentions
      WHERE subject_kind = $1 AND subject_id = $2
      ORDER BY published_at DESC NULLS LAST, fetched_at DESC`,
    [subjectKind, subjectId]
  );
  return rows;
}

// ── Extractor ──────────────────────────────────────────────────────────────

function extractArticle(html, baseUrl) {
  const $ = cheerio.load(html);

  // 1. Harvest all JSON-LD blocks into one array
  const jsonLd = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const txt = $(el).contents().text();
      const parsed = JSON.parse(txt);
      if (Array.isArray(parsed)) jsonLd.push(...parsed);
      else if (parsed && typeof parsed === 'object') {
        if (Array.isArray(parsed['@graph'])) jsonLd.push(...parsed['@graph']);
        else jsonLd.push(parsed);
      }
    } catch { /* skip malformed */ }
  });
  const article = jsonLd.find(x => typeof x?.['@type'] === 'string' && /Article|NewsArticle|BlogPosting|Legislation|Report/i.test(x['@type']))
    || jsonLd.find(x => x?.headline || x?.datePublished);

  // 2. Meta helper
  const meta = name =>
    $(`meta[property="${name}"]`).attr('content')
    || $(`meta[name="${name}"]`).attr('content')
    || null;

  // 3. Title
  const title =
    article?.headline
    || meta('og:title')
    || meta('twitter:title')
    || $('h1').first().text().trim()
    || $('title').text().trim()
    || null;

  // 4. Description
  const description =
    article?.description
    || meta('og:description')
    || meta('twitter:description')
    || meta('description')
    || null;

  // 5. Author
  let author = null;
  if (article?.author) {
    author = typeof article.author === 'string'
      ? article.author
      : Array.isArray(article.author) ? article.author.map(a => a?.name || a).filter(Boolean).join(', ')
      : article.author?.name || null;
  }
  author ||= meta('article:author') || meta('author') || $('[rel="author"]').first().text().trim() || null;

  // 6. Site name / publisher
  const site_name = meta('og:site_name') || article?.publisher?.name || null;

  // 7. Published date
  const rawDate =
    article?.datePublished
    || article?.dateCreated
    || meta('article:published_time')
    || meta('og:updated_time')
    || $('time[datetime]').first().attr('datetime')
    || null;
  const published_at = rawDate ? parseDate(rawDate) : null;

  // 8. Image
  let image =
    meta('og:image')
    || meta('twitter:image')
    || (typeof article?.image === 'string' ? article.image : article?.image?.url)
    || $('article img').first().attr('src')
    || null;
  if (image && !/^https?:/i.test(image)) {
    try { image = new URL(image, baseUrl).toString(); } catch {}
  }

  // 9. Canonical
  const canonical = $('link[rel="canonical"]').attr('href') || meta('og:url') || null;

  // 10. Body — prefer <article>, then common news-article containers,
  // fall back to the biggest text block on the page.
  let bodyEl = $('article').first();
  if (!bodyEl.length) bodyEl = $('[itemprop="articleBody"]').first();
  if (!bodyEl.length) bodyEl = $('main').first();
  if (!bodyEl.length) bodyEl = $('body');
  const body = (bodyEl.text() || '').replace(/\s+/g, ' ').trim().slice(0, MAX_BODY);

  return {
    title:       clip(title, 800),
    description: clip(description, DESCRIPTION_MAX),
    author:      clip(author, 300),
    site_name:   clip(site_name, 200),
    published_at,
    image:       clip(image, 2000),
    canonical:   clip(canonical, 2000),
    body,
  };
}

function clip(s, n) {
  if (!s || typeof s !== 'string') return s || null;
  return s.length > n ? s.slice(0, n) : s;
}
function parseDate(s) {
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

// ── Persistence ─────────────────────────────────────────────────────────────

async function persistSuccess({ subjectKind, subjectId, url, canonical, host, title, author, site_name, description, body_excerpt, image_url, published_at, http_status }) {
  await pool.query(
    `INSERT INTO ai_legal_source_mentions
       (subject_kind, subject_id, url, canonical_url, host, title, author, site_name, description, body_excerpt, image_url, published_at, fetched_at, http_status, error, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::timestamptz, NOW(), $13, NULL, NOW())
     ON CONFLICT (subject_kind, subject_id, url) DO UPDATE SET
       canonical_url = EXCLUDED.canonical_url,
       host          = EXCLUDED.host,
       title         = EXCLUDED.title,
       author        = EXCLUDED.author,
       site_name     = EXCLUDED.site_name,
       description   = EXCLUDED.description,
       body_excerpt  = EXCLUDED.body_excerpt,
       image_url     = EXCLUDED.image_url,
       published_at  = EXCLUDED.published_at,
       fetched_at    = NOW(),
       http_status   = EXCLUDED.http_status,
       error         = NULL,
       updated_at    = NOW()`,
    [subjectKind, subjectId, url, canonical || null, host || null, title || null, author || null, site_name || null, description || null, body_excerpt || null, image_url || null, published_at || null, http_status || null]
  );
  return { url, ok: true };
}

async function persistError({ subjectKind, subjectId, url, http_status = null, error }) {
  await pool.query(
    `INSERT INTO ai_legal_source_mentions
       (subject_kind, subject_id, url, fetched_at, http_status, error, updated_at)
     VALUES ($1,$2,$3, NOW(), $4, $5, NOW())
     ON CONFLICT (subject_kind, subject_id, url) DO UPDATE SET
       fetched_at  = NOW(),
       http_status = EXCLUDED.http_status,
       error       = EXCLUDED.error,
       updated_at  = NOW()`,
    [subjectKind, subjectId, url, http_status, error]
  );
  return { url, error };
}
