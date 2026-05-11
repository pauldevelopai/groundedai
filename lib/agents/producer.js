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
const { assembleRadioScript } = require('../audio/assemble');
const { detectEngines } = require('../audio/tts');
const { renderAudiogram } = require('../video/audiogram');
const { renderVertical } = require('../video/vertical');
const { srtFromTimedSegments, timedSegmentsFromRadioScript } = require('../video/captions');

const FORMAT_LABELS = {
  radio_script: 'Radio script',
  podcast_outline: 'Podcast outline',
  video_brief: 'Video brief',
  audio_assembly: 'Audio assembly (Slice 12)',
  vertical_video: 'Vertical video (Slice 13)',
  audiogram: 'Audiogram (Slice 13)',
};

const TEXT_FORMATS = new Set(['radio_script', 'podcast_outline', 'video_brief']);
const ASSEMBLY_FORMATS = new Set(['audio_assembly', 'audiogram', 'vertical_video']);

const BASE_SYSTEM = `You are Grounded's Audio & Video Producer agent — a finished-product composer for African newsrooms.

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

/**
 * Assemble a previously-generated radio_script production into a single
 * mono WAV file. Inserts a producer_productions row of format
 * 'audio_assembly' linked back to the source script, runs the local-only
 * audio pipeline, and persists a producer_assets row for the output file.
 *
 * No external paid service involved — Whisper + Piper + ffmpeg only.
 *
 * @param {object} opts
 * @param {string} opts.sourceProductionId   id of the radio_script production to assemble
 * @param {string} [opts.title]
 * @param {string} [opts.language='en']
 * @param {{ newsroomId: string, userId?: string, endpoint?: string }} opts.context
 */
async function runAudioAssembly({ sourceProductionId, title, language, context }) {
  if (!sourceProductionId) throw new Error('sourceProductionId is required.');
  const srcRes = await pool.query(
    `SELECT id, newsroom_id, format, output, title FROM producer_productions WHERE id = $1`,
    [sourceProductionId]
  );
  const src = srcRes.rows[0];
  if (!src || src.newsroom_id !== context.newsroomId) {
    throw new Error('Source production not found in this newsroom.');
  }
  if (src.format !== 'radio_script') {
    throw new Error(`Audio assembly currently supports radio_script only — source is "${src.format}".`);
  }
  const script = src.output;
  if (!script || typeof script !== 'object') {
    throw new Error('Source production has no script output yet.');
  }

  const insert = await pool.query(
    `INSERT INTO producer_productions
       (newsroom_id, created_by, title, format, source_text, status)
     VALUES ($1, $2, $3, 'audio_assembly', $4, 'pending')
     RETURNING id`,
    [
      context.newsroomId,
      context.userId || null,
      (title || `Audio assembly — ${src.title}`).slice(0, 200),
      `audio_assembly of ${sourceProductionId}`,
    ]
  );
  const productionId = insert.rows[0].id;

  const startedAt = Date.now();
  const engines = detectEngines();
  try {
    const result = await assembleRadioScript(script, {
      productionId,
      language: language || 'en',
    });
    const durationMs = Date.now() - startedAt;

    // Persist the asset row.
    const assetRes = await pool.query(
      `INSERT INTO producer_assets
         (newsroom_id, production_id, created_by, kind, format, storage_path,
          bytes, duration_seconds, sha256, metadata)
       VALUES ($1, $2, $3, 'audio', 'wav', $4, $5, $6, $7, $8::jsonb)
       RETURNING id`,
      [
        context.newsroomId,
        productionId,
        context.userId || null,
        result.relPath,
        result.bytes,
        result.durationSeconds,
        result.sha256,
        JSON.stringify({
          source_production_id: sourceProductionId,
          sample_rate: result.sampleRate,
          tts_engines_available: {
            piper: !!engines.piper,
            espeak_ng: !!engines.espeak,
            macos_say: !!engines.say,
          },
          segment_log: result.segmentLog,
        }),
      ]
    );
    const assetId = assetRes.rows[0].id;

    await pool.query(
      `UPDATE producer_productions
          SET output = $2,
              duration_estimate_seconds = $3,
              duration_ms = $4,
              status = 'generated',
              updated_at = NOW()
        WHERE id = $1`,
      [
        productionId,
        JSON.stringify({
          asset_id: assetId,
          format: 'wav',
          duration_seconds: result.durationSeconds,
          source_production_id: sourceProductionId,
          segment_log: result.segmentLog,
        }),
        Math.round(result.durationSeconds || 0),
        durationMs,
      ]
    );

    return {
      productionId,
      assetId,
      durationMs,
      durationSeconds: result.durationSeconds,
      bytes: result.bytes,
      segmentLog: result.segmentLog,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await pool.query(
      `UPDATE producer_productions SET status = 'failed', error = $2, updated_at = NOW() WHERE id = $1`,
      [productionId, message]
    );
    throw err;
  }
}

/**
 * Render an audiogram (waveform-over-still + burned captions) MP4 from
 * either:
 *   - a producer_assets row (sourceAssetId), in which case captions are
 *     re-derived by transcribing that audio file with Whisper, OR
 *   - a radio_script production whose audio_assembly run has already happened
 *     (sourceProductionId), in which case captions come from the segment_log.
 *
 * Either way we produce a new producer_productions row of format='audiogram',
 * a producer_assets row for the MP4, and link them.
 */
async function runAudiogram({
  sourceProductionId, sourceAssetId, title, captionFromTranscript,
  context,
}) {
  const path = require('path');
  const fs = require('fs');
  const { transcribeFile } = require('../audio/stt');

  let audioAssetRow = null;
  let scriptForCaptions = null;
  let segmentLogForCaptions = null;
  let derivedTitle = title;

  if (sourceAssetId) {
    const r = await pool.query(
      `SELECT id, newsroom_id, kind, format, storage_path, production_id, metadata
         FROM producer_assets WHERE id = $1`,
      [sourceAssetId]
    );
    audioAssetRow = r.rows[0];
    if (!audioAssetRow || audioAssetRow.newsroom_id !== context.newsroomId) {
      throw new Error('Audio asset not found in this newsroom.');
    }
    if (audioAssetRow.kind !== 'audio') {
      throw new Error(`Audiogram requires an audio asset; received "${audioAssetRow.kind}".`);
    }
  } else if (sourceProductionId) {
    // Find an audio asset belonging to this production (assembly already run).
    const r = await pool.query(
      `SELECT pa.id, pa.newsroom_id, pa.kind, pa.format, pa.storage_path, pa.production_id, pa.metadata,
              pp.format AS prod_format, pp.title AS prod_title, pp.output AS prod_output
         FROM producer_assets pa
         JOIN producer_productions pp ON pp.id = pa.production_id
        WHERE (pa.production_id = $1 OR (pa.metadata->>'source_production_id') = $2)
          AND pa.newsroom_id = $3 AND pa.kind = 'audio'
        ORDER BY pa.created_at DESC LIMIT 1`,
      [sourceProductionId, sourceProductionId, context.newsroomId]
    );
    audioAssetRow = r.rows[0];
    if (!audioAssetRow) {
      throw new Error('No audio asset for that production. Generate audio first via "audio_assembly".');
    }
    derivedTitle = derivedTitle || `Audiogram — ${audioAssetRow.prod_title}`;
    // Pull source script + segment_log for caption use.
    if (audioAssetRow.metadata && Array.isArray(audioAssetRow.metadata.segment_log)) {
      segmentLogForCaptions = audioAssetRow.metadata.segment_log;
    }
    const sourceScriptId = audioAssetRow.metadata?.source_production_id;
    if (sourceScriptId) {
      const sr = await pool.query(`SELECT output FROM producer_productions WHERE id = $1`, [sourceScriptId]);
      scriptForCaptions = sr.rows[0]?.output || null;
    }
  } else {
    throw new Error('runAudiogram requires sourceProductionId or sourceAssetId.');
  }

  // Insert pending production row up front.
  const insert = await pool.query(
    `INSERT INTO producer_productions
       (newsroom_id, created_by, title, format, source_text, status)
     VALUES ($1, $2, $3, 'audiogram', $4, 'pending')
     RETURNING id`,
    [
      context.newsroomId,
      context.userId || null,
      (derivedTitle || `Audiogram — ${new Date().toLocaleDateString()}`).slice(0, 200),
      `audiogram of asset ${audioAssetRow.id}`,
    ]
  );
  const productionId = insert.rows[0].id;

  const startedAt = Date.now();
  try {
    const root = process.cwd();
    const absAudio = path.resolve(root, audioAssetRow.storage_path);
    if (!fs.existsSync(absAudio)) throw new Error(`Source audio file missing on disk: ${audioAssetRow.storage_path}`);

    // Build captions. Prefer the segment_log (already aligned to the
    // assembled audio); fall back to a fresh Whisper pass when caller asks
    // for it or when no segment_log is available.
    const workDir = path.join(root, 'storage', 'producer', `tmp-${productionId}`);
    fs.mkdirSync(workDir, { recursive: true });
    const srtPath = path.join(workDir, 'captions.srt');

    let captionSource;
    if (captionFromTranscript || (!segmentLogForCaptions && !scriptForCaptions)) {
      const t = await transcribeFile(absAudio, { language: 'en' });
      srtFromTimedSegments(t.segments, srtPath);
      captionSource = 'whisper';
    } else {
      const timed = timedSegmentsFromRadioScript(scriptForCaptions || {}, segmentLogForCaptions);
      srtFromTimedSegments(timed, srtPath);
      captionSource = segmentLogForCaptions ? 'segment_log' : 'script';
    }

    const finalRel = path.join('storage', 'producer', `${productionId}.mp4`);
    const finalAbs = path.join(root, finalRel);
    const r = await renderAudiogram({
      absAudioPath: absAudio,
      absSrtPath: srtPath,
      absOutPath: finalAbs,
      title: '',
    });
    const durationMs = Date.now() - startedAt;

    // Asset row.
    const assetRes = await pool.query(
      `INSERT INTO producer_assets
         (newsroom_id, production_id, created_by, kind, format, storage_path,
          bytes, duration_seconds, sha256, metadata)
       VALUES ($1, $2, $3, 'video', 'mp4', $4, $5, $6, $7, $8::jsonb)
       RETURNING id`,
      [
        context.newsroomId,
        productionId,
        context.userId || null,
        finalRel,
        r.bytes,
        r.durationSeconds,
        r.sha256,
        JSON.stringify({
          source_audio_asset_id: audioAssetRow.id,
          source_production_id: sourceProductionId || audioAssetRow.production_id,
          caption_source: captionSource,
          width: 1080, height: 1080,
        }),
      ]
    );
    const assetId = assetRes.rows[0].id;

    await pool.query(
      `UPDATE producer_productions
          SET output = $2, duration_estimate_seconds = $3, duration_ms = $4,
              status = 'generated', updated_at = NOW()
        WHERE id = $1`,
      [
        productionId,
        JSON.stringify({
          asset_id: assetId,
          format: 'mp4',
          duration_seconds: r.durationSeconds,
          source_audio_asset_id: audioAssetRow.id,
          caption_source: captionSource,
        }),
        Math.round(r.durationSeconds || 0),
        durationMs,
      ]
    );

    // Cleanup intermediates (keep the SRT for inspection if anyone wants it).
    try { fs.unlinkSync(srtPath); } catch {}
    try { fs.rmdirSync(workDir); } catch {}

    return { productionId, assetId, durationMs, durationSeconds: r.durationSeconds, bytes: r.bytes, captionSource };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await pool.query(
      `UPDATE producer_productions SET status = 'failed', error = $2, updated_at = NOW() WHERE id = $1`,
      [productionId, message]
    );
    throw err;
  }
}

/**
 * Render a vertical-video MP4 from an existing video_brief production.
 * Procedural backgrounds + on-screen text + TTS voice-over, no real B-roll
 * (until we add an upload UI in a later slice).
 */
async function runVerticalVideo({ sourceProductionId, title, language, context }) {
  const path = require('path');
  const fs = require('fs');

  const r = await pool.query(
    `SELECT id, newsroom_id, format, output, title FROM producer_productions WHERE id = $1`,
    [sourceProductionId]
  );
  const src = r.rows[0];
  if (!src || src.newsroom_id !== context.newsroomId) {
    throw new Error('Source production not found in this newsroom.');
  }
  if (src.format !== 'video_brief') {
    throw new Error(`vertical_video requires a video_brief source — got "${src.format}".`);
  }
  const brief = src.output;
  if (!brief || !Array.isArray(brief.shots) || brief.shots.length === 0) {
    throw new Error('Source video_brief has no shots to render.');
  }

  const insert = await pool.query(
    `INSERT INTO producer_productions
       (newsroom_id, created_by, title, format, source_text, status)
     VALUES ($1, $2, $3, 'vertical_video', $4, 'pending')
     RETURNING id`,
    [
      context.newsroomId,
      context.userId || null,
      (title || `Vertical video — ${src.title}`).slice(0, 200),
      `vertical_video of ${sourceProductionId}`,
    ]
  );
  const productionId = insert.rows[0].id;

  const startedAt = Date.now();
  try {
    const root = process.cwd();
    const finalRel = path.join('storage', 'producer', `${productionId}.mp4`);
    const finalAbs = path.join(root, finalRel);
    const workDir = path.join(root, 'storage', 'producer', `tmp-${productionId}`);
    const result = await renderVertical({
      brief,
      absOutPath: finalAbs,
      workDir,
      language: language || 'en',
    });
    const durationMs = Date.now() - startedAt;

    const assetRes = await pool.query(
      `INSERT INTO producer_assets
         (newsroom_id, production_id, created_by, kind, format, storage_path,
          bytes, duration_seconds, sha256, metadata)
       VALUES ($1, $2, $3, 'video', 'mp4', $4, $5, $6, $7, $8::jsonb)
       RETURNING id`,
      [
        context.newsroomId,
        productionId,
        context.userId || null,
        finalRel,
        result.bytes,
        result.durationSeconds,
        result.sha256,
        JSON.stringify({
          source_production_id: sourceProductionId,
          width: result.width,
          height: result.height,
          segment_log: result.segmentLog,
        }),
      ]
    );
    const assetId = assetRes.rows[0].id;

    await pool.query(
      `UPDATE producer_productions
          SET output = $2, duration_estimate_seconds = $3, duration_ms = $4,
              status = 'generated', updated_at = NOW()
        WHERE id = $1`,
      [
        productionId,
        JSON.stringify({
          asset_id: assetId,
          format: 'mp4',
          duration_seconds: result.durationSeconds,
          source_production_id: sourceProductionId,
          segment_log: result.segmentLog,
        }),
        Math.round(result.durationSeconds || 0),
        durationMs,
      ]
    );

    // Cleanup work dir
    try { for (const f of fs.readdirSync(workDir)) fs.unlinkSync(path.join(workDir, f)); fs.rmdirSync(workDir); } catch {}

    return {
      productionId, assetId, durationMs,
      durationSeconds: result.durationSeconds, bytes: result.bytes,
      segmentLog: result.segmentLog,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await pool.query(
      `UPDATE producer_productions SET status = 'failed', error = $2, updated_at = NOW() WHERE id = $1`,
      [productionId, message]
    );
    throw err;
  }
}

module.exports = { runProduction, runAudioAssembly, runAudiogram, runVerticalVideo, TEXT_FORMATS, ASSEMBLY_FORMATS, FORMAT_LABELS };

// ─── Agent registry entry ──────────────────────────────────────────────────
const { register, resolveConfig } = require('./registry');
register({
  slug: 'producer',
  name: 'Audio & Video Producer',
  icon: '🎬',
  description: 'Builds the finished product across formats: radio scripts, podcast outlines, video briefs, audio assembly, vertical video. In video, pulls archive and stock footage together, auto-captions for the target platform, and outputs an editable timeline plus a ready-to-upload MP4. In audio, delivers podcast-quality output — solo, two-host, or interview-style, with a sound design layer — sized for podcast platforms, WhatsApp voice notes, and audiograms. All rendering stays on-machine — no third-party services.',
  triggers: ['produce', 'radio script', 'podcast', 'video brief', 'short form', 'audio', 'assemble'],
  inputs: {
    sourceText: {
      type: 'longtext',
      label: 'Source article',
      description: 'For text formats: the article, brief, or transcript the production is built from. Not used by audio_assembly.',
    },
    archiveContext: {
      type: 'longtext',
      label: 'Past coverage from your archive',
      description: 'Optional. Wire an Archivist node into this — the Audio & Video Producer weaves the matched passages into text productions as B-roll, archival quotes, or context.',
    },
    title: {
      type: 'string',
      label: 'Production title',
      description: 'Optional. Defaults to "<format> — <today\'s date>".',
    },
    sourceProductionId: {
      type: 'string',
      label: 'Source production id',
      description: 'For audio_assembly, audiogram, and vertical_video. id of the upstream radio_script / video_brief / radio_script-with-audio production this output is built from.',
    },
    sourceAssetId: {
      type: 'string',
      label: 'Source audio asset id',
      description: 'Audiogram only. Direct reference to a producer_assets row when you want to use a specific audio file.',
    },
  },
  config: {
    format: {
      type: 'select',
      default: 'radio_script',
      label: 'Production format',
      description: 'What you\'re producing. Audio assembly turns an existing radio_script production into a WAV using fully-local TTS + procedural stings.',
      options: [
        { value: 'radio_script', label: 'Radio script — broadcast-ready text' },
        { value: 'podcast_outline', label: 'Podcast outline — solo / two-host / interview' },
        { value: 'video_brief', label: 'Video brief — shot list + VO + on-screen text' },
        { value: 'audio_assembly', label: 'Audio assembly — assemble a radio script into a WAV (local TTS)' },
        { value: 'audiogram', label: 'Audiogram — MP4 waveform + burned captions for social' },
        { value: 'vertical_video', label: 'Vertical video — render a video brief into a 1080×1920 MP4' },
      ],
    },
    language: {
      type: 'string',
      default: 'en',
      label: 'TTS language (audio_assembly)',
      description: 'ISO code passed to Piper / espeak-ng / macOS say. English by default. Voice quality varies by what is installed locally.',
      placeholder: 'en',
    },
  },
  outputs: {
    output: { type: 'json', description: 'Structured production output. For audio_assembly, contains asset_id and segment log.' },
    productionId: { type: 'string', description: 'Persisted producer_productions row id, used for editor review and downstream nodes.' },
  },
  route: '/api/producer/productions',
  async run(input, ctx) {
    const cfg = resolveConfig('producer', input);
    if (cfg.format === 'audio_assembly') {
      const { productionId, assetId, durationMs, durationSeconds, segmentLog } = await runAudioAssembly({
        sourceProductionId: input.sourceProductionId,
        title: input.title,
        language: cfg.language,
        context: { ...ctx, endpoint: ctx.endpoint || '/api/agents/producer' },
      });
      return {
        result: { output: { asset_id: assetId, duration_seconds: durationSeconds, segment_log: segmentLog }, productionId },
        cost: null,
        durationMs,
      };
    }
    if (cfg.format === 'audiogram') {
      const { productionId, assetId, durationMs, durationSeconds } = await runAudiogram({
        sourceProductionId: input.sourceProductionId,
        sourceAssetId: input.sourceAssetId,
        title: input.title,
        captionFromTranscript: !!input.captionFromTranscript,
        context: { ...ctx, endpoint: ctx.endpoint || '/api/agents/producer' },
      });
      return {
        result: { output: { asset_id: assetId, duration_seconds: durationSeconds }, productionId },
        cost: null,
        durationMs,
      };
    }
    if (cfg.format === 'vertical_video') {
      const { productionId, assetId, durationMs, durationSeconds, segmentLog } = await runVerticalVideo({
        sourceProductionId: input.sourceProductionId,
        title: input.title,
        language: cfg.language,
        context: { ...ctx, endpoint: ctx.endpoint || '/api/agents/producer' },
      });
      return {
        result: { output: { asset_id: assetId, duration_seconds: durationSeconds, segment_log: segmentLog }, productionId },
        cost: null,
        durationMs,
      };
    }
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
