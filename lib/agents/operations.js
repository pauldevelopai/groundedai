// Operations agent — whole-org operational support per AGENTS.md:
// editorial calendar, freelancer coordination, contributor management,
// finance + sales, performance metrics. Reads the live operational tables
// directly (no copy-paste) so briefs reflect current newsroom state.
//
// Five brief kinds:
//   weekly_planning     — synthesises calendar + capacity into a week ahead
//   freelancer_check_in — outstanding payments + idle freelancers + new commissions
//   contributor_triage  — vetting queue + moderation routing (per AGENTS.md)
//   finance_summary     — runway-style read of recent income vs expense
//   performance_review  — what shifted across the last few metric snapshots

const { pool } = require('../db');
const { chat } = require('../claude');
const { parseClaudeJson } = require('../parse-claude-json');
const { loadProfile, formatForPrompt: formatProfileForPrompt } = require('../newsroom-profile');
const calendar = require('../operations/calendar');
const freelancers = require('../operations/freelancers');
const contributors = require('../operations/contributors');
const finance = require('../operations/finance');
const metrics = require('../operations/metrics');
const { runAgenticLoop } = require('./agentic/loop');
const agenticTools = require('./agentic/tools');

const KIND_LABELS = {
  weekly_planning: 'Weekly planning',
  freelancer_check_in: 'Freelancer check-in',
  contributor_triage: 'Contributor triage',
  finance_summary: 'Finance summary',
  performance_review: 'Performance review',
  ad_hoc_question: 'Ad-hoc question (agentic)',
};

const AGENTIC_SYSTEM_PROMPT = `You are Grounded's Operations Manager in agentic mode. The editor has asked you a free-form question about how their newsroom is operating. Answer it by reading the live operational tables via the db_read tool.

Tables you can read (all auto-scoped to this newsroom):
- editorial_calendar — stories in production / ideas / shipped (status, title, owner_id, deadline, publish_date)
- freelancers — roster (name, beats, status, last_active_at, outstanding_amount, currency)
- community_contributors — contributors (name, contact_kind, vetting_status, submissions_count, trust_score_pct)
- ops_briefs — your own past briefs (kind, status, created_at)
- ops_finance_entries — income + expense rows
- ops_metric_snapshots — performance snapshots
- inbound_submissions — recent tips/submissions
- research_dossiers — open investigations
- verifier_runs — recent verifications

Hard rules:
1. Read the data before answering. Never guess based on the question alone.
2. Cite the rows that informed your answer — quote a few key fields from each.
3. STOP WHEN ENOUGH. One or two db_read calls usually suffices.
4. END WITH JSON. Your last message MUST be a single JSON object:

{
  "answer": "<the editor-facing answer, 2-5 sentences>",
  "evidence": [
    { "table": "<table queried>", "row_summary": "<1-2 line summary of the row>" }
  ],
  "caveats": "<anything the editor should know about gaps in the data, or empty string>"
}

JSON only — no preamble, no markdown.`;

const BASE_SYSTEM = `You are Grounded's Operations Manager agent — operational support across the whole newsroom (editorial, sales, logistics, finance, contributor management).

Hard constraints:
1. USE ONLY the live operational data supplied. Don't invent stories, freelancers, contributors, payments, or metrics that aren't in the context.
2. If something is missing (no calendar entries, no metric snapshots), say so clearly — don't paper over a thin signal.
3. Be concrete: name people, name stories, give amounts. Editors read these on the move; abstractions are useless to them.
4. When you flag something needing attention (an overdue piece, an outstanding payment, a contributor in review), put a verb on it — "follow up with X today", not "X may need attention".
5. Treat every output as a draft for the editor / managing editor. Don't be precious.`;

const KIND_PROMPTS = {
  weekly_planning: `OUTPUT: a structured weekly planning brief. Return ONLY valid JSON matching:
{
  "headline": "<2 sentence top-line for the editorial meeting>",
  "in_production_now": [{ "title": "<calendar title>", "owner": "<assignee or 'unassigned'>", "deadline": "<ISO date or null>", "status_note": "<one line>" }],
  "shipping_this_week": [{ "title": "<title>", "publish_date": "<ISO date>", "format": "<format>", "owner": "<assignee>" }],
  "at_risk": [{ "title": "<title>", "concern": "<why it's at risk — be specific>", "action": "<what to do today>" }],
  "ideas_to_progress": [{ "title": "<idea>", "next_step": "<concrete next step>" }],
  "outstanding_questions": ["<question for the managing editor>", ...]
}
JSON only.`,

  freelancer_check_in: `OUTPUT: a freelancer-state brief. Return ONLY valid JSON matching:
{
  "headline": "<2 sentence top-line>",
  "outstanding_payments": [{ "name": "<freelancer>", "currency": "<currency>", "amount_pending": <number>, "action": "<who pays this and when>" }],
  "idle_freelancers": [{ "name": "<freelancer>", "beats": ["<beat>"], "suggestion": "<a calendar idea they could pick up; reference the title from in_production / ideas if any fit>" }],
  "new_or_recent_commissions": [{ "name": "<freelancer>", "title": "<calendar title>", "deadline": "<ISO date or null>" }],
  "overall_health": "<2-3 sentence read on roster health and risks>",
  "outstanding_questions": ["<editor question>", ...]
}
JSON only.`,

  contributor_triage: `OUTPUT: a community-contributor triage brief — per the AGENTS.md spec Operations runs vetting + moderation routing. Return ONLY valid JSON matching:
{
  "headline": "<2 sentence top-line>",
  "to_vet_this_week": [{ "name": "<contributor>", "contact_kind": "<channel>", "submissions": <int>, "trust_score_pct": <int 0-100 or null>, "recommended_action": "vet | hold | block | promote_to_freelancer", "reason": "<why>" }],
  "promotable": [{ "name": "<contributor>", "evidence": "<published count, trust, beats>", "suggestion": "<promote to small_stipend, attribution upgrade, etc>" }],
  "moderation_concerns": [{ "name": "<contributor>", "concern": "<specific concern>", "action": "<route to moderator? require id? block?>" }],
  "attribution_audit": [{ "name": "<contributor>", "issue": "<missing attribution name, generic byline, etc>", "fix": "<what to set>" }],
  "outstanding_questions": ["<editor question>", ...]
}
JSON only.`,

  finance_summary: `OUTPUT: a runway-style finance summary. Return ONLY valid JSON matching:
{
  "headline": "<2 sentence top-line for the managing editor>",
  "income_observed": [{ "category": "<grant/subscriptions/sponsor/etc>", "currency": "<cur>", "paid": <number>, "pending": <number>, "note": "<one line>" }],
  "expense_observed": [{ "category": "<freelancer_payout/rent/etc>", "currency": "<cur>", "paid": <number>, "pending": <number>, "note": "<one line>" }],
  "freelancer_payables": [{ "name": "<freelancer>", "currency": "<cur>", "pending": <number> }],
  "concerns": ["<specific concern, e.g. 'pending freelancer spend > recent income'>"],
  "opportunities": ["<specific opportunity, e.g. 'submit Q2 grant report — three matching funders in library'>"],
  "outstanding_questions": ["<editor question>", ...]
}
JSON only.`,

  performance_review: `OUTPUT: a performance-review brief reading recent metric snapshots. Return ONLY valid JSON matching:
{
  "headline": "<2 sentence top-line>",
  "movements": [{ "metric": "<metric key>", "from": "<previous value formatted>", "to": "<latest value formatted>", "change": "<delta + direction>", "interpretation": "<what it implies, in one sentence>" }],
  "wins": ["<concrete win, with named story/segment if identifiable>"],
  "concerns": ["<concrete concern>"],
  "what_to_test_next": ["<an experiment or change worth running this period>"],
  "outstanding_questions": ["<editor question>", ...]
}
JSON only.`,
};

/**
 * Generate an operations brief. Persists ops_briefs row, runs Claude with
 * the live operational context, updates row on success / failure.
 *
 * @param {object} opts
 * @param {string}   opts.kind           — one of KIND_LABELS keys
 * @param {string}   [opts.briefInput]   — optional editor framing / focus
 * @param {string}   [opts.title]
 * @param {{newsroomId: string, userId?: string, endpoint?: string}} opts.context
 */
async function runOperationsBrief({ kind, briefInput, title, context }) {
  if (kind === 'ad_hoc_question') {
    return runOperationsQuestion({ question: briefInput, title, context });
  }
  if (!KIND_PROMPTS[kind]) {
    throw new Error(`Unknown kind "${kind}". Expected one of: ${Object.keys(KIND_PROMPTS).join(', ')}, ad_hoc_question`);
  }

  const insert = await pool.query(
    `INSERT INTO ops_briefs (newsroom_id, created_by, title, kind, brief_input, status)
     VALUES ($1, $2, $3, $4, $5, 'pending')
     RETURNING id`,
    [
      context.newsroomId,
      context.userId || null,
      (title || `${KIND_LABELS[kind]} — ${new Date().toLocaleDateString()}`).slice(0, 200),
      kind,
      briefInput || null,
    ]
  );
  const briefId = insert.rows[0].id;

  // Pull whatever context this kind needs. Each helper handles "no rows"
  // gracefully — its formatForPrompt returns a "(empty)" placeholder
  // string the model can read.
  const profile = await loadProfile(context.newsroomId).catch(() => null);
  const profileBlock = profile ? formatProfileForPrompt(profile) : null;

  const ctxBlocks = [];
  if (profileBlock) ctxBlocks.push(`--- NEWSROOM PROFILE ---\n${profileBlock}`);
  if (kind === 'weekly_planning') {
    const items = await calendar.listUpcoming(context.newsroomId, { horizonDays: 14 });
    ctxBlocks.push(`--- EDITORIAL CALENDAR (next 14 days, all open items) ---\n${calendar.formatForPrompt(items)}`);
    const flList = await freelancers.listFreelancers(context.newsroomId, { status: 'active' });
    ctxBlocks.push(`--- ACTIVE FREELANCERS (assignment candidates) ---\n${freelancers.formatForPrompt(flList)}`);
  } else if (kind === 'freelancer_check_in') {
    const flList = await freelancers.outstandingPayments(context.newsroomId);
    ctxBlocks.push(`--- FREELANCER ROSTER + OUTSTANDING PAYABLES ---\n${freelancers.formatForPrompt(flList)}`);
    const items = await calendar.listAll(context.newsroomId, { limit: 60 });
    ctxBlocks.push(`--- RECENT CALENDAR (so you can see who's on what) ---\n${calendar.formatForPrompt(items)}`);
  } else if (kind === 'contributor_triage') {
    const list = await contributors.listContributors(context.newsroomId);
    ctxBlocks.push(`--- COMMUNITY CONTRIBUTORS ---\n${contributors.formatForPrompt(list)}`);
  } else if (kind === 'finance_summary') {
    const t = await finance.totals(context.newsroomId, { sinceDays: 90 });
    ctxBlocks.push(`--- FINANCE TOTALS (last 90 days) ---\n${finance.formatTotalsForPrompt(t)}`);
    const fl = await freelancers.outstandingPayments(context.newsroomId);
    ctxBlocks.push(`--- FREELANCER PAYABLES ---\n${freelancers.formatForPrompt(fl)}`);
  } else if (kind === 'performance_review') {
    const snaps = await metrics.listSnapshots(context.newsroomId, { limit: 6 });
    ctxBlocks.push(`--- METRIC SNAPSHOTS (newest first) ---\n${metrics.formatForPrompt(snaps)}`);
  }

  if (briefInput && briefInput.trim()) {
    ctxBlocks.push(`--- EDITOR'S FRAMING ---\n${briefInput.trim()}`);
  }
  ctxBlocks.push('Draft the brief now. Return JSON only.');

  const systemPrompt = [BASE_SYSTEM, KIND_PROMPTS[kind]].join('\n\n');
  const startedAt = Date.now();
  try {
    const { text, cost } = await chat({
      system: systemPrompt,
      messages: [{ role: 'user', content: ctxBlocks.join('\n\n') }],
      maxTokens: 4096,
      context: { ...context, agent: 'operations', endpoint: context.endpoint || '/api/operations/briefs' },
    });
    const output = parseClaudeJson(text);
    const durationMs = Date.now() - startedAt;
    await pool.query(
      `UPDATE ops_briefs SET output = $2::jsonb, duration_ms = $3, cost_usd = $4, status = 'generated', updated_at = NOW() WHERE id = $1`,
      [briefId, JSON.stringify(output), durationMs, cost?.costUsd ?? null]
    );
    return { briefId, kind, output, cost, durationMs };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await pool.query(
      `UPDATE ops_briefs SET status = 'failed', error = $2, updated_at = NOW() WHERE id = $1`,
      [briefId, message]
    );
    throw err;
  }
}

/**
 * Ad-hoc agentic question. Runs the bounded loop with db_read +
 * archive_search + invoke_agent. Persists to ops_briefs with
 * kind='ad_hoc_question' so the trace shows up in /operations.
 */
async function runOperationsQuestion({ question, title, context, maxSteps = 5 }) {
  const q = (question || '').trim();
  if (!q) throw new Error('ad_hoc_question requires briefInput (the question text).');

  const insert = await pool.query(
    `INSERT INTO ops_briefs (newsroom_id, created_by, title, kind, brief_input, status)
     VALUES ($1, $2, $3, 'ad_hoc_question', $4, 'pending')
     RETURNING id`,
    [
      context.newsroomId,
      context.userId || null,
      (title || `Question — ${new Date().toLocaleDateString()}`).slice(0, 200),
      q,
    ]
  );
  const briefId = insert.rows[0].id;
  const startedAt = Date.now();

  try {
    const loop = await runAgenticLoop({
      system: AGENTIC_SYSTEM_PROMPT,
      tools: agenticTools.all,
      input: q,
      ctx: {
        ...context,
        parentAgent: 'operations',
        endpoint: context.endpoint || 'operations.ad_hoc_question',
      },
      maxSteps,
    });

    let parsed = null;
    try { parsed = parseClaudeJson(loop.text); }
    catch { /* keep raw text */ }

    const output = {
      answer: parsed?.answer || loop.text,
      evidence: parsed?.evidence || [],
      caveats: parsed?.caveats || '',
      raw_text: loop.text,
      stoppedBecause: loop.stoppedBecause,
      stepsTaken: loop.stepsTaken,
      step_summary: loop.steps.map((s) => ({
        step: s.step, tool: s.tool, duration_ms: s.duration_ms,
        error: s.error || null, invocation_id: s.invocation_id,
      })),
    };

    const durationMs = Date.now() - startedAt;
    await pool.query(
      `UPDATE ops_briefs SET output = $2::jsonb, duration_ms = $3, cost_usd = $4, status = 'generated', updated_at = NOW() WHERE id = $1`,
      [briefId, JSON.stringify(output), durationMs, loop.totalCost?.costUsd ?? null]
    );
    return { briefId, kind: 'ad_hoc_question', output, cost: loop.totalCost, durationMs };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await pool.query(
      `UPDATE ops_briefs SET status = 'failed', error = $2, updated_at = NOW() WHERE id = $1`,
      [briefId, message]
    );
    throw err;
  }
}

module.exports = { runOperationsBrief, runOperationsQuestion, KIND_LABELS };

// ─── Agent registry entry ──────────────────────────────────────────────────
const { register, resolveConfig } = require('./registry');
register({
  slug: 'operations',
  name: 'Operations Manager',
  icon: '🛠',
  category: 'tool',
  description:
    'Runs the internal stuff: editorial calendar, deadlines, freelancer coordination, sales, logistics, financial management, performance metrics. Built on AI working across the whole organisation, not just the editorial floor — the shift that turns AI from a feature into a foundation for organisational resilience. Generates structured briefs (weekly plan, freelancer check-in, contributor triage, finance summary, performance review) directly from your live operational tables — never copy-paste.',
  triggers: ['operations', 'plan', 'calendar', 'freelancer', 'contributor', 'budget', 'finance', 'metrics', 'weekly'],
  inputs: {
    briefInput: {
      type: 'longtext',
      label: "Editor's framing (optional)",
      description: 'Optional steer — what to focus on, what to skip. The agent reads the live operational tables either way.',
    },
    title: {
      type: 'string',
      label: 'Brief title',
      description: 'Optional. Defaults to "<kind> — <today\'s date>".',
    },
  },
  config: {
    kind: {
      type: 'select',
      default: 'weekly_planning',
      label: 'Brief kind',
      description: 'Which operational read you need.',
      options: [
        { value: 'weekly_planning', label: 'Weekly planning — calendar + capacity → week ahead' },
        { value: 'freelancer_check_in', label: 'Freelancer check-in — payables, idle, new commissions' },
        { value: 'contributor_triage', label: 'Contributor triage — vet, moderate, promote, audit attribution' },
        { value: 'finance_summary', label: 'Finance summary — runway-style 90-day read' },
        { value: 'performance_review', label: 'Performance review — recent metric snapshots' },
        { value: 'ad_hoc_question', label: 'Ad-hoc question (V2 agentic) — answer a free-form question by reading the live tables' },
      ],
    },
  },
  outputs: {
    output: { type: 'json', description: 'Structured brief, kind-specific shape.' },
    briefId: { type: 'string', description: 'ops_briefs row id, used for editor review and downstream nodes.' },
  },
  route: '/api/operations/briefs',
  async run(input, ctx) {
    const cfg = resolveConfig('operations', input);
    const { briefId, output, cost, durationMs } = await runOperationsBrief({
      kind: cfg.kind,
      briefInput: input.briefInput,
      title: input.title,
      context: { ...ctx, endpoint: ctx.endpoint || '/api/agents/operations' },
    });
    return { result: { output, briefId }, cost, durationMs };
  },
});
