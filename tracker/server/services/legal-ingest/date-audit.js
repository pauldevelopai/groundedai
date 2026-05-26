// Full-auto date audit for lawsuits + regulations.
//
// For each entity we call Claude with web_search enabled, asking it to verify
// the dates we hold against primary sources. Claude returns structured JSON
// with corrections and a source URL per corrected field. We write changes
// back directly (user asked for full auto) and append the source URL to
// the entity's source_urls array so provenance is preserved.
//
// NOT all dates can be verified. Unverifiable fields are left as-is.
//
// Usage:
//   await auditLawsuitDates({ limit: 5 });
//   await auditRegulationDates({ limit: 5 });
//   await auditAllDates({ limit: 10 });

import pool from '../../db/pool.js';
import { callClaudeWithWebSearch } from '../claude.js';
import { urlResolves } from './url-verify.js';

// Lawsuit date fields we'll try to verify
const LAWSUIT_DATE_FIELDS = ['filing_date', 'last_update', 'next_deadline'];
// Regulation date fields
const REG_DATE_FIELDS = ['proposed_date', 'enacted_date', 'effective_date', 'enforcement_date', 'next_milestone'];

// ── Prompts ─────────────────────────────────────────────────────────────────
function buildLawsuitPrompt(c) {
  const current = LAWSUIT_DATE_FIELDS
    .map(f => `- ${f}: ${c[f] ? toDate(c[f]) : 'unknown'}`).join('\n');
  return {
    system: `You are a fact-checker verifying dates for a tracker of AI lawsuits.

Using web search, look up authoritative primary sources (court dockets, official judgments, regulator press releases, reputable legal press). For each date field below, either confirm it or propose a correction with a source URL.

Output STRICT JSON with this shape and nothing else:
{
  "filing_date":   { "value": "YYYY-MM-DD" | null, "source_url": "https://…", "confidence": 0.0-1.0, "note": "short" } | null,
  "last_update":   { ... } | null,
  "next_deadline": { ... } | null,
  "overall_note": "short"
}

Rules:
- Use null (not a guess) when you cannot find a primary source.
- Confidence < 0.6 → set the field to null.
- Prefer official court / regulator URLs. Avoid Wikipedia unless it cites a primary source.
- Dates in ISO 8601 (YYYY-MM-DD) only.`,
    userContent: `Case: **${c.case_name}**
Jurisdiction: ${c.jurisdiction || 'Unknown'}
Court: ${c.court || 'Unknown'}${c.district ? ` (${c.district})` : ''}
Parties: ${(c.plaintiffs || []).join(', ') || 'Unknown'} v. ${(c.defendants || []).join(', ') || 'Unknown'}
Case type: ${c.case_type || 'Unknown'}

Current dates on record:
${current}

Existing source URLs:
${(c.source_urls || []).concat([c.source_url, c.case_url].filter(Boolean)).filter(Boolean).slice(0, 6).join('\n') || '(none)'}

Verify the three dates via web search and return the JSON.`,
  };
}

function buildRegulationPrompt(r) {
  const current = REG_DATE_FIELDS
    .map(f => `- ${f}: ${r[f] ? toDate(r[f]) : 'unknown'}`).join('\n');
  return {
    system: `You are a fact-checker verifying dates for a tracker of AI regulations.

Using web search, look up authoritative primary sources (official gazettes, regulator websites, regulator press releases, reputable legal press). For each date field below, either confirm it or propose a correction with a source URL.

Output STRICT JSON:
{
  "proposed_date":    { "value": "YYYY-MM-DD" | null, "source_url": "https://…", "confidence": 0.0-1.0, "note": "short" } | null,
  "enacted_date":     { ... } | null,
  "effective_date":   { ... } | null,
  "enforcement_date": { ... } | null,
  "next_milestone":   { ... } | null,
  "overall_note": "short"
}

Rules:
- Use null when you cannot find a primary source.
- Confidence < 0.6 → null.
- Prefer official regulator / gazette URLs.
- ISO 8601 dates only.`,
    userContent: `Regulation: **${r.short_name || r.regulation_name}**${r.short_name && r.regulation_name !== r.short_name ? ` (full: ${r.regulation_name})` : ''}
Jurisdiction: ${r.jurisdiction}
Regulator: ${r.regulator || 'Unknown'}
Type: ${r.regulation_type || 'Unknown'}

Current dates on record:
${current}

Existing URLs:
${[r.official_url, r.source_url].concat(r.source_urls || []).filter(Boolean).slice(0, 6).join('\n') || '(none)'}

Verify the five dates via web search and return the JSON.`,
  };
}

function toDate(v) {
  if (!v) return 'unknown';
  const d = new Date(v);
  return isNaN(d.getTime()) ? String(v) : d.toISOString().slice(0, 10);
}

// ── Response parsing ────────────────────────────────────────────────────────
function extractJson(text) {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('No JSON in response');
  return JSON.parse(m[0]);
}

// ── Per-entity runners ──────────────────────────────────────────────────────
async function auditOneLawsuit(c) {
  const prompt = buildLawsuitPrompt(c);
  const { text, citations } = await callClaudeWithWebSearch({
    system: prompt.system,
    userContent: prompt.userContent,
    maxTokens: 1200,
    maxUses: 2,  // was 4 — cost-optimised
  });

  let parsed;
  try { parsed = extractJson(text); }
  catch (err) { throw new Error(`parse failed: ${err.message}. Raw: ${text.slice(0, 200)}`); }

  const updates = [];
  const params = [];
  const sourceUrls = new Set();
  const changes = [];

  for (const field of LAWSUIT_DATE_FIELDS) {
    const v = parsed[field];
    if (!v || typeof v !== 'object') continue;
    const { value, confidence, source_url, note } = v;
    // D5 anti-hallucination guard: require confidence + a resolvable source URL.
    if (value && confidence >= 0.6 && source_url) {
      const verified = await urlResolves(source_url);
      if (!verified) {
        changes.push({ field, before: toDate(c[field]), after: toDate(value), source_url, confidence, note, rejected: 'source_url_unresolved' });
        continue;
      }
      const beforeStr = toDate(c[field]);
      const afterStr  = toDate(value);
      if (beforeStr !== afterStr) {
        params.push(value);
        updates.push(`${field} = $${params.length}::date`);
        sourceUrls.add(source_url);
        changes.push({ field, before: beforeStr, after: afterStr, source_url, confidence, note });
      }
    }
  }

  if (updates.length === 0) return { id: c.id, name: c.case_name, changes, citations };

  // Append new source URLs (dedup against the existing array)
  const merged = [...new Set([...(c.source_urls || []), ...sourceUrls])];
  params.push(merged);
  updates.push(`source_urls = $${params.length}::text[]`);
  params.push(c.id);

  await pool.query(
    `UPDATE ai_lawsuits SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${params.length}`,
    params
  );

  // Keep the public timeline consistent: when the audit corrected last_update,
  // make sure there's an ai_lawsuit_events row at the new date. We upsert a
  // single "update" event tagged with [date_audit] so it's idempotent across
  // re-runs and can't be confused with a seeded filing/outcome event.
  const lastUpdateChange = changes.find(c => !c.rejected && c.field === 'last_update');
  if (lastUpdateChange) {
    const tag = '[date_audit]';
    const src = lastUpdateChange.source_url;
    const title = `${c.case_name.slice(0, 400)} — date verified`;
    const existing = await pool.query(
      `SELECT id FROM ai_lawsuit_events WHERE lawsuit_id = $1 AND description LIKE $2 LIMIT 1`,
      [c.id, `${tag}%`]
    );
    if (existing.rowCount > 0) {
      await pool.query(
        `UPDATE ai_lawsuit_events
            SET event_date = $1::date, title = $2, description = $3, source_url = $4, source_verified_at = NOW()
          WHERE id = $5`,
        [lastUpdateChange.after, title, `${tag} ${lastUpdateChange.note || ''}`.slice(0, 10000), src, existing.rows[0].id]
      );
    } else {
      await pool.query(
        `INSERT INTO ai_lawsuit_events (lawsuit_id, event_date, event_type, title, description, source_url, source_verified_at)
         VALUES ($1, $2::date, 'update', $2, $3, $4, NOW())`,
        [c.id, lastUpdateChange.after, title, `${tag} ${lastUpdateChange.note || ''}`.slice(0, 10000), src]
      );
    }
  }

  return { id: c.id, name: c.case_name, changes, citations };
}

async function auditOneRegulation(r) {
  const prompt = buildRegulationPrompt(r);
  const { text, citations } = await callClaudeWithWebSearch({
    system: prompt.system,
    userContent: prompt.userContent,
    maxTokens: 1200,
    maxUses: 2,  // was 4 — cost-optimised
  });

  let parsed;
  try { parsed = extractJson(text); }
  catch (err) { throw new Error(`parse failed: ${err.message}. Raw: ${text.slice(0, 200)}`); }

  const updates = [];
  const params = [];
  const sourceUrls = new Set();
  const changes = [];

  for (const field of REG_DATE_FIELDS) {
    const v = parsed[field];
    if (!v || typeof v !== 'object') continue;
    const { value, confidence, source_url, note } = v;
    if (value && confidence >= 0.6 && source_url) {
      const verified = await urlResolves(source_url);
      if (!verified) {
        changes.push({ field, before: toDate(r[field]), after: toDate(value), source_url, confidence, note, rejected: 'source_url_unresolved' });
        continue;
      }
      const beforeStr = toDate(r[field]);
      const afterStr  = toDate(value);
      if (beforeStr !== afterStr) {
        params.push(value);
        updates.push(`${field} = $${params.length}::date`);
        sourceUrls.add(source_url);
        changes.push({ field, before: beforeStr, after: afterStr, source_url, confidence, note });
      }
    }
  }

  if (updates.length === 0) return { id: r.id, name: r.short_name || r.regulation_name, changes, citations };

  const merged = [...new Set([...(r.source_urls || []), ...sourceUrls])];
  params.push(merged);
  updates.push(`source_urls = $${params.length}::text[]`);
  params.push(r.id);

  await pool.query(
    `UPDATE ai_regulations SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${params.length}`,
    params
  );

  // Reflect date-audit corrections in the public timeline. For regulations,
  // semantically interesting dates are enacted and effective — we upsert
  // events for each that changed, tagged [date_audit:<field>] for idempotency.
  const fieldToEvent = {
    enacted_date:   { type: 'enacted',     title: 'Enacted'  },
    effective_date: { type: 'took_effect', title: 'Took effect' },
    enforcement_date: { type: 'took_effect', title: 'Enforcement begins' },
  };
  for (const ch of changes) {
    if (ch.rejected) continue;
    const evSpec = fieldToEvent[ch.field];
    if (!evSpec) continue;
    const tag = `[date_audit:${ch.field}]`;
    const existing = await pool.query(
      `SELECT id FROM ai_regulation_events WHERE regulation_id = $1 AND description LIKE $2 LIMIT 1`,
      [r.id, `${tag}%`]
    );
    if (existing.rowCount > 0) {
      await pool.query(
        `UPDATE ai_regulation_events
            SET event_date = $1::date, title = $2, description = $3, source_url = $4, source_verified_at = NOW()
          WHERE id = $5`,
        [ch.after, evSpec.title, `${tag} ${ch.note || ''}`.slice(0, 10000), ch.source_url, existing.rows[0].id]
      );
    } else {
      await pool.query(
        `INSERT INTO ai_regulation_events (regulation_id, event_date, event_type, title, description, source_url, source_verified_at)
         VALUES ($1, $2::date, $3, $4, $5, $6, NOW())`,
        [r.id, ch.after, evSpec.type, evSpec.title, `${tag} ${ch.note || ''}`.slice(0, 10000), ch.source_url]
      );
    }
  }

  return { id: r.id, name: r.short_name || r.regulation_name, changes, citations };
}

// ── Public entry points ─────────────────────────────────────────────────────
export async function auditLawsuitDates({ limit = 5, onlyUnaudited = false } = {}) {
  const { rows } = await pool.query(
    `SELECT * FROM ai_lawsuits
      ORDER BY updated_at ASC NULLS FIRST
      LIMIT $1`,
    [limit]
  );
  const summary = { processed: rows.length, changed: 0, unchanged: 0, errors: [], log: [] };
  for (const c of rows) {
    try {
      const res = await auditOneLawsuit(c);
      if (res.changes.length) summary.changed++;
      else summary.unchanged++;
      summary.log.push(res);
    } catch (err) {
      summary.errors.push({ id: c.id, name: c.case_name, error: err.message });
    }
  }
  return summary;
}

export async function auditRegulationDates({ limit = 5 } = {}) {
  const { rows } = await pool.query(
    `SELECT * FROM ai_regulations ORDER BY updated_at ASC NULLS FIRST LIMIT $1`,
    [limit]
  );
  const summary = { processed: rows.length, changed: 0, unchanged: 0, errors: [], log: [] };
  for (const r of rows) {
    try {
      const res = await auditOneRegulation(r);
      if (res.changes.length) summary.changed++;
      else summary.unchanged++;
      summary.log.push(res);
    } catch (err) {
      summary.errors.push({ id: r.id, name: r.short_name || r.regulation_name, error: err.message });
    }
  }
  return summary;
}

export async function auditAllDates({ limit = 10 } = {}) {
  const halfL = Math.ceil(limit / 2);
  const halfR = Math.floor(limit / 2);
  const [l, r] = await Promise.all([
    auditLawsuitDates({ limit: halfL }),
    auditRegulationDates({ limit: halfR }),
  ]);
  return { lawsuits: l, regulations: r };
}
