// Procedural music stings + actuality placeholders, generated on the fly
// via ffmpeg's lavfi sources. No external sample library required, no
// licensing issues, no extra binary deps. The studio team replaces these
// with real tape later — the placeholders just give the editor a hearable
// structure of the piece.
//
// Three primitives:
//   sting     — short major-third sine pair with fade in/out (bumper-ish)
//   actuality — silence with low-level pink noise + a 0.4s "tape head"
//               click at the start, so it's obvious WHERE the actuality
//               goes when the editor scrubs through.
//   silence   — pure silence at the right sample rate.

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const SAMPLE_RATE = 22050;

async function sting(absOutPath, durationSeconds = 1.5) {
  fs.mkdirSync(path.dirname(absOutPath), { recursive: true });
  return runFfmpeg([
    '-y', '-hide_banner', '-loglevel', 'error',
    // Two sine tones (C5 + E5) in a stereo mix, then mixed to mono.
    '-f', 'lavfi', '-i', `sine=frequency=523:duration=${durationSeconds}:sample_rate=${SAMPLE_RATE}`,
    '-f', 'lavfi', '-i', `sine=frequency=659:duration=${durationSeconds}:sample_rate=${SAMPLE_RATE}`,
    '-filter_complex',
      `[0]volume=0.25,afade=t=in:st=0:d=0.15,afade=t=out:st=${(durationSeconds - 0.25).toFixed(3)}:d=0.25[a];` +
      `[1]volume=0.25,afade=t=in:st=0:d=0.15,afade=t=out:st=${(durationSeconds - 0.25).toFixed(3)}:d=0.25[b];` +
      `[a][b]amix=inputs=2:normalize=0[mix]`,
    '-map', '[mix]',
    '-ac', '1', '-ar', String(SAMPLE_RATE),
    absOutPath,
  ]);
}

async function actuality(absOutPath, durationSeconds, label) {
  fs.mkdirSync(path.dirname(absOutPath), { recursive: true });
  // Pink noise bed at low volume — tape hiss feel.
  return runFfmpeg([
    '-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'lavfi', '-i', `anoisesrc=color=pink:duration=${durationSeconds}:sample_rate=${SAMPLE_RATE}`,
    '-f', 'lavfi', '-i', `sine=frequency=2000:duration=0.05:sample_rate=${SAMPLE_RATE}`,
    '-filter_complex',
      `[0]volume=0.03[hiss];` +
      `[1]volume=0.4[click];` +
      `[click][hiss]concat=n=2:v=0:a=1[a]`,
    '-map', '[a]',
    '-ac', '1', '-ar', String(SAMPLE_RATE),
    '-t', String(durationSeconds),
    absOutPath,
  ]);
}

async function silence(absOutPath, durationSeconds) {
  fs.mkdirSync(path.dirname(absOutPath), { recursive: true });
  return runFfmpeg([
    '-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'lavfi', '-i', `anullsrc=channel_layout=mono:sample_rate=${SAMPLE_RATE}`,
    '-t', String(durationSeconds),
    absOutPath,
  ]);
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

module.exports = { sting, actuality, silence, SAMPLE_RATE };
