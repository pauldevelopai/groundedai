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

const JSON_SCHEMA_PROMPT = `Return ONLY valid JSON matching this schema:
{
  "claims": [
    {
      "claim": "<verbatim or close paraphrase of a factual claim from the article>",
      "verdict": "supported" | "disputed" | "unverifiable" | "likely_ai_generated",
      "confidence": <number between 0 and 1>,
      "evidence": "<your reasoning, neutral tone>",
      "sources": ["<url or short descriptor; empty array if none>"]
    }
  ],
  "ai_likelihood": <number between 0 and 1>,
  "ai_indicators": ["<phrase or pattern suggesting AI-generation, if any>"],
  "overall_assessment": "<2–4 sentence editor-facing summary>"
}

Identify 3–10 claims. Prioritise factual claims that affect the article's main argument. Skip stylistic statements and opinion. Output JSON only — no preamble, no markdown fences.`;

function buildSystemPrompt(hasArchiveContext) {
  return [
    BASE_SYSTEM_PROMPT,
    hasArchiveContext ? ARCHIVE_CONSTRAINT : NO_ARCHIVE_CONSTRAINT,
    JSON_SCHEMA_PROMPT
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
async function verify({ articleText, specificClaims, archiveContext, context }) {
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
  const systemPrompt = buildSystemPrompt(!!archiveContext);

  const { text, cost } = await chat({
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
    maxTokens: 4096,
    context: { ...context, agent: 'verifier' },
  });

  const result = parseClaudeJson(text);
  const durationMs = Date.now() - startedAt;

  return { result, cost, durationMs };
}

module.exports = { verify };

const { register } = require('./registry');
register({
  slug: 'verifier',
  name: 'Verifier',
  description: 'Checks claims against external sources and the newsroom\'s archive. Multi-source consensus, never single-source. Verifies journalist-sourced claims AND community submissions from Distributor\'s intake queue. Built on an Africa-grounded credibility map.',
  triggers: ['verify', 'fact-check', 'fact check', 'check claims'],
  inputs: {
    articleText: { type: 'longtext', required: true, description: 'Full article body to verify (≥50 chars).' },
    specificClaims: { type: 'string[]', description: 'Optional list of specific claims to focus on.' },
    archiveContext: { type: 'longtext', description: 'Optional past coverage from the newsroom archive (typically wired from an Archivist node).' },
  },
  outputs: {
    result: { type: 'json', description: 'Verifier output: { claims, ai_likelihood, ai_indicators, overall_assessment }.' },
  },
  route: '/api/agents/verifier',
  async run(input, ctx) {
    const { result, cost, durationMs } = await verify({
      articleText: input.articleText,
      specificClaims: input.specificClaims,
      archiveContext: input.archiveContext,
      context: ctx,
    });
    return { result: { result }, cost, durationMs };
  },
});
