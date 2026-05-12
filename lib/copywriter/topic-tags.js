// Copywriter topic-tag scorer.
//
// Pure-JS, no Claude, no external calls. Given an article text and the
// effective topic taxonomy (default ⊕ per-newsroom override), returns a
// per-bucket density score plus two style proxies (strong-verb rate +
// attribution density). Used by Drafter's user-message builder to give
// Claude a one-line "Topic match: ..." hint.
//
// Scoring:
//   topics.<bucket>      = matched_keyword_occurrences / total_words * 100,
//                          capped at 1.0
//   strong_verbs_per_100 = strong_verb_occurrences / total_words * 100
//   attribution_density  = attribution_match_occurrences / total_words * 100
//
// Matching:
//   Case-insensitive. Single-token keywords match on word boundaries.
//   Multi-word phrases (e.g. "load shedding", "according to") match as
//   case-insensitive substrings preceded and followed by a word boundary.
//   Acronyms with hyphens (e.g. "ZANU-PF") and dots are preserved verbatim
//   in the regex.

const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');
const { pool } = require('../db');
const { mergeWithOverrides } = require('../newsroom-profile/merge-overrides');

const DEFAULT_PATH = path.join(__dirname, '..', '..', 'config', 'topic_tags.default.yml');

let _defaultCache = null;

/**
 * Load the pan-African default topic taxonomy from disk. Cached after first
 * read. Throws if the file is missing or malformed.
 */
function loadDefaultTopics() {
  if (_defaultCache) return _defaultCache;
  const raw = fs.readFileSync(DEFAULT_PATH, 'utf8');
  const parsed = yaml.load(raw);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('topic_tags.default.yml: must be a YAML object');
  }
  if (!parsed.topics || typeof parsed.topics !== 'object') {
    throw new Error('topic_tags.default.yml: missing required `topics` map');
  }
  _defaultCache = parsed;
  return _defaultCache;
}

/** Reset cache — useful for tests. */
function _resetCache() {
  _defaultCache = null;
}

/**
 * Return the effective topic taxonomy for a newsroom: default ⊕ per-newsroom
 * override. Override lives at `newsroom_profile.metadata.topic_tags` and
 * shares the same shape as the default.
 *
 * Pass newsroomId=null to get the unmodified default — useful for tests
 * and the CLI smoke check.
 */
async function getEffectiveTopics(newsroomId) {
  const defaults = loadDefaultTopics();
  if (!newsroomId) return defaults;

  const { rows } = await pool.query(
    `SELECT metadata FROM newsroom_profiles WHERE newsroom_id = $1`,
    [newsroomId]
  );
  const override = rows[0]?.metadata?.topic_tags;
  if (!override) return defaults;
  return mergeWithOverrides(defaults, override);
}

// ─── Scoring primitives ────────────────────────────────────────────────────

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Count case-insensitive occurrences of a keyword/phrase in text. Word-
 * boundary at both ends. Hyphenated tokens (ZANU-PF) and dotted acronyms
 * are preserved.
 */
function countOccurrences(text, keyword) {
  if (!keyword || !text) return 0;
  // Word boundary at the boundaries of the *literal* keyword. \b doesn't
  // work for keywords ending in punctuation, so we use lookbehind/lookahead
  // for "word char on one side" instead.
  const pattern = '(?<![A-Za-z0-9])' + escapeRegex(keyword) + '(?![A-Za-z0-9])';
  const re = new RegExp(pattern, 'gi');
  const matches = text.match(re);
  return matches ? matches.length : 0;
}

function countWords(text) {
  const m = (text || '').match(/[A-Za-z][A-Za-z'’-]*/g);
  return m ? m.length : 0;
}

/**
 * Score an article against an effective topic taxonomy.
 *
 * @param {string} text
 * @param {object} effectiveTopics  shape: { topics: { <slug>: { keywords: [...] } }, strong_verbs: [...], attribution_words: [...] }
 * @returns {{
 *   topics: Record<string, number>,
 *   strong_verbs_per_100: number,
 *   attribution_density: number,
 *   total_words: number
 * }}
 */
function scoreArticle(text, effectiveTopics) {
  const cleaned = (text || '').trim();
  const totalWords = countWords(cleaned);
  const out = {
    topics: {},
    strong_verbs_per_100: 0,
    attribution_density: 0,
    total_words: totalWords,
  };

  if (totalWords === 0) {
    // Empty text — every bucket scores 0
    for (const slug of Object.keys(effectiveTopics?.topics || {})) {
      out.topics[slug] = 0;
    }
    return out;
  }

  // Per-bucket density
  for (const [slug, bucket] of Object.entries(effectiveTopics.topics || {})) {
    const keywords = (bucket && bucket.keywords) || [];
    let hits = 0;
    for (const kw of keywords) {
      hits += countOccurrences(cleaned, kw);
    }
    // Per-100-words density, capped at 1.0
    const density = (hits / totalWords) * 100;
    out.topics[slug] = Math.round(Math.min(1.0, density) * 100) / 100;
  }

  // Strong verbs + attribution
  const strongVerbs = effectiveTopics.strong_verbs || [];
  let strongHits = 0;
  for (const v of strongVerbs) strongHits += countOccurrences(cleaned, v);
  out.strong_verbs_per_100 = Math.round((strongHits / totalWords) * 100 * 100) / 100;

  const attrWords = effectiveTopics.attribution_words || [];
  let attrHits = 0;
  for (const a of attrWords) attrHits += countOccurrences(cleaned, a);
  out.attribution_density = Math.round((attrHits / totalWords) * 100 * 100) / 100;

  return out;
}

/**
 * Format a score object into a single line for inclusion in Claude prompts.
 * Returns the top 3 topics by density (where density > 0.05) plus the two
 * style rates. Empty string if nothing's worth mentioning.
 *
 *   "Topic match: politics_governance 0.42, justice_rule_of_law 0.18 · strong verbs 2.1/100w · attribution 1.3/100w"
 */
function formatScoreLine(score) {
  if (!score || !score.topics) return '';
  const topTopics = Object.entries(score.topics)
    .filter(([, v]) => v > 0.05)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([slug, v]) => `${slug} ${v.toFixed(2)}`);

  const parts = [];
  if (topTopics.length > 0) parts.push('Topic match: ' + topTopics.join(', '));
  if (score.strong_verbs_per_100 > 0) parts.push(`strong verbs ${score.strong_verbs_per_100.toFixed(1)}/100w`);
  if (score.attribution_density > 0) parts.push(`attribution ${score.attribution_density.toFixed(1)}/100w`);
  return parts.join(' · ');
}

module.exports = {
  loadDefaultTopics,
  getEffectiveTopics,
  scoreArticle,
  formatScoreLine,
  countOccurrences,
  countWords,
  _resetCache,
  DEFAULT_PATH,
};
