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

const { chat } = require('../claude');
const { parseClaudeJson } = require('../parse-claude-json');

const BASE_SYSTEM_PROMPT = `You are Anchor's Verifier agent — a fact-checking assistant for African newsrooms.

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

module.exports = { verify };

const { register, resolveConfig } = require('./registry');
register({
  slug: 'verifier',
  name: 'Verifier',
  icon: '🛡️',
  description: 'Checks claims against external sources and the newsroom\'s archive. Multi-source consensus, never single-source. Verifies journalist-sourced claims AND community submissions an editor has sent on from Distributor\'s triage queue. Built on an Africa-grounded credibility map.',
  triggers: ['verify', 'fact-check', 'fact check', 'check claims'],
  inputs: {
    articleText: { type: 'longtext', required: true, description: 'Full article body to verify (≥50 chars).' },
    specificClaims: { type: 'string[]', description: 'Optional list of specific claims to focus on.' },
    archiveContext: { type: 'longtext', description: 'Optional past coverage from the newsroom archive (typically wired from an Archivist node).' },
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
    return { result: { result }, cost, durationMs };
  },
});
