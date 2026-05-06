// Stitch a radio_script JSON into a single mono WAV.
//
// Input shape (from Producer agent slice 9):
//   {
//     intro: "<host words + sting cue>",
//     segments: [
//       { type: 'host', text, duration_seconds? },
//       { type: 'actuality', cue_in, cue_out, duration_seconds, description },
//       { type: 'music_sting', duration_seconds, description }
//     ],
//     outro: "<sign-off lines>"
//   }
//
// Pipeline:
//   1. For each segment, generate a per-segment .wav (TTS for host/intro/outro,
//      procedural sting for music_sting, procedural actuality bed for actuality).
//   2. ffmpeg concat-demuxer the per-segment wavs into one final wav.
//   3. Persist a producer_assets row pointing at the final file.
//
// Returns { absPath, relPath, durationSeconds, bytes, sha256, segmentLog }.
// segmentLog is a per-segment audit so the editor knows which engine
// produced each chunk (Piper vs espeak-ng vs silence stub vs procedural).

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const crypto = require('crypto');

const tts = require('./tts');
const sting = require('./sting');

async function assembleRadioScript(script, opts = {}) {
  const productionId = opts.productionId || crypto.randomUUID();
  const language = opts.language || 'en';
  const cwd = process.cwd();
  const workDir = path.join(cwd, 'storage', 'producer', `tmp-${productionId}`);
  const finalRel = path.join('storage', 'producer', `${productionId}.wav`);
  const finalAbs = path.join(cwd, finalRel);
  fs.mkdirSync(workDir, { recursive: true });
  fs.mkdirSync(path.dirname(finalAbs), { recursive: true });

  const segmentFiles = [];
  const segmentLog = [];

  // Intro narration
  if (script.intro && typeof script.intro === 'string') {
    const intro = path.join(workDir, '00-intro.wav');
    const r = await tts.synthesise(script.intro, intro, { language });
    segmentFiles.push(intro);
    segmentLog.push({ kind: 'intro', engine: r.engine, duration: r.durationSeconds, text: clip(script.intro) });
  }

  const list = Array.isArray(script.segments) ? script.segments : [];
  for (let i = 0; i < list.length; i++) {
    const seg = list[i] || {};
    const file = path.join(workDir, `${pad(i + 1, 2)}-${seg.type || 'unknown'}.wav`);
    if (seg.type === 'host' && typeof seg.text === 'string' && seg.text.trim()) {
      const r = await tts.synthesise(seg.text, file, { language });
      segmentFiles.push(file);
      segmentLog.push({ kind: 'host', speaker: seg.speaker || null, engine: r.engine, duration: r.durationSeconds, text: clip(seg.text) });
    } else if (seg.type === 'actuality') {
      const dur = positiveNumber(seg.duration_seconds, 8);
      await sting.actuality(file, dur, seg.description || 'actuality');
      segmentFiles.push(file);
      segmentLog.push({ kind: 'actuality', engine: 'procedural', duration: dur, description: clip(seg.description) });
    } else if (seg.type === 'music_sting') {
      const dur = positiveNumber(seg.duration_seconds, 2);
      await sting.sting(file, dur);
      segmentFiles.push(file);
      segmentLog.push({ kind: 'music_sting', engine: 'procedural', duration: dur, description: clip(seg.description) });
    } else {
      // Unknown segment type — drop a half-second silence so the run continues.
      await sting.silence(file, 0.5);
      segmentFiles.push(file);
      segmentLog.push({ kind: 'unknown', engine: 'procedural_silence', duration: 0.5, raw: clip(JSON.stringify(seg)) });
    }
  }

  // Outro
  if (script.outro && typeof script.outro === 'string') {
    const outro = path.join(workDir, '99-outro.wav');
    const r = await tts.synthesise(script.outro, outro, { language });
    segmentFiles.push(outro);
    segmentLog.push({ kind: 'outro', engine: r.engine, duration: r.durationSeconds, text: clip(script.outro) });
  }

  if (segmentFiles.length === 0) {
    throw new Error('Script produced no audio segments to assemble.');
  }

  // ffmpeg concat demuxer needs a list file. Quote each path safely.
  const listPath = path.join(workDir, 'concat.txt');
  fs.writeFileSync(
    listPath,
    segmentFiles.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join('\n'),
  );

  await runFfmpeg([
    '-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'concat', '-safe', '0', '-i', listPath,
    '-ar', String(tts.SAMPLE_RATE), '-ac', '1',
    finalAbs,
  ]);

  // Cleanup work dir but keep the final asset.
  for (const f of segmentFiles) safeUnlink(f);
  safeUnlink(listPath);
  try { fs.rmdirSync(workDir); } catch { /* dir not empty if user inspected it */ }

  const stat = fs.statSync(finalAbs);
  const sha256 = sha256File(finalAbs);
  const durationSeconds = await probeDuration(finalAbs);

  return {
    absPath: finalAbs,
    relPath: finalRel,
    bytes: stat.size,
    sha256,
    durationSeconds,
    segmentLog,
    sampleRate: tts.SAMPLE_RATE,
  };
}

function pad(n, w) { return String(n).padStart(w, '0'); }
function clip(s, max = 140) { if (!s) return null; return s.length > max ? s.slice(0, max - 1) + '…' : s; }
function positiveNumber(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
function safeUnlink(p) { try { fs.unlinkSync(p); } catch { /* ignore */ } }
function sha256File(p) {
  const buf = fs.readFileSync(p);
  return crypto.createHash('sha256').update(buf).digest('hex');
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

module.exports = { assembleRadioScript };
