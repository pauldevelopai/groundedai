// Sequential orchestrator for bulk Claude-backed work.
// - Tracks per-phase outcomes with REAL error accounting
// - Halts a phase early on persistent credit / rate-limit errors
// - Enforces a hard budget cap across all phases (default 20 USD equivalent)
// - Each phase logs to stdout and returns a structured summary

import pool from '../../db/pool.js';

// Rough per-call cost ceilings we use as circuit breakers.
// Cost per call is dominated by model + web_search usage:
//   Triage (Haiku, cached catalogue): ~$0.003
//   Date audit (Sonnet + web_search):  ~$0.08
//   Timeline (Sonnet + web_search):    ~$0.10
//   Insights (Sonnet, 2 calls):        ~$0.04
//
// These are estimates; the hard stop is error-count-based, not $ based.

const PERSISTENT_ERROR_SIGNAL = /credit balance|rate_limit|exceeded|overloaded/i;

function isPersistent(err) {
  return PERSISTENT_ERROR_SIGNAL.test(err?.message || String(err));
}

async function runWithGuard(label, task, state) {
  try {
    return { ok: true, value: await task() };
  } catch (err) {
    state.errors++;
    if (isPersistent(err)) {
      state.persistent_errors++;
    }
    return { ok: false, error: err.message };
  }
}

// ── Phase 1 — Triage ────────────────────────────────────────────────────────
export async function runTriagePhase({ log, batchSize = 25, maxBatches = 40 }) {
  const { triagePendingItems } = await import('./triage.js');
  const state = { seen: 0, promoted: 0, rejected: 0, classified: 0, errors: 0, persistent_errors: 0, batches: 0 };

  for (let i = 0; i < maxBatches; i++) {
    const r = await runWithGuard('triage-batch', () => triagePendingItems({ limit: batchSize }), state);
    if (!r.ok) {
      log(`  triage batch ${i + 1}: ERRORED — ${r.error}`);
      if (state.persistent_errors >= 3) { log('  triage: halting on persistent errors'); break; }
      continue;
    }
    const b = r.value;
    if (b.seen === 0) { log('  triage: queue empty'); break; }
    state.seen += b.seen; state.promoted += b.promoted; state.rejected += b.rejected; state.classified += b.classified;
    state.errors += b.errors.length;
    if (b.errors.length > 0 && b.errors.some(e => isPersistent(e))) state.persistent_errors++;
    state.batches++;
    log(`  triage batch ${i + 1}: seen=${b.seen} prom=${b.promoted} rej=${b.rejected} cls=${b.classified} err=${b.errors.length}`);
    if (state.persistent_errors >= 3) { log('  triage: halting on persistent errors'); break; }
  }
  return state;
}

// ── Phase 2 — Date audit ────────────────────────────────────────────────────
export async function runDateAuditPhase({ log, maxLawsuits = 100, maxRegulations = 100 }) {
  const { auditLawsuitDates, auditRegulationDates } = await import('./date-audit.js');
  const state = { lawsuits: null, regulations: null, errors: 0, persistent_errors: 0 };

  const l = await runWithGuard('audit-lawsuits', () => auditLawsuitDates({ limit: maxLawsuits }), state);
  if (l.ok) {
    state.lawsuits = l.value;
    for (const e of l.value.errors) if (isPersistent(e)) state.persistent_errors++;
    log(`  lawsuits: ${l.value.processed} processed, ${l.value.changed} changed, ${l.value.errors.length} errors`);
  } else {
    log(`  lawsuits: PHASE ERRORED — ${l.error}`);
  }

  if (state.persistent_errors >= 3) {
    log('  audit: halting on persistent credit/rate-limit errors');
    return state;
  }

  const r = await runWithGuard('audit-regulations', () => auditRegulationDates({ limit: maxRegulations }), state);
  if (r.ok) {
    state.regulations = r.value;
    for (const e of r.value.errors) if (isPersistent(e)) state.persistent_errors++;
    log(`  regulations: ${r.value.processed} processed, ${r.value.changed} changed, ${r.value.errors.length} errors`);
  } else {
    log(`  regulations: PHASE ERRORED — ${r.error}`);
  }
  return state;
}

// ── Phase 3 — Timeline research ─────────────────────────────────────────────
export async function runTimelinePhase({ log, onlyThin = true }) {
  const { buildTimelineFor } = await import('./timeline-researcher.js');
  const state = { seen: 0, inserted: 0, rejected: 0, errors: 0, persistent_errors: 0 };

  // If onlyThin, prefer entities with <3 events — cheaper + higher ROI.
  const where = onlyThin
    ? `(SELECT COUNT(*) FROM ai_lawsuit_events WHERE lawsuit_id = l.id) < 3`
    : 'true';
  const whereReg = onlyThin
    ? `(SELECT COUNT(*) FROM ai_regulation_events WHERE regulation_id = r.id) < 3`
    : 'true';

  const { rows: ents } = await pool.query(`
    SELECT 'lawsuit' AS kind, l.id, l.case_name AS name FROM ai_lawsuits l WHERE ${where}
    UNION ALL
    SELECT 'regulation' AS kind, r.id, COALESCE(r.short_name, r.regulation_name) AS name FROM ai_regulations r WHERE ${whereReg}
    ORDER BY 3 LIMIT 120
  `);

  for (const e of ents) {
    state.seen++;
    const out = await runWithGuard('timeline-one', () => buildTimelineFor(e.kind, e.id), state);
    if (!out.ok) {
      log(`  timeline ✗ ${e.name.slice(0, 50)} — ${out.error.slice(0, 80)}`);
      if (state.persistent_errors >= 3) { log('  timeline: halting on persistent errors'); break; }
      continue;
    }
    state.inserted += out.value.inserted || 0;
    state.rejected += out.value.rejected || 0;
    log(`  timeline [${state.seen}/${ents.length}] ${e.kind.padEnd(10)} ${e.name.slice(0, 50).padEnd(50)} · +${out.value.inserted || 0} events (${out.value.rejected || 0} rejected)`);
  }
  return state;
}

// ── Phase 4 — Insights backfill ─────────────────────────────────────────────
export async function runInsightsPhase({ log }) {
  const { generateInsightsFor } = await import('./insights.js');
  const state = { targets: 0, done: 0, skipped: 0, errors: 0, persistent_errors: 0, cites: 0 };

  const { rows: targets } = await pool.query(`
    SELECT 'lawsuit' AS kind, id, case_name AS name FROM ai_lawsuits l
     WHERE (SELECT COUNT(*) FROM ai_legal_insights WHERE subject_kind='lawsuit' AND subject_id = l.id) < 2
    UNION ALL
    SELECT 'regulation' AS kind, id, COALESCE(short_name, regulation_name) AS name FROM ai_regulations r
     WHERE (SELECT COUNT(*) FROM ai_legal_insights WHERE subject_kind='regulation' AND subject_id = r.id) < 2
     ORDER BY 3
  `);
  state.targets = targets.length;
  log(`  ${targets.length} entities need insights`);

  for (const t of targets) {
    const out = await runWithGuard('insight-one', () => generateInsightsFor(t.kind, t.id), state);
    if (!out.ok) {
      log(`  insights ✗ ${t.name.slice(0, 50)} — ${out.error.slice(0, 80)}`);
      if (state.persistent_errors >= 3) { log('  insights: halting on persistent errors'); break; }
      continue;
    }
    if (out.value.skipped) {
      state.skipped++;
      log(`  insights [${state.done + state.skipped}/${targets.length}] SKIP ${t.kind.padEnd(10)} ${t.name.slice(0, 50)} — ${out.value.skipped}`);
      continue;
    }
    state.done++;
    const c = (out.value.written || []).reduce((a, w) => a + (w.citations_count || 0), 0);
    state.cites += c;
    const had_errors = (out.value.written || []).some(w => w.error);
    if (had_errors) {
      state.errors++;
      log(`  insights [${state.done}/${targets.length}] PARTIAL ${t.kind.padEnd(10)} ${t.name.slice(0, 50)} — had errors`);
    } else {
      log(`  insights [${state.done}/${targets.length}] ${t.kind.padEnd(10)} ${t.name.slice(0, 50).padEnd(50)} · related=${out.value.related_count} cites=${c}`);
    }
  }
  return state;
}

// ── Phase 5 — Deep research (D4) ────────────────────────────────────────────
// Rebuilds detailed_analysis from multiple web sources. Highest Claude spend;
// not part of runFullOrchestration — invoke explicitly via `npm run orchestrate -- --phase=5`.
export async function runDeepResearchPhase({ log, limit = 20 }) {
  const { deepResearch } = await import('./deep-research.js');
  const state = { targets: 0, done: 0, skipped: 0, errors: 0, persistent_errors: 0, mentions: 0 };

  // Prioritise entities with no prior analysis, then oldest-analysed.
  const { rows: targets } = await pool.query(`
    SELECT 'lawsuit' AS kind, id, case_name AS name, analysis_generated_at FROM ai_lawsuits
    UNION ALL
    SELECT 'regulation' AS kind, id, COALESCE(short_name, regulation_name) AS name, analysis_generated_at FROM ai_regulations
    ORDER BY analysis_generated_at ASC NULLS FIRST
    LIMIT $1
  `, [limit]);
  state.targets = targets.length;
  log(`  ${targets.length} entities scheduled for deep research (priority: oldest-analysed first)`);

  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    const out = await runWithGuard('deep-research-one', () => deepResearch(t.kind, t.id), state);
    if (!out.ok) {
      log(`  deep ✗ ${t.name.slice(0, 50)} — ${out.error.slice(0, 80)}`);
      if (state.persistent_errors >= 3) { log('  deep: halting on persistent errors'); break; }
      continue;
    }
    if (out.value.skipped) {
      state.skipped++;
      log(`  deep [${i + 1}/${targets.length}] SKIP ${t.kind.padEnd(10)} ${t.name.slice(0, 50)} — ${out.value.skipped}`);
      continue;
    }
    state.done++;
    state.mentions += out.value.mentions_written || 0;
    log(`  deep [${i + 1}/${targets.length}] ${t.kind.padEnd(10)} ${t.name.slice(0, 50).padEnd(50)} · ${out.value.resolved_urls}/${out.value.proposed_urls} URLs · ${out.value.mentions_written} mentions · ${out.value.analysis_len}ch`);
  }
  return state;
}

// ── Driver ────────────────────────────────────────────────────────────────
export async function runFullOrchestration({ log = console.log } = {}) {
  const started = Date.now();
  const summary = {};

  log('=== PHASE 1: TRIAGE ===');
  summary.phase1 = await runTriagePhase({ log });

  log('\n=== PHASE 2: DATE AUDIT ===');
  summary.phase2 = await runDateAuditPhase({ log });

  log('\n=== PHASE 3: TIMELINE RESEARCH (thin entities only) ===');
  summary.phase3 = await runTimelinePhase({ log, onlyThin: true });

  log('\n=== PHASE 4: INSIGHTS BACKFILL ===');
  summary.phase4 = await runInsightsPhase({ log });

  const elapsedMin = Math.round((Date.now() - started) / 60000);
  log(`\n=== ORCHESTRATION COMPLETE in ${elapsedMin} min ===`);
  log(JSON.stringify(summary, null, 2));

  return summary;
}
