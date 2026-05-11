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

const BASE_SYSTEM = `You are Grounded's Social media listener agent — a disinformation and influence-operations analyst for an African newsroom.

THE THREAT MODEL you're optimising for: English-language posts written by bot networks operated out of Russia or China, targeting African audiences (especially Zambia, South Africa, Zimbabwe, Kenya) by impersonating "local voices". Language detection is the WEAKEST origin signal because these networks deliberately write in the target audience's language. The strongest signals, in priority order:

  1. Page Transparency country (Meta-disclosed admin location). When a Page that claims to represent Zambia/SA/Zim discloses its admins are based in Russia / Belarus / China, that is conclusive origin evidence by itself.
  2. Match against a documented IO network in the supplied known-networks block (Doppelganger, African Initiative, Spamouflage Dragon, Wagner-aligned Africa networks, Secondary Infektion).
  3. SimHash siblings — other signals with near-duplicate text from other accounts within a tight time window. Multiple "independent" voices posting the same 9-word phrase is coordination.
  4. Outbound URL forensics — domain age (SSL cert NotBefore), WHOIS country mismatch, hosting in a country incongruent with the claimed identity.
  5. Account-creation recency mismatched with claimed institutional history.
  6. Source-domain match against curated state-media property list (rt.com, sputnikafrica.com, cgtn.com, etc).
  7. Language / NER (only useful for the minority of posts in the operator's native language).

Hard constraints:
1. STRUCTURAL EVIDENCE FIRST. Use the pre-computed signals supplied. Do not invent attributions.
2. ATTRIBUTION CARE. "Bot network from Russia targeting Zambia" is a serious claim. Only assert it when at least one of {Page Transparency country, IO-network match, simhash siblings ≥ 2} lines up. State the strength of evidence explicitly.
3. AFRICAN NEWSROOM LENS. When the target is African audiences, say so plainly — that's the story.
4. NO CHILLING EFFECTS. Don't recommend legitimate-but-uncomfortable speech be flagged as foreign influence. The bar for "this is a CIB asset" is real evidence, not vibes.
5. EDITOR HAND-OFF. Always flag the recommended action: ignore / monitor / context-note / correction-publish / refer-to-Verifier. Editor decides; you propose.`;

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

  // Build a known-networks block once so all signals share the same context.
  const networksList = signals.length > 0
    ? await pool.query(
        `SELECT id, name, attributed_to, alignment, targets_africa, description
           FROM social_known_networks WHERE newsroom_id = $1
          ORDER BY targets_africa DESC, alignment, lower(name) LIMIT 30`,
        [context.newsroomId]
      ).then(r => r.rows).catch(() => [])
    : [];
  if (networksList.length > 0) {
    const block = networksList.map(n =>
      `  · ${n.name} — ${n.attributed_to || 'unattributed'} (${n.alignment}${n.targets_africa ? ', targets Africa' : ''})`
    ).join('\n');
    ctxBlocks.push(`--- DOCUMENTED IO NETWORKS (registry the signals below may match against) ---\n${block}`);
  }

  // Compact signal block: include the structural analysis with the new
  // priority-ordered origin signals so the agent reads the strong stuff
  // first. Trims the raw text to keep token usage bounded.
  const signalBlock = signals.map((s) => {
    const a = s.analysis || {};
    const o = a.origin_signals || {};
    const lines = [];
    lines.push(`signal_id: ${s.id}`);
    lines.push(`platform: ${s.platform}${s.post_url ? ` · ${s.post_url}` : ''}`);
    lines.push(`author: ${s.author_handle || s.author_display_name || 'unknown'}`);
    lines.push(`posted_at: ${s.posted_at ? new Date(s.posted_at).toISOString() : 'unknown'}`);

    // STRONGEST signals first.
    if (o.account_country) {
      lines.push(`📍 ACCOUNT ADMIN COUNTRY (Page Transparency): ${o.account_country}${o.account_country_iso ? ` [${o.account_country_iso}]` : ''}`);
    }
    if (o.account_age_days != null) lines.push(`account age: ${o.account_age_days} days${o.account_age_days < 90 ? ' ⚠ recent' : ''}`);
    if (o.posting_cadence_note) lines.push(`posting cadence: ${o.posting_cadence_note}`);
    if (Array.isArray(o.name_change_history) && o.name_change_history.length > 0) {
      lines.push(`Page name changes: ${o.name_change_history.length} historical name${o.name_change_history.length === 1 ? '' : 's'}`);
    }
    if (Array.isArray(o.network_matches) && o.network_matches.length > 0) {
      const m = o.network_matches.map((nm) => `${nm.network_name} (${nm.attributed_to}; matched on ${nm.matched_on.join(', ')})`).join(' | ');
      lines.push(`🚨 IO-NETWORK MATCH: ${m}`);
    }
    if (Array.isArray(o.simhash_siblings) && o.simhash_siblings.length > 0) {
      const sib = o.simhash_siblings.map((s) => `${s.author_handle || s.signal_id.slice(0, 8)} (Hamming ${s.hamming_distance})`).join(', ');
      lines.push(`🔁 SIMHASH SIBLINGS (${o.simhash_siblings.length}): ${sib}`);
    }
    if (o.source_match) lines.push(`source domain: ${o.source_match.identifier} → ${o.source_match.alignment}`);
    if (o.domain_findings && Object.keys(o.domain_findings).length > 0) {
      const f = Object.entries(o.domain_findings).map(([d, v]) => {
        const bits = [];
        if (v.ssl_age_days != null) bits.push(`SSL ${v.ssl_age_days}d`);
        if (v.whois_country) bits.push(`WHOIS ${v.whois_country}`);
        if (v.ssl_subject_country) bits.push(`SSL country ${v.ssl_subject_country}`);
        return `${d}: ${bits.join(', ')}`;
      }).join(' | ');
      lines.push(`outbound URL forensics: ${f}`);
    }
    if (a.lang) lines.push(`language: ${a.lang.code} (${(a.lang.confidence * 100).toFixed(0)}%) — note: weak origin signal`);
    if (a.entities?.persons?.length) lines.push(`persons: ${a.entities.persons.slice(0, 5).join(', ')}`);
    if (a.entities?.locations?.length) lines.push(`locations: ${a.entities.locations.slice(0, 5).join(', ')}`);
    lines.push(`text: ${(s.raw_text || '').slice(0, 1200)}`);
    return lines.join('\n');
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
  name: 'Social media listener',
  icon: '🛰',
  description:
    'Detects the origin of social media posts to track if they are from foreign agents (notably state-linked bot networks out of Russia and China targeting African audiences). The threat model assumes posts are written in English, not Russian or Mandarin — so origin is inferred from the social media trace, not the text: Page Transparency country signals, IO-network registry matches (Doppelganger, African Initiative, Spamouflage Dragon, Secondary Infektion, Wagner-aligned Africa), URL forensics (WHOIS, SSL cert age, outbound link graph), simhash siblings, and account-history anomalies. A curated per-newsroom source-reputation list (RT, Sputnik Africa, CGTN Africa, etc.) is seeded by default and editable. Pilot ingests via manual paste, CSV, or webhook; real Meta Content Library / Graph API integrations plug in as adapters.',
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
