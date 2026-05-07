// Audiogram renderer — turns an audio file + caption track into an MP4
// suitable for social posting. Uses ffmpeg's showwaves filter (no extra
// deps). Output is a square 1080x1080 by default (Twitter / IG-friendly).
//
// Layout:
//   ─────────────────────────────────────────
//   │ <newsroom name>                       │  (top strip, optional)
//   │                                       │
//   │     ::::::::::::::::::::::::::::      │  (waveform)
//   │     ::::::::::::::::::::::::::::      │
//   │                                       │
//   │  CAPTIONS WRAP HERE FROM SRT          │
//   │  (burned in via libass)               │
//   ─────────────────────────────────────────

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_W = 1080;
const DEFAULT_H = 1080;

/**
 * Render an audiogram MP4 from an existing audio file + an SRT subtitle file.
 *
 * @param {object} opts
 * @param {string} opts.absAudioPath  WAV or any ffmpeg-readable audio
 * @param {string} opts.absSrtPath    captions in SRT format
 * @param {string} opts.absOutPath    output .mp4 path
 * @param {string} [opts.title]       newsroom / show title shown across the top
 * @param {number} [opts.width=1080]
 * @param {number} [opts.height=1080]
 * @param {object} [opts.colours]
 * @param {string} [opts.colours.bg='#0b1220']
 * @param {string} [opts.colours.wave='#3aa0ff']
 * @param {string} [opts.colours.title='#ffffff']
 */
async function renderAudiogram(opts) {
  const {
    absAudioPath, absSrtPath, absOutPath,
    title = '',
    width = DEFAULT_W,
    height = DEFAULT_H,
  } = opts;
  const colours = {
    bg: '#0b1220',
    wave: '#3aa0ff',
    title: '#ffffff',
    ...(opts.colours || {}),
  };

  if (!fs.existsSync(absAudioPath)) throw new Error(`audiogram: missing audio at ${absAudioPath}`);
  fs.mkdirSync(path.dirname(absOutPath), { recursive: true });

  // Construct the filter graph.
  // Inputs: 0 = audio, 1 = colour background.
  // Outputs:
  //   - waveform via showwaves on audio, scaled, overlaid on top of bg
  //   - subtitles burned via the subtitles filter
  // ffmpeg's subtitles filter takes a path; we have to escape it for
  // filter syntax (replace ':' with '\:' on macOS or it won't parse).

  const escapedSrt = absSrtPath.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\'");

  // Build the title-bar drawtext. Skip the filter if no title.
  const titleFilter = title
    ? `,drawtext=text='${ffmpegEscapeText(title)}':fontcolor=${colours.title}:fontsize=${Math.round(width / 28)}:x=(w-text_w)/2:y=h*0.07:box=0`
    : '';

  // Subtitle styling via ASS overrides — pass through `force_style`.
  const subtitleStyle = [
    'FontName=Helvetica',
    `FontSize=${Math.round(width / 32)}`,
    'PrimaryColour=&H00FFFFFF',
    'OutlineColour=&H80000000',
    'BackColour=&H00000000',
    'BorderStyle=1',
    'Outline=2',
    'Shadow=0',
    'Alignment=2',
    'MarginV=' + Math.round(height * 0.08),
  ].join(',');

  // showwaves needs a fixed-size single-frame mode (because we scale and
  // overlay). It draws into an output the size of (width, ~height/3).
  const waveH = Math.round(height / 3);
  const filterComplex = [
    `[1:v]drawbox=x=0:y=0:w=${width}:h=${height}:color=${colours.bg}:t=fill[bg]`,
    `[0:a]showwaves=s=${width}x${waveH}:colors=${colours.wave}:mode=cline:rate=30,format=yuva420p[wave]`,
    // place the waveform vertically centred
    `[bg][wave]overlay=(W-w)/2:(H-h)/2[base]`,
    `[base]subtitles='${escapedSrt}':force_style='${subtitleStyle}'${titleFilter}[v]`,
  ].join(';');

  await runFfmpeg([
    '-y', '-hide_banner', '-loglevel', 'error',
    '-i', absAudioPath,
    '-f', 'lavfi', '-i', `color=c=${colours.bg}:s=${width}x${height}:r=30`,
    '-filter_complex', filterComplex,
    '-map', '[v]', '-map', '0:a',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '128k',
    '-shortest',
    absOutPath,
  ]);

  return statBundle(absOutPath);
}

function ffmpegEscapeText(s) {
  // ffmpeg drawtext text-escape: backslash specials, then wrap apostrophes
  return String(s)
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'");
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

function statBundle(absPath) {
  const stat = fs.statSync(absPath);
  const sha256 = crypto.createHash('sha256').update(fs.readFileSync(absPath)).digest('hex');
  return new Promise((resolve) => {
    const p = spawn('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', absPath]);
    let out = '';
    p.stdout.on('data', (b) => { out += b.toString(); });
    p.on('close', () => {
      const n = parseFloat(out.trim());
      resolve({
        absPath,
        bytes: stat.size,
        sha256,
        durationSeconds: Number.isFinite(n) ? Number(n.toFixed(3)) : null,
      });
    });
    p.on('error', () => resolve({ absPath, bytes: stat.size, sha256, durationSeconds: null }));
  });
}

module.exports = { renderAudiogram, DEFAULT_W, DEFAULT_H };
