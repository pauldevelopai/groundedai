// Sensitivity classifier — V2 Step 5.
//
// Pure-JS, deterministic, no Claude call. Given a text payload + a
// newsroom's sensitivity_rules, returns:
//
//   { label: 'public' | 'internal' | 'sensitive',
//     confidence: 0..1,
//     reasons: string[] }
//
// The classifier is intentionally simple and explicit. Hard signals
// (source-protection vocabulary, SA ID number patterns, the newsroom's
// own always-sensitive keywords) escalate to 'sensitive'. Mid signals
// (email addresses, internal-only language) escalate to 'internal'.
// Otherwise 'public'.
//
// Per-newsroom overrides live at newsroom_profile.metadata.sensitivity_
// rules with this shape:
//
//   {
//     always_sensitive_keywords: ['whistleblower', 'confidential source', ...],
//     always_sensitive_workflows: ['leaked-document-triage'],
//     regex_patterns: ['\\bACME-\\d{4}\\b'],
//     default_label: 'public' | 'internal',
//   }
//
// classify() and getEffectiveRules() are exported for the routing layer
// (lib/agents/route.js) and the newsroom profile editor.

const { pool } = require('../db');
const { mergeWithOverrides } = require('../newsroom-profile/merge-overrides');

// Default rule set — keep tight; newsrooms extend per their beats.
const DEFAULT_RULES = {
  // Hard signals — any match → label = 'sensitive'
  always_sensitive_keywords: [
    'whistleblower',
    'confidential source',
    'off-record',
    'off the record',
    'source-protection',
    'embargo',
    'embargoed',
    'leaked document',
    'unpublished draft',
  ],
  // Workflow slugs that are sensitive regardless of input text.
  always_sensitive_workflows: [],
  // Custom regex patterns — useful for newsroom-specific identifiers
  // (e.g. case numbers, internal project codes).
  regex_patterns: [],
  // Fallback when no signal hits. 'public' for most newsrooms; some may
  // prefer 'internal' as a more conservative default.
  default_label: 'public',
};

// Built-in hard regex patterns. PII + government identifiers we always
// treat as sensitive regardless of newsroom override.
const BUILT_IN_HARD_PATTERNS = [
  // SA ID number — 13 digits in a recognisable pattern. Most reliable
  // PII signal in the SA market.
  { pattern: /\b\d{13}\b/, reason: 'looks like a SA ID number' },
  // South African passport (8 chars: 1 letter + 7 digits, sometimes
  // newer 9-char variants). Skip — too false-positive-prone.
  // Generic phone-number-ish patterns are too noisy; we don't include
  // them. Emails are 'internal', see below.
];

// Built-in soft patterns → 'internal'. Email addresses are the canonical
// "leaks personal contact info" tell.
const BUILT_IN_SOFT_PATTERNS = [
  { pattern: /[\w.+-]+@[\w-]+\.[\w.-]+/, reason: 'contains an email address' },
  { pattern: /\bdraft\b/i, reason: 'mentions a draft' },
  { pattern: /\binternal\b/i, reason: 'mentions internal material' },
];

async function getEffectiveRules(newsroomId) {
  if (!newsroomId) return cloneDefault();
  const { rows } = await pool.query(
    `SELECT metadata->'sensitivity_rules' AS override
       FROM newsroom_profiles
      WHERE newsroom_id = $1`,
    [newsroomId]
  );
  const override = rows[0]?.override;
  if (!override) return cloneDefault();
  return mergeWithOverrides(cloneDefault(), override);
}

function cloneDefault() {
  return {
    always_sensitive_keywords: [...DEFAULT_RULES.always_sensitive_keywords],
    always_sensitive_workflows: [...DEFAULT_RULES.always_sensitive_workflows],
    regex_patterns: [...DEFAULT_RULES.regex_patterns],
    default_label: DEFAULT_RULES.default_label,
  };
}

/**
 * Classify a text payload + optional workflow slug against an effective
 * rule set. Pure function — call getEffectiveRules() first to merge the
 * newsroom override, then pass into here.
 *
 * @param {object} args
 * @param {string} args.text            the input being classified
 * @param {string} [args.workflowSlug]  optional — for always_sensitive_workflows
 * @param {object} args.rules           effective rules (defaults ⊕ override)
 * @returns {{label: 'public'|'internal'|'sensitive', confidence: number, reasons: string[]}}
 */
function classify({ text, workflowSlug, rules }) {
  const reasons = [];
  const haystack = (text || '').toString();
  const lower = haystack.toLowerCase();

  // 1. Workflow-level always-sensitive check.
  if (workflowSlug && Array.isArray(rules.always_sensitive_workflows)
      && rules.always_sensitive_workflows.includes(workflowSlug)) {
    reasons.push(`workflow "${workflowSlug}" is marked always-sensitive`);
  }

  // 2. Hard keyword check (newsroom + default lists merged in rules).
  const keywords = Array.isArray(rules.always_sensitive_keywords)
    ? rules.always_sensitive_keywords : [];
  for (const k of keywords) {
    if (!k || typeof k !== 'string') continue;
    if (lower.includes(k.toLowerCase())) {
      reasons.push(`hard keyword: "${k}"`);
    }
  }

  // 3. Built-in hard regex patterns.
  for (const { pattern, reason } of BUILT_IN_HARD_PATTERNS) {
    if (pattern.test(haystack)) reasons.push(reason);
  }

  // 4. Custom regex patterns from newsroom override.
  if (Array.isArray(rules.regex_patterns)) {
    for (const src of rules.regex_patterns) {
      if (typeof src !== 'string' || !src) continue;
      try {
        const r = new RegExp(src, 'i');
        if (r.test(haystack)) reasons.push(`custom pattern matched: ${src}`);
      } catch {
        // Malformed override pattern — skip silently rather than failing
        // every call. The editor UI should also validate at write-time.
      }
    }
  }

  if (reasons.length > 0) {
    return { label: 'sensitive', confidence: 0.95, reasons };
  }

  // 5. Soft signals → internal.
  for (const { pattern, reason } of BUILT_IN_SOFT_PATTERNS) {
    if (pattern.test(haystack)) reasons.push(reason);
  }
  if (reasons.length > 0) {
    return { label: 'internal', confidence: 0.7, reasons };
  }

  // 6. Default label from the rules (usually 'public').
  const fallback = rules.default_label === 'internal' ? 'internal' : 'public';
  return {
    label: fallback,
    confidence: 0.6,
    reasons: [`no signal — using default "${fallback}"`],
  };
}

module.exports = {
  classify,
  getEffectiveRules,
  DEFAULT_RULES,
  BUILT_IN_HARD_PATTERNS,
  BUILT_IN_SOFT_PATTERNS,
};
