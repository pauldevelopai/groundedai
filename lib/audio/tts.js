// Text-to-speech with a fallback chain. Self-hostable / fully-free tools
// only — Grounded never sends production audio out to a paid TTS API.
//
// Detection order at runtime (first one available wins per-process):
//   1. Piper            — best quality, native binary + downloadable .onnx voice
//                          (https://github.com/rhasspy/piper). Editor-grade.
//   2. espeak-ng        — robotic but fast; useful for development cache misses.
//   3. macOS `say`      — built-in on dev machines; reasonable quality.
//   4. silence stub     — last-resort placeholder so the pipeline still
//                          produces an output file with the correct duration.
//                          Marked clearly in metadata.
//
// All four return a 22050 Hz mono WAV file at the path requested. The
// downstream assembler (assemble.js) re-samples / concatenates with ffmpeg.

const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const SAMPLE_RATE = 22050;

let detectionCache = null;

function detectEngines() {
  if (detectionCache) return detectionCache;
  detectionCache = {
    piper: which('piper'),
    espeak: which('espeak-ng'),
    say: process.platform === 'darwin' && which('say'),
    ffmpeg: which('ffmpeg'),
  };
  return detectionCache;
}

function which(cmd) {
  const r = spawnSync('which', [cmd], { stdio: ['ignore', 'pipe', 'ignore'] });
  if (r.status !== 0) return null;
  const out = (r.stdout || '').toString().trim();
  return out || null;
}

/**
 * Synthesise `text` into a WAV file at `absOutPath`.
 * Returns { engine, durationSeconds, bytes } once written.
 *
 * @param {string} text
 * @param {string} absOutPath  must end in .wav
 * @param {object} [opts]
 * @param {string} [opts.voice]    engine-specific voice id (Piper voice file path; espeak language; macOS voice name)
 * @param {string} [opts.language='en']
 */
async function synthesise(text, absOutPath, opts = {}) {
  if (!absOutPath.endsWith('.wav')) {
    throw new Error('TTS output must be a .wav path');
  }
  fs.mkdirSync(path.dirname(absOutPath), { recursive: true });
  const engines = detectEngines();
  if (!engines.ffmpeg) throw new Error('ffmpeg is required for TTS pipelines (system dependency).');

  if (engines.piper) {
    return synthesiseWithPiper(text, absOutPath, opts);
  }
  if (engines.espeak) {
    return synthesiseWithEspeak(text, absOutPath, opts);
  }
  if (engines.say) {
    return synthesiseWithMacSay(text, absOutPath, opts);
  }
  return synthesiseSilenceStub(text, absOutPath);
}

function synthesiseWithPiper(text, absOutPath, opts) {
  return new Promise((resolve, reject) => {
    const args = ['--output_file', absOutPath];
    if (opts.voice) args.push('--model', opts.voice);
    const p = spawn('piper', args, { stdio: ['pipe', 'inherit', 'pipe'] });
    let err = '';
    p.stderr?.on('data', (b) => { err += b.toString(); });
    p.on('error', reject);
    p.on('close', (code) => {
      if (code !== 0) return reject(new Error(`piper failed (${code}): ${err.trim()}`));
      finalise(absOutPath, 'piper').then(resolve, reject);
    });
    p.stdin.end(text);
  });
}

function synthesiseWithEspeak(text, absOutPath, opts) {
  return new Promise((resolve, reject) => {
    const args = ['-w', absOutPath];
    if (opts.language) args.push('-v', opts.language);
    args.push(text);
    const p = spawn('espeak-ng', args, { stdio: ['ignore', 'inherit', 'pipe'] });
    let err = '';
    p.stderr?.on('data', (b) => { err += b.toString(); });
    p.on('error', reject);
    p.on('close', (code) => {
      if (code !== 0) return reject(new Error(`espeak-ng failed (${code}): ${err.trim()}`));
      finalise(absOutPath, 'espeak-ng').then(resolve, reject);
    });
  });
}

async function synthesiseWithMacSay(text, absOutPath, opts) {
  // macOS `say` writes AIFF natively — pipe it through ffmpeg to .wav at our sample rate.
  const tmp = absOutPath.replace(/\.wav$/, '.aiff');
  await new Promise((resolve, reject) => {
    const args = ['-o', tmp];
    if (opts.voice) args.push('-v', opts.voice);
    args.push('--', text);
    const p = spawn('say', args);
    let err = '';
    p.stderr?.on('data', (b) => { err += b.toString(); });
    p.on('error', reject);
    p.on('close', (code) => code === 0 ? resolve() : reject(new Error(`say failed (${code}): ${err.trim()}`)));
  });
  await ffmpegConvert(tmp, absOutPath);
  fs.unlinkSync(tmp);
  return finalise(absOutPath, 'macos_say');
}

async function synthesiseSilenceStub(text, absOutPath) {
  // Reserve 1 second per ~14 spoken characters (≈ 145 wpm), min 1 s.
  const seconds = Math.max(1, Math.round(text.length / 14));
  await ffmpegSilence(absOutPath, seconds);
  return finalise(absOutPath, 'silence_stub');
}

function ffmpegSilence(absOutPath, seconds) {
  return new Promise((resolve, reject) => {
    const p = spawn('ffmpeg', [
      '-y', '-hide_banner', '-loglevel', 'error',
      '-f', 'lavfi', '-i', `anullsrc=channel_layout=mono:sample_rate=${SAMPLE_RATE}`,
      '-t', String(seconds),
      absOutPath,
    ]);
    let err = '';
    p.stderr.on('data', (b) => { err += b.toString(); });
    p.on('close', (code) => code === 0 ? resolve() : reject(new Error(`ffmpeg silence failed: ${err.trim()}`)));
  });
}

function ffmpegConvert(srcPath, dstPath) {
  return new Promise((resolve, reject) => {
    const p = spawn('ffmpeg', [
      '-y', '-hide_banner', '-loglevel', 'error',
      '-i', srcPath,
      '-ar', String(SAMPLE_RATE), '-ac', '1',
      dstPath,
    ]);
    let err = '';
    p.stderr.on('data', (b) => { err += b.toString(); });
    p.on('close', (code) => code === 0 ? resolve() : reject(new Error(`ffmpeg convert failed: ${err.trim()}`)));
  });
}

async function finalise(absOutPath, engine) {
  const stat = fs.statSync(absOutPath);
  const durationSeconds = await probeDuration(absOutPath);
  return { engine, bytes: stat.size, durationSeconds, sampleRate: SAMPLE_RATE };
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

module.exports = { synthesise, detectEngines, SAMPLE_RATE };
