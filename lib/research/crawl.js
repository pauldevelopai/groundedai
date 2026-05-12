// Link discovery for the Researcher deep-crawler (Step 3).
//
// Given a homepage / archive URL, fetch it, parse out <a href> links, and
// return a filtered + deduped list of article-shaped URLs ready to be
// scraped by Step 2's scrapeUrl().
//
// Heuristics (deliberately simple — the model decides what's interesting
// downstream):
//   - same-host only by default
//   - exclude_paths / include_paths_only / priority_paths from rules
//   - skip obvious non-article URLs (login, search, tag, podcast feeds,
//     image extensions, mailto:, javascript:, anchor-only, telephone)
//   - dedupe by URL
//   - clamp to maxLinks
//
// Per-newsroom rule overrides live at newsroom_profile.metadata.crawl_rules
// in this shape:
//   {
//     "exclude_paths": ["/podcasts/", "/sponsored/"],
//     "include_paths_only": null,
//     "priority_paths": ["/investigations/", "/breaking/"],
//     "max_links_per_crawl": 10,
//     "respect_robots": true,
//     "same_host_only": true
//   }
// (any of these may be omitted; defaults below).

const axios = require('axios');
const { load: cheerioLoad } = require('cheerio');
const { pool } = require('../db');
const { mergeWithOverrides } = require('../newsroom-profile/merge-overrides');
const { USER_AGENT, MAX_BODY_BYTES } = require('./scrape');

const DEFAULT_RULES = {
  exclude_paths: [],
  include_paths_only: null,
  priority_paths: [],
  max_links_per_crawl: 10,
  respect_robots: true,
  same_host_only: true,
};

// File extensions / path patterns we never crawl regardless of rules.
const NEVER_CRAWL = [
  /\.(jpg|jpeg|png|gif|webp|svg|ico|mp3|mp4|m4a|mov|webm|pdf|doc|docx|xls|xlsx|ppt|pptx|zip|tar|gz)(\?|#|$)/i,
  /\/feed\/?$/i,
  /\/rss\/?$/i,
  /\/atom\.xml$/i,
  /\?print=1/i,
  /\/(login|signup|register|account|profile|cart|checkout)/i,
  /\/(tag|tags|category|categories|author)\//i,
  /\/(search|amp)\//i,
  /\/(comment|wp-admin|wp-login|wp-content)/i,
];

/**
 * Return the effective crawl rules for a newsroom: defaults ⊕ per-newsroom
 * override at newsroom_profile.metadata.crawl_rules.
 */
async function getEffectiveCrawlRules(newsroomId) {
  if (!newsroomId) return { ...DEFAULT_RULES };
  const { rows } = await pool.query(
    `SELECT metadata FROM newsroom_profiles WHERE newsroom_id = $1`,
    [newsroomId]
  );
  const override = rows[0]?.metadata?.crawl_rules;
  if (!override) return { ...DEFAULT_RULES };
  // Plain shallow merge — these are flat scalars + small arrays; the generic
  // deep-merge would dedupe exclude_paths/priority_paths which is what we want.
  return mergeWithOverrides({ ...DEFAULT_RULES }, override);
}

/**
 * Discover article-shaped links from a homepage.
 *
 * @param {string} homepageUrl
 * @param {object} [opts]
 * @param {object} [opts.rules]    pre-merged rules from getEffectiveCrawlRules
 * @param {number} [opts.maxLinks] override rules.max_links_per_crawl
 * @returns {Promise<{ links: string[], host: string, fetched: number }>}
 */
async function discoverLinks(homepageUrl, opts = {}) {
  let parsed;
  try { parsed = new URL(homepageUrl); } catch { throw new Error('Invalid homepage URL: ' + homepageUrl); }
  const host = parsed.host.toLowerCase();
  const rules = { ...DEFAULT_RULES, ...(opts.rules || {}) };
  const maxLinks = opts.maxLinks ?? rules.max_links_per_crawl ?? DEFAULT_RULES.max_links_per_crawl;

  const res = await axios.get(homepageUrl, {
    timeout: 20_000,
    maxRedirects: 5,
    maxContentLength: MAX_BODY_BYTES,
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'text/html,application/xhtml+xml',
    },
    validateStatus: (s) => s >= 200 && s < 300,
    responseType: 'text',
    transformResponse: [(d) => d],
  });

  const $ = cheerioLoad(res.data);
  const baseHref = $('base[href]').attr('href') || homepageUrl;
  const seen = new Set();
  const candidates = [];   // [{ url, priority }]
  let fetched = 0;

  $('a[href]').each((_, el) => {
    fetched++;
    const raw = $(el).attr('href');
    if (!raw) return;
    let u;
    try { u = new URL(raw, baseHref); } catch { return; }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return;
    if (rules.same_host_only !== false && u.host.toLowerCase() !== host) return;
    if (u.href === homepageUrl) return;

    const path = u.pathname;
    if (NEVER_CRAWL.some((re) => re.test(u.href))) return;

    if (Array.isArray(rules.exclude_paths)) {
      if (rules.exclude_paths.some((p) => p && path.includes(p))) return;
    }
    if (Array.isArray(rules.include_paths_only) && rules.include_paths_only.length > 0) {
      if (!rules.include_paths_only.some((p) => p && path.includes(p))) return;
    }

    // Normalise — strip trailing slash + drop the fragment
    u.hash = '';
    const norm = u.href.replace(/\/$/, '');
    if (seen.has(norm)) return;
    seen.add(norm);

    const priority = Array.isArray(rules.priority_paths)
      && rules.priority_paths.some((p) => p && path.includes(p)) ? 1 : 0;
    candidates.push({ url: norm, priority });
  });

  // Sort: priority desc, then input order (stable via index)
  candidates.sort((a, b) => b.priority - a.priority);
  const links = candidates.slice(0, maxLinks).map((c) => c.url);

  return { links, host, fetched };
}

module.exports = {
  discoverLinks,
  getEffectiveCrawlRules,
  DEFAULT_RULES,
  NEVER_CRAWL,
};
