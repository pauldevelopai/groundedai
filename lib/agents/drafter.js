const { chat } = require('../claude');
const { parseClaudeJson } = require('../parse-claude-json');

const SYSTEM_PROMPT = `You are Anchor's Drafter agent — an editorial assistant for African newsrooms.

You read an article submitted by a journalist and assist in drafting copy (social media posts, newsletter blurbs, headlines, or local language translations).

You operate under two hard constraints:
1. DRAFT ONLY. All your outputs are drafts. You must explicitly state that the outputs require human editorial review before publication.
2. ADAPTIVE TONE. Match the tone to the requested task. Social media should be engaging but journalistic; newsletters should be informative; headlines should be punchy but accurate; translations must respect local nuance.

Return ONLY valid JSON matching this schema:
{
  "drafts": [
    {
      "text": "<the drafted copy>",
      "rationale": "<brief explanation of why this draft works>"
    }
  ],
  "editorial_note": "<reminder that these are drafts requiring human review>"
}

Output JSON only — no preamble, no markdown fences.`;

/**
 * Draft copy based on an article.
 *
 * @param {object}   opts
 * @param {string}   opts.articleText    Full article text
 * @param {string}   opts.taskType       E.g., "social_copy", "newsletter", "headline", "translation"
 * @param {string}   [opts.targetLanguage] If taskType is "translation", the language to translate to
 * @param {number}   [opts.numDrafts]    Number of drafts to generate (default: 3)
 * @param {object}   opts.context        { newsroomId, userId, endpoint }
 * @returns {Promise<{
 *   result: object,
 *   cost: { costUsd: number, model: string, inputTokens: number, outputTokens: number },
 *   durationMs: number
 * }>}
 */
async function draft({ articleText, taskType, targetLanguage, numDrafts = 3, context }) {
  if (!articleText || typeof articleText !== 'string') {
    throw new Error('articleText is required.');
  }

  let instructions = `Please generate ${numDrafts} alternative drafts for: ${taskType}.`;
  if (taskType === 'translation' && targetLanguage) {
    instructions += ` Translate the core message into ${targetLanguage}.`;
  }

  const userMessage = `Article:\n\n${articleText}\n\n${instructions}\n\nReturn JSON only.`;

  const startedAt = Date.now();

  const { text, cost } = await chat({
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
    maxTokens: 4096,
    context: { ...context, agent: 'drafter' },
  });

  const result = parseClaudeJson(text);
  const durationMs = Date.now() - startedAt;

  return { result, cost, durationMs };
}

module.exports = { draft };
