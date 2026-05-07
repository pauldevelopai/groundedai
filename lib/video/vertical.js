// Vertical video renderer — turns a video_brief production's shot list
// into a 1080x1920 MP4. Each shot becomes one segment:
//   - background:    procedural gradient (visual placeholder until the
//                    studio team uploads real B-roll). Colour rotates per
//                    shot so segment boundaries are visually clear.
//   - on-screen text: burned in via drawtext, centred-bottom-third
//   - voiceover:      TTS via the existing fallback chain (lib/audio/tts)
//
// Shots are concatenated via the concat demuxer like assemble.js does for
// audio. No external dependencies beyond ffmpeg.

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const tts = require('../audio/tts');

const DEFAULT_W = 1080;
const DEFAULT_H = 1920;

// Gradient palette — each pair is two HEX colours that ffmpeg's gradients
// filter blends between. Rotates per shot for visual rhythm.
const GRADIENT_PALETTE = [
  ['#0b1220', '#1f3b66'],
  ['#0a4a3a', '#0a6363'],
  ['#5a3a99', '#a02b6f'],
  ['#7a5800', '#a02020'],
  ['#0044aa', '#3aa0ff'],
];

/**
 * Render a vertical-video MP4 from a video_brief.output.
 *
 * @param {object} opts
 * @param {object} opts.brief   the video_brief output JSON
 * @param {string} opts.absOutPath
 * @param {string} opts.workDir absolute path for per-shot intermediate files
 * @param {string} [opts.language='en']
 */
async function renderVertical({ brief, absOutPath, workDir, language = 'en' }) {
  if (!brief || !Array.isArray(brief.shots) || brief.shots.length === 0) {
    throw new Error('video_brief.shots is empty — nothing to render.');
  }
  fs.mkdirSync(workDir, { recursive: true });
  fs.mkdirSync(path.dirname(absOutPath), { recursive: true });

  const segmentLog = [];
  const segmentFiles = [];

  for (let i = 0; i < brief.shots.length; i++) {
    const shot = brief.shots[i] || {};
    const idx = i + 1;
    const tag = pad(idx, 2);
    const duration = positiveNumber(shot.duration_seconds, 4);
    const palette = GRADIENT_PALETTE[i % GRADIENT_PALETTE.length];

    // 1. Voice-over WAV (or silence if no VO).
    const voPath = path.join(workDir, `shot${tag}-vo.wav`);
    let ttsEngine = 'silence';
    if (shot.voiceover && String(shot.voiceover).trim()) {
      const r = await tts.synthesise(shot.voiceover, voPath, { language });
      ttsEngine = r.engine;
    } else {
      await synthSilence(voPath, duration);
    }
    // Pad/clip the VO to the shot's duration so audio + video stay in lockstep.
    const voFitted = path.join(workDir, `shot${tag}-vo-fit.wav`);
    await fitToDuration(voPath, voFitted, duration);

    // 2. Render this shot's video clip.
    const shotPath = path.join(workDir, `shot${tag}.mp4`);
    await renderShot({
      durationSeconds: duration,
      absVoPath: voFitted,
      absOutPath: shotPath,
      onScreenText: shot.on_screen_text || shot.visual || '',
      indexLabel: brief.format === 'vertical_short' || brief.format === 'horizontal_explainer'
        ? `${idx} / ${brief.shots.length}`
        : '',
      palette,
    });
    segmentFiles.push(shotPath);
    segmentLog.push({
      index: idx,
      duration,
      tts_engine: ttsEngine,
      visual: clip(shot.visual),
      on_screen_text: clip(shot.on_screen_text),
    });
  }

  // Concat all shots into the final MP4.
  const listFile = path.join(workDir, 'concat.txt');
  fs.writeFileSync(
    listFile,
    segmentFiles.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join('\n'),
  );
  await runFfmpeg([
    '-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'concat', '-safe', '0', '-i', listFile,
    '-c', 'copy', // shots are pre-encoded with matching params
    absOutPath,
  ]);

  // Cleanup intermediates.
  for (const f of segmentFiles) safeUnlink(f);
  safeUnlink(listFile);

  const stat = fs.statSync(absOutPath);
  const sha256 = crypto.createHash('sha256').update(fs.readFileSync(absOutPath)).digest('hex');
  const durationSeconds = await probeDuration(absOutPath);
  return {
    absPath: absOutPath,
    bytes: stat.size,
    sha256,
    durationSeconds,
    segmentLog,
    width: DEFAULT_W,
    height: DEFAULT_H,
  };
}

async function renderShot({ durationSeconds, absVoPath, absOutPath, onScreenText, indexLabel, palette }) {
  const w = DEFAULT_W, h = DEFAULT_H;
  const [c1, c2] = palette;

  // gradients filter renders a smooth animated gradient. We freeze it by
  // running for a short -t and then loop / extend? Simpler: use it for the
  // duration with a slow variation, then a subtle vignette via vignette filter.
  const textFilters = [];
  if (onScreenText && onScreenText.trim()) {
    textFilters.push(
      `drawtext=text='${ffmpegEscapeText(onScreenText)}':` +
      `fontcolor=white:fontsize=${Math.round(w / 18)}:` +
      `box=1:boxcolor=black@0.4:boxborderw=18:` +
      `x=(w-text_w)/2:y=h*0.55:` +
      `line_spacing=8`
    );
  }
  if (indexLabel) {
    textFilters.push(
      `drawtext=text='${ffmpegEscapeText(indexLabel)}':` +
      `fontcolor=white@0.6:fontsize=${Math.round(w / 36)}:` +
      `x=(w-text_w)/2:y=h*0.9`
    );
  }

  // Compose the filter chain: gradients → vignette → drawtexts.
  const videoFilter = [
    `gradients=size=${w}x${h}:c0=${hex(c1)}:c1=${hex(c2)}:duration=${durationSeconds}:speed=0.05`,
    `vignette`,
    ...textFilters,
  ].join(',');

  await runFfmpeg([
    '-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'lavfi', '-i', videoFilter,
    '-i', absVoPath,
    '-t', String(durationSeconds),
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '22', '-pix_fmt', 'yuv420p',
    '-r', '30',
    '-c:a', 'aac', '-b:a', '128k', '-ar', '44100',
    '-shortest',
    absOutPath,
  ]);
}

async function fitToDuration(srcPath, dstPath, durationSeconds) {
  // apad will add silence to short audio; -t will cap long audio.
  await runFfmpeg([
    '-y', '-hide_banner', '-loglevel', 'error',
    '-i', srcPath,
    '-af', 'apad',
    '-t', String(durationSeconds),
    '-ar', '44100', '-ac', '2',
    dstPath,
  ]);
}

async function synthSilence(absOutPath, durationSeconds) {
  await runFfmpeg([
    '-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'lavfi', '-i', 'anullsrc=channel_layout=mono:sample_rate=22050',
    '-t', String(durationSeconds),
    absOutPath,
  ]);
}

function probeDuration(absPath) {
  return new Promise((resolve) => {
    const p = spawn('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', absPath]);
    let out = '';
    p.stdout.on('data', (b) => { out += b.toString(); });
    p.on('close', () => {
      const n = parseFloat(out.trim());
      resolve(Number.isFinite(n) ? Number(n.toFixed(3)) : null);
    });
    p.on('error', () => resolve(null));
  });
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const p = spawn('ffmpeg', args);
    let err = '';
    p.stderr.on('data', (b) => { err += b.toString(); });
    p.on('error', reject);
    p.on('close', (code) => code === 0 ? resolve() : reject(new Error(`ffmpeg failed (${code}): ${err.trim()}`)));
  });
}

function ffmpegEscapeText(s) {
  return String(s)
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
    .slice(0, 280);
}
function pad(n, w) { return String(n).padStart(w, '0'); }
function clip(s, max = 140) { if (!s) return null; return s.length > max ? s.slice(0, max - 1) + '…' : s; }
function positiveNumber(v, fallback) { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : fallback; }
function safeUnlink(p) { try { fs.unlinkSync(p); } catch { /* ignore */ } }
function hex(c) { return c.startsWith('#') ? '0x' + c.slice(1) : c; }

module.exports = { renderVertical, DEFAULT_W, DEFAULT_H };
