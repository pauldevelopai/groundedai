// Social Listener agent. Three brief kinds:
//   signal_analysis      — given one or more flagged signals, produce a
//                          structured "what was said, where it came from,
//                          why it's damaging, recommended response" report.
//   keyword_sweep        — given a window of recent signals, group them
//                          by keyword and rank by severity / origin.
//   coordinated_pattern  — look across recent signals for shared phrasing,
//                          timing windows, and suspect-source amplification.
//
// The agent reads the pre-LLM structural analysis (lang detection, NER,
// source-reputation match) attached to each signal — it does NOT redo
// that work. This keeps the LLM focused on attribution reasoning and
// recommended-response framing, where Claude actually adds value over a
// classifier.

const { pool } = require('../db');
const { chat } = require('../claude');
const { parseClaudeJson } = require('../parse-claude-json');
const { loadProfile, formatForPrompt: formatProfileForPrompt } = require('../newsroom-profile');

const KIND_LABELS = {
  signal_analysis: 'Signal analysis',
  keyword_sweep: 'Keyword sweep',
  coordinated_pattern: 'Coordinated pattern',
};

const BASE_SYSTEM = `You are Anchor's Social Listener agent — a disinformation and influence-operations analyst for an African newsroom.

Hard constraints:
1. STRUCTURAL EVIDENCE FIRST. The signals supplied include pre-computed language detection, named entities, and source-reputation matches. Use them. Do NOT invent attributions that aren't supported.
2. ATTRIBUTION CARE. "State-aligned" is a serious claim. Only assert it when (a) the source domain matches a known state property, or (b) the language + framing + amplification network all line up consistently. State the strength of evidence explicitly.
3. AFRICAN NEWSROOM LENS. The audience is reporters covering Africa. When state-aligned content is targeting African audiences (Sputnik Africa, CGTN Africa, Wagner-aligned amplifiers, etc), say so plainly — that's the story.
4. NO CHILLING EFFECTS. Don't recommend that legitimate-but-uncomfortable speech be flagged as foreign influence. The bar for "this is a CIB property" is real evidence, not vibes.
5. EDITOR HAND-OFF. Always flag the recommended action: ignore / monitor / context-note / correction-publish / refer-to-Verifier. The editor decides; you propose.`;

const KIND_PROMPTS = {
  signal_analysis: `OUTPUT: a structured analysis of the supplied signals. Return ONLY valid JSON matching:
{
  "headline": "<2-sentence overview for the editor>",
  "signals": [
    {
      "signal_id": "<UUID>",
      "what_was_said": "<plain-language summary of the post — under 60 words>",
      "language_assessment": "<one line on detected language(s) and whether the framing matches the language>",
      "origin_attribution": {
        "primary_signal": "<the single strongest piece of evidence>",
        "supporting_signals": ["<additional supporting evidence>", ...],
        "confidence": "low | medium | high",
        "alignment": "state_russia | state_china | state_other | cib_network | extremist | unclear | none"
      },
      "why_damaging": "<what specific harm could this cause to a newsroom's audience or coverage; one or two sentences>",
      "severity": "low | medium | high | critical",
      "recommended_response": "ignore | monitor | context-note | correction-publish | refer-to-verifier | refer-to-distributor"
    }
  ],
  "patterns": ["<pattern across the supplied signals worth flagging>", ...],
  "outstanding_questions": ["<question for the editor — e.g. 'is this account already in your distrust list?'>", ...]
}
JSON only.`,

  keyword_sweep: `OUTPUT: a keyword-watchlist sweep over the supplied signals. Return ONLY valid JSON matching:
{
  "headline": "<2-sentence top-line>",
  "by_keyword": [
    {
      "keyword": "<the watchlist term>",
      "hit_count": <int>,
      "top_signals": [
        { "signal_id": "<UUID>", "snippet": "<10-25 word excerpt around the hit>", "alignment": "<alignment if known, else 'unclear'>" }
      ],
      "trend_note": "<one line on volume / direction / origin concentration>"
    }
  ],
  "outliers": [
    { "signal_id": "<UUID>", "reason": "<why this one stands out from the cluster>" }
  ],
  "outstanding_questions": ["<editor question>", ...]
}
JSON only.`,

  coordinated_pattern: `OUTPUT: a coordinated-behaviour analysis across the supplied signals. Return ONLY valid JSON matching:
{
  "headline": "<2-sentence top-line>",
  "candidate_clusters": [
    {
      "label": "<short cluster label, e.g. 'Sputnik Africa amplification of Wagner narrative'>",
      "signal_ids": ["<UUID>", ...],
      "shared_phrasing": ["<exact phrase, ≤120 chars>", ...],
      "shared_domains": ["<domain>", ...],
      "shared_handles": ["<handle>", ...],
      "time_window": "<ISO-style range or 'unclear'>",
      "alignment_assessment": "state_russia | state_china | cib_network | unclear",
      "confidence": "low | medium | high",
      "evidence_summary": "<2-3 sentences laying out what makes this look coordinated>"
    }
  ],
  "single_outliers": [
    { "signal_id": "<UUID>", "note": "<why it doesn't cluster but still warrants attention>" }
  ],
  "next_steps": ["<actionable suggestion for the newsroom>", ...],
  "outstanding_questions": ["<editor question>", ...]
}
JSON only.`,
};

/**
 * Generate a Social Listener brief.
 *
 * @param {object} opts
 * @param {string} opts.kind            'signal_analysis' | 'keyword_sweep' | 'coordinated_pattern'
 * @param {string[]} [opts.signalIds]   subset of social_signals.id rows to reason about; defaults to recent
 * @param {string} [opts.briefInput]
 * @param {string} [opts.title]
 * @param {{newsroomId: string, userId?: string, endpoint?: string}} opts.context
 */
async function runSocialListenerBrief({ kind, signalIds, briefInput, title, context }) {
  if (!KIND_PROMPTS[kind]) {
    throw new Error(`Unknown kind "${kind}". Expected one of: ${Object.keys(KIND_PROMPTS).join(', ')}`);
  }

  // Pull signals: explicit list if supplied, otherwise the most recent ~20.
  let signals;
  if (Array.isArray(signalIds) && signalIds.length > 0) {
    const sr = await pool.query(
      `SELECT * FROM social_signals WHERE id = ANY($1::uuid[]) AND newsroom_id = $2
        ORDER BY posted_at DESC NULLS LAST, created_at DESC`,
      [signalIds, context.newsroomId]
    );
    signals = sr.rows;
  } else {
    const sr = await pool.query(
      `SELECT * FROM social_signals WHERE newsroom_id = $1
         AND status IN ('new', 'analysed', 'flagged')
        ORDER BY created_at DESC LIMIT 20`,
      [context.newsroomId]
    );
    signals = sr.rows;
  }
  if (!signals || signals.length === 0) {
    throw new Error('No signals to analyse. Ingest at least one social signal first.');
  }

  const insert = await pool.query(
    `INSERT INTO social_listener_briefs
       (newsroom_id, created_by, title, kind, brief_input, signal_ids, status)
     VALUES ($1, $2, $3, $4, $5, $6::uuid[], 'pending')
     RETURNING id`,
    [
      context.newsroomId, context.userId || null,
      (title || `${KIND_LABELS[kind]} — ${new Date().toLocaleDateString()}`).slice(0, 200),
      kind, briefInput || null,
      signals.map(s => s.id),
    ]
  );
  const briefId = insert.rows[0].id;

  // Build context blocks.
  const profile = await loadProfile(context.newsroomId).catch(() => null);
  const profileBlock = profile ? formatProfileForPrompt(profile) : null;
  const ctxBlocks = [];
  if (profileBlock) ctxBlocks.push(`--- NEWSROOM PROFILE ---\n${profileBlock}`);

  // Compact signal block: include the structural analysis but trim the raw
  // text so token usage stays bounded across 20 signals.
  const signalBlock = signals.map((s) => {
    const a = s.analysis || {};
    const lang = a.lang ? `${a.lang.code} (${(a.lang.confidence * 100).toFixed(0)}%)` : 'unknown';
    const persons = a.entities?.persons?.slice(0, 5).join(', ');
    const locations = a.entities?.locations?.slice(0, 5).join(', ');
    const sourceMatch = a.origin_signals?.source_match;
    const matchLine = sourceMatch
      ? `MATCHED SOURCE: ${sourceMatch.identifier} → ${sourceMatch.alignment} (conf ${sourceMatch.confidence})`
      : 'no domain match';
    const hints = (a.origin_signals?.hints || []).join('; ');
    return [
      `signal_id: ${s.id}`,
      `platform: ${s.platform}${s.post_url ? ` · ${s.post_url}` : ''}`,
      `author: ${s.author_handle || s.author_display_name || 'unknown'}`,
      `posted_at: ${s.posted_at ? new Date(s.posted_at).toISOString() : 'unknown'}`,
      `language: ${lang}`,
      persons ? `persons: ${persons}` : '',
      locations ? `locations: ${locations}` : '',
      `${matchLine}${hints ? ' · hints: ' + hints : ''}`,
      `text: ${(s.raw_text || '').slice(0, 1200)}`,
    ].filter(Boolean).join('\n');
  }).join('\n---\n');
  ctxBlocks.push(`--- SIGNALS ---\n${signalBlock}`);

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
      context: { ...context, agent: 'social_listener', endpoint: context.endpoint || '/api/social/briefs' },
    });
    const output = parseClaudeJson(text);
    const durationMs = Date.now() - startedAt;
    await pool.query(
      `UPDATE social_listener_briefs SET output = $2::jsonb, duration_ms = $3, cost_usd = $4, status = 'generated', updated_at = NOW() WHERE id = $1`,
      [briefId, JSON.stringify(output), durationMs, cost?.costUsd ?? null]
    );
    return { briefId, kind, output, cost, durationMs, signalIds: signals.map(s => s.id) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await pool.query(
      `UPDATE social_listener_briefs SET status = 'failed', error = $2, updated_at = NOW() WHERE id = $1`,
      [briefId, message]
    );
    throw err;
  }
}

module.exports = { runSocialListenerBrief, KIND_LABELS };

// ─── Agent registry entry ──────────────────────────────────────────────────
const { register, resolveConfig } = require('./registry');
register({
  slug: 'social_listener',
  name: 'Social Listener',
  icon: '🛰',
  description:
    'Tracks Facebook + cross-platform posts for narratives the newsroom flags. Open-source language identification (Xenova/xlm-roberta-base-language-detection) and multilingual NER (Xenova/wikineural-multilingual-ner) run in-process via Transformers.js — strong on Russian + Chinese signals. A curated per-newsroom source-reputation list (RT, Sputnik, Sputnik Africa, CGTN, CGTN Africa, Xinhua, etc seeded by default; editable) lets the agent tie posts back to documented state-media properties. Three brief kinds: signal analysis, keyword sweep, coordinated pattern. Pilot ingests via manual paste, CSV, or webhook; real Meta Content Library / Graph API integrations plug in as adapters per the Distributor pattern.',
  triggers: ['social', 'listen', 'facebook', 'disinfo', 'disinformation', 'cib', 'sputnik', 'cgtn', 'state media'],
  inputs: {
    briefInput: {
      type: 'longtext',
      label: "Editor's framing (optional)",
      description: 'Optional steer — what the agent should focus on (a specific narrative, a region, a known account).',
    },
    title: {
      type: 'string',
      label: 'Brief title',
      description: 'Optional. Defaults to "<kind> — <today\'s date>".',
    },
    signalIds: {
      type: 'string[]',
      label: 'Signal ids (optional)',
      description: 'Comma-separated UUIDs of social_signals rows to focus on. If empty, agent analyses the most recent unprocessed signals.',
    },
  },
  config: {
    kind: {
      type: 'select',
      default: 'signal_analysis',
      label: 'Brief kind',
      description: 'Which analysis the agent should run.',
      options: [
        { value: 'signal_analysis', label: 'Signal analysis — origin attribution + recommended response' },
        { value: 'keyword_sweep', label: 'Keyword sweep — group recent signals by watchlist term' },
        { value: 'coordinated_pattern', label: 'Coordinated pattern — look for shared phrasing / timing / domains' },
      ],
    },
  },
  outputs: {
    output: { type: 'json', description: 'Structured brief, kind-specific shape.' },
    briefId: { type: 'string', description: 'social_listener_briefs row id.' },
  },
  route: '/api/social/briefs',
  async run(input, ctx) {
    const cfg = resolveConfig('social_listener', input);
    const ids = Array.isArray(input.signalIds)
      ? input.signalIds
      : (typeof input.signalIds === 'string' && input.signalIds.trim()
          ? input.signalIds.split(',').map(s => s.trim()).filter(Boolean)
          : null);
    const { briefId, output, cost, durationMs } = await runSocialListenerBrief({
      kind: cfg.kind,
      signalIds: ids,
      briefInput: input.briefInput,
      title: input.title,
      context: { ...ctx, endpoint: ctx.endpoint || '/api/agents/social_listener' },
    });
    return { result: { output, briefId }, cost, durationMs };
  },
});
