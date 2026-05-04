// Cost logger for Claude API calls. Lifted from surepath/costs.js, simplified
// to Claude-only (extensible to Google/ElevenLabs later). Inserts one row per
// call into api_costs.
//
// Pricing per 1M tokens, in USD. Keep in sync with anthropic.com/pricing.

const { pool } = require('./db');

const CLAUDE_PRICING = {
  // Claude 4 family (current as of 2026-05). Update when models change.
  'claude-opus-4-7': { input: 15, output: 75 },
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-haiku-4-5-20251001': { input: 0.8, output: 4 },
};

function calculateClaudeCost(model, inputTokens, outputTokens) {
  const pricing = CLAUDE_PRICING[model];
  if (!pricing) {
    console.warn(`Unknown Claude model for pricing: ${model}. Defaulting to Sonnet rates.`);
    return calculateClaudeCost('claude-sonnet-4-6', inputTokens, outputTokens);
  }
  return (
    (inputTokens / 1_000_000) * pricing.input +
    (outputTokens / 1_000_000) * pricing.output
  );
}

/**
 * Log a Claude API call to the api_costs table.
 *
 * @param {object} args
 * @param {string} args.model
 * @param {number} args.inputTokens
 * @param {number} args.outputTokens
 * @param {string} [args.newsroomId]
 * @param {string} [args.userId]
 * @param {string} [args.agent]
 * @param {string} [args.endpoint]
 * @returns {Promise<{ costUsd: number, model: string, inputTokens: number, outputTokens: number }>}
 */
async function logClaudeCost({
  model,
  inputTokens,
  outputTokens,
  newsroomId,
  userId,
  agent,
  endpoint,
}) {
  const costUsd = calculateClaudeCost(model, inputTokens, outputTokens);
  await pool.query(
    `INSERT INTO api_costs
       (service, model, endpoint, agent, newsroom_id, user_id,
        input_tokens, output_tokens, cost_usd)
     VALUES ('anthropic', $1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      model,
      endpoint || null,
      agent || null,
      newsroomId || null,
      userId || null,
      inputTokens,
      outputTokens,
      costUsd,
    ]
  );
  return { costUsd, model, inputTokens, outputTokens };
}

module.exports = {
  CLAUDE_PRICING,
  calculateClaudeCost,
  logClaudeCost,
};
