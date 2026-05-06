// Speech-to-text via Xenova/whisper-base (Transformers.js, in-process).
//
// First invocation downloads ~150 MB of quantized ONNX weights into the
// HuggingFace cache (~/.cache/huggingface). Cached after that. Cold load
// is ~10–20 s; warm transcription is real-time-ish for typical interview
// tape on Apple Silicon.
//
// Design parity with lib/storage/embed.js — Transformers.js is ESM-only,
// so we wrap dynamic import in a memoised initialiser and keep this file
// CommonJS so the rest of the app can require() it.

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const os = require('os');
const crypto = require('crypto');

const MODEL_ID = 'Xenova/whisper-base';

let pipelinePromise = null;

async function getPipeline() {
  if (pipelinePromise) return pipelinePromise;
  pipelinePromise = (async () => {
    const { pipeline, env } = await import('@huggingface/transformers');
    env.allowRemoteModels = true;
    env.allowLocalModels = true;
    return pipeline('automatic-speech-recognition', MODEL_ID);
  })();
  return pipelinePromise;
}

/**
 * Decode an audio file (any format ffmpeg can read) into a Float32Array
 * of mono PCM at 16 kHz, the rate Whisper expects. Whisper itself accepts
 * a Float32Array directly; the resampling happens here so we don't depend
 * on any node-side audio library.
 */
async function decodeMonoFloat32(absInputPath) {
  return new Promise((resolve, reject) => {
    // ffmpeg → s16le @ 16 kHz mono → stdout. Convert to Float32 in node.
    const ff = spawn('ffmpeg', [
      '-hide_banner', '-loglevel', 'error',
      '-i', absInputPath,
      '-f', 's16le',
      '-acodec', 'pcm_s16le',
      '-ac', '1',
      '-ar', '16000',
      'pipe:1',
    ]);
    const chunks = [];
    let err = '';
    ff.stdout.on('data', (b) => chunks.push(b));
    ff.stderr.on('data', (b) => { err += b.toString(); });
    ff.on('error', reject);
    ff.on('close', (code) => {
      if (code !== 0) return reject(new Error(`ffmpeg decode failed (${code}): ${err.trim()}`));
      const buf = Buffer.concat(chunks);
      // s16le → Float32 in [-1, 1]
      const samples = new Float32Array(buf.length / 2);
      for (let i = 0; i < samples.length; i++) {
        samples[i] = buf.readInt16LE(i * 2) / 32768;
      }
      resolve(samples);
    });
  });
}

/**
 * Transcribe an audio file. Returns { text, segments, durationSeconds }.
 *
 * @param {string} absInputPath  absolute path to an audio file on disk
 * @param {object} [opts]
 * @param {string} [opts.language='en']  ISO code; pass 'auto' to let Whisper detect
 */
async function transcribeFile(absInputPath, opts = {}) {
  const language = opts.language || 'en';
  const samples = await decodeMonoFloat32(absInputPath);
  const durationSeconds = Number((samples.length / 16000).toFixed(3));

  const pipe = await getPipeline();
  const result = await pipe(samples, {
    language: language === 'auto' ? null : language,
    task: 'transcribe',
    return_timestamps: true,
    chunk_length_s: 30,
    stride_length_s: 5,
  });

  // Result shape: { text, chunks: [{timestamp: [start, end], text}, ...] }
  const segments = Array.isArray(result.chunks)
    ? result.chunks.map((c) => ({
        start: Array.isArray(c.timestamp) ? c.timestamp[0] : null,
        end: Array.isArray(c.timestamp) ? c.timestamp[1] : null,
        text: (c.text || '').trim(),
      }))
    : [];
  return {
    text: (result.text || '').trim(),
    segments,
    durationSeconds,
    model: MODEL_ID,
  };
}

/**
 * Save a Buffer of audio data to a deterministic on-disk path under
 * storage/producer/, returns { absPath, relPath, sha256, bytes }.
 * Used by the upload route before kicking off transcription.
 */
function persistUpload(buffer, suggestedExt) {
  const id = crypto.randomUUID();
  const ext = (suggestedExt || '.bin').toLowerCase();
  const relPath = path.join('storage', 'producer', `upload-${id}${ext}`);
  const absPath = path.join(process.cwd(), relPath);
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  fs.writeFileSync(absPath, buffer);
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
  return { absPath, relPath, sha256, bytes: buffer.length };
}

module.exports = { transcribeFile, persistUpload, MODEL_ID };
