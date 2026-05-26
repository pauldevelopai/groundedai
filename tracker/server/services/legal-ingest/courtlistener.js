// Deep CourtListener integration: for each US lawsuit we track, fetch its
// docket and turn every docket entry into a verified ai_lawsuit_events row.
//
// Free-tier limits: "please throttle to ~1 RPS" per CourtListener docs.
// Auth token is OPTIONAL — lifts the rate limit. We read it from
// COURTLISTENER_TOKEN in env; if missing, we sleep 1.2s between calls.
//
// Design:
//   1. If the lawsuit row already has external_id → treat it as the
//      CourtListener docket ID and pull entries directly.
//   2. Else: search CourtListener by case_name, pick the best match.
//      Only auto-bind if confidence is high enough (> 0.75); otherwise
//      log a "needs_review" for human triage.
//   3. For each entry, we upsert an event row keyed by
//      (lawsuit_id, external_entry_id). The source_url on every event is a
//      canonical courtlistener.com URL, so the D5 guard passes trivially.

import axios from 'axios';
import pool from '../../db/pool.js';

const BASE = 'https://www.courtlistener.com';
const UA   = 'AI Legal Tracker / ailegal.co.za (research bot)';
const TOKEN = process.env.COURTLISTENER_TOKEN || '';
const SLEEP_BETWEEN_CALLS = TOKEN ? 200 : 1200;

const authHeader = TOKEN ? { Authorization: `Token ${TOKEN}` } : {};

// Minimum (fuzzy) match score to bind automatically. Below this we flag it.
const AUTO_BIND_THRESHOLD = 0.75;

// ── HTTP helpers ────────────────────────────────────────────────────────────
class CourtListenerAuthError extends Error {
  constructor() {
    super('CourtListener requires an API token for docket / docket-entries endpoints. Sign up free at https://www.courtlistener.com/help/api/rest/#authentication and set COURTLISTENER_TOKEN in .env.');
    this.name = 'CourtListenerAuthError';
    this.code = 'NEEDS_AUTH';
  }
}

async function get(path, params = {}) {
  const url = path.startsWith('http') ? path : `${BASE}${path}`;
  try {
    const res = await axios.get(url, {
      timeout: 20000,
      headers: { 'User-Agent': UA, ...authHeader },
      params,
      validateStatus: s => s >= 200 && s < 400,
    });
    await new Promise(r => setTimeout(r, SLEEP_BETWEEN_CALLS));
    return res.data;
  } catch (err) {
    if (err.response?.status === 401) throw new CourtListenerAuthError();
    throw err;
  }
}

// ── Search: find the likely docket for a given case name ───────────────────
export async function findDocketForCase(caseName, { court } = {}) {
  // Strip our disambiguator suffixes: "(California)", "(UK)", etc.
  const cleaned = caseName.replace(/\s*\([^)]*\)\s*$/g, '').trim();

  const params = { q: cleaned, type: 'r', order_by: 'score desc' };
  if (court) params.court = court;

  const data = await get('/api/rest/v4/search/', params);
  const hits = data?.results || [];
  if (hits.length === 0) return { match: null, confidence: 0, hits: [] };

  // Score by string similarity + court proximity
  const scored = hits.slice(0, 10).map(h => {
    const name = h.caseName || h.case_name || '';
    const sim = stringSimilarity(cleaned.toLowerCase(), name.toLowerCase());
    return { hit: h, similarity: sim };
  }).sort((a, b) => b.similarity - a.similarity);

  const top = scored[0];
  return {
    match: top.hit,
    confidence: top.similarity,
    hits: scored.map(s => ({ id: s.hit.docket_id || s.hit.id, caseName: s.hit.caseName, sim: s.similarity, absolute_url: s.hit.absolute_url })),
  };
}

// Jaccard-ish similarity over tokenised case names. Good enough for
// matching "Bartz v. Anthropic" to "Bartz et al. v. Anthropic PBC".
function stringSimilarity(a, b) {
  const toks = s => new Set(
    s.replace(/[^\w\s]/g, ' ')
     .split(/\s+/)
     .filter(t => t.length > 1 && !['v', 'vs', 'the', 'and', 'et', 'al', 'inc', 'llc', 'ltd', 'co', 'corp'].includes(t))
  );
  const A = toks(a), B = toks(b);
  if (A.size === 0 || B.size === 0) return 0;
  let overlap = 0;
  for (const x of A) if (B.has(x)) overlap++;
  return overlap / Math.min(A.size, B.size);
}

// ── Docket entries ──────────────────────────────────────────────────────────
export async function getDocketEntries(docketId, { limit = 100 } = {}) {
  const entries = [];
  let nextUrl = `/api/rest/v4/docket-entries/?docket=${docketId}&order_by=date_filed&page_size=50`;
  while (nextUrl && entries.length < limit) {
    const data = await get(nextUrl);
    if (!data?.results) break;
    entries.push(...data.results);
    nextUrl = data.next
      ? data.next.replace(/^https?:\/\/[^/]+/, '')  // strip host so `get()` re-prefixes
      : null;
  }
  return entries.slice(0, limit);
}

// ── Entry → event mapping ───────────────────────────────────────────────────
// CourtListener entries describe motions, orders, rulings etc. We pick the
// most descriptive text and classify into our event_type taxonomy.
function classifyEntry(entry) {
  const text = (entry.description || entry.short_description || '').toLowerCase();
  if (/granted.*dismiss|dismiss.*granted|voluntarily dismissed/.test(text)) return 'dismissal';
  if (/order.*settle|settlement.*approv|joint stipulation of dismissal/.test(text)) return 'settlement';
  if (/notice of appeal|filed.*appeal/.test(text)) return 'appeal';
  if (/summary judgment/.test(text)) return 'ruling';
  if (/amended complaint|amended answer/.test(text)) return 'amendment';
  if (/complaint|filed.*lawsuit|initial filing/.test(text)) return 'filing';
  if (/order|ruling|opinion/.test(text)) return 'ruling';
  if (/hearing|oral argument/.test(text)) return 'hearing';
  return 'update';
}

function entryToEvent(entry, docketId) {
  const title = entry.description || entry.short_description || 'Docket entry';
  const date  = entry.date_filed || entry.date_created || null;
  const type  = classifyEntry(entry);
  const url   = entry.absolute_url
    ? `${BASE}${entry.absolute_url}`
    : `${BASE}/docket/${docketId}/`;
  return { title: title.slice(0, 500), date, type, url, external_entry_id: String(entry.id) };
}

// ── Per-case sync ──────────────────────────────────────────────────────────
export async function syncLawsuitFromCourtListener(lawsuitId) {
  const { rows } = await pool.query(
    `SELECT id, case_name, external_id FROM ai_lawsuits WHERE id = $1`,
    [lawsuitId]
  );
  if (rows.length === 0) throw new Error('lawsuit not found');
  const lawsuit = rows[0];

  // 1. Figure out the docket ID
  let docketId = lawsuit.external_id && /^\d+$/.test(lawsuit.external_id)
    ? lawsuit.external_id
    : null;
  let confidence = docketId ? 1 : 0;
  let discoveryInfo = null;

  if (!docketId) {
    const search = await findDocketForCase(lawsuit.case_name);
    confidence = search.confidence;
    discoveryInfo = { candidates: search.hits };
    if (search.match && confidence >= AUTO_BIND_THRESHOLD) {
      docketId = String(search.match.docket_id || search.match.id);
      await pool.query('UPDATE ai_lawsuits SET external_id = $1 WHERE id = $2', [docketId, lawsuitId]);
    } else {
      return {
        lawsuit_id: lawsuitId,
        case_name: lawsuit.case_name,
        needs_review: true,
        reason: 'no_match_above_threshold',
        confidence,
        candidates: search.hits,
      };
    }
  }

  // 2. Fetch entries. If no auth token, degrade: return the docket URL as a
  //    single "docket binding" event so the lawsuit at least gets a canonical
  //    CourtListener link, but skip per-entry sync.
  if (!TOKEN) {
    const docketUrl = `${BASE}/docket/${docketId}/`;
    return {
      lawsuit_id: lawsuitId,
      case_name: lawsuit.case_name,
      docket_id: docketId,
      docket_url: docketUrl,
      confidence,
      entries_seen: 0,
      inserted: 0,
      needs_auth: true,
      message: 'Docket found and bound. Set COURTLISTENER_TOKEN to sync individual entries.',
    };
  }

  const entries = await getDocketEntries(docketId, { limit: 60 });
  let inserted = 0, duplicates = 0;

  // 3. Persist each entry as an event row, keyed by external_entry_id.
  //    Use a tiny text marker in description so a re-sync finds the same row.
  for (const raw of entries) {
    const ev = entryToEvent(raw, docketId);
    const descriptionTagged = `[cl_entry:${ev.external_entry_id}]` + (raw.description || raw.short_description || '');

    const exists = await pool.query(
      `SELECT 1 FROM ai_lawsuit_events
        WHERE lawsuit_id = $1 AND description LIKE $2
        LIMIT 1`,
      [lawsuitId, `[cl_entry:${ev.external_entry_id}]%`]
    );
    if (exists.rowCount > 0) { duplicates++; continue; }

    await pool.query(
      `INSERT INTO ai_lawsuit_events
         (lawsuit_id, event_date, event_type, title, description, source_url, source_verified_at)
       VALUES ($1, $2::date, $3, $4, $5, $6, NOW())`,
      [lawsuitId, ev.date, ev.type, ev.title, descriptionTagged.slice(0, 10000), ev.url]
    );
    inserted++;
  }

  // 4. Bump last_update if we inserted anything with a date
  if (inserted > 0) {
    await pool.query(
      `UPDATE ai_lawsuits
          SET last_update = GREATEST(COALESCE(last_update, 'epoch'::date),
                                     COALESCE((SELECT MAX(event_date) FROM ai_lawsuit_events WHERE lawsuit_id = $1), last_update)),
              last_scraped_at = NOW(),
              updated_at = NOW()
        WHERE id = $1`,
      [lawsuitId]
    );
  }

  return {
    lawsuit_id: lawsuitId,
    case_name: lawsuit.case_name,
    docket_id: docketId,
    confidence,
    entries_seen: entries.length,
    inserted,
    duplicates,
  };
}

// ── Bulk — sync every US case ─────────────────────────────────────────────
export async function syncAllUsLawsuits({ limit = 60 } = {}) {
  const { rows } = await pool.query(
    `SELECT id, case_name FROM ai_lawsuits
      WHERE jurisdiction LIKE 'US%'
      ORDER BY updated_at ASC
      LIMIT $1`,
    [limit]
  );
  const summary = { seen: rows.length, synced: 0, needs_review: 0, errors: 0, events_inserted: 0, per_case: [] };
  for (const l of rows) {
    try {
      const r = await syncLawsuitFromCourtListener(l.id);
      if (r.needs_review) { summary.needs_review++; }
      else { summary.synced++; summary.events_inserted += r.inserted || 0; }
      summary.per_case.push(r);
    } catch (err) {
      summary.errors++;
      summary.per_case.push({ lawsuit_id: l.id, case_name: l.case_name, error: err.message });
    }
  }
  return summary;
}

// ── Admin: manually bind a docket ID ────────────────────────────────────────
export async function bindDocketManually(lawsuitId, docketId) {
  await pool.query('UPDATE ai_lawsuits SET external_id = $1 WHERE id = $2', [String(docketId), lawsuitId]);
  return syncLawsuitFromCourtListener(lawsuitId);
}
