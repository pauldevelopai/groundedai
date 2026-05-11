// Fundraiser agent — drafts grant applications, donor reports, concept
// notes, and LOIs. Reads the newsroom profile (mission, beats, strengths,
// impact stories, audience) and, when a funder is selected, shapes the
// output to that funder's published application_structure with word
// limits respected per section.
//
// Output is structured JSONB so the editor can edit a section at a time
// in the UI rather than an opaque blob of prose. Budget scaffolding is
// generated alongside the narrative so the editor has numeric starting
// points instead of a blank spreadsheet.

const { pool } = require('../db');
const { chat } = require('../claude');
const { parseClaudeJson } = require('../parse-claude-json');
const { loadProfile, formatForPrompt } = require('../newsroom-profile');
const { loadFunder, formatFunderForPrompt } = require('../fundraiser/funders');

const KIND_LABELS = {
  grant_application: 'Grant application',
  donor_report: 'Donor report',
  concept_note: 'Concept note',
  loi: 'Letter of inquiry',
};

const BASE_SYSTEM = `You are Grounded's Fundraiser agent — a grant-writing assistant for African newsrooms.

Hard constraints:
1. NEVER FABRICATE the newsroom's track record. Use only what's in the NEWSROOM PROFILE block. If the profile is thin, say "to be filled in by the editor" rather than invent.
2. RESPECT THE FUNDER'S STRUCTURE. When a FUNDER block is provided, output one section per requested section, in the order given, and stay within word limits.
3. PLAIN, PRECISE LANGUAGE. Funders read hundreds of these. Cliché ("game-changing", "ecosystem", "synergies") gets skipped. Concrete verbs and named outputs get read.
4. NUMBERS WHERE THEY HELP. Reach figures, prior grant performance, costs per output — only if the profile actually contains them. Do not invent numbers.
5. EDITOR HAND-OFF. Treat your output as a first draft. The editor will revise. Don't be precious.`;

const KIND_PROMPTS = {
  grant_application: `OUTPUT: a structured grant-application draft. Return ONLY valid JSON matching this schema:

{
  "title": "<application title — short and specific>",
  "executive_summary": "<2–4 sentence summary an officer can read in 20 seconds>",
  "sections": [
    {
      "title": "<section title — match funder structure when given>",
      "word_limit": <int or null>,
      "content": "<draft prose, within the word limit if specified>",
      "editor_notes": "<what the editor needs to verify or fill in, e.g. 'confirm 2024 reach figure' — empty string if none>"
    }
  ],
  "budget_scaffold": {
    "total_request_usd": <int>,
    "duration_months": <int>,
    "lines": [
      { "category": "Personnel", "amount_usd": <int>, "rationale": "<why this much>" },
      { "category": "Production", "amount_usd": <int>, "rationale": "<why this much>" }
    ],
    "co_funding_notes": "<other secured / pending support if known, else empty string>"
  },
  "outstanding_questions": ["<question the editor needs to answer before submission>", ...]
}

If a FUNDER block lists application_structure, your sections array MUST mirror those titles in order, respecting each word_limit. JSON only.`,

  donor_report: `OUTPUT: a donor report draft. Return ONLY valid JSON matching this schema:

{
  "title": "<report title>",
  "period": "<reporting period, e.g. 'Jan–Dec 2025'>",
  "headline_outcomes": ["<top outcome 1>", "<top outcome 2>", "<top outcome 3>"],
  "sections": [
    {
      "title": "<section title>",
      "content": "<draft prose>",
      "editor_notes": "<what to verify>"
    }
  ],
  "metrics": [
    { "label": "<metric, e.g. 'Stories published'>", "value": "<value or 'TBC'>", "context": "<one-line context>" }
  ],
  "stories_to_highlight": [
    { "headline": "<piece headline>", "why_it_mattered": "<one sentence>" }
  ],
  "challenges_and_learning": "<honest paragraph on what didn't work>",
  "outstanding_questions": ["<editor verification question>", ...]
}

JSON only.`,

  concept_note: `OUTPUT: a concept note. Return ONLY valid JSON matching this schema:

{
  "title": "<concept title>",
  "the_idea": "<2–3 sentence pitch>",
  "the_problem": "<the editorial / civic problem this addresses>",
  "the_approach": "<how you would do it — methods, formats, partners>",
  "why_us": "<the newsroom's specific qualifications, drawn from the profile>",
  "expected_outputs": ["<output 1>", "<output 2>"],
  "expected_outcomes": ["<outcome 1>", "<outcome 2>"],
  "duration_months": <int>,
  "budget_estimate_usd": <int>,
  "outstanding_questions": ["<editor verification question>", ...]
}

JSON only.`,

  loi: `OUTPUT: a letter of inquiry (max ~400 words total). Return ONLY valid JSON matching this schema:

{
  "subject": "<email subject line — short, specific, intriguing>",
  "salutation": "<addressed to programme officer; default 'Dear Programme Officer,' if none known>",
  "opening": "<1 paragraph: who we are + why we're writing>",
  "the_work": "<1 paragraph: what we propose>",
  "fit_with_funder": "<1 paragraph: why this funder specifically — connect to their public priorities>",
  "ask": "<1 paragraph: amount, duration, what we'd like to discuss next>",
  "closing": "<1-2 sentence sign-off>",
  "outstanding_questions": ["<editor verification question>", ...]
}

JSON only.`,
};

/**
 * Generate a fundraiser brief. Persists fundraiser_briefs row up front
 * (status='pending'), runs Claude, updates on success / failure.
 *
 * @param {object} opts
 * @param {string}   opts.kind           — 'grant_application' | 'donor_report' | 'concept_note' | 'loi'
 * @param {string}   opts.briefInput     — editor's short brief (the project / report scope)
 * @param {string}   [opts.title]
 * @param {string}   [opts.funderId]     — optional funders.id; tailors output to that funder's structure
 * @param {number}   [opts.budgetRequestUsd]
 * @param {number}   [opts.durationMonths]
 * @param {{newsroomId: string, userId?: string, endpoint?: string}} opts.context
 */
async function runFundraiserBrief({
  kind,
  briefInput,
  title,
  funderId,
  budgetRequestUsd,
  durationMonths,
  context,
}) {
  if (!briefInput || briefInput.trim().length < 30) {
    throw new Error('briefInput is required (min 30 chars).');
  }
  if (!KIND_PROMPTS[kind]) {
    throw new Error(`Unknown kind "${kind}". Expected one of: ${Object.keys(KIND_PROMPTS).join(', ')}`);
  }

  const insert = await pool.query(
    `INSERT INTO fundraiser_briefs
       (newsroom_id, created_by, funder_id, title, kind, brief_input,
        budget_request_usd, duration_months, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')
     RETURNING id`,
    [
      context.newsroomId,
      context.userId || null,
      funderId || null,
      (title || `${KIND_LABELS[kind]} — ${new Date().toLocaleDateString()}`).slice(0, 200),
      kind,
      briefInput,
      Number.isFinite(budgetRequestUsd) ? budgetRequestUsd : null,
      Number.isFinite(durationMonths) ? durationMonths : null,
    ]
  );
  const briefId = insert.rows[0].id;

  let profileBlock = null;
  try {
    const profile = await loadProfile(context.newsroomId);
    profileBlock = formatForPrompt(profile);
  } catch (e) {
    console.error('fundraiser: profile load failed', e);
  }

  let funderBlock = null;
  if (funderId) {
    try {
      const funder = await loadFunder(context.newsroomId, funderId);
      funderBlock = formatFunderForPrompt(funder);
    } catch (e) {
      console.error('fundraiser: funder load failed', e);
    }
  }

  const systemPrompt = [BASE_SYSTEM, KIND_PROMPTS[kind]].join('\n\n');
  const userBlocks = [];
  if (profileBlock) userBlocks.push(`--- NEWSROOM PROFILE ---\n${profileBlock}`);
  else userBlocks.push('--- NEWSROOM PROFILE ---\n(empty — flag this in outstanding_questions)');
  if (funderBlock) userBlocks.push(`--- FUNDER ---\n${funderBlock}`);
  if (Number.isFinite(budgetRequestUsd) && budgetRequestUsd > 0) {
    userBlocks.push(`--- ASK ---\nBudget request: USD ${budgetRequestUsd.toLocaleString()}`);
  }
  if (Number.isFinite(durationMonths) && durationMonths > 0) {
    userBlocks.push(`--- DURATION ---\n${durationMonths} months`);
  }
  userBlocks.push(`--- EDITOR'S BRIEF ---\n${briefInput}`);
  userBlocks.push('Draft the document now. Return JSON only.');

  const startedAt = Date.now();
  try {
    const { text, cost } = await chat({
      system: systemPrompt,
      messages: [{ role: 'user', content: userBlocks.join('\n\n') }],
      maxTokens: 4096,
      context: {
        ...context,
        agent: 'fundraiser',
        endpoint: context.endpoint || '/api/fundraiser/briefs',
      },
    });
    const output = parseClaudeJson(text);
    const durationMs = Date.now() - startedAt;

    await pool.query(
      `UPDATE fundraiser_briefs
          SET output = $2,
              duration_ms = $3,
              cost_usd = $4,
              status = 'generated',
              updated_at = NOW()
        WHERE id = $1`,
      [briefId, JSON.stringify(output), durationMs, cost?.costUsd ?? null]
    );

    return { briefId, kind, output, cost, durationMs };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await pool.query(
      `UPDATE fundraiser_briefs SET status = 'failed', error = $2, updated_at = NOW() WHERE id = $1`,
      [briefId, message]
    );
    throw err;
  }
}

module.exports = { runFundraiserBrief, KIND_LABELS };

// ─── Agent registry entry ──────────────────────────────────────────────────
const { register, resolveConfig } = require('./registry');
register({
  slug: 'fundraiser',
  name: 'Fundraiser',
  icon: '💰',
  description:
    'Handles the structural work of grant writing. Keeps a live funder library of the major media-development donors and the newsroom\'s profile — strengths, prior coverage, audience data, impact stories — up to date. Auto-populates relevant sections so a short brief comes back as a first draft, mapped to the funder\'s structure with budget scaffolding included. Across the cohort, it surfaces collaboration opportunities — joint applications that improve everyone\'s odds.',
  triggers: ['grant', 'fundraise', 'donor', 'application', 'concept note', 'loi'],
  inputs: {
    briefInput: {
      type: 'longtext',
      required: true,
      label: "Editor's brief",
      description:
        "The project, body of work, or reporting period to draft from. A few sentences is enough — the agent expands it using your newsroom profile.",
    },
    title: {
      type: 'string',
      label: 'Document title',
      description: 'Optional. Defaults to "<kind> — <today\'s date>".',
    },
    funderId: {
      type: 'string',
      label: 'Funder (id)',
      description: 'Optional. Wire from a Funder picker in the UI; agent uses it to shape sections + word limits.',
    },
  },
  config: {
    kind: {
      type: 'select',
      default: 'grant_application',
      label: 'Document kind',
      description: 'What you are writing.',
      options: [
        { value: 'grant_application', label: 'Grant application — full structured proposal' },
        { value: 'donor_report', label: 'Donor report — outcomes against a prior grant' },
        { value: 'concept_note', label: 'Concept note — the idea before the full proposal' },
        { value: 'loi', label: 'Letter of inquiry — short pitch to open a conversation' },
      ],
    },
    budget_request_usd: {
      type: 'number',
      default: null,
      label: 'Ask amount (USD)',
      description: 'Optional. If supplied, the budget scaffold totals this. Leave blank to let the agent suggest.',
    },
    duration_months: {
      type: 'number',
      default: null,
      label: 'Project length (months)',
      description: 'Optional. Standard grant cycles are 12 or 24 months.',
    },
  },
  outputs: {
    output: { type: 'json', description: 'Structured draft — sections, budget scaffold, outstanding questions.' },
    briefId: { type: 'string', description: 'fundraiser_briefs row id, used for editor review and downstream nodes.' },
  },
  route: '/api/fundraiser/briefs',
  async run(input, ctx) {
    const cfg = resolveConfig('fundraiser', input);
    const { briefId, output, cost, durationMs } = await runFundraiserBrief({
      kind: cfg.kind,
      briefInput: input.briefInput,
      title: input.title,
      funderId: input.funderId,
      budgetRequestUsd: toNumberOrNull(cfg.budget_request_usd),
      durationMonths: toNumberOrNull(cfg.duration_months),
      context: { ...ctx, endpoint: ctx.endpoint || '/api/agents/fundraiser' },
    });
    return { result: { output, briefId }, cost, durationMs };
  },
});

function toNumberOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
