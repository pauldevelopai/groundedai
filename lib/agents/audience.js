// Audience agent — analytics conversion + AI query layer over the
// resulting signals. Per the 2026-05-07 scope revision, the agent runs
// historical-grounded consultations:
//
//   - headline_test:    given a proposed headline, predict landing
//                       performance from this newsroom's past patterns
//                       (what topics/framings have actually landed,
//                       what's been bouncing, audience drift).
//   - angle_check:      given a story angle, find which past pieces
//                       resemble it and report their actual performance.
//   - analytics_query:  free-form natural-language interrogation of
//                       the analytics signals ("What's been bouncing
//                       this month?", "Are vernacular pieces landing?").
//
// The agent reads recent audience_signals JSONB rows (landed_topics,
// gaps, bounced_stories, drift_notes) plus the newsroom profile. All
// reasoning is grounded in the newsroom's actual analytics, never in
// invented or generic "African reader" personas.
//
// runFocusGroup() is retained at module level but soft-deprecated — it
// no longer drives the agent's registered behaviour and the persona
// machinery is no longer surfaced in the workspace UI. See the
// project_audience_scope memory note (2026-05-07).

const { pool } = require('../db');
const { chat } = require('../claude');
const { parseClaudeJson } = require('../parse-claude-json');
const { loadPersonas, formatPersonaForPrompt } = require('../audience/personas');
const { loadProfile, formatForPrompt: formatProfileForPrompt } = require('../newsroom-profile');

const KIND_LABELS = {
  headline_test: 'Headline test',
  angle_check: 'Angle sense-check',
  analytics_query: 'Analytics query',
};

const BASE_SYSTEM = `You are Grounded's Audience Analytics Manager agent — an analytics-grounded editorial advisor for an African newsroom.

THE LOAD-BEARING RULE: every claim you make must be grounded in the newsroom's actual past performance, as evidenced in the analytics signals supplied. You do not invent reader reactions. You do not speculate based on demographic priors. You read what landed, what bounced, what gaps exist, and what the trends say — then reason editorially from there.

Hard constraints:
1. GROUNDED. If the data doesn't support a conclusion, say "data is silent on this" rather than guess.
2. SPECIFIC. When you cite a comparable past piece, name it (use the headline/URL from the signals).
3. NEWSROOM LENS. Use the newsroom profile's beats + audience to weight what counts as "landing" or "bouncing".
4. EDITOR HAND-OFF. State the recommendation as a draft for the editor to confirm — never as a verdict.
5. NO IMAGINED PERSONAS. The previous focus-group persona system is out of scope. Don't ventriloquise readers.`;

const KIND_PROMPTS = {
  headline_test: `OUTPUT: a headline backtest. Return ONLY valid JSON matching:
{
  "headline_under_test": "<the headline you were given, verbatim>",
  "predicted_performance": "strong | moderate | weak | uncertain",
  "reasoning": "<2-3 sentences citing specific past pieces and signals from the data>",
  "comparable_pieces": [
    { "headline_or_url": "<from the signals>", "what_happened": "<landed | bounced | strong dwell | etc>", "what_it_implies_for_this_headline": "<1 sentence>" }
  ],
  "concerns": ["<specific concern, e.g. 'similar phrasing has shown short dwell'>", ...],
  "alternative_phrasings": [
    { "alternative": "<rephrased headline>", "why_it_might_perform_better": "<1 sentence anchored to past data>" }
  ],
  "outstanding_questions": ["<question for the editor>", ...]
}
JSON only.`,

  angle_check: `OUTPUT: a story-angle backtest. Return ONLY valid JSON matching:
{
  "angle_under_review": "<editor's angle text, verbatim>",
  "summary": "<2-3 sentence editor-facing summary of the angle's likely fit>",
  "comparable_past_pieces": [
    { "headline_or_url": "<from signals>", "framing_overlap": "<how the angle resembles this piece>", "actual_performance": "<what the data shows>", "lesson": "<one line>" }
  ],
  "audience_segments_likely_to_engage": ["<beat / region / language audience supported by the data>", ...],
  "audience_segments_likely_to_skip": ["<segment + why, supported by the data>", ...],
  "framing_adjustments": [
    { "current_framing": "<phrase from the angle>", "suggested_adjustment": "<rephrasing>", "rationale": "<anchored to past data>" }
  ],
  "outstanding_questions": ["<question for the editor>", ...]
}
JSON only.`,

  analytics_query: `OUTPUT: an analytics query response. Return ONLY valid JSON matching:
{
  "question": "<the editor's question, verbatim>",
  "direct_answer": "<2-3 sentence answer that uses specific numbers / pieces from the signals>",
  "supporting_evidence": [
    { "signal": "<landed_topic | gap | bounced_story | drift_note>", "evidence": "<the exact line from the signals data>", "interpretation": "<one line>" }
  ],
  "what_data_does_not_show": "<one line on the limits of what was supplied>",
  "follow_up_questions_for_data": ["<analytic question worth checking next>", ...],
  "recommended_editor_actions": ["<concrete action>", ...]
}
JSON only.`,
};

/**
 * Run an analytics-grounded consultation. Persists an audience_consultations
 * row up front (status='pending'), pulls the newsroom's recent analytics
 * signals + profile, runs Claude, updates the row.
 *
 * @param {object} opts
 * @param {string}   opts.kind          'headline_test' | 'angle_check' | 'analytics_query'
 * @param {string}   opts.inputText     headline / angle text / question
 * @param {string}   [opts.contextBrief] optional draft body or extra steer
 * @param {string}   [opts.title]
 * @param {{newsroomId: string, userId?: string, endpoint?: string}} opts.context
 */
async function runAudienceConsultation({ kind, inputText, contextBrief, title, context }) {
  if (!KIND_PROMPTS[kind]) {
    throw new Error(`Unknown kind "${kind}". Expected one of: ${Object.keys(KIND_PROMPTS).join(', ')}`);
  }
  if (!inputText || inputText.trim().length < 4) {
    throw new Error('inputText is required (a headline / angle / question).');
  }

  // Pull the most recent analysed signals — these are the foundation for
  // every consultation. We attach their IDs to the consultation row so
  // the editor can audit which data informed the response.
  const signalsRes = await pool.query(
    `SELECT id, source, filename, period_start, period_end, signals,
            total_pageviews, unique_visitors, analysis_summary, created_at
       FROM audience_signals
      WHERE newsroom_id = $1 AND status = 'analyzed'
      ORDER BY created_at DESC LIMIT 8`,
    [context.newsroomId]
  );
  const signals = signalsRes.rows;
  const referencedSignalIds = signals.map(s => s.id);

  const insert = await pool.query(
    `INSERT INTO audience_consultations
       (newsroom_id, created_by, title, kind, input_text, context_brief,
        referenced_signal_ids, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7::uuid[], 'pending')
     RETURNING id`,
    [
      context.newsroomId, context.userId || null,
      (title || `${KIND_LABELS[kind]} — ${new Date().toLocaleDateString()}`).slice(0, 200),
      kind, inputText, contextBrief || null,
      referencedSignalIds,
    ]
  );
  const consultationId = insert.rows[0].id;

  const profile = await loadProfile(context.newsroomId).catch(() => null);
  const profileBlock = profile ? formatProfileForPrompt(profile) : null;

  const ctxBlocks = [];
  if (profileBlock) ctxBlocks.push(`--- NEWSROOM PROFILE ---\n${profileBlock}`);

  if (signals.length === 0) {
    ctxBlocks.push('--- ANALYTICS SIGNALS ---\n(no analytics signals on file yet — explicitly note this in your response)');
  } else {
    const signalBlock = signals.map((s, i) => formatSignalForPrompt(s, i + 1)).join('\n---\n');
    ctxBlocks.push(`--- ANALYTICS SIGNALS (${signals.length} most recent, newest first) ---\n${signalBlock}`);
  }

  if (kind === 'headline_test') {
    ctxBlocks.push(`--- HEADLINE UNDER TEST ---\n${inputText}`);
  } else if (kind === 'angle_check') {
    ctxBlocks.push(`--- STORY ANGLE UNDER REVIEW ---\n${inputText}`);
  } else if (kind === 'analytics_query') {
    ctxBlocks.push(`--- EDITOR'S QUESTION ---\n${inputText}`);
  }
  if (contextBrief && contextBrief.trim()) {
    ctxBlocks.push(`--- ADDITIONAL CONTEXT ---\n${contextBrief.trim()}`);
  }
  ctxBlocks.push('Respond now. Return JSON only.');

  const systemPrompt = [BASE_SYSTEM, KIND_PROMPTS[kind]].join('\n\n');
  const startedAt = Date.now();
  try {
    const { text, cost } = await chat({
      system: systemPrompt,
      messages: [{ role: 'user', content: ctxBlocks.join('\n\n') }],
      maxTokens: 4096,
      context: { ...context, agent: 'audience', endpoint: context.endpoint || '/api/audience/consultations' },
    });
    const output = parseClaudeJson(text);
    const durationMs = Date.now() - startedAt;
    await pool.query(
      `UPDATE audience_consultations
          SET output = $2::jsonb, duration_ms = $3, cost_usd = $4,
              status = 'generated', updated_at = NOW()
        WHERE id = $1`,
      [consultationId, JSON.stringify(output), durationMs, cost?.costUsd ?? null]
    );
    return { consultationId, kind, output, cost, durationMs, referencedSignalIds };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await pool.query(
      `UPDATE audience_consultations SET status = 'failed', error = $2, updated_at = NOW() WHERE id = $1`,
      [consultationId, message]
    );
    throw err;
  }
}

/**
 * Compact text rendering of an audience_signals row for the prompt.
 */
function formatSignalForPrompt(s, index) {
  const lines = [];
  lines.push(`Signal #${index} (${s.source}${s.filename ? ` · ${s.filename}` : ''}, ingested ${new Date(s.created_at).toISOString().slice(0, 10)})`);
  if (s.period_start || s.period_end) {
    lines.push(`Period: ${s.period_start || '?'} → ${s.period_end || '?'}`);
  }
  if (s.total_pageviews != null) lines.push(`Total pageviews: ${s.total_pageviews}`);
  if (s.unique_visitors != null) lines.push(`Unique visitors: ${s.unique_visitors}`);
  if (s.analysis_summary) lines.push(`Summary: ${s.analysis_summary}`);
  const sig = s.signals || {};
  if (Array.isArray(sig.landed_topics) && sig.landed_topics.length > 0) {
    lines.push('Landed topics:');
    for (const t of sig.landed_topics) {
      lines.push(`  · ${t.topic}: ${t.evidence}${t.why_it_landed ? ` — ${t.why_it_landed}` : ''}`);
    }
  }
  if (Array.isArray(sig.gaps) && sig.gaps.length > 0) {
    lines.push('Gaps:');
    for (const g of sig.gaps) {
      lines.push(`  · ${g.topic_or_audience}: ${g.evidence}${g.implication ? ` — ${g.implication}` : ''}`);
    }
  }
  if (Array.isArray(sig.bounced_stories) && sig.bounced_stories.length > 0) {
    lines.push('Bounced stories:');
    for (const b of sig.bounced_stories) {
      lines.push(`  · ${b.headline_or_url}: ${b.drop_off_signal}${b.diagnosis ? ` — ${b.diagnosis}` : ''}`);
    }
  }
  if (sig.drift_notes) lines.push(`Drift: ${sig.drift_notes}`);
  return lines.join('\n');
}

// ─── Soft-deprecated focus-group runner (slice 10) ───────────────────────
//
// Retained for backward compatibility with /api/audience/focus-groups
// callers that may exist in long-running workflows. Not surfaced in the
// Builder palette anymore.

const FG_KIND_HINT = {
  headline: 'a headline',
  lede: 'a lede',
  angle: 'a story angle / framing',
  full_draft: 'a full story draft',
};

const FG_SYSTEM_PROMPT = `You are Grounded's Audience Analytics Manager agent — synthetic focus group (DEPRECATED — kept for backward compat).

You are given personas + test material. Each persona reacts in first person; then summarise across the group.

Return ONLY valid JSON matching:
{
  "transcript": [{ "persona_id":"<UUID>", "persona_name":"<name>", "first_reaction":"<3-5 sentences in first person>", "would_share": <bool>, "would_finish_reading": <bool>, "confidence": <0-1>, "concerns": ["..."] }],
  "summary": "<editor-facing summary>",
  "recommendations": ["..."]
}
JSON only.`;

async function runFocusGroup({ title, testMaterial, testMaterialKind, contextBrief, personaIds, context }) {
  if (!testMaterial || testMaterial.trim().length < 5) {
    throw new Error('testMaterial is required.');
  }
  if (!FG_KIND_HINT[testMaterialKind]) {
    throw new Error(`testMaterialKind must be one of: ${Object.keys(FG_KIND_HINT).join(', ')}`);
  }
  if (!Array.isArray(personaIds) || personaIds.length === 0) {
    throw new Error('Pick at least one persona.');
  }
  const personas = await loadPersonas(context.newsroomId, personaIds);
  if (personas.length !== personaIds.length) throw new Error('One or more personas not found.');

  const insert = await pool.query(
    `INSERT INTO focus_group_sessions
       (newsroom_id, created_by, title, test_material, test_material_kind,
        context_brief, persona_ids, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
     RETURNING id`,
    [
      context.newsroomId, context.userId || null,
      (title || `Focus group — ${FG_KIND_HINT[testMaterialKind]} — ${new Date().toLocaleDateString()}`).slice(0, 200),
      testMaterial, testMaterialKind, contextBrief || null, personaIds,
    ]
  );
  const sessionId = insert.rows[0].id;

  const profile = await loadProfile(context.newsroomId).catch(() => null);
  const profileBlock = profile ? formatProfileForPrompt(profile) : null;
  const personaBlock = personas.map(p => `[id: ${p.id}]\n${formatPersonaForPrompt(p)}`).join('\n\n');
  const userBlocks = [];
  if (profileBlock) userBlocks.push(`--- NEWSROOM CONTEXT ---\n${profileBlock}`);
  userBlocks.push(`--- PERSONAS (${personas.length}) ---\n${personaBlock}`);
  userBlocks.push(`--- TEST MATERIAL — ${FG_KIND_HINT[testMaterialKind]} ---\n${testMaterial}`);
  if (contextBrief) userBlocks.push(`--- EDITOR'S BRIEF ---\n${contextBrief}`);
  userBlocks.push('Run the focus group now. Return JSON only.');

  const startedAt = Date.now();
  try {
    const { text, cost } = await chat({
      system: FG_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userBlocks.join('\n\n') }],
      maxTokens: 3072,
      context: { ...context, agent: 'audience-focus-group', endpoint: context.endpoint || '/api/audience/focus-groups' },
    });
    const parsed = parseClaudeJson(text);
    parsed.transcript = Array.isArray(parsed.transcript) ? parsed.transcript : [];
    parsed.recommendations = Array.isArray(parsed.recommendations) ? parsed.recommendations : [];
    const durationMs = Date.now() - startedAt;
    await pool.query(
      `UPDATE focus_group_sessions
          SET transcript = $2, summary = $3, recommendations = $4,
              cost_usd = $5, duration_ms = $6, status = 'completed',
              updated_at = NOW()
        WHERE id = $1`,
      [sessionId, JSON.stringify(parsed.transcript), parsed.summary || null, parsed.recommendations, cost?.costUsd ?? null, durationMs]
    );
    return { sessionId, ...parsed, cost, durationMs };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await pool.query(
      `UPDATE focus_group_sessions SET status = 'failed', error = $2, updated_at = NOW() WHERE id = $1`,
      [sessionId, message]
    );
    throw err;
  }
}

module.exports = { runAudienceConsultation, KIND_LABELS, runFocusGroup };

// ─── Agent registry entry ──────────────────────────────────────────────────
const { register, resolveConfig } = require('./registry');
register({
  slug: 'audience',
  name: 'Audience Analytics Manager',
  icon: '👥',
  description:
    'Collects analytics across the newsroom and gives you an AI layer over them — so you can interrogate what\'s landing, what\'s missing, what\'s bouncing, and where engagement is concentrating. Test a headline and sense-check a story angle against what has worked in the past. Three consultation kinds: HEADLINE TEST (will this headline land — backtested against your past pieces), ANGLE SENSE-CHECK (how has this kind of angle performed before), ANALYTICS QUERY (free-form natural-language interrogation: "what\'s bouncing this month?", "are vernacular pieces landing?"). Reads recent audience_signals + your newsroom profile.',
  triggers: ['audience', 'analytics', 'headline test', 'will this land', 'angle check', 'what is landing'],
  inputs: {
    inputText: {
      type: 'longtext',
      required: true,
      label: 'Headline / angle / question',
      description: 'For headline_test paste the proposed headline. For angle_check paste the angle / lede / framing. For analytics_query type a free-form question about your analytics.',
    },
    contextBrief: {
      type: 'string',
      label: 'Additional context',
      description: 'Optional. Draft body, target audience, or anything you want the agent to weigh.',
    },
    title: {
      type: 'string',
      label: 'Title',
      description: 'Optional. Defaults to "<kind> — <today\'s date>".',
    },
  },
  config: {
    kind: {
      type: 'select',
      default: 'headline_test',
      label: 'Consultation kind',
      description: 'Which kind of analytics-grounded check to run.',
      options: [
        { value: 'headline_test', label: 'Headline test — will this headline land, based on past performance' },
        { value: 'angle_check', label: 'Angle sense-check — how has this kind of angle performed before' },
        { value: 'analytics_query', label: 'Analytics query — free-form question about what\'s landing/bouncing/missing' },
      ],
    },
  },
  outputs: {
    output: { type: 'json', description: 'Structured response, kind-specific shape.' },
    consultationId: { type: 'string', description: 'audience_consultations row id.' },
  },
  route: '/api/audience/consultations',
  async run(input, ctx) {
    const cfg = resolveConfig('audience', input);
    const { consultationId, output, cost, durationMs } = await runAudienceConsultation({
      kind: cfg.kind,
      inputText: input.inputText,
      contextBrief: input.contextBrief,
      title: input.title,
      context: { ...ctx, endpoint: ctx.endpoint || '/api/agents/audience' },
    });
    return { result: { output, consultationId }, cost, durationMs };
  },
});
