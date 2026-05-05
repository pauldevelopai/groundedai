const { chat } = require('../claude');
const { parseClaudeJson } = require('../parse-claude-json');

const BASE_SYSTEM = `You are Anchor's Drafter agent — an editorial assistant for African newsrooms.

You read an article submitted by a journalist and assist in drafting copy. You operate under two hard constraints:
1. DRAFT ONLY. All your outputs are drafts. State that the outputs require human editorial review before publication.
2. ADAPTIVE TONE. Match the tone and length to the requested task and platform.`;

const TASK_GUIDANCE = {
  social_copy: 'Write engaging-but-journalistic social media posts. Lead with the angle.',
  headline: 'Write punchy but accurate headlines. No clickbait. Each draft is a single line.',
  newsletter: 'Write a newsletter blurb of about 80–120 words: lede, why-it-matters, link-back hook.',
  video_script: 'Write a short-form video script. Open with a 1-line hook. Then 30–60 seconds of talking-head script with timing cues.',
  podcast_intro: 'Write a podcast intro — cold-open feel, 20–40 seconds, ending on the day\'s main story.',
  translation: 'Translate the core message faithfully. Preserve names and place names. This is light translation; deep translation work belongs in the Translator agent.',
};

const PLATFORM_GUIDANCE = {
  twitter: 'Strict 280-character limit per draft.',
  linkedin: 'Professional voice; 1–3 short paragraphs; story angle up front.',
  instagram: 'Caption-style; can use line breaks; first line is the hook.',
  facebook: '2–4 sentences; conversational; ask a question if natural.',
  whatsapp_broadcast: 'Broadcast-friendly: short, plain, can be forwarded.',
  newsletter: 'Newsletter teaser; sets up the click-through.',
  website: 'CMS teaser/standfirst; one to two short sentences.',
};

const LENGTH_HINT = {
  short: 'Keep drafts very short.',
  medium: 'Standard length.',
  long: 'Allow a longer treatment if the source supports it.',
};

const TONE_HINT = {
  newsroom_default: 'Use the newsroom\'s default voice — journalistic, clear, accessible.',
  formal: 'Formal broadsheet voice.',
  conversational: 'Conversational, accessible — like explaining to a friend.',
  punchy: 'Punchy and attention-grabbing without sliding into clickbait.',
  explanatory: 'Explanatory — walk the reader through the why.',
};

function buildSystemPrompt({ taskType, tone, targetPlatform, length, allowEmojis, audienceSegment }) {
  const lines = [BASE_SYSTEM];
  lines.push(TASK_GUIDANCE[taskType] || TASK_GUIDANCE.social_copy);
  if (tone && TONE_HINT[tone]) lines.push(TONE_HINT[tone]);
  if (taskType !== 'headline' && taskType !== 'translation' && targetPlatform && PLATFORM_GUIDANCE[targetPlatform]) {
    lines.push(`Platform: ${PLATFORM_GUIDANCE[targetPlatform]}`);
  }
  if (length && LENGTH_HINT[length]) lines.push(LENGTH_HINT[length]);
  lines.push(allowEmojis ? 'Emojis are allowed where they fit naturally.' : 'Do NOT use emojis.');
  if (audienceSegment) lines.push(`Audience: writing for ${audienceSegment}. Adapt vocabulary and references.`);

  lines.push(`Return ONLY valid JSON matching this schema:
{
  "drafts": [
    { "text": "<the drafted copy>", "rationale": "<brief explanation of why this draft works>" }
  ],
  "editorial_note": "<reminder that these are drafts requiring human review>"
}

Output JSON only — no preamble, no markdown fences.`);
  return lines.join('\n\n');
}

/**
 * Draft copy based on an article.
 *
 * @param {object} opts
 * @param {string} opts.articleText
 * @param {string} opts.taskType
 * @param {string} [opts.targetLanguage]
 * @param {number} [opts.numDrafts]
 * @param {string} [opts.tone]
 * @param {string} [opts.targetPlatform]
 * @param {string} [opts.length]
 * @param {boolean} [opts.allowEmojis]
 * @param {string} [opts.audienceSegment]
 * @param {object} opts.context
 * @returns {Promise<{ result: object, cost: { costUsd: number, model: string, inputTokens: number, outputTokens: number }, durationMs: number }>}
 */
async function draft({
  articleText,
  taskType = 'social_copy',
  targetLanguage,
  numDrafts = 3,
  tone = 'newsroom_default',
  targetPlatform = 'any',
  length = 'medium',
  allowEmojis = false,
  audienceSegment,
  context,
}) {
  if (!articleText || typeof articleText !== 'string') {
    throw new Error('articleText is required.');
  }

  let instructions = `Please generate ${numDrafts} alternative drafts for: ${taskType}.`;
  if (taskType === 'translation' && targetLanguage) {
    instructions += ` Translate the core message into ${targetLanguage}.`;
  }

  const userMessage = `Article:\n\n${articleText}\n\n${instructions}\n\nReturn JSON only.`;

  const startedAt = Date.now();
  const systemPrompt = buildSystemPrompt({ taskType, tone, targetPlatform, length, allowEmojis, audienceSegment });

  const { text, cost } = await chat({
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
    maxTokens: 4096,
    context: { ...context, agent: 'drafter' },
  });

  const result = parseClaudeJson(text);
  const durationMs = Date.now() - startedAt;

  return { result, cost, durationMs };
}

module.exports = { draft };

const { register, resolveConfig } = require('./registry');
register({
  slug: 'drafter',
  name: 'Drafter',
  icon: '✍️',
  description: 'Writes social copy, headlines, newsletter blurbs, and scripts in the newsroom\'s house style. Handles light translation. In short-form video, paste an article and Drafter produces the script (opening hook included) for Translator and Producer to take forward.',
  triggers: ['draft', 'social', 'headline', 'newsletter', 'translate'],
  inputs: {
    articleText: {
      type: 'longtext',
      required: true,
      label: 'Source article',
      description: 'The article the drafter writes from. Either filled by the user when they run the workflow, or wired from another node.',
    },
  },
  config: {
    task_type: {
      type: 'select',
      default: 'social_copy',
      label: 'What to draft',
      description: 'The kind of copy this node produces.',
      options: [
        { value: 'social_copy', label: 'Social media post', description: 'Short, engaging, journalistic.' },
        { value: 'headline', label: 'Headline', description: 'Punchy, accurate, multiple alternatives.' },
        { value: 'newsletter', label: 'Newsletter blurb', description: 'Informative, ~100 words.' },
        { value: 'video_script', label: 'Short-form video script', description: 'Opening hook + 30–60s talking-head script.' },
        { value: 'podcast_intro', label: 'Podcast intro', description: 'Spoken-word intro with cold-open feel.' },
        { value: 'translation', label: 'Translation', description: 'Light translation to the target language. For deep work, use the Translator agent.' },
      ],
    },
    num_drafts: {
      type: 'number',
      default: 3,
      min: 1,
      max: 10,
      step: 1,
      label: 'How many alternatives',
      description: 'Drafter returns this many independent drafts so the editor can pick.',
    },
    tone: {
      type: 'select',
      default: 'newsroom_default',
      label: 'Voice',
      description: 'House voice the draft is written in.',
      options: [
        { value: 'newsroom_default', label: 'Newsroom default' },
        { value: 'formal', label: 'Formal, broadsheet' },
        { value: 'conversational', label: 'Conversational, accessible' },
        { value: 'punchy', label: 'Punchy, attention-grabbing' },
        { value: 'explanatory', label: 'Explanatory, walk-the-reader-through' },
      ],
    },
    target_platform: {
      type: 'select',
      default: 'any',
      label: 'Target platform',
      description: 'Shapes length and format. Ignored for headlines and translation.',
      options: [
        { value: 'any', label: 'Any / unspecified' },
        { value: 'twitter', label: 'X / Twitter (≤ 280 chars)' },
        { value: 'linkedin', label: 'LinkedIn' },
        { value: 'instagram', label: 'Instagram (caption)' },
        { value: 'facebook', label: 'Facebook' },
        { value: 'whatsapp_broadcast', label: 'WhatsApp broadcast' },
        { value: 'newsletter', label: 'Newsletter' },
        { value: 'website', label: 'Website / CMS teaser' },
      ],
    },
    length: {
      type: 'select',
      default: 'medium',
      label: 'Length',
      options: [
        { value: 'short', label: 'Short' },
        { value: 'medium', label: 'Medium' },
        { value: 'long', label: 'Long' },
      ],
    },
    target_language: {
      type: 'string',
      default: '',
      label: 'Target language',
      description: 'Only used when "What to draft" is Translation.',
      placeholder: 'e.g. isiZulu, Shona, Swahili',
    },
    allow_emojis: {
      type: 'boolean',
      default: false,
      label: 'Allow emojis',
      description: 'Off by default. Some newsrooms keep their feed copy emoji-free.',
    },
    audience_segment: {
      type: 'string',
      default: '',
      label: 'Audience segment',
      description: 'Who this is being written for. Drafter shapes vocabulary accordingly.',
      placeholder: 'e.g. young township readers, business audience, rural feature-phone users',
    },
  },
  outputs: {
    result: { type: 'json', description: 'Drafter output: { drafts: [{text, rationale}], editorial_note }.' },
  },
  route: '/api/agents/drafter',
  async run(input, ctx) {
    const cfg = resolveConfig('drafter', input);
    const { result, cost, durationMs } = await draft({
      articleText: input.articleText,
      taskType: cfg.task_type,
      targetLanguage: cfg.target_language || undefined,
      numDrafts: Math.max(1, Math.min(10, parseInt(cfg.num_drafts, 10) || 3)),
      tone: cfg.tone,
      targetPlatform: cfg.target_platform,
      length: cfg.length,
      allowEmojis: !!cfg.allow_emojis,
      audienceSegment: cfg.audience_segment || undefined,
      context: ctx,
    });
    return { result: { result }, cost, durationMs };
  },
});
