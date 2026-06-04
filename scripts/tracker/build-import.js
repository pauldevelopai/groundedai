#!/usr/bin/env node
// scripts/tracker/build-import.js
// ─────────────────────────────────────────────────────────────────────────
// Deterministically transform the Tracker app's pg_dump into a GROUNDED import.
//
// Rules (see docs/tracker/overlap-map.yaml + HUB_TRACKER_NODES_PLAN.md):
//   • DECIDED SCOPE (2026-05-25): import ONLY the AI-Legal Tracker + ingestion.
//     AS_IS = the ai_*/ai_legal_* core (lawsuits, regulations, usecases, sources,
//     raw-items, submissions, subscriptions, notifications, api-keys, …) imported
//     unchanged. KEEP_PREFIXED = the industry-intelligence feed, imported under a
//     `tracker_` prefix (constraint/index names prefixed too, to avoid collisions).
//   • Everything else — CRM/cohort/training, outreach, fundraising, ai-assistant,
//     auth/infra, and the legacy `migrations` table — is dropped from the import
//     (covered by grounded's own features or out of scope; see HUB_TRACKER_NODES_PLAN.md).
//   • FK constraints that point at a dropped table are stripped, so nothing dangles.
//   • OWNER TO / GRANT / REVOKE / COMMENT / SET / session pragmas are stripped
//     (the legacy "holly" owner role does not exist in GROUNDED).
//   • Legacy column wording is renamed (COLUMN_RENAMES) — the brand is retired.
//   • FUNCTIONS + TRIGGERS (full-text-search maintenance + event fan-out) are
//     appended at the END of the migration (after all tables/constraints/indexes
//     exist). They reference only the AI-Legal as-is tables, so they apply
//     cleanly against the imported schema.
//   • All COPY data is stripped from the schema migration; it loads separately
//     via `--data` (one-shot, not replayed on every migrate).
//   • Table references are rewritten only where schema-qualified as
//     `public.<table>`, so column names are never touched.
//
// Usage:
//   node scripts/tracker/build-import.js          # write db/migrations/039_tracker_import.sql
//   node scripts/tracker/build-import.js --data    # print remapped COPY data to stdout
//
// The transform is re-runnable; the source dump stays canonical.

const fs = require('node:fs');
const path = require('node:path');

const DUMP = process.env.TRACKER_DUMP || path.join(__dirname, '../../../tracker/holly.sql');
const OUT = path.join(__dirname, '../../db/migrations/039_tracker_import.sql');

// AI-Legal core + ingestion + public engagement — imported AS-IS (no prefix).
const AS_IS = new Set([
  'ai_lawsuits', 'ai_lawsuit_events', 'ai_regulations', 'ai_regulation_events',
  'ai_legal_usecases', 'ai_legal_raw_items', 'ai_legal_sources', 'ai_legal_source_runs',
  'ai_legal_source_mentions', 'ai_legal_insights', 'ai_legal_subscriptions',
  'ai_legal_notifications', 'ai_legal_user_submissions', 'ai_legal_api_keys', 'ai_legal_tools',
]);
// Kept but not ai_*-named, so imported under the tracker_ prefix: the industry
// intelligence feed. Its FKs to dropped CRM tables (sectors, team_members) are
// stripped automatically (see the FK-skip in emitSchema).
const KEEP_PREFIXED = new Set(['industry_intelligence', 'intelligence_sources']);

// Exactly the two sets above are imported. Everything else (CRM/cohort/training,
// outreach, fundraising, ai-assistant, auth/infra + the legacy migrations table)
// is dropped from the import.
const KEEP = (t) => AS_IS.has(t) || KEEP_PREFIXED.has(t);

// Legacy wording baked into the schema. Renamed everywhere (brand retired).
// NOTE: the tracker backend that reads these columns must be updated to match
// when it is lifted in (T1). Flagged for Paul.
const COLUMN_RENAMES = { holly_access: 'admin_access' };

const raw = fs.readFileSync(DUMP, 'utf8');

const ALL_TABLES = [...raw.matchAll(/^CREATE TABLE public\.([a-z0-9_]+)/gim)].map((m) => m[1]);
const isRenamed = (t) => KEEP_PREFIXED.has(t);
const mapTable = (t) => (!KEEP(t) ? null : AS_IS.has(t) ? t : 'tracker_' + t);
const namesByLenDesc = [...ALL_TABLES].sort((a, b) => b.length - a.length);

function renameCols(text) {
  let t = text;
  for (const [from, to] of Object.entries(COLUMN_RENAMES)) {
    t = t.replace(new RegExp('\\b' + from + '\\b', 'g'), to);
  }
  return t;
}
function rewriteRefs(text) {
  let t = text;
  for (const name of namesByLenDesc) {
    if (!isRenamed(name)) continue; // AS_IS and EXCLUDE keep their public.<name>
    t = t.replace(new RegExp('public\\.' + name + '(?![a-z0-9_])', 'g'), 'public.tracker_' + name);
  }
  return renameCols(t);
}
const prefixConstraintName = (s) => s.replace(/ADD CONSTRAINT ([a-z0-9_]+)/i, 'ADD CONSTRAINT tracker_$1');
const prefixIndexName = (s) => s.replace(/(CREATE (?:UNIQUE )?INDEX )([a-z0-9_]+)( ON )/i, '$1tracker_$2$3');

// ── Statement segmentation. DDL ends at a line terminating in ';', EXCEPT
//    inside a $$-dollar-quoted function body. COPY blocks are skipped wholesale.
function* statements() {
  const lines = raw.split('\n');
  let buf = [];
  let inCopy = false;
  let inDollar = false;
  for (const line of lines) {
    if (inCopy) { if (line === '\\.') inCopy = false; continue; }
    const t = line.trim();
    if (buf.length === 0 && !inDollar) {
      if (t === '' || t.startsWith('--') || t.startsWith('\\')) continue;
      if (/^SET /i.test(t) || /^SELECT /i.test(t)) continue; // session pragmas, setval
      if (t.startsWith('COPY ')) { inCopy = true; continue; }
    }
    if ((line.match(/\$\$/g) || []).length % 2 === 1) inDollar = !inDollar;
    buf.push(line);
    if (!inDollar && t.endsWith(';')) { yield buf.join('\n').trim(); buf = []; }
  }
  if (buf.length) yield buf.join('\n').trim();
}

function emitSchema() {
  const out = [];
  const funcs = [];
  const trigs = [];
  const stats = { kept: 0, dropped: 0, tables: 0, renamed: 0, asis: 0, functions: 0, triggers: 0 };

  for (const stmt of statements()) {
    const s = stmt.replace(/\s+/g, ' ').trim();
    if (!s) continue;

    if (/ OWNER TO /i.test(s) || /^GRANT /i.test(s) || /^REVOKE /i.test(s) || /^COMMENT ON /i.test(s)) { stats.dropped++; continue; }
    if (/^(CREATE|ALTER) SEQUENCE /i.test(s)) { stats.dropped++; continue; } // only migrations_id_seq exists
    if (/^CREATE EXTENSION /i.test(s)) { out.push(stmt); stats.kept++; continue; }

    // Functions + triggers: appended at the end (after tables exist).
    if (/^CREATE (OR REPLACE )?FUNCTION /i.test(s)) { funcs.push(rewriteRefs(stmt)); stats.functions++; continue; }
    if (/^CREATE TRIGGER /i.test(s)) { trigs.push(rewriteRefs(stmt)); stats.triggers++; continue; }

    let m;
    if ((m = stmt.match(/^CREATE TABLE public\.([a-z0-9_]+)/i))) {
      const tbl = m[1];
      if (mapTable(tbl) === null) { stats.dropped++; continue; }
      out.push(rewriteRefs(stmt));
      stats.kept++; stats.tables++;
      if (isRenamed(tbl)) stats.renamed++; else stats.asis++;
      continue;
    }
    if ((m = stmt.match(/^ALTER TABLE (?:ONLY )?public\.([a-z0-9_]+)/i))) {
      const tbl = m[1];
      if (mapTable(tbl) === null || /SET DEFAULT nextval/i.test(stmt)) { stats.dropped++; continue; }
      // Strip FK constraints that point at a dropped table, so the trimmed schema
      // has no dangling references (e.g. industry_intelligence -> sectors / team_members).
      const fk = stmt.match(/REFERENCES public\.([a-z0-9_]+)/i);
      if (fk && mapTable(fk[1]) === null) { stats.dropped++; continue; }
      let o = rewriteRefs(stmt);
      if (isRenamed(tbl)) o = prefixConstraintName(o);
      out.push(o); stats.kept++; continue;
    }
    if ((m = stmt.match(/^CREATE (?:UNIQUE )?INDEX [a-z0-9_]+ ON public\.([a-z0-9_]+)/i))) {
      const tbl = m[1];
      if (mapTable(tbl) === null) { stats.dropped++; continue; }
      let o = rewriteRefs(stmt);
      if (isRenamed(tbl)) o = prefixIndexName(o);
      out.push(o); stats.kept++; continue;
    }
    console.warn('DROPPED unrecognized statement: ' + s.slice(0, 90));
    stats.dropped++;
  }

  const header = [
    '-- 039_tracker_import.sql',
    '-- GENERATED by scripts/tracker/build-import.js from the Tracker app pg_dump.',
    '-- Do not edit by hand — re-run the generator. Source of truth: the dump.',
    '--',
    '-- DECIDED SCOPE (2026-05-25): only the AI-Legal Tracker + ingestion is imported.',
    '-- AI-Legal core tables as-is; the industry-intelligence feed prefixed tracker_;',
    '-- the CRM/cohort/training, outreach, fundraising, ai-assistant and auth/infra',
    '-- tables are dropped (covered by grounded or out of scope). FKs to dropped',
    '-- tables are stripped. OWNER/GRANT/COMMENT/data stripped. FTS + fan-out',
    '-- functions/triggers appended at the end (they reference only kept tables).',
    '-- Data loads separately (one-shot): node scripts/tracker/build-import.js --data',
    `-- Tables: ${stats.tables} (${stats.asis} as-is, ${stats.renamed} prefixed).`,
    '', '',
  ].join('\n');

  const body = out.join('\n\n')
    + '\n\n\n-- ─── Functions: full-text-search maintenance + event fan-out ───\n\n'
    + funcs.join('\n\n')
    + '\n\n\n-- ─── Triggers ───\n\n'
    + trigs.join('\n\n');
  fs.writeFileSync(OUT, header + body + '\n');

  console.error(`[build-import] wrote ${OUT}`);
  console.error(`[build-import] ${JSON.stringify(stats)}`);
  console.error(`[build-import] dump tables: ${ALL_TABLES.length}`);
}

function emitData() {
  const lines = raw.split('\n');
  let i = 0;
  while (i < lines.length) {
    const m = lines[i].match(/^COPY public\.([a-z0-9_]+) (\(.*\) FROM stdin;)$/);
    if (!m) { i++; continue; }
    const mapped = mapTable(m[1]);
    const block = [];
    let j = i + 1;
    while (j < lines.length && lines[j] !== '\\.') { block.push(lines[j]); j++; }
    if (mapped !== null) {
      process.stdout.write(`COPY public.${mapped} ${renameCols(m[2])}\n`);
      if (block.length) process.stdout.write(block.join('\n') + '\n');
      process.stdout.write('\\.\n\n');
    }
    i = j + 1;
  }
}

if (process.argv.includes('--data')) emitData();
else emitSchema();
