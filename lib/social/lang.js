// Language identification for social signals.
//
// We use a deterministic script-ratio detector instead of an ML model.
// For our use case ("is this Cyrillic / Han / Arabic / Latin / mixed?")
// script detection is actually a STRONGER signal than a multi-class
// classifier:
//   - Cyrillic in a Facebook post is Russian / Ukrainian / Bulgarian /
//     Serbian etc — for our purposes "this is in Cyrillic" is the
//     attribution-relevant fact.
//   - Han characters mean Chinese (Simplified or Traditional, can't
//     reliably split without a much larger model).
//   - Arabic / Hebrew / Devanagari etc are similarly script-determined.
//
// The other big win: no model download, no cold start, works offline,
// fully deterministic and explainable. For Russian-state-media-translated
// English posts (where script detection won't fire), the source-domain
// match in lib/social/sources.js carries the load.
//
// Future enhancement: bring in a real multilingual classifier (e.g. a
// Transformers.js-compatible glotlid build) for finer Latin-script
// distinctions when we need them.

// Unicode block ranges for the scripts we care about. Arabic, Cyrillic,
// Han, Hebrew, Devanagari, Hangul, Hiragana/Katakana, Thai, Greek.
const SCRIPTS = [
  { name: 'Latin',      ranges: [[0x0041, 0x005A], [0x0061, 0x007A], [0x00C0, 0x024F]] },
  { name: 'Cyrillic',   ranges: [[0x0400, 0x04FF], [0x0500, 0x052F], [0x2DE0, 0x2DFF], [0xA640, 0xA69F]] },
  { name: 'Greek',      ranges: [[0x0370, 0x03FF]] },
  { name: 'Arabic',     ranges: [[0x0600, 0x06FF], [0x0750, 0x077F], [0x08A0, 0x08FF], [0xFB50, 0xFDFF], [0xFE70, 0xFEFF]] },
  { name: 'Hebrew',     ranges: [[0x0590, 0x05FF]] },
  { name: 'Devanagari', ranges: [[0x0900, 0x097F]] },
  { name: 'Han',        ranges: [[0x3400, 0x4DBF], [0x4E00, 0x9FFF], [0xF900, 0xFAFF], [0x20000, 0x2A6DF]] },
  { name: 'Hiragana',   ranges: [[0x3040, 0x309F]] },
  { name: 'Katakana',   ranges: [[0x30A0, 0x30FF]] },
  { name: 'Hangul',     ranges: [[0xAC00, 0xD7AF], [0x1100, 0x11FF]] },
  { name: 'Thai',       ranges: [[0x0E00, 0x0E7F]] },
];

// Map dominant script + (optional) co-script to an ISO-639-1 code that
// our downstream prompts already know how to talk about.
const SCRIPT_TO_LANG = {
  Cyrillic:   { code: 'ru', name: 'Russian / Cyrillic' },
  Han:        { code: 'zh', name: 'Chinese (Han)' },
  Arabic:     { code: 'ar', name: 'Arabic' },
  Hebrew:     { code: 'he', name: 'Hebrew' },
  Devanagari: { code: 'hi', name: 'Hindi / Devanagari' },
  Greek:      { code: 'el', name: 'Greek' },
  Thai:       { code: 'th', name: 'Thai' },
  Hangul:     { code: 'ko', name: 'Korean' },
  Hiragana:   { code: 'ja', name: 'Japanese' },
  Katakana:   { code: 'ja', name: 'Japanese' },
  Latin:      { code: 'en', name: 'Latin script (likely English or other Latin-script language)' },
};

const MODEL_ID = 'script-ratio (deterministic)';

/**
 * Detect language by counting script-frequencies in the text. Returns
 * the same shape as the ML detector that this replaces.
 *
 * @param {string} text
 * @returns {Promise<{primary:{code,name,confidence}, secondary?:{code,name,confidence}|null, raw:Array}>}
 */
async function detectLanguage(text) {
  const cleaned = (text || '').trim();
  if (!cleaned || cleaned.length < 2) {
    return { primary: { code: 'unknown', name: 'unknown', confidence: 0 }, secondary: null, raw: [] };
  }
  const counts = new Map();
  let total = 0;
  // Iterate by code points (handles surrogate pairs in CJK Extension B).
  for (const ch of cleaned) {
    const cp = ch.codePointAt(0);
    if (cp == null) continue;
    if (cp <= 0x20 || cp === 0x00A0) continue;       // skip whitespace
    if (cp >= 0x2000 && cp <= 0x200F) continue;      // unicode whitespace block
    if (cp >= 0x0030 && cp <= 0x0039) continue;      // skip digits — not a language signal
    const script = scriptOf(cp);
    if (!script) continue;
    counts.set(script, (counts.get(script) || 0) + 1);
    total++;
  }
  if (total === 0) {
    return { primary: { code: 'unknown', name: 'unknown', confidence: 0 }, secondary: null, raw: [] };
  }
  const ranked = [...counts.entries()]
    .map(([script, n]) => ({ script, ratio: n / total }))
    .sort((a, b) => b.ratio - a.ratio);

  // Map ranked scripts to lang candidates.
  const primaryScript = ranked[0];
  const secondaryScript = ranked[1] && ranked[1].ratio > 0.05 ? ranked[1] : null;
  const primary = {
    ...(SCRIPT_TO_LANG[primaryScript.script] || { code: primaryScript.script.toLowerCase(), name: primaryScript.script }),
    confidence: Number(primaryScript.ratio.toFixed(3)),
  };
  const secondary = secondaryScript ? {
    ...(SCRIPT_TO_LANG[secondaryScript.script] || { code: secondaryScript.script.toLowerCase(), name: secondaryScript.script }),
    confidence: Number(secondaryScript.ratio.toFixed(3)),
  } : null;

  // raw is a stable shape that the prompt block can render verbatim.
  const raw = ranked.map(r => ({ code: (SCRIPT_TO_LANG[r.script] || { code: r.script.toLowerCase() }).code, name: r.script, confidence: Number(r.ratio.toFixed(3)) }));
  return { primary, secondary, raw };
}

function scriptOf(codepoint) {
  for (const s of SCRIPTS) {
    for (const [lo, hi] of s.ranges) {
      if (codepoint >= lo && codepoint <= hi) return s.name;
    }
  }
  return null;
}

module.exports = { detectLanguage, MODEL_ID };
