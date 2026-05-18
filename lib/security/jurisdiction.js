// Jurisdiction pack loader + tool risk scorer for the Digital Security Audit.
//
// Slice B of the Security Audit build (see docs/SECURITY_AUDIT_PLAN.md).
// Pure / deterministic — no DB, no Claude. The audit pipeline (Slice C)
// calls scoreInventory() with the live tool inventory + the newsroom's
// jurisdiction + their overrides, and the result feeds the report.
//
// Pack file: config/jurisdiction-packs.yaml. Loaded once at module load
// and cached. Override the path via GROUNDED_JURISDICTION_PACK_PATH for
// tests.

const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');

const DEFAULT_PACK_PATH = path.join(__dirname, '..', '..', 'config', 'jurisdiction-packs.yaml');

const SEVERITY_TO_BAND = {
  warn: 'medium',
  avoid: 'high',
  prohibit: 'critical',
};
const BAND_RANK = { low: 0, medium: 1, high: 2, critical: 3 };
const BAND_BY_RANK = ['low', 'medium', 'high', 'critical'];

// Data kinds that escalate one risk band if they're in tool.data_kinds_exposed
// AND the tool's residency isn't on the safe list. This is the "source-
// protection material doesn't leave the perimeter" rule from the concept note.
const SENSITIVE_DATA_KINDS = new Set(['source_contacts', 'unpublished_drafts']);

let _packs = null;

/**
 * Load (and memoise) the jurisdiction packs from YAML.
 * Pass { reload: true } to force a re-read (used by tests).
 */
function loadPacks({ reload = false, packPath } = {}) {
  if (_packs && !reload) return _packs;
  const p = packPath || process.env.GROUNDED_JURISDICTION_PACK_PATH || DEFAULT_PACK_PATH;
  const raw = fs.readFileSync(p, 'utf8');
  const parsed = yaml.load(raw);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error(`jurisdiction-packs: YAML did not parse to an object`);
  }
  if (!parsed.default) {
    throw new Error(`jurisdiction-packs: a "default" section is required`);
  }
  _packs = parsed;
  return _packs;
}

/**
 * Resolve a pack for the given jurisdiction code (ISO-2). Falls back to
 * 'default' if unknown. Returns a normalised pack with default-empty arrays.
 */
function packFor(jurisdiction, packs = loadPacks()) {
  const raw = (jurisdiction && packs[jurisdiction]) || packs.default;
  return normalisePack(raw);
}

function normalisePack(p) {
  return {
    data_law_summary: typeof p.data_law_summary === 'string' ? p.data_law_summary.trim() : '',
    safe_residencies: Array.isArray(p.safe_residencies) ? p.safe_residencies.map(String) : [],
    risky_residencies: Array.isArray(p.risky_residencies) ? p.risky_residencies.map(String) : [],
    tool_avoid_list: Array.isArray(p.tool_avoid_list) ? p.tool_avoid_list.map(normaliseEntry) : [],
    tool_allow_list: Array.isArray(p.tool_allow_list) ? p.tool_allow_list.map(normaliseEntry) : [],
  };
}

function normaliseEntry(e) {
  return {
    vendor: typeof e.vendor === 'string' ? e.vendor : null,
    tool_name: typeof e.tool_name === 'string' ? e.tool_name : null,
    severity: e.severity || 'warn',
    reason: typeof e.reason === 'string' ? e.reason : '',
  };
}

/**
 * Merge a pack with per-newsroom overrides. Overrides shape:
 *   {
 *     tool_allow_list: [...],     // append
 *     tool_avoid_list: [...],     // append (own entries override pack ones with same vendor/tool_name)
 *     safe_residencies: [...],    // append (deduped)
 *     risky_residencies: [...],   // append (deduped)
 *   }
 * If an override puts a residency in safe AND the pack has it in risky,
 * the override wins.
 */
function mergePackWithOverrides(pack, overrides) {
  if (!overrides || typeof overrides !== 'object') return pack;
  const overrideSafe = Array.isArray(overrides.safe_residencies) ? overrides.safe_residencies.map(String) : [];
  const overrideRisky = Array.isArray(overrides.risky_residencies) ? overrides.risky_residencies.map(String) : [];

  // Override-promoted safes win over pack-risky.
  const safeSet = new Set([...pack.safe_residencies, ...overrideSafe]);
  const riskySet = new Set(pack.risky_residencies.filter((r) => !overrideSafe.includes(r)).concat(overrideRisky));

  // Avoid-list: pack entries first, then override entries — but override
  // entries with same (vendor + tool_name) replace the pack entry.
  const overrideAvoid = Array.isArray(overrides.tool_avoid_list) ? overrides.tool_avoid_list.map(normaliseEntry) : [];
  const seen = new Set();
  const avoidMerged = [];
  for (const e of [...overrideAvoid, ...pack.tool_avoid_list]) {
    const key = `${(e.vendor || '').toLowerCase()}::${(e.tool_name || '').toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    avoidMerged.push(e);
  }

  const allowMerged = [
    ...pack.tool_allow_list,
    ...(Array.isArray(overrides.tool_allow_list) ? overrides.tool_allow_list.map(normaliseEntry) : []),
  ];

  return {
    data_law_summary: pack.data_law_summary,
    safe_residencies: [...safeSet],
    risky_residencies: [...riskySet],
    tool_avoid_list: avoidMerged,
    tool_allow_list: allowMerged,
  };
}

function entryMatches(entry, tool) {
  // Match if both vendor + tool_name are specified and both match (AND),
  // OR if only one is specified and it matches. Case-insensitive.
  const v = (tool.vendor || '').toLowerCase();
  const n = (tool.tool_name || '').toLowerCase();
  const eV = (entry.vendor || '').toLowerCase();
  const eN = (entry.tool_name || '').toLowerCase();
  if (eV && eN) return eV === v && eN === n;
  if (eV) return eV === v;
  if (eN) return eN === n;
  return false;
}

function bumpBand(current, target) {
  return BAND_BY_RANK[Math.max(BAND_RANK[current] || 0, BAND_RANK[target] || 0)];
}

function severityToBand(severity) {
  return SEVERITY_TO_BAND[severity] || 'medium';
}

/**
 * Score a single tool against the newsroom's jurisdiction pack + overrides.
 *
 * @param {object} tool         { vendor, tool_name, data_residency?, data_kinds_exposed? }
 * @param {string} jurisdiction ISO-2 country code (or 'default')
 * @param {object} [overrides]  per-newsroom override blob
 * @returns {{ risk_band: 'low'|'medium'|'high'|'critical', reasons: Array<{kind: string, ...}> }}
 */
function scoreTool(tool, jurisdiction, overrides = null) {
  const pack = mergePackWithOverrides(packFor(jurisdiction), overrides);
  const reasons = [];
  let band = 'low';

  // 1. Allow-list takes precedence — if a newsroom has explicitly whitelisted
  //    the tool, we still flag residency for visibility but cap at 'medium'.
  let allowListed = null;
  for (const e of pack.tool_allow_list) {
    if (entryMatches(e, tool)) { allowListed = e; break; }
  }

  // 2. Residency check.
  const residency = (tool.data_residency || '').toUpperCase();
  if (!residency) {
    reasons.push({ kind: 'no_residency_declared' });
    band = bumpBand(band, 'medium');
  } else if (pack.safe_residencies.includes(residency)) {
    reasons.push({ kind: 'safe_residency', residency });
  } else if (pack.risky_residencies.includes(residency)) {
    reasons.push({ kind: 'risky_residency', residency, summary: pack.data_law_summary });
    band = bumpBand(band, 'medium');
  } else {
    reasons.push({ kind: 'unknown_residency', residency });
    band = bumpBand(band, 'medium');
  }

  // 3. Avoid-list (skipped if allow-listed).
  if (!allowListed) {
    for (const e of pack.tool_avoid_list) {
      if (entryMatches(e, tool)) {
        reasons.push({ kind: 'avoid_listed', severity: e.severity, reason: e.reason, vendor: e.vendor, tool_name: e.tool_name });
        band = bumpBand(band, severityToBand(e.severity));
      }
    }
  } else {
    reasons.push({ kind: 'allow_listed', reason: allowListed.reason });
    // Cap risk at 'medium' for explicitly allow-listed tools.
    if (BAND_RANK[band] > BAND_RANK.medium) band = 'medium';
  }

  // 4. Sensitive data kinds escalate one band when residency isn't safe.
  const kinds = Array.isArray(tool.data_kinds_exposed) ? tool.data_kinds_exposed : [];
  const hasSensitive = kinds.some((k) => SENSITIVE_DATA_KINDS.has(k));
  const residencyIsSafe = pack.safe_residencies.includes(residency);
  if (hasSensitive && !residencyIsSafe) {
    const before = band;
    band = bumpBand(band, BAND_BY_RANK[Math.min(BAND_RANK[band] + 1, 3)]);
    if (band !== before) {
      reasons.push({
        kind: 'sensitive_data_exposed',
        data_kinds: kinds.filter((k) => SENSITIVE_DATA_KINDS.has(k)),
      });
    }
  }

  return { risk_band: band, reasons };
}

/**
 * Score an entire inventory at once.
 *
 * @param {Array} tools         security_external_tools rows
 * @param {string} jurisdiction ISO-2 (or 'default')
 * @param {object} [overrides]
 * @returns {{
 *   per_tool: Record<string, { risk_band, reasons }>,  // keyed by tool.id
 *   overall_risk_band: 'low'|'medium'|'high'|'critical',
 *   counts: { low, medium, high, critical }
 * }}
 */
function scoreInventory(tools, jurisdiction, overrides = null) {
  const perTool = {};
  const counts = { low: 0, medium: 0, high: 0, critical: 0 };
  let overall = 'low';
  for (const t of tools) {
    const scored = scoreTool(t, jurisdiction, overrides);
    perTool[t.id] = scored;
    counts[scored.risk_band] += 1;
    overall = bumpBand(overall, scored.risk_band);
  }
  return { per_tool: perTool, overall_risk_band: overall, counts };
}

module.exports = {
  loadPacks,
  packFor,
  mergePackWithOverrides,
  scoreTool,
  scoreInventory,
  // Exported for tests:
  BAND_RANK,
  BAND_BY_RANK,
  SEVERITY_TO_BAND,
  SENSITIVE_DATA_KINDS,
};
