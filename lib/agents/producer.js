// Producer agent — finished-product composition across formats. Slice 9
// implements the text outputs: radio scripts, podcast outlines, video
// briefs. Slice 12 adds audio assembly (Whisper + Piper). Slice 13 adds
// vertical video + audiograms (ffmpeg).
//
// Producer reads the per-newsroom profile (voice + style + audience) and
// optionally weaves in archive context (so a long-form piece can pull in
// the newsroom's prior coverage as B-roll / archival quotes / context).
// Every production persists to producer_productions for editor review.

const { pool } = require('../db');
const { chat } = require('../claude');
const { parseClaudeJson } = require('../parse-claude-json');
const { loadProfile, formatForPrompt } = require('../newsroom-profile');

const FORMAT_LABELS = {
  radio_script: 'Radio script',
  podcast_outline: 'Podcast outline',
  video_brief: 'Video brief',
  audio_assembly: 'Audio assembly (Slice 12)',
  vertical_video: 'Vertical video (Slice 13)',
  audiogram: 'Audiogram (Slice 13)',
};

const TEXT_FORMATS = new Set(['radio_script', 'podcast_outline', 'video_brief']);

const BASE_SYSTEM = `You are Anchor's Producer agent — a finished-product composer for African newsrooms.

Hard constraints:
1. PRODUCTION-READY. The output is intended for the studio / desk to use directly. Be specific, not abstract.
2. RESPECT THE NEWSROOM. When a NEWSROOM CONTEXT block is supplied, write in that voice, follow that style, address that audience.
3. NEVER FABRICATE FACTS. Use only what's in the source article + archive context. Don't invent quotes, statistics, or details.
4. CITE WHERE POSSIBLE. When archive context is provided, mark passages drawn from it with [Archive: filename] inline.
5. EDITOR SIGN-OFF. State explicitly that the output requires editor review before broadcast / publication.`;

const FORMAT_PROMPTS = {
  radio_script: `OUTPUT: a broadcast-ready radio script. Return ONLY valid JSON matching this schema:

{
  "title": "<short on-air title>",
  "estimated_duration_seconds": <integer, target runtime>,
  "intro": "<music sting + host welcome lines>",
  "segments": [
    { "type": "host", "speaker": "<role/name>", "duration_seconds": <int>, "text": "<word-for-word host script>" },
    { "type": "actuality", "duration_seconds": <int>, "description": "<who is speaking and from where>", "cue_in": "<first 3-5 words of clip>", "cue_out": "<last 3-5 words of clip>" },
    { "type": "music_sting", "duration_seconds": <int>, "description": "<purpose: bumper, transition, etc.>" }
  ],
  "outro": "<sign-off lines>",
  "production_notes": "<any cues, sound design, or technical reminders>"
}

Length: aim for the requested duration. Distribute time across segments realistically. JSON only.`,

  podcast_outline: `OUTPUT: a podcast episode outline. Return ONLY valid JSON matching this schema:

{
  "title": "<episode title>",
  "show_format": "solo" | "two_host" | "interview",
  "estimated_duration_minutes": <int>,
  "cold_open": "<10–30s hook that runs before the theme music>",
  "segments": [
    {
      "title": "<segment name>",
      "duration_minutes": <int>,
      "talking_points": ["<bullet 1>", "<bullet 2>"],
      "tape_or_b_roll": "<archival material or guest tape this segment uses, if any>",
      "transition": "<how this segment ends and the next begins>"
    }
  ],
  "sponsor_break_after_segment_indices": [<int>],
  "outro": "<closing reflection + call-to-action>",
  "show_notes_draft": "<2–4 sentence written show notes for the podcast app description>"
}

JSON only.`,

  video_brief: `OUTPUT: a video brief for the production team. Return ONLY valid JSON matching this schema:

{
  "title": "<short on-screen title>",
  "format": "vertical_short" | "horizontal_explainer" | "interview",
  "estimated_duration_seconds": <int, e.g. 30, 60, 180>,
  "hook": "<the first 3 seconds — bold visual + question/claim that stops the scroll>",
  "shots": [
    {
      "index": <int>,
      "duration_seconds": <int>,
      "visual": "<what the camera/footage shows>",
      "voiceover": "<word-for-word VO; empty string if none>",
      "on_screen_text": "<caption / chyron text; empty string if none>",
      "source_note": "<archive filename, contributor credit, or 'original'>"
    }
  ],
  "broll_notes": "<archival or stock footage to pull, named explicitly>",
  "music_mood": "<two or three adjectives>",
  "captions_style": "<how captions should look — colour, position, font choice>",
  "outro_card": "<final on-screen card / handle to follow>"
}

JSON only.`,
};

/**
 * Run a producer composition. Persists a producer_productions row up front
 * (status='pending'), runs Claude, updates the row on success / failure.
 * Uses the newsroom profile for voice + style automatically.
 *
 * @param {object} opts
 * @param {string} opts.title         — display title for the production row
 * @param {string} opts.sourceText    — input article / brief
 * @param {string} opts.format        — one of TEXT_FORMATS for slice 9
 * @param {string} [opts.archiveContext] — optional past-coverage block
 * @param {{ newsroomId: string, userId?: string, endpoint?: string }} opts.context
 */
async function runProduction({ title, sourceText, format, archiveContext, context }) {
  if (!sourceText || sourceText.trim().length < 30) {
    throw new Error('sourceText is required (min 30 chars).');
  }
  if (!TEXT_FORMATS.has(format)) {
    throw new Error(
      `Format "${format}" is not yet supported. Slice 9 covers ${[...TEXT_FORMATS].join(', ')}; ` +
        `Slice 12 adds audio_assembly; Slice 13 adds vertical_video and audiogram.`
    );
  }

  const insert = await pool.query(
    `INSERT INTO producer_productions
       (newsroom_id, created_by, title, format, source_text, archive_context, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'pending')
     RETURNING id`,
    [
      context.newsroomId,
      context.userId || null,
      (title || `${FORMAT_LABELS[format]} — ${new Date().toLocaleDateString()}`).slice(0, 200),
      format,
      sourceText,
      archiveContext || null,
    ]
  );
  const productionId = insert.rows[0].id;

  let profileBlock = null;
  try {
    const profile = await loadProfile(context.newsroomId);
    profileBlock = formatForPrompt(profile);
  } catch (e) {
    console.error('producer: profile load failed', e);
  }

  const systemPrompt = [BASE_SYSTEM, FORMAT_PROMPTS[format]].join('\n\n');
  const userBlocks = [];
  if (profileBlock) userBlocks.push(`--- NEWSROOM CONTEXT ---\n${profileBlock}`);
  if (archiveContext) userBlocks.push(`--- ARCHIVE CONTEXT ---\n${archiveContext}`);
  userBlocks.push(`--- SOURCE ARTICLE ---\n${sourceText}`);
  userBlocks.push('Compose the production now. Return JSON only.');
  const userMessage = userBlocks.join('\n\n');

  const startedAt = Date.now();
  try {
    const { text, cost } = await chat({
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
      maxTokens: 4096,
      context: { ...context, agent: 'producer', endpoint: context.endpoint || '/api/producer/productions' },
    });
    const output = parseClaudeJson(text);
    const durationMs = Date.now() - startedAt;
    const durationEstSec = pickDurationEstimate(format, output);

    await pool.query(
      `UPDATE producer_productions
          SET output = $2,
              duration_estimate_seconds = $3,
              duration_ms = $4,
              cost_usd = $5,
              status = 'generated',
              updated_at = NOW()
        WHERE id = $1`,
      [productionId, JSON.stringify(output), durationEstSec, durationMs, cost?.costUsd ?? null]
    );

    return { productionId, format, output, cost, durationMs };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await pool.query(
      `UPDATE producer_productions SET status = 'failed', error = $2, updated_at = NOW() WHERE id = $1`,
      [productionId, message]
    );
    throw err;
  }
}

function pickDurationEstimate(format, output) {
  if (!output || typeof output !== 'object') return null;
  if (format === 'radio_script' && Number.isFinite(output.estimated_duration_seconds)) {
    return output.estimated_duration_seconds;
  }
  if (format === 'podcast_outline' && Number.isFinite(output.estimated_duration_minutes)) {
    return output.estimated_duration_minutes * 60;
  }
  if (format === 'video_brief' && Number.isFinite(output.estimated_duration_seconds)) {
    return output.estimated_duration_seconds;
  }
  return null;
}

module.exports = { runProduction, TEXT_FORMATS, FORMAT_LABELS };

// ─── Agent registry entry ──────────────────────────────────────────────────
const { register, resolveConfig } = require('./registry');
register({
  slug: 'producer',
  name: 'Producer',
  icon: '🎬',
  description: 'Builds the finished product across formats. Slice 9 ships radio scripts, podcast outlines, and video briefs as structured outputs the studio team can use directly. Reads your newsroom profile for voice + style. Audio assembly (Slice 12) and vertical video / audiograms (Slice 13) are coming.',
  triggers: ['produce', 'radio script', 'podcast', 'video brief', 'short form'],
  inputs: {
    sourceText: {
      type: 'longtext',
      required: true,
      label: 'Source article',
      description: 'The article, brief, or transcript the production is built from.',
    },
    archiveContext: {
      type: 'longtext',
      label: 'Past coverage from your archive',
      description: 'Optional. Wire an Archivist node into this — Producer weaves the matched passages into the production as B-roll, archival quotes, or context.',
    },
    title: {
      type: 'string',
      label: 'Production title',
      description: 'Optional. Defaults to "<format> — <today\'s date>".',
    },
  },
  config: {
    format: {
      type: 'select',
      default: 'radio_script',
      label: 'Production format',
      description: 'What you\'re producing. Slice 9 covers the three text formats; audio + video assembly land in Slices 12 and 13.',
      options: [
        { value: 'radio_script', label: 'Radio script — broadcast-ready' },
        { value: 'podcast_outline', label: 'Podcast outline — solo / two-host / interview' },
        { value: 'video_brief', label: 'Video brief — shot list + VO + on-screen text' },
      ],
    },
  },
  outputs: {
    output: { type: 'json', description: 'Structured production output, format-specific shape.' },
    productionId: { type: 'string', description: 'Persisted producer_productions row id, used for editor review and downstream nodes.' },
  },
  route: '/api/producer/productions',
  async run(input, ctx) {
    const cfg = resolveConfig('producer', input);
    const { productionId, output, cost, durationMs } = await runProduction({
      title: input.title,
      sourceText: input.sourceText,
      format: cfg.format,
      archiveContext: input.archiveContext,
      context: { ...ctx, endpoint: ctx.endpoint || '/api/agents/producer' },
    });
    return {
      result: { output, productionId },
      cost,
      durationMs,
    };
  },
});
