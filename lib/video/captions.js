// SRT caption file generation from timed segments.
//
// Two sources we need to support:
//   1. Whisper segments — { start, end, text } in seconds (the shape STT
//      already returns). Used for audiograms when we have the audio asset
//      but not a written script.
//   2. radio_script segments — durations only, no absolute timestamps.
//      We accumulate to derive start/end. Useful for audiograms when we
//      go straight from a script (skipping the re-transcription step).
//
// Output is an SRT file path on disk that ffmpeg's `subtitles` filter
// can consume directly.

const fs = require('fs');
const path = require('path');

/**
 * Write an SRT file from Whisper-style timed segments.
 * @param {Array<{start:number,end:number,text:string}>} segments
 * @param {string} absOutPath
 * @param {object} [opts]
 * @param {number} [opts.maxCharsPerLine=42]
 * @returns {string} the written path
 */
function srtFromTimedSegments(segments, absOutPath, opts = {}) {
  const maxLine = opts.maxCharsPerLine || 42;
  const lines = [];
  let counter = 1;
  for (const seg of segments || []) {
    const start = Number(seg.start);
    const end = Number(seg.end);
    const text = (seg.text || '').trim();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || !text) continue;
    lines.push(String(counter++));
    lines.push(`${formatTimestamp(start)} --> ${formatTimestamp(end)}`);
    lines.push(wrap(text, maxLine));
    lines.push('');
  }
  fs.mkdirSync(path.dirname(absOutPath), { recursive: true });
  fs.writeFileSync(absOutPath, lines.join('\n'));
  return absOutPath;
}

/**
 * Build timed segments from a radio_script's intro/segments/outro by
 * accumulating per-segment durations. Host segments use their text;
 * actuality and music_sting segments emit a description-style caption.
 *
 * @param {object} script  the radio_script JSON
 * @param {Array<{kind, duration, text?, description?}>} segmentLog from assemble.js
 *   When provided, durations are taken from the actual audio output, not
 *   the script's planned durations. More accurate for caption sync.
 * @returns {Array<{start, end, text}>}
 */
function timedSegmentsFromRadioScript(script, segmentLog = null) {
  const out = [];
  let cursor = 0;

  // If we have a segmentLog from a real assembly, walk that instead — its
  // durations are what's actually on disk, including TTS variability.
  if (Array.isArray(segmentLog) && segmentLog.length > 0) {
    for (const s of segmentLog) {
      const dur = positiveNumber(s.duration, 1);
      const start = cursor;
      const end = start + dur;
      const text = captionTextForLogEntry(s);
      if (text) out.push({ start, end, text });
      cursor = end;
    }
    return out;
  }

  // Otherwise, fall back to the script itself.
  if (script?.intro) {
    const dur = estimateSecondsForText(script.intro);
    out.push({ start: cursor, end: cursor + dur, text: script.intro });
    cursor += dur;
  }
  for (const s of (script?.segments || [])) {
    const dur = positiveNumber(s.duration_seconds, 4);
    const text = captionTextForScriptSegment(s);
    if (text) out.push({ start: cursor, end: cursor + dur, text });
    cursor += dur;
  }
  if (script?.outro) {
    const dur = estimateSecondsForText(script.outro);
    out.push({ start: cursor, end: cursor + dur, text: script.outro });
  }
  return out;
}

function captionTextForLogEntry(s) {
  if (s.kind === 'music_sting') return null; // no caption while sting plays
  if (s.kind === 'actuality') {
    return s.description ? `[${s.description}]` : '[actuality]';
  }
  return s.text || null;
}

function captionTextForScriptSegment(s) {
  if (s.type === 'host') return s.text || null;
  if (s.type === 'actuality') return s.description ? `[${s.description}]` : '[actuality]';
  return null;
}

function estimateSecondsForText(s) {
  // Rough WPM-based estimate: ~150 wpm. Used only when we don't have
  // measured durations from a real assembly.
  const words = (s || '').trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1.5, (words / 150) * 60);
}

function positiveNumber(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function formatTimestamp(seconds) {
  const ms = Math.round(seconds * 1000);
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const milli = ms % 1000;
  return `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)},${pad(milli, 3)}`;
}

function pad(n, w) { return String(n).padStart(w, '0'); }

function wrap(text, max) {
  if (text.length <= max) return text;
  const words = text.split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    if ((line + ' ' + w).trim().length > max) {
      if (line) lines.push(line);
      line = w;
    } else {
      line = (line + ' ' + w).trim();
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 2).join('\n'); // SRT convention: max 2 lines
}

module.exports = {
  srtFromTimedSegments,
  timedSegmentsFromRadioScript,
};
