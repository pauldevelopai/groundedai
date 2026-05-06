// Claude wrapper with retry-with-exponential-backoff + cost logging.
// NOT lifted from Surepath — Surepath's wrapper has no retry logic.
// This is a new build that hooks lib/costs.js for every successful call.
//
// Anchor LOCK: every Claude call uses Haiku 4.5. Hardcoded here on purpose.
// No model parameter on chat(); no env override; no per-agent knob. Paul's
// directive 2026-05-06. See feedback_haiku_only memory. If you find yourself
// adding a model parameter or a tier knob, stop — the answer is no.

const Anthropic = require('@anthropic-ai/sdk');
const { logClaudeCost } = require('./costs');

const ANCHOR_MODEL = 'claude-haiku-4-5-20251001';
const DEFAULT_MAX_TOKENS = 4096;
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

let _client = null;
function client() {
  if (!_client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY is not set.');
    }
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _client;
}

function isRetryable(err) {
  if (!err) return false;
  const status = err.status || err.statusCode;
  if (status === 429 || status === 529) return true;
  if (err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT') return true;
  // Anthropic SDK uses these names for transient network issues.
  if (
    err.name === 'APIConnectionError' ||
    err.name === 'APIConnectionTimeoutError'
  ) {
    return true;
  }
  return false;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Send a message to Claude with retry + cost logging.
 *
 * Locked to Haiku 4.5. There is no model parameter — see ANCHOR_MODEL above.
 *
 * @param {object} opts
 * @param {string} opts.system         System prompt
 * @param {Array}  opts.messages       [{ role: 'user'|'assistant', content }]
 * @param {number} [opts.maxTokens]    Default: 4096
 * @param {object} [opts.context]      Cost-logging metadata:
 *                                     { newsroomId, userId, agent, endpoint }
 * @returns {Promise<{
 *   text: string,
 *   raw: object,
 *   cost: { costUsd: number, model: string, inputTokens: number, outputTokens: number }
 * }>}
 */
async function chat({
  system,
  messages,
  maxTokens = DEFAULT_MAX_TOKENS,
  context = {},
}) {
  let lastErr;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await client().messages.create({
        model: ANCHOR_MODEL,
        max_tokens: maxTokens,
        system,
        messages,
      });

      const text = response.content
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('');

      const cost = await logClaudeCost({
        model: response.model,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        newsroomId: context.newsroomId,
        userId: context.userId,
        agent: context.agent,
        endpoint: context.endpoint,
      });

      return { text, raw: response, cost };
    } catch (err) {
      lastErr = err;
      if (!isRetryable(err) || attempt === MAX_RETRIES - 1) throw err;
      const delay = BASE_DELAY_MS * Math.pow(2, attempt) + Math.random() * 250;
      console.warn(
        `Claude call retry ${attempt + 1}/${MAX_RETRIES - 1} after ${Math.round(delay)}ms (${err.message})`
      );
      await sleep(delay);
    }
  }
  throw lastErr;
}

module.exports = { chat };
