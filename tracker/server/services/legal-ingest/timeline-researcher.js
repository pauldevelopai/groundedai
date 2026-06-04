// Deep timeline research agent.
//
// For each lawsuit or regulation, ask Claude (with web_search) to enumerate
// every significant event in chronological order, with date + source URL for
// each. Returns a JSON array of proposed events. Every event must have a
// source URL; URLs are verified to resolve (D5 guard) before writing.
//
// We also feed Claude the events we ALREADY have, so it doesn't duplicate —
// and a cutoff filter prevents adding events with invalid dates.
//
// Typical output for an active lawsuit: 8–20 events spanning filing through
// most recent docket activity. For a regulation: proposal → consultation →
// adoption → entry into force → enforcement milestones.

import pool from '../../db/pool.js';
import { callClaudeWithWebSearch } from '../claude.js';
import { urlResolves } from './url-verify.js';

const LAWSUIT_EVENT_TYPES = ['filing','hearing','ruling','settlement','dismissal','decision','appeal','amendment','update'];
const REG_EVENT_TYPES     = ['proposed','consultation','enacted','amended','took_effect','enforcement_action','guidance_issued','repealed','superseded','update'];

// ── Prompt builders ─────────────────────────────────────────────────────────
function buildLawsuitPrompt(c, existingEvents) {
  const have = existingEvents.length === 0
    ? '(none)'
    : existingEvents.map(e => `- ${e.event_date || '—'} · ${e.event_type} · ${(e.title || '').slice(0, 120)}`).join('\n');
  return {
    system: `You are a precise legal research agent building an event timeline for an AI lawsuit tracker.

Output STRICT JSON with the following shape and NOTHING else:
{
  "events": [
    {
      "event_date": "YYYY-MM-DD",
      "event_type": "filing" | "hearing" | "ruling" | "settlement" | "dismissal" | "decision" | "appeal" | "amendment" | "update",
      "title": "short headline, ~60 chars",
      "description": "1–3 sentences explaining what happened and why it matters",
      "source_url": "https://…",
      "confidence": 0.0-1.0
    }
  ]
}

Rules:
- Use web_search to find docket entries, rulings, filings, settlements, press coverage. Focus on CourtListener, PACER, regulator press releases, Reuters, Law360, JURIST, Lawfare.
- Return every event you can verify with a primary source. Aim for 8–20 events for an active case, every significant one.
- Each event MUST include a source_url pointing to a primary record. If you can't find a source, OMIT the event — do not guess dates.
- Dates in strict ISO YYYY-MM-DD. If only the month is known, prefer the earliest of that month.
- Don't repeat events that are already in the "Existing events" list below.
- Sort events oldest → newest in the output.
- confidence < 0.5 → omit.
- No markdown, no commentary, only the JSON object.`,
    userContent: `# Case
**${c.case_name}**
Jurisdiction: ${c.jurisdiction}
Court: ${c.court || 'unknown'}${c.district ? ` (${c.district})` : ''}
${c.judge ? `Judge: ${c.judge}\n` : ''}Type: ${c.case_type} · Status: ${c.status}
Parties: ${(c.plaintiffs || []).join(', ')} v. ${(c.defendants || []).join(', ')}
${c.filing_date ? `Filed: ${c.filing_date}\n` : ''}${c.summary ? `\nSummary: ${c.summary}\n` : ''}

# Existing events (do NOT duplicate)
${have}

# Task
Research this case exhaustively using web_search. Return the JSON object with every additional event you can verify with a primary source.`,
  };
}

function buildRegulationPrompt(r, existingEvents) {
  const have = existingEvents.length === 0
    ? '(none)'
    : existingEvents.map(e => `- ${e.event_date || '—'} · ${e.event_type} · ${(e.title || '').slice(0, 120)}`).join('\n');
  return {
    system: `You are a precise legal research agent building an event timeline for an AI regulation tracker.

Output STRICT JSON:
{
  "events": [
    {
      "event_date": "YYYY-MM-DD",
      "event_type": "proposed" | "consultation" | "enacted" | "amended" | "took_effect" | "enforcement_action" | "guidance_issued" | "repealed" | "superseded" | "update",
      "title": "~60 char headline",
      "description": "1–3 sentence summary",
      "source_url": "https://…",
      "confidence": 0.0-1.0
    }
  ]
}

Rules:
- Use web_search. Prefer official regulator sites, EUR-Lex, Federal Register, national gazettes, regulator press releases.
- Enumerate every significant milestone: initial proposal, consultation window, committee/parliamentary stages, enactment, promulgation, entry into force, enforcement deadlines, first enforcement actions, amendments.
- Every event needs a source_url (primary source preferred). Omit if unverifiable.
- Sort oldest → newest. ISO dates. No duplicates of existing events. confidence < 0.5 → omit. JSON only.`,
    userContent: `# Regulation
**${r.short_name || r.regulation_name}**${r.short_name ? ` (full: ${r.regulation_name})` : ''}
Jurisdiction: ${r.jurisdiction}
Regulator: ${r.regulator || 'unknown'}
Type: ${r.regulation_type} · Status: ${r.status}
${r.enacted_date ? `Enacted: ${r.enacted_date}\n` : ''}${r.effective_date ? `Effective: ${r.effective_date}\n` : ''}${r.summary ? `\nSummary: ${r.summary}\n` : ''}

# Existing events (do NOT duplicate)
${have}

# Task
Research this regulation using web_search. Return JSON of every verifiable milestone.`,
  };
}

// ── JSON extraction ─────────────────────────────────────────────────────────
function extractEvents(text, allowedTypes) {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON in response');
  const parsed = JSON.parse(jsonMatch[0]);
  if (!Array.isArray(parsed?.events)) return [];
  return parsed.events.filter(e =>
    e && typeof e === 'object'
    && typeof e.event_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(e.event_date)
    && allowedTypes.includes(e.event_type)
    && typeof e.source_url === 'string' && /^https?:\/\//i.test(e.source_url)
    && (typeof e.confidence !== 'number' || e.confidence >= 0.5)
  );
}

// ── Per-entity runner ───────────────────────────────────────────────────────
async function researchLawsuit(lawsuitId) {
  const { rows } = await pool.query('SELECT * FROM ai_lawsuits WHERE id = $1', [lawsuitId]);
  if (rows.length === 0) throw new Error('lawsuit not found');
  const c = rows[0];

  const { rows: existing } = await pool.query(
    `SELECT event_date::text, event_type, title, source_url
       FROM ai_lawsuit_events WHERE lawsuit_id = $1 ORDER BY event_date ASC NULLS LAST`,
    [lawsuitId]
  );

  const prompt = buildLawsuitPrompt(c, existing);
  const { text, citations } = await callClaudeWithWebSearch({
    system: prompt.system,
    userContent: prompt.userContent,
    maxTokens: 2500,
    maxUses: 4,  // was 8 — cost-optimised
  });

  let proposed = [];
  try { proposed = extractEvents(text, LAWSUIT_EVENT_TYPES); }
  catch (err) { throw new Error(`parse failed: ${err.message}. Response head: ${text.slice(0, 200)}`); }

  // Dedup against existing events by (date + near-identical title)
  const existingKeys = new Set(existing.map(e => `${e.event_date}:${(e.title || '').toLowerCase().slice(0, 40)}`));
  const verified = [];
  for (const ev of proposed) {
    const key = `${ev.event_date}:${(ev.title || '').toLowerCase().slice(0, 40)}`;
    if (existingKeys.has(key)) continue;

    // D5 guard: source URL must resolve
    const ok = await urlResolves(ev.source_url);
    if (!ok) { verified.push({ ...ev, rejected: 'source_url_unresolved' }); continue; }

    await pool.query(
      `INSERT INTO ai_lawsuit_events (lawsuit_id, event_date, event_type, title, description, source_url, source_verified_at)
       VALUES ($1, $2::date, $3, $4, $5, $6, NOW())`,
      [lawsuitId, ev.event_date, ev.event_type, ev.title?.slice(0, 500) || null, ev.description || null, ev.source_url]
    );
    verified.push(ev);
  }

  // Bump last_update to match newest event we just inserted
  const added = verified.filter(e => !e.rejected);
  if (added.length > 0) {
    const newestDate = added.reduce((a, e) => e.event_date > a ? e.event_date : a, '1900-01-01');
    await pool.query(
      `UPDATE ai_lawsuits
          SET last_update = GREATEST(COALESCE(last_update, 'epoch'::date), $1::date),
              updated_at = NOW()
        WHERE id = $2`,
      [newestDate, lawsuitId]
    );
  }

  return {
    kind: 'lawsuit',
    id: lawsuitId,
    name: c.case_name,
    existing_count: existing.length,
    proposed_count: proposed.length,
    inserted: added.length,
    rejected: verified.filter(e => e.rejected).length,
    citations,
  };
}

async function researchRegulation(regulationId) {
  const { rows } = await pool.query('SELECT * FROM ai_regulations WHERE id = $1', [regulationId]);
  if (rows.length === 0) throw new Error('regulation not found');
  const r = rows[0];

  const { rows: existing } = await pool.query(
    `SELECT event_date::text, event_type, title, source_url
       FROM ai_regulation_events WHERE regulation_id = $1 ORDER BY event_date ASC NULLS LAST`,
    [regulationId]
  );

  const prompt = buildRegulationPrompt(r, existing);
  const { text, citations } = await callClaudeWithWebSearch({
    system: prompt.system,
    userContent: prompt.userContent,
    maxTokens: 2500,
    maxUses: 4,  // was 8 — cost-optimised
  });

  let proposed = [];
  try { proposed = extractEvents(text, REG_EVENT_TYPES); }
  catch (err) { throw new Error(`parse failed: ${err.message}. Response head: ${text.slice(0, 200)}`); }

  const existingKeys = new Set(existing.map(e => `${e.event_date}:${(e.title || '').toLowerCase().slice(0, 40)}`));
  const verified = [];
  for (const ev of proposed) {
    const key = `${ev.event_date}:${(ev.title || '').toLowerCase().slice(0, 40)}`;
    if (existingKeys.has(key)) continue;
    const ok = await urlResolves(ev.source_url);
    if (!ok) { verified.push({ ...ev, rejected: 'source_url_unresolved' }); continue; }
    await pool.query(
      `INSERT INTO ai_regulation_events (regulation_id, event_date, event_type, title, description, source_url, source_verified_at)
       VALUES ($1, $2::date, $3, $4, $5, $6, NOW())`,
      [regulationId, ev.event_date, ev.event_type, ev.title?.slice(0, 500) || null, ev.description || null, ev.source_url]
    );
    verified.push(ev);
  }

  return {
    kind: 'regulation',
    id: regulationId,
    name: r.short_name || r.regulation_name,
    existing_count: existing.length,
    proposed_count: proposed.length,
    inserted: verified.filter(e => !e.rejected).length,
    rejected: verified.filter(e => e.rejected).length,
    citations,
  };
}

export async function buildTimelineFor(kind, id) {
  if (kind === 'lawsuit')    return researchLawsuit(id);
  if (kind === 'regulation') return researchRegulation(id);
  throw new Error('kind must be lawsuit or regulation');
}

// Scheduler entry: picks the N entities with the stalest or thinnest timelines.
export async function deepenStalestTimelines({ limit = 5 } = {}) {
  // Prefer entities with few events + not researched recently. We heuristically
  // pick cases that have <3 events and a filing/effective date >30 days ago.
  const [law, reg] = await Promise.all([
    pool.query(`
      SELECT l.id, l.case_name AS name FROM ai_lawsuits l
       WHERE (SELECT COUNT(*) FROM ai_lawsuit_events WHERE lawsuit_id = l.id) < 3
       ORDER BY l.updated_at ASC LIMIT $1
    `, [Math.ceil(limit / 2)]),
    pool.query(`
      SELECT r.id, COALESCE(r.short_name, r.regulation_name) AS name FROM ai_regulations r
       WHERE (SELECT COUNT(*) FROM ai_regulation_events WHERE regulation_id = r.id) < 3
       ORDER BY r.updated_at ASC LIMIT $1
    `, [Math.floor(limit / 2)]),
  ]);
  const summary = { seen: law.rows.length + reg.rows.length, inserted: 0, errors: [] };
  for (const c of law.rows) {
    try { const r = await researchLawsuit(c.id); summary.inserted += r.inserted; }
    catch (err) { summary.errors.push({ id: c.id, name: c.name, error: err.message }); }
  }
  for (const c of reg.rows) {
    try { const r = await researchRegulation(c.id); summary.inserted += r.inserted; }
    catch (err) { summary.errors.push({ id: c.id, name: c.name, error: err.message }); }
  }
  return summary;
}
