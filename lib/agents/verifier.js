// Verifier agent — fact-checks claims in submitted text and flags AI-generated
// content. No archive cross-reference yet (that comes when Archivist lands in
// Pass C and Verifier can call it for retrieval).
//
// Per the briefing's core philosophy ("Never Accuse"), all output uses neutral,
// cautious language. Verdicts are advisory; the journalist signs off.
//
// Output shape (validated by callers):
//   {
//     claims: [
//       { claim, verdict, confidence, evidence, sources }
//     ],
//     ai_likelihood: 0.0–1.0,
//     ai_indicators: [string],
//     overall_assessment: string
//   }
//
//   verdict ∈ {"supported" | "disputed" | "unverifiable" | "likely_ai_generated"}

const { pool } = require('../db');
const { chat } = require('../claude');
const { parseClaudeJson } = require('../parse-claude-json');
const {
  matchUrlsAgainstOutlets,
  formatOutletsForPrompt,
  extractUrls,
} = require('../verifier/outlets');
const { runAgenticLoop } = require('./agentic/loop');
const agenticTools = require('./agentic/tools');

const AGENTIC_LOW_CONFIDENCE_THRESHOLD = 0.6;
const AGENTIC_SYSTEM_PROMPT = `You are the Verifier's enrichment loop. The Verifier just returned an initial verdict on a set of factual claims. Some have low confidence. Use the supplied tools to gather more evidence before producing a revised verdict.

Rules:
- Call archive_search FIRST with a tight question per low-confidence claim. Use the cited claims as evidence if the newsroom has prior coverage.
- Call web_fetch sparingly — only on a clearly-named URL where you expect a primary source (regulator, court, the publisher itself). Never browse blogs or aggregators.
- If a tool returns trusted_source: false, treat the page as weak corroboration only.
- After tools, emit a single JSON object: { revised_claims: [{ claim, revised_verdict, revised_confidence, new_evidence, sources_used }], notes }. No prose outside the JSON.

Verdicts must be one of: supported, disputed, unverifiable, likely_ai_generated.`;

const BASE_SYSTEM_PROMPT = `You are Grounded's Verifier agent — a fact-checking assistant for African newsrooms.

You read an article submitted by a journalist and produce a verification report. You operate under three hard constraints:

1. NEVER ACCUSE. Use neutral, cautious language ("appears to", "could not be verified from this text alone"). You are flagging things a journalist should check, not making accusations.

2. EVIDENCE-BASED. For every claim, the "evidence" field describes what makes the claim credible or doubtful — based on the article text itself and your general training-data context. If you cannot evaluate, say so with verdict "unverifiable".`;

const NO_ARCHIVE_CONSTRAINT = `3. NO ARCHIVE ACCESS. Do not claim you have cross-referenced the newsroom's archive. External-source citations should reference verifiable public information only — and you must note that the journalist needs to independently confirm them.`;

const ARCHIVE_CONSTRAINT = `3. ARCHIVE CONTEXT PROVIDED. You have access to previous coverage from this newsroom's archive. Use it to fact-check the claims. Cite the [Source: ...] from the archive when using it.`;

const TONE_HINT = {
  cautious_advisory: 'Use cautious advisory tone — neutral phrasing, asks the journalist to confirm.',
  forensic: 'Use forensic tone — tighter, evidence-led prose. Still neutral; never accusatory.',
  plain: 'Use plain language so a non-journalist can understand the verdict (this material may have come from a community submission).',
};

function buildJsonSchemaPrompt({ maxClaims, flagAi, requireArchiveCorroboration }) {
  const aiBlock = flagAi
    ? `\n  "ai_likelihood": <number between 0 and 1>,\n  "ai_indicators": ["<phrase or pattern suggesting AI-generation, if any>"],`
    : `\n  "ai_likelihood": null,\n  "ai_indicators": [],`;
  const corroboration = requireArchiveCorroboration
    ? '\n\nIf ARCHIVE CONTEXT is provided, downgrade any claim that has no archive support to verdict "unverifiable" or "disputed".'
    : '';
  return `Return ONLY valid JSON matching this schema:
{
  "claims": [
    {
      "claim": "<verbatim or close paraphrase of a factual claim from the article>",
      "verdict": "supported" | "disputed" | "unverifiable" | "likely_ai_generated",
      "confidence": <number between 0 and 1>,
      "evidence": "<your reasoning, neutral tone>",
      "sources": ["<url or short descriptor; empty array if none>"]
    }
  ],${aiBlock}
  "overall_assessment": "<2–4 sentence editor-facing summary>"
}

Identify up to ${maxClaims} claims. Prioritise factual claims that affect the article's main argument. Skip stylistic statements and opinion. Output JSON only — no preamble, no markdown fences.${corroboration}`;
}

function buildSystemPrompt({ hasArchiveContext, maxClaims, tone, flagAi, requireArchiveCorroboration }) {
  return [
    BASE_SYSTEM_PROMPT,
    hasArchiveContext ? ARCHIVE_CONSTRAINT : NO_ARCHIVE_CONSTRAINT,
    `4. ${TONE_HINT[tone] || TONE_HINT.cautious_advisory}`,
    buildJsonSchemaPrompt({ maxClaims, flagAi, requireArchiveCorroboration }),
  ].join('\n\n');
}

/**
 * Verify an article's claims.
 *
 * @param {object}   opts
 * @param {string}   opts.articleText        Full article text (≥50 chars)
 * @param {string[]} [opts.specificClaims]   If provided, verify only these
 * @param {string}   [opts.archiveContext]   Optional relevant content from the newsroom archive
 * @param {object}   opts.context            { newsroomId, userId, endpoint }
 * @returns {Promise<{
 *   result: object,
 *   cost: { costUsd: number, model: string, inputTokens: number, outputTokens: number },
 *   durationMs: number
 * }>}
 */
async function verify({
  articleText,
  specificClaims,
  archiveContext,
  maxClaims = 5,
  confidenceThreshold = 0,
  tone = 'cautious_advisory',
  flagAiGenerated = true,
  requireArchiveCorroboration = false,
  context,
}) {
  if (!articleText || typeof articleText !== 'string' || articleText.length < 50) {
    throw new Error('articleText is required (min 50 chars).');
  }

  let userMessage = specificClaims && specificClaims.length > 0
    ? `Article:\n\n${articleText}\n\nVerify these specific claims:\n${specificClaims.map((c, i) => `${i + 1}. ${c}`).join('\n')}\n\nReturn JSON only.`
    : `Article:\n\n${articleText}\n\nIdentify and verify the main factual claims. Return JSON only.`;

  if (archiveContext) {
    userMessage += `\n\n--- ARCHIVE CONTEXT ---\n${archiveContext}`;
  }
  // Slice 16 — credibility map. When the article references URLs we know
  // about, attach the credibility findings so the verifier can weigh
  // sources accordingly.
  if (context && context.newsroomId) {
    try {
      const urls = extractUrls(articleText);
      if (urls.length > 0) {
        const findings = await matchUrlsAgainstOutlets(context.newsroomId, urls);
        const block = formatOutletsForPrompt(findings);
        if (block) {
          userMessage += `\n\n--- CREDIBILITY MAP (your newsroom's outlet registry) ---\n${block}\n\nUse these scores to weight sources. A claim sourced from an outlet with credibility 0.9 is stronger evidence than one sourced from an outlet with credibility 0.5; a claim sourced from a state-aligned outlet should be flagged when the claim concerns that government's position. State the source weighting explicitly in the evidence field.`;
          // Stash findings on the context so callers (runVerifierStandalone)
          // can persist them on the run row.
          context.__matchedOutletFindings = findings;
        }
      }
    } catch (err) {
      console.error('verifier: outlet matching failed', err);
    }
  }

  const startedAt = Date.now();
  const systemPrompt = buildSystemPrompt({
    hasArchiveContext: !!archiveContext,
    maxClaims: Math.max(1, Math.min(15, parseInt(maxClaims, 10) || 5)),
    tone,
    flagAi: !!flagAiGenerated,
    requireArchiveCorroboration: !!requireArchiveCorroboration,
  });

  const { text, cost } = await chat({
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
    maxTokens: 4096,
    context: { ...context, agent: 'verifier' },
  });

  const result = parseClaudeJson(text);
  const durationMs = Date.now() - startedAt;

  // Post-filter by confidence threshold (defaults to 0 = no filter).
  const minConfidence = parseFloat(confidenceThreshold) || 0;
  if (minConfidence > 0 && Array.isArray(result.claims)) {
    result.claims = result.claims.filter((c) =>
      typeof c.confidence === 'number' ? c.confidence >= minConfidence : true
    );
  }

  return { result, cost, durationMs };
}

/**
 * Standalone verification — used by /api/verifier/runs and by the
 * Distributor + Social Listener `refer-to-verifier` route_actions.
 * Persists a verifier_runs row up front (status='pending'), runs verify(),
 * updates the row on success/failure, returns { runId, result }.
 *
 * Optional sourceKind/sourceId are persisted on the run row + back-filled
 * via the originating table's routed_to_verifier_run_id column when the
 * caller wants the cross-link.
 *
 * @param {object} opts
 * @param {string}  opts.claimText
 * @param {string}  [opts.title]
 * @param {string}  [opts.contextBrief]
 * @param {string}  [opts.sourceKind]   'manual' | 'inbound_submission' | 'social_signal' | 'production' | 'translation'
 * @param {string}  [opts.sourceId]
 * @param {string}  [opts.archiveContext]
 * @param {object}  [opts.options]      forwarded to verify(): {maxClaims, tone, flagAi, requireArchiveCorroboration, confidenceThreshold}
 * @param {{newsroomId: string, userId?: string, endpoint?: string}} opts.context
 */
async function runVerifierStandalone(opts) {
  const {
    claimText, title, contextBrief,
    sourceKind = 'manual', sourceId,
    archiveContext, options = {},
    context,
  } = opts;
  if (!claimText || claimText.trim().length < 50) {
    throw new Error('claimText is required (min 50 chars).');
  }

  // Mirror into workflow_runs so the V2 Observatory has a unified
  // per-agent invocation record and EditPills can record feedback against
  // it. Verifier-specific data continues to live on verifier_runs; the
  // workflow_runs row carries telemetry (status, cost, duration, error).
  let workflowRunId = null;
  if (context.userId) {
    const wrInsert = await pool.query(
      `INSERT INTO workflow_runs (newsroom_id, user_id, agent, status, input)
       VALUES ($1, $2, 'verifier', 'running', $3)
       RETURNING id`,
      [
        context.newsroomId,
        context.userId,
        JSON.stringify({ source: 'verifier_standalone', sourceKind, sourceId: sourceId || null }),
      ]
    );
    workflowRunId = wrInsert.rows[0].id;
  }

  const insert = await pool.query(
    `INSERT INTO verifier_runs
       (newsroom_id, initiated_by, title, claim_text, context_brief,
        source_kind, source_id, status, workflow_run_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8)
     RETURNING id`,
    [
      context.newsroomId,
      context.userId || null,
      (title || `Verification — ${new Date().toLocaleDateString()}`).slice(0, 200),
      claimText,
      contextBrief || null,
      sourceKind,
      sourceId || null,
      workflowRunId,
    ]
  );
  const runId = insert.rows[0].id;

  const startedAt = Date.now();
  // Pass a context object that verify() can stash matched-outlet findings on.
  const verifyCtx = { ...context };
  try {
    const { result, cost, durationMs } = await verify({
      articleText: claimText,
      archiveContext,
      maxClaims: options.maxClaims,
      confidenceThreshold: options.confidenceThreshold,
      tone: options.tone,
      flagAiGenerated: options.flagAi !== false,
      requireArchiveCorroboration: options.requireArchiveCorroboration,
      context: verifyCtx,
    });
    const findings = verifyCtx.__matchedOutletFindings || {};

    // V2 Step 4 — optional agentic enrichment over low-confidence claims.
    let enrichment = null;
    let totalCostUsd = cost?.costUsd ?? 0;
    if (options.agenticMode === true && Array.isArray(result.claims)) {
      try {
        enrichment = await runAgenticEnrichment({
          claims: result.claims,
          articleText: claimText,
          context: verifyCtx,
          parentInvocationId: workflowRunId,
          maxSteps: typeof options.agenticMaxSteps === 'number' ? options.agenticMaxSteps : 5,
        });
        if (enrichment) {
          result.agentic_supplement = enrichment.supplement;
          totalCostUsd += enrichment.totalCost?.costUsd || 0;
        }
      } catch (enrichErr) {
        // Enrichment failures must not break the verification — record on
        // the result and continue.
        result.agentic_supplement = { error: enrichErr.message };
      }
    }

    await pool.query(
      `UPDATE verifier_runs
          SET output = $2::jsonb,
              matched_outlet_findings = $3::jsonb,
              duration_ms = $4,
              cost_usd = $5,
              status = 'verified',
              updated_at = NOW()
        WHERE id = $1`,
      [runId, JSON.stringify(result), JSON.stringify(findings), durationMs, totalCostUsd]
    );
    if (workflowRunId) {
      await pool.query(
        `UPDATE workflow_runs
            SET status = 'completed',
                output = $2::jsonb,
                input_tokens = $3,
                output_tokens = $4,
                cost_usd = $5,
                duration_ms = $6,
                completed_at = NOW()
          WHERE id = $1`,
        [workflowRunId, JSON.stringify(result), cost?.inputTokens ?? null, cost?.outputTokens ?? null, totalCostUsd, durationMs]
      );
    }
    return { runId, result, matchedOutletFindings: findings, cost, durationMs };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Persist any matched-outlet findings the structural pipeline computed
    // before the Claude call failed — that work is still useful to the
    // editor even when verification itself couldn't complete.
    const findings = verifyCtx.__matchedOutletFindings || {};
    await pool.query(
      `UPDATE verifier_runs
          SET status = 'failed',
              error = $2,
              matched_outlet_findings = $3::jsonb,
              updated_at = NOW()
        WHERE id = $1`,
      [runId, message, JSON.stringify(findings)]
    );
    if (workflowRunId) {
      await pool.query(
        `UPDATE workflow_runs SET status = 'failed', error = $2, completed_at = NOW() WHERE id = $1`,
        [workflowRunId, message]
      );
    }
    throw Object.assign(err instanceof Error ? err : new Error(message), { runId });
  }
}

/**
 * Run the agentic-loop enrichment over low-confidence claims from a
 * Verifier run. Returns { supplement, totalCost, steps } or null if no
 * claim qualified.
 *
 * @param {object} args
 * @param {Array}  args.claims                Initial Verifier claims.
 * @param {string} args.articleText           Original article (for context).
 * @param {object} args.context               { newsroomId, userId, ... }
 * @param {string} [args.parentInvocationId]  workflow_runs.id of the parent.
 * @param {number} [args.maxSteps]            cap (default 5).
 */
async function runAgenticEnrichment({
  claims, articleText, context, parentInvocationId = null, maxSteps = 5,
}) {
  const lowConfidence = (claims || []).filter((c) =>
    typeof c.confidence === 'number' && c.confidence < AGENTIC_LOW_CONFIDENCE_THRESHOLD,
  );
  if (lowConfidence.length === 0) return null;

  const promptPayload = {
    article_excerpt: (articleText || '').slice(0, 2000),
    low_confidence_claims: lowConfidence.map((c) => ({
      claim: c.claim,
      verdict: c.verdict,
      confidence: c.confidence,
      initial_evidence: c.evidence,
      initial_sources: c.sources || [],
    })),
  };

  const userMessage = `Initial Verifier output:\n\n${JSON.stringify(promptPayload, null, 2)}\n\nUse the tools to enrich. End with the JSON object described in your system prompt.`;

  const loop = await runAgenticLoop({
    system: AGENTIC_SYSTEM_PROMPT,
    tools: agenticTools.all,
    input: userMessage,
    ctx: {
      ...context,
      parentAgent: 'verifier',
      endpoint: 'verifier.agentic_enrichment',
    },
    parentInvocationId,
    maxSteps,
  });

  let revised = null;
  try { revised = parseClaudeJson(loop.text); }
  catch { /* unparseable — keep the raw text */ }

  return {
    supplement: {
      stoppedBecause: loop.stoppedBecause,
      stepsTaken: loop.stepsTaken,
      raw_text: loop.text,
      revised_claims: revised?.revised_claims || null,
      notes: revised?.notes || null,
      step_summary: loop.steps.map((s) => ({
        step: s.step,
        tool: s.tool,
        duration_ms: s.duration_ms,
        error: s.error || null,
        invocation_id: s.invocation_id,
      })),
    },
    totalCost: loop.totalCost,
  };
}

module.exports = { verify, runVerifierStandalone, runAgenticEnrichment };

const { register, resolveConfig } = require('./registry');
register({
  slug: 'verifier',
  name: 'Verifier',
  icon: '🛡️',
  description: 'Checks claims against external sources and the newsroom\'s archive. Returns a confidence rating, evidence, citations, and gaps. Multi-source consensus, never single-source. Built on an Africa-grounded credibility map. Verifies both journalist-sourced claims and community-submitted material, pairing with the Digital News Gatherer\'s intake queue to fact-check tips, submissions, and contributor pieces before they enter the editorial pipeline. Pairs with Archivist to turn dead storage into a live intelligence system — archives that serve ongoing investigations, hold institutional memory, and open up product and licensing revenue.',
  triggers: ['verify', 'fact-check', 'fact check', 'check claims'],
  inputs: {
    articleText: {
      type: 'longtext',
      required: true,
      label: 'Article to fact-check',
      description: 'The article or text the user pastes in when running the workflow.',
    },
    specificClaims: {
      type: 'string[]',
      label: 'Specific focus areas',
      description: 'Optional. A short list of specific claims the verifier should focus on instead of identifying its own.',
    },
    archiveContext: {
      type: 'longtext',
      label: 'Past coverage from your archive',
      description: 'Optional. Wire an Archivist node into this input — it pulls relevant past coverage from your newsroom archive so the verifier can cross-check claims.',
    },
  },
  config: {
    max_claims: {
      type: 'number',
      default: 5,
      min: 1,
      max: 15,
      step: 1,
      label: 'Maximum claims to verify',
      description: 'Cap on how many factual claims the verifier surfaces per article.',
    },
    confidence_threshold: {
      type: 'number',
      default: 0,
      min: 0,
      max: 1,
      step: 0.05,
      label: 'Minimum confidence to surface',
      description: 'Drop claims below this confidence level. 0 keeps all.',
    },
    tone: {
      type: 'select',
      default: 'cautious_advisory',
      label: 'Verdict tone',
      description: '"Never accuse" is always on. This shapes how findings are phrased.',
      options: [
        { value: 'cautious_advisory', label: 'Cautious advisory (default)', description: 'Neutral, asks the journalist to confirm.' },
        { value: 'forensic', label: 'Forensic', description: 'Tighter, evidence-led prose.' },
        { value: 'plain', label: 'Plain language', description: 'Audience-readable phrasing for community-submitted material.' },
      ],
    },
    flag_ai_generated: {
      type: 'boolean',
      default: true,
      label: 'Flag AI-generated content',
      description: 'Score the article for likely AI generation and list indicators.',
    },
    require_archive_corroboration: {
      type: 'boolean',
      default: false,
      label: 'Require archive corroboration',
      description: 'When archiveContext is wired, downgrade claims with no archive support.',
    },
    agentic_mode: {
      type: 'boolean',
      default: false,
      label: 'Agentic enrichment (V2)',
      description: 'When on, the Verifier calls archive_search + web_fetch on its own to enrich low-confidence claims before returning. Adds ~1-3 Haiku calls per run, capped at 5 tool steps.',
    },
  },
  outputs: {
    result: { type: 'json', description: 'Verifier output: { claims, ai_likelihood, ai_indicators, overall_assessment }.' },
  },
  route: '/api/agents/verifier',
  async run(input, ctx) {
    const cfg = resolveConfig('verifier', input);
    const { result, cost, durationMs } = await verify({
      articleText: input.articleText,
      specificClaims: input.specificClaims,
      archiveContext: input.archiveContext,
      maxClaims: cfg.max_claims,
      confidenceThreshold: cfg.confidence_threshold,
      tone: cfg.tone,
      flagAiGenerated: cfg.flag_ai_generated,
      requireArchiveCorroboration: cfg.require_archive_corroboration,
      context: ctx,
    });

    // V2 Step 4: optional agentic enrichment from the workflow path.
    let totalCostUsd = cost?.costUsd ?? 0;
    if (cfg.agentic_mode === true && Array.isArray(result.claims)) {
      try {
        const enrichment = await runAgenticEnrichment({
          claims: result.claims,
          articleText: input.articleText,
          context: ctx,
          maxSteps: 5,
        });
        if (enrichment) {
          result.agentic_supplement = enrichment.supplement;
          totalCostUsd += enrichment.totalCost?.costUsd || 0;
        }
      } catch (enrichErr) {
        result.agentic_supplement = { error: enrichErr.message };
      }
    }

    return { result: { result }, cost: { ...cost, costUsd: totalCostUsd }, durationMs };
  },
});
