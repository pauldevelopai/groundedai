// Trusted-sources allowlist for the Researcher's single-page scrape.
//
// Annotation-only: a URL matched against the allowlist gets
// `trustedSource: true` + a `trustedReason` like "pan_continental" or
// "south_africa". The scrape NEVER refuses non-listed URLs — editors can
// scrape anything; the model gets a credibility hint.
//
// Pan-African default ships in config/trusted_sources.default.yml.
// Per-newsroom overrides live at newsroom_profile.metadata.trusted_sources
// in the same shape (category → list of apex domains). Merge via
// lib/newsroom-profile/merge-overrides.js.

const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');
const { pool } = require('../db');
const { mergeWithOverrides } = require('../newsroom-profile/merge-overrides');

const DEFAULT_PATH = path.join(__dirname, '..', '..', 'config', 'trusted_sources.default.yml');

let _defaultCache = null;

function loadDefault() {
  if (_defaultCache) return _defaultCache;
  const raw = fs.readFileSync(DEFAULT_PATH, 'utf8');
  const parsed = yaml.load(raw);
  if (!parsed || typeof parsed !== 'object' || !parsed.trusted_sources) {
    throw new Error('trusted_sources.default.yml: missing top-level `trusted_sources` map');
  }
  _defaultCache = parsed.trusted_sources;
  return _defaultCache;
}

function _resetCache() { _defaultCache = null; }

/**
 * Return the effective allowlist for a newsroom: default ⊕ per-newsroom
 * override. Shape: { <category>: [<apex-domain>, ...], ... }.
 *
 * Pass newsroomId=null for the unmodified default.
 */
async function getEffectiveAllowlist(newsroomId) {
  const def = loadDefault();
  if (!newsroomId) return def;
  const { rows } = await pool.query(
    `SELECT metadata FROM newsroom_profiles WHERE newsroom_id = $1`,
    [newsroomId]
  );
  const override = rows[0]?.metadata?.trusted_sources;
  if (!override) return def;
  return mergeWithOverrides(def, override);
}

/**
 * Normalise a hostname for matching. Lowercase, strip leading "www.".
 */
function normaliseHost(host) {
  return String(host || '').toLowerCase().replace(/^www\./, '');
}

/**
 * Walk apex-down: given "subdomain.example.co.za" we check
 * "subdomain.example.co.za" then "example.co.za" then "co.za" against the
 * entries. This catches a Reuters Africa URL like
 * https://www.reuters.com/world/africa/... against the "reuters.com" entry.
 */
function* apexCandidates(host) {
  const parts = host.split('.');
  for (let i = 0; i < parts.length - 1; i++) {
    yield parts.slice(i).join('.');
  }
}

/**
 * Check a URL against an effective allowlist. Returns
 * { trustedSource: boolean, reason: string | null } where reason is the
 * category name (e.g. "pan_continental") if matched.
 *
 * @param {object} args
 * @param {string} args.url
 * @param {string} [args.newsroomId]  if set, merges per-newsroom override
 * @param {object} [args.allowlist]   pre-fetched effective allowlist
 *                                     (saves a DB round-trip when checking
 *                                     many URLs in a tight loop)
 */
async function checkUrl({ url, newsroomId, allowlist }) {
  let parsed;
  try { parsed = new URL(url); } catch { return { trustedSource: false, trustedReason: null }; }
  const host = normaliseHost(parsed.host);
  if (!host) return { trustedSource: false, trustedReason: null };

  const list = allowlist || await getEffectiveAllowlist(newsroomId || null);
  for (const [category, domains] of Object.entries(list)) {
    if (!Array.isArray(domains)) continue;
    const set = new Set(domains.map(normaliseHost));
    for (const cand of apexCandidates(host)) {
      if (set.has(cand)) return { trustedSource: true, trustedReason: category };
    }
  }
  return { trustedSource: false, trustedReason: null };
}

module.exports = {
  loadDefault,
  getEffectiveAllowlist,
  checkUrl,
  normaliseHost,
  _resetCache,
  DEFAULT_PATH,
};
