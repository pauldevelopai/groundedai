// Distributor agent — two-way per AGENTS.md + project memory:
//   inbound:    triage incoming submissions, route to Verifier or
//               Operations / contributor management
//   outbound:   draft per-channel publishing copy that respects each
//               channel's defaults (length, hashtag style, etc)
//   correction: draft a per-channel correction propagation
//
// All three return structured JSON the editor reviews before any
// downstream side effect (creating a contributor row, queueing a send,
// dispatching a correction). Per the project memory, Anchor never spawns
// outbound or contributor rows silently — agent proposes, editor confirms.

const { pool } = require('../db');
const { chat } = require('../claude');
const { parseClaudeJson } = require('../parse-claude-json');
const { loadProfile, formatForPrompt: formatProfileForPrompt } = require('../newsroom-profile');
const inbound = require('../distribution/inbound');
const channels = require('../distribution/channels');

const KIND_LABELS = {
  inbound_triage: 'Inbound triage',
  outbound_plan: 'Outbound plan',
  correction_draft: 'Correction draft',
};

const BASE_SYSTEM = `You are Anchor's Distributor agent — the inbound triage + outbound publishing assistant for an African newsroom.

Hard constraints:
1. NEVER act unilaterally. Every output is a proposal for the editor to confirm; never frame a route as already done.
2. RESPECT THE LIVE TABLES. Use only the inbound submission, channel list, and source piece supplied. Don't invent submissions, channels, or platform features.
3. PER-CHANNEL FIDELITY. When proposing outbound copy, keep each channel's length and conventions in mind (Twitter 280 chars, WP needs an HTML body, WhatsApp prefers short and conversational). A "tweet" written for an article body is useless; an article body written as a tweet is also useless.
4. SAFETY FIRST. If a submission looks like a hate-speech complaint, a personal-attack tip, or anything that needs immediate moderation routing, flag it explicitly with severity='high' rather than burying it in the suggested route.
5. EDITOR HAND-OFF. State explicitly that a human approval is required before any contributor row, calendar idea, or platform send happens.`;

const KIND_PROMPTS = {
  inbound_triage: `OUTPUT: a structured triage of inbound submissions. Return ONLY valid JSON matching:
{
  "headline": "<2-sentence overview for the editor>",
  "decisions": [
    {
      "submission_id": "<UUID from the inbound block>",
      "suggested_classification": "news_tip | contributor_signup | correction | feedback | spam | unrelated",
      "suggested_route": "verifier | operations_contributor | calendar_idea | archive | block | reply_only",
      "rationale": "<one to two sentences — be specific>",
      "urgency_score": <0..1, where >0.7 means look at this today>,
      "drafted_reply": "<short courteous reply the editor can send back, if applicable; empty string if not>"
    }
  ],
  "patterns_observed": ["<pattern across submissions worth flagging>", ...],
  "outstanding_questions": ["<question for the editor>", ...]
}
JSON only.`,

  outbound_plan: `OUTPUT: a per-channel publishing plan. Return ONLY valid JSON matching:
{
  "headline": "<one-line summary of the plan>",
  "channels": [
    {
      "channel_id": "<UUID from the channels block>",
      "channel_name": "<channel.name>",
      "channel_kind": "<channel.channel_kind>",
      "draft": {
        "title": "<title — only if relevant for this channel kind>",
        "body": "<the actual copy — respect the channel's typical length>",
        "hashtags": ["<tag>", ...],
        "media_note": "<what visual / audio asset to attach if any; empty string if none>"
      },
      "rationale": "<why this framing for this channel>",
      "publish_window": "<editor-readable window e.g. 'today 17:00–19:00 SAST' or 'no rush'>"
    }
  ],
  "cross_post_notes": "<things the editor should keep consistent across channels — name spellings, embargoes, attribution, etc>",
  "outstanding_questions": ["<question for the editor>", ...]
}
JSON only.`,

  correction_draft: `OUTPUT: a per-channel correction draft. Return ONLY valid JSON matching:
{
  "headline": "<one-line summary>",
  "core_correction": "<the canonical correction text — what was wrong, what is right, in 2-3 sentences. This is the source of truth other channels paraphrase>",
  "per_channel": [
    {
      "send_id": "<UUID from the affected_sends block>",
      "channel_kind": "<channel kind>",
      "draft": "<the channel-specific correction copy. For Twitter / WhatsApp keep tight; for WP append to the article footer using a CORRECTION header>",
      "tone": "<neutral|formal|conversational>",
      "should_pin": <true|false; only true for severity material+ on social channels>
    }
  ],
  "internal_actions": ["<follow-up the newsroom should take internally — fix archive, fix translations, brief reporter>", ...],
  "outstanding_questions": ["<question for the editor>", ...]
}
JSON only.`,
};

/**
 * Generate a distributor brief. Persists distributor_briefs row, runs
 * Claude with the live distribution context, updates row on success / failure.
 *
 * @param {object} opts
 * @param {string}   opts.kind            'inbound_triage' | 'outbound_plan' | 'correction_draft'
 * @param {string}   [opts.briefInput]
 * @param {string}   [opts.title]
 * @param {string}   [opts.inboundId]     for inbound_triage focused on a single submission
 * @param {string}   [opts.sourceKind]    for outbound_plan / correction_draft
 * @param {string}   [opts.sourceId]
 * @param {string}   [opts.correctionId]  for correction_draft
 * @param {{newsroomId: string, userId?: string, endpoint?: string}} opts.context
 */
async function runDistributorBrief({
  kind, briefInput, title,
  inboundId, sourceKind, sourceId, correctionId,
  context,
}) {
  if (!KIND_PROMPTS[kind]) {
    throw new Error(`Unknown kind "${kind}". Expected one of: ${Object.keys(KIND_PROMPTS).join(', ')}`);
  }

  const insert = await pool.query(
    `INSERT INTO distributor_briefs
       (newsroom_id, created_by, title, kind, brief_input,
        inbound_id, send_id, correction_id, source_kind, source_id, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending')
     RETURNING id`,
    [
      context.newsroomId, context.userId || null,
      (title || `${KIND_LABELS[kind]} — ${new Date().toLocaleDateString()}`).slice(0, 200),
      kind, briefInput || null,
      inboundId || null,
      null,                                // send_id is set by the editor when they queue a send
      correctionId || null,
      sourceKind || null, sourceId || null,
    ]
  );
  const briefId = insert.rows[0].id;

  // Pull context per kind.
  const profile = await loadProfile(context.newsroomId).catch(() => null);
  const profileBlock = profile ? formatProfileForPrompt(profile) : null;
  const ctxBlocks = [];
  if (profileBlock) ctxBlocks.push(`--- NEWSROOM PROFILE ---\n${profileBlock}`);

  if (kind === 'inbound_triage') {
    let submissions;
    if (inboundId) {
      const r = await pool.query(
        `SELECT id, source, sender_name, sender_contact, subject, body, status
           FROM inbound_submissions WHERE id = $1 AND newsroom_id = $2`,
        [inboundId, context.newsroomId]
      );
      submissions = r.rows;
    } else {
      submissions = await inbound.listSubmissions(context.newsroomId, { status: 'new' });
    }
    if (!submissions || submissions.length === 0) {
      ctxBlocks.push('--- INBOUND SUBMISSIONS ---\n(no new submissions)');
    } else {
      const detailed = submissions.map(s =>
        `id: ${s.id}\nsource: ${s.source}\nfrom: ${s.sender_name || ''} <${s.sender_contact || ''}>\nsubject: ${s.subject || ''}\nbody: ${s.body || ''}`
      ).join('\n---\n');
      ctxBlocks.push(`--- INBOUND SUBMISSIONS ---\n${detailed}`);
    }
  } else if (kind === 'outbound_plan') {
    if (!sourceKind || !sourceId) throw new Error('outbound_plan requires sourceKind + sourceId.');
    const ch = await channels.listChannels(context.newsroomId);
    if (!ch || ch.length === 0) {
      throw new Error('No outbound channels configured. Add channels in /distribution before planning.');
    }
    ctxBlocks.push(
      `--- AVAILABLE OUTBOUND CHANNELS ---\n` +
      ch.map(c =>
        `id: ${c.id}\nname: ${c.name}\nkind: ${c.channel_kind}\n` +
        (c.external_url ? `url: ${c.external_url}\n` : '') +
        (c.defaults && Object.keys(c.defaults).length > 0
          ? `defaults: ${JSON.stringify(c.defaults)}\n` : '')
      ).join('\n')
    );

    // Load the source piece. Production is the most common; we look there
    // first because slice 14 gave us the producer table to work with.
    const src = await loadSourcePiece(context.newsroomId, sourceKind, sourceId);
    if (!src) throw new Error('Source piece not found in this newsroom.');
    ctxBlocks.push(`--- SOURCE PIECE (${sourceKind}) ---\n${src}`);
  } else if (kind === 'correction_draft') {
    if (!correctionId) throw new Error('correction_draft requires correctionId.');
    const cr = await pool.query(
      `SELECT * FROM distribution_corrections WHERE id = $1 AND newsroom_id = $2`,
      [correctionId, context.newsroomId]
    );
    const correction = cr.rows[0];
    if (!correction) throw new Error('Correction not found.');
    ctxBlocks.push(
      `--- CORRECTION ---\n` +
      `reason: ${correction.reason}\n` +
      `severity: ${correction.severity}\n` +
      `proposed text: ${correction.correction_text}\n`
    );
    // Affected sends
    const sids = Object.keys(correction.channel_propagation || {});
    if (sids.length > 0) {
      const sendsRes = await pool.query(
        `SELECT s.id, s.payload, s.permalink, c.name AS channel_name, c.channel_kind
           FROM distribution_sends s
           JOIN distribution_channels c ON c.id = s.channel_id
          WHERE s.id = ANY($1::uuid[]) AND s.newsroom_id = $2`,
        [sids, context.newsroomId]
      );
      ctxBlocks.push(
        '--- AFFECTED SENDS ---\n' +
        sendsRes.rows.map(s =>
          `send_id: ${s.id}\nchannel: ${s.channel_name} (${s.channel_kind})\npermalink: ${s.permalink || '(none)'}\noriginal_payload: ${JSON.stringify(s.payload).slice(0, 600)}`
        ).join('\n---\n')
      );
    }
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
      context: { ...context, agent: 'distributor', endpoint: context.endpoint || '/api/distribution/briefs' },
    });
    const output = parseClaudeJson(text);
    const durationMs = Date.now() - startedAt;
    await pool.query(
      `UPDATE distributor_briefs SET output = $2::jsonb, duration_ms = $3, cost_usd = $4, status = 'generated', updated_at = NOW() WHERE id = $1`,
      [briefId, JSON.stringify(output), durationMs, cost?.costUsd ?? null]
    );
    return { briefId, kind, output, cost, durationMs };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await pool.query(
      `UPDATE distributor_briefs SET status = 'failed', error = $2, updated_at = NOW() WHERE id = $1`,
      [briefId, message]
    );
    throw err;
  }
}

async function loadSourcePiece(newsroomId, sourceKind, sourceId) {
  if (sourceKind === 'production') {
    const r = await pool.query(
      `SELECT title, format, output, edited_output FROM producer_productions WHERE id = $1 AND newsroom_id = $2`,
      [sourceId, newsroomId]
    );
    const row = r.rows[0];
    if (!row) return null;
    const out = row.edited_output || row.output;
    return `title: ${row.title}\nformat: ${row.format}\noutput:\n${JSON.stringify(out).slice(0, 6000)}`;
  }
  return null;
}

module.exports = { runDistributorBrief, KIND_LABELS };

// ─── Agent registry entry ──────────────────────────────────────────────────
const { register, resolveConfig } = require('./registry');
register({
  slug: 'distributor',
  name: 'Distributor',
  icon: '📡',
  description:
    'Two-way distribution. Inbound: triage tips and submissions, route to Verifier (for fact-checking) or Operations (for contributor vetting). Outbound: draft per-channel publishing copy that respects each channel\'s length + style. Correction loop: when a published piece needs correcting, draft + propagate the fix across the channels it went out through. Per-newsroom credentials are encrypted at rest with AES-256-GCM. Pilot uses simulated dispatch; real per-channel adapters land per channel.',
  triggers: ['distribute', 'publish', 'tweet', 'post', 'tip', 'inbound', 'correction', 'triage'],
  inputs: {
    briefInput: {
      type: 'longtext',
      label: "Editor's framing (optional)",
      description: 'Optional steer — what to focus on for the triage / plan / correction.',
    },
    title: {
      type: 'string',
      label: 'Brief title',
      description: 'Optional. Defaults to "<kind> — <today\'s date>".',
    },
    inboundId: {
      type: 'string',
      label: 'Inbound submission id',
      description: 'For inbound_triage focused on a single submission.',
    },
    sourceProductionId: {
      type: 'string',
      label: 'Source production id',
      description: 'For outbound_plan — the producer_productions row to publish.',
    },
    correctionId: {
      type: 'string',
      label: 'Correction id',
      description: 'For correction_draft — the distribution_corrections row to draft against.',
    },
  },
  config: {
    kind: {
      type: 'select',
      default: 'inbound_triage',
      label: 'Brief kind',
      description: 'Which distributor task to draft.',
      options: [
        { value: 'inbound_triage', label: 'Inbound triage — classify + route submissions' },
        { value: 'outbound_plan', label: 'Outbound plan — per-channel publishing copy' },
        { value: 'correction_draft', label: 'Correction draft — per-channel correction copy' },
      ],
    },
  },
  outputs: {
    output: { type: 'json', description: 'Structured brief, kind-specific shape.' },
    briefId: { type: 'string', description: 'distributor_briefs row id, used for editor review and downstream nodes.' },
  },
  route: '/api/distribution/briefs',
  async run(input, ctx) {
    const cfg = resolveConfig('distributor', input);
    const { briefId, output, cost, durationMs } = await runDistributorBrief({
      kind: cfg.kind,
      briefInput: input.briefInput,
      title: input.title,
      inboundId: input.inboundId,
      sourceKind: input.sourceProductionId ? 'production' : undefined,
      sourceId: input.sourceProductionId,
      correctionId: input.correctionId,
      context: { ...ctx, endpoint: ctx.endpoint || '/api/agents/distributor' },
    });
    return { result: { output, briefId }, cost, durationMs };
  },
});
