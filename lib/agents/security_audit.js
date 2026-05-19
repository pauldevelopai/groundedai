// Digital Security Audit — Slice C (the audit pipeline).
//
// Concept-note Tool #5. Composes four ingredients into a saved report:
//
//   1. The newsroom's self-reported external-tool inventory
//      (security_external_tools, populated via /security inventory UI)
//   2. The newsroom's jurisdiction + per-newsroom overrides
//      (newsroom_profile.metadata.jurisdiction / jurisdiction_overrides)
//   3. Deterministic risk scoring of each inventory tool via the
//      jurisdiction pack (Slice B's lib/security/jurisdiction.js)
//   4. Routing-history rollup — what's actually been sent outside the
//      newsroom's perimeter over the past N days, read from
//      workflow_executions (sensitivity_label + executed_on)
//
// Plus one Haiku call to draft a prioritised fix list grounded in those
// four inputs. Locked-Haiku rule applies — chat() takes no model param.
// On Anthropic outage, lib/claude.js falls over to Ollama automatically.
//
// Persistence: one row per audit run in security_audit_reports.
//   - summary_json holds the full report payload (inventory_with_scoring,
//     routing_history, fix_list, summary_narrative)
//   - inventory_snapshot_json captures the inventory as it stood at run
//     time — so old reports keep meaning after the editor edits the live
//     inventory
//   - overall_risk_band rolled up from the per-tool scoring
//
// Workflow node use: category='tool', registered as 'security_audit'.
// Returns { reportId, overallRiskBand } so downstream nodes can branch.

const { pool } = require('../db');
const { chat } = require('../claude');
const { parseClaudeJson } = require('../parse-claude-json');
const { packFor, mergePackWithOverrides, scoreInventory } = require('../security/jurisdiction');

const DEFAULT_ROUTING_WINDOW_DAYS = 90;
const MAX_ROUTING_WINDOW_DAYS = 365;
const MAX_TOOLS_IN_PROMPT = 50;

const SYSTEM_PROMPT = `You are Grounded's Digital Security Audit assistant.

You will receive a structured payload covering one newsroom's:
- Jurisdiction (e.g. South Africa under POPIA)
- Self-reported external AI / data tools, each pre-scored against the jurisdiction pack
- 90-day routing history: workflow executions grouped by sensitivity and where they ran (cloud vs appliance)

Your job: draft a prioritised list of specific, named fixes the editor can work through this week. Ground every recommendation in the input — quote specific tool names, specific routing patterns, specific sources from the scoring. Do NOT invent vendors, tools, or facts that aren't in the payload.

Hard rules:
1. Concrete, named actions. "Move source-protection material off ChatGPT" not "tighten data handling".
2. Specific to the newsroom's actual inventory + history. If they don't use TikTok, don't recommend anything about TikTok.
3. Prioritise: critical > high > medium > low. Critical means data is actively at risk right now. Low means a hygiene improvement.
4. Cite the evidence. Every fix references either a specific tool from the inventory or a specific routing pattern from the history.
5. Editor-facing tone. Direct, action-oriented, no jargon.

OUTPUT: return ONLY valid JSON matching this schema:

{
  "summary_narrative": "<2-3 sentences for the editor: what's the overall picture this audit reveals?>",
  "fix_list": [
    {
      "priority": "critical | high | medium | low",
      "title": "<short imperative title>",
      "action": "<specific action — what to do, who does it, when>",
      "evidence": "<which tool(s) or routing pattern(s) from the input back this up>"
    }
  ],
  "concerns_noted": ["<one-line patterns worth flagging but not actionable as a fix>"]
}

JSON only — no preamble, no markdown fences.`;

/**
 * Run a Digital Security Audit for the newsroom. Inserts a
 * security_audit_reports row, fills it in, returns { reportId, output }.
 *
 * @param {object} opts
 * @param {string} opts.newsroomId
 * @param {string} [opts.userId]
 * @param {number} [opts.routingWindowDays]  default 90
 * @returns {Promise<{ reportId: string, output: object, cost: object, durationMs: number, overallRiskBand: string }>}
 */
async function runAudit({ newsroomId, userId = null, routingWindowDays = DEFAULT_ROUTING_WINDOW_DAYS }) {
  const window = Math.max(1, Math.min(MAX_ROUTING_WINDOW_DAYS, parseInt(routingWindowDays, 10) || DEFAULT_ROUTING_WINDOW_DAYS));
  const startedAt = Date.now();

  // 1. Open the report row (status='running'). Lets the UI poll a partial
  //    state if the run is slow; on failure we update the same row.
  const insert = await pool.query(
    `INSERT INTO security_audit_reports
       (newsroom_id, initiated_by, routing_window_days, status)
     VALUES ($1, $2, $3, 'running')
     RETURNING id`,
    [newsroomId, userId, window]
  );
  const reportId = insert.rows[0].id;

  try {
    // 2. Load inventory + jurisdiction context.
    const inventoryRes = await pool.query(
      `SELECT id, vendor, tool_name, data_residency, declared_use,
              data_kinds_exposed, data_kinds_other, notes,
              added_by, created_at, updated_at
         FROM security_external_tools
        WHERE newsroom_id = $1
        ORDER BY lower(vendor), lower(tool_name)`,
      [newsroomId]
    );
    const tools = inventoryRes.rows;

    const profileRes = await pool.query(
      `SELECT metadata->>'jurisdiction'             AS jurisdiction,
              metadata->'jurisdiction_overrides'    AS overrides
         FROM newsroom_profiles
        WHERE newsroom_id = $1`,
      [newsroomId]
    );
    const jurisdiction = (profileRes.rows[0]?.jurisdiction || 'default').trim() || 'default';
    const overrides = profileRes.rows[0]?.overrides || null;

    // 3. Score the inventory deterministically.
    const basePack = packFor(jurisdiction);
    const effectivePack = mergePackWithOverrides(basePack, overrides);
    const scoring = scoreInventory(tools, jurisdiction, overrides);

    // 4. Routing-history rollup — workflow_executions grouped by slug +
    //    sensitivity + executed_on for the window.
    const historyRes = await pool.query(
      `SELECT COALESCE(workflow_slug, '(ad-hoc)') AS workflow_slug,
              COALESCE(sensitivity_label, 'unlabelled') AS sensitivity_label,
              COALESCE(executed_on, 'cloud') AS executed_on,
              COUNT(*)::int AS runs,
              SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END)::int AS completed,
              SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END)::int AS failed
         FROM workflow_executions
        WHERE newsroom_id = $1
          AND started_at >= NOW() - ($2 || ' days')::interval
        GROUP BY workflow_slug, sensitivity_label, executed_on
        ORDER BY runs DESC`,
      [newsroomId, String(window)]
    );
    const routingHistory = historyRes.rows;

    // Aggregate totals for the prompt.
    const totals = { runs: 0, by_sensitivity: { public: 0, internal: 0, sensitive: 0, unlabelled: 0 }, by_target: { cloud: 0, appliance: 0 } };
    for (const r of routingHistory) {
      totals.runs += r.runs;
      totals.by_sensitivity[r.sensitivity_label] = (totals.by_sensitivity[r.sensitivity_label] || 0) + r.runs;
      totals.by_target[r.executed_on] = (totals.by_target[r.executed_on] || 0) + r.runs;
    }

    // 5. Compose Claude payload. Cap inventory length defensively.
    const promptPayload = {
      jurisdiction,
      jurisdiction_pack_summary: effectivePack.data_law_summary,
      audit_depth: effectivePack.audit_depth || basePack.audit_depth || 'light',
      inventory_with_scoring: tools.slice(0, MAX_TOOLS_IN_PROMPT).map((t) => ({
        vendor: t.vendor,
        tool_name: t.tool_name,
        data_residency: t.data_residency,
        declared_use: t.declared_use,
        data_kinds_exposed: t.data_kinds_exposed,
        risk_band: scoring.per_tool[t.id]?.risk_band || 'low',
        reasons: scoring.per_tool[t.id]?.reasons || [],
      })),
      overall_risk_band: scoring.overall_risk_band,
      counts_by_band: scoring.counts,
      routing_window_days: window,
      routing_totals: totals,
      routing_history: routingHistory,
    };
    const userMessage = `Run a security audit for this newsroom and draft the fix list.\n\n${JSON.stringify(promptPayload, null, 2)}\n\nReturn JSON only.`;

    // 6. ONE Haiku call. lib/claude.js handles Anthropic-outage fallback.
    const { text, cost } = await chat({
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
      maxTokens: 3000,
      context: { newsroomId, userId, agent: 'security_audit', endpoint: '/api/security/reports' },
    });
    const parsed = parseClaudeJson(text);

    // Defensive normalisation.
    const fixList = Array.isArray(parsed.fix_list) ? parsed.fix_list : [];
    const narrative = typeof parsed.summary_narrative === 'string' ? parsed.summary_narrative : '';
    const concerns = Array.isArray(parsed.concerns_noted) ? parsed.concerns_noted : [];

    const summary = {
      generated_at: new Date().toISOString(),
      jurisdiction,
      jurisdiction_pack: {
        data_law_summary: effectivePack.data_law_summary,
        data_law_sources: effectivePack.data_law_sources || basePack.data_law_sources || [],
        audit_depth: effectivePack.audit_depth || basePack.audit_depth || 'light',
        last_verified: basePack.last_verified || null,
      },
      inventory_with_scoring: promptPayload.inventory_with_scoring,
      counts_by_band: scoring.counts,
      overall_risk_band: scoring.overall_risk_band,
      routing_window_days: window,
      routing_totals: totals,
      routing_history: routingHistory,
      summary_narrative: narrative,
      fix_list: fixList,
      concerns_noted: concerns,
    };

    const durationMs = Date.now() - startedAt;
    await pool.query(
      `UPDATE security_audit_reports
          SET status = 'completed',
              overall_risk_band = $2,
              summary_json = $3::jsonb,
              inventory_snapshot_json = $4::jsonb,
              cost_usd = $5,
              finished_at = NOW()
        WHERE id = $1`,
      [
        reportId, scoring.overall_risk_band,
        JSON.stringify(summary), JSON.stringify(tools),
        cost?.costUsd ?? null,
      ]
    );

    return { reportId, output: summary, cost, durationMs, overallRiskBand: scoring.overall_risk_band };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await pool.query(
      `UPDATE security_audit_reports
          SET status = 'failed', error = $2, finished_at = NOW()
        WHERE id = $1`,
      [reportId, message]
    );
    err.reportId = reportId;
    throw err;
  }
}

module.exports = { runAudit, DEFAULT_ROUTING_WINDOW_DAYS, MAX_ROUTING_WINDOW_DAYS };

// ─── Agent registry entry ──────────────────────────────────────────────────
const { register, resolveConfig } = require('./registry');
register({
  slug: 'security_audit',
  name: 'Digital Security Audit',
  icon: '🛡️',
  category: 'tool',
  description:
    'Audits the newsroom\'s digital security exposure: scores each external AI / data tool the newsroom uses against the loaded jurisdiction pack, reads the past 90 days of routing history to show what\'s already been sent outside the perimeter, and drafts a prioritised fix list. Concept-note Tool #5. On-demand from /security; also a draggable Builder block.',
  triggers: ['security', 'audit', 'risk', 'data leak', 'data exposure'],
  inputs: {},
  config: {
    routingWindowDays: {
      type: 'number',
      default: DEFAULT_ROUTING_WINDOW_DAYS,
      min: 1,
      max: MAX_ROUTING_WINDOW_DAYS,
      step: 30,
      label: 'Routing-history window (days)',
      description: 'How far back the audit looks when summarising what data has been sent to cloud vs appliance.',
    },
  },
  outputs: {
    reportId: { type: 'string', description: 'security_audit_reports row id; open at /security/reports/<id>.' },
    overallRiskBand: { type: 'string', description: '"low" | "medium" | "high" | "critical" — the highest per-tool band.' },
  },
  route: '/api/security/reports',
  async run(_input, ctx) {
    const cfg = resolveConfig('security_audit', {});
    const window = parseInt(cfg.routingWindowDays, 10) || DEFAULT_ROUTING_WINDOW_DAYS;
    const { reportId, cost, durationMs, overallRiskBand } = await runAudit({
      newsroomId: ctx.newsroomId,
      userId: ctx.userId,
      routingWindowDays: window,
    });
    return { result: { reportId, overallRiskBand }, cost, durationMs };
  },
});
