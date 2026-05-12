// Style-fingerprint extractor for the newsroom profile.
//
// Pure-JS deterministic analyser. No Claude, no external API. Given a
// corpus of recent articles (text + optional title + optional publishedAt),
// returns a quantified style fingerprint with 14 dimensions covering
// rhythm, vocabulary, voice, attribution, and rate-based signals.
//
// Conceptual shift the fingerprint introduces:
//   - Editor-authored newsroom_profile.voice / .style_notes / .ethics_policy
//     stay primary and untouched.
//   - This adds a DATA-grounded second voice computed from the newsroom's
//     own past output. Both can disagree; the prompt shows both and Claude
//     weights them.
//
// Output dimensions:
//   sentence_rhythm        median + variance of sentence length in words
//   paragraph_rhythm       median + variance of paragraph length in words
//   vocab_register         avg word length, ratio of words >7 chars
//   voice_ratio            passive vs active rate (regex proxy)
//   hedge_density          may/could/reportedly/alleged/etc per 100 words
//   attribution_style      counts: said-X / according-to-X / X-told-paper
//   quote_ratio            % of sentences containing a direct quote
//   time_anchor_density    relative-time refs per 100 words
//   numerical_density      numbers per 100 words
//   acronym_density        ALL-CAPS tokens (≥3 chars) per 100 words
//   place_name_density     proper nouns matching a tiny African gazetteer
//                          + newsroom geography[] list (if supplied)
//   headline_length        median word count when titles supplied
//   lede_openers           top-5 first-three-word patterns (auto-learned)
//   repeated_phrases       top-10 trigrams/quadgrams (auto-learned)
//
// Banded labels (used by formatForPrompt) translate raw numbers into
// human-readable bands like "short / medium / long" so Claude doesn't lock
// onto precise numerics.

const HEDGES = [
  'may ', 'might ', 'could ', 'reportedly', 'allegedly', 'alleged ',
  'is said to', 'appears to', 'seems to', 'is believed to',
  'is thought to', 'understood to', 'sources say', 'sources said',
];

const TIME_ANCHORS = [
  'yesterday', 'today', 'tomorrow', 'last night', 'this week', 'last week',
  'this month', 'last month', 'this year', 'last year', 'next week',
  'next month', 'on monday', 'on tuesday', 'on wednesday', 'on thursday',
  'on friday', 'on saturday', 'on sunday',
];

// Tiny African gazetteer for place_name_density. Newsroom geography from
// newsroom_profiles.geography[] should be merged in by the caller.
const DEFAULT_GAZETTEER = [
  // Countries
  'South Africa', 'Zimbabwe', 'Zambia', 'Kenya', 'Nigeria', 'Ghana',
  'Ethiopia', 'Egypt', 'Morocco', 'Tunisia', 'Algeria', 'Senegal',
  'Uganda', 'Tanzania', 'Rwanda', 'DRC', 'Sudan', 'South Sudan',
  // SA cities/provinces
  'Johannesburg', 'Cape Town', 'Durban', 'Pretoria', 'Bloemfontein',
  'Gauteng', 'KwaZulu-Natal', 'Western Cape', 'Eastern Cape',
  'Limpopo', 'Mpumalanga', 'Free State', 'North West', 'Northern Cape',
  // ZW / ZM / KE
  'Harare', 'Bulawayo', 'Mutare', 'Victoria Falls',
  'Lusaka', 'Kitwe', 'Ndola',
  'Nairobi', 'Mombasa', 'Kisumu',
];

const ATTRIBUTION_PATTERNS = [
  { kind: 'said_x', re: /\bsaid\s+[A-Z][a-z]/g },
  { kind: 'x_said', re: /[A-Z][a-z]+\s+said\b/g },
  { kind: 'according_to', re: /\baccording to\b/gi },
  { kind: 'told_the', re: /\btold the\b/gi },
  { kind: 'told_x', re: /\btold\s+[A-Z][a-z]/g },
  { kind: 'reportedly', re: /\breportedly\b/gi },
];

// ─── Helpers ───────────────────────────────────────────────────────────────

function median(arr) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const m = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[m - 1] + sorted[m]) / 2 : sorted[m];
}

function variance(arr) {
  if (arr.length === 0) return 0;
  const mean = arr.reduce((s, x) => s + x, 0) / arr.length;
  return arr.reduce((s, x) => s + (x - mean) ** 2, 0) / arr.length;
}

function tokenWords(text) {
  const m = (text || '').match(/[A-Za-z][A-Za-z'’-]*/g);
  return m || [];
}

function splitSentences(text) {
  // Simple boundary: punctuation followed by whitespace + capital.
  return (text || '')
    .split(/(?<=[.!?])\s+(?=[A-Z"])/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

function splitParagraphs(text) {
  return (text || '')
    .split(/\n\s*\n/g)
    .map((p) => p.trim())
    .filter(Boolean);
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function countMatches(text, needles) {
  let n = 0;
  const lower = text.toLowerCase();
  for (const needle of needles) {
    const re = new RegExp('\\b' + escapeRegex(needle.toLowerCase()) + '\\b', 'g');
    const m = lower.match(re);
    if (m) n += m.length;
  }
  return n;
}

function countPlaceNames(text, gazetteer) {
  let n = 0;
  for (const place of gazetteer) {
    // Word-boundary, case-sensitive (places are proper nouns)
    const re = new RegExp('\\b' + escapeRegex(place) + '\\b', 'g');
    const m = text.match(re);
    if (m) n += m.length;
  }
  return n;
}

function countQuotedSentences(sentences) {
  let n = 0;
  for (const s of sentences) {
    if (/["“][^"”]{8,}["”]/.test(s) || /['‘][^'’]{12,}['’]/.test(s)) n++;
  }
  return n;
}

function extractLedeOpeners(texts, topK = 5) {
  const counts = new Map();
  for (const t of texts) {
    const first = (t || '').trim().split(/\s+/).slice(0, 3).join(' ').toLowerCase();
    if (!first || first.length < 4) continue;
    counts.set(first, (counts.get(first) || 0) + 1);
  }
  return Array.from(counts.entries())
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topK)
    .map(([phrase, count]) => ({ phrase, count }));
}

function extractRepeatedPhrases(text, topK = 10) {
  const words = tokenWords(text).map((w) => w.toLowerCase());
  const counts = new Map();
  for (let n = 3; n <= 4; n++) {
    for (let i = 0; i + n <= words.length; i++) {
      const ng = words.slice(i, i + n).join(' ');
      // Skip ngrams that are mostly stopwords (e.g. "of the and")
      counts.set(ng, (counts.get(ng) || 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .filter(([, n]) => n >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topK)
    .map(([phrase, count]) => ({ phrase, count }));
}

// ─── Analyser ──────────────────────────────────────────────────────────────

/**
 * Compute the style fingerprint over a corpus.
 *
 * @param {object} args
 * @param {Array<{ text: string, title?: string, publishedAt?: string }>} args.texts
 * @param {string[]} [args.geography]  newsroom_profile.geography to merge
 *                                      into the place-name gazetteer
 * @returns {object} fingerprint — dimensions object
 */
function computeFingerprint({ texts, geography = [] }) {
  if (!Array.isArray(texts) || texts.length === 0) {
    throw new Error('computeFingerprint: texts[] required');
  }

  const corpus = texts.map((t) => t.text || '').filter(Boolean).join('\n\n');
  const titles = texts.map((t) => t.title || '').filter(Boolean);

  const allSentences = splitSentences(corpus);
  const allParagraphs = splitParagraphs(corpus);
  const allWords = tokenWords(corpus);
  const totalWords = allWords.length || 1;

  const sentenceLengths = allSentences.map((s) => tokenWords(s).length);
  const paraLengths = allParagraphs.map((p) => tokenWords(p).length);

  // Vocab register
  const longWordCount = allWords.filter((w) => w.length > 7).length;
  const avgWordLength = allWords.reduce((s, w) => s + w.length, 0) / (allWords.length || 1);

  // Voice ratio (regex proxy): was/were/been + past participle
  const passiveMatches = corpus.match(/\b(was|were|been|being)\s+([a-z]+ed|[a-z]+en)\b/g) || [];
  const activeProxy = corpus.match(/\b(said|told|announced|reported|made|signed|denied)\b/gi) || [];
  const totalVoiceSamples = passiveMatches.length + activeProxy.length;
  const passiveRate = totalVoiceSamples > 0 ? passiveMatches.length / totalVoiceSamples : 0;

  // Hedges
  const hedgeCount = HEDGES.reduce(
    (n, h) => n + (corpus.toLowerCase().match(new RegExp(escapeRegex(h), 'g')) || []).length,
    0
  );

  // Time anchors
  const timeAnchorCount = TIME_ANCHORS.reduce(
    (n, t) => n + (corpus.toLowerCase().match(new RegExp(escapeRegex(t), 'g')) || []).length,
    0
  );

  // Numerical density
  const numericalCount = (corpus.match(/\b\d{1,3}(?:[.,]\d+)?\b|R\d|\$\d/g) || []).length;

  // Acronyms
  const acronymCount = (corpus.match(/\b[A-Z]{3,}\b/g) || []).length;

  // Place names
  const gazetteer = Array.from(new Set([...DEFAULT_GAZETTEER, ...(geography || [])]));
  const placeCount = countPlaceNames(corpus, gazetteer);

  // Quote ratio
  const quotedSentences = countQuotedSentences(allSentences);
  const quoteRatio = allSentences.length ? quotedSentences / allSentences.length : 0;

  // Attribution style counts
  const attrCounts = {};
  for (const { kind, re } of ATTRIBUTION_PATTERNS) {
    attrCounts[kind] = (corpus.match(re) || []).length;
  }

  // Headlines
  const headlineLengths = titles.map((t) => tokenWords(t).length);

  // Auto-learned
  const ledeOpeners = extractLedeOpeners(texts.map((t) => t.text), 5);
  const repeatedPhrases = extractRepeatedPhrases(corpus, 10);

  const round = (n, p = 2) => Math.round(n * 10 ** p) / 10 ** p;

  return {
    source_count: texts.length,
    total_words: totalWords,
    computed_at: new Date().toISOString(),

    sentence_rhythm: {
      median: round(median(sentenceLengths)),
      variance: round(variance(sentenceLengths)),
    },
    paragraph_rhythm: {
      median: round(median(paraLengths)),
      variance: round(variance(paraLengths)),
    },
    vocab_register: {
      avg_word_length: round(avgWordLength),
      long_word_ratio: round(longWordCount / totalWords, 4),
    },
    voice_ratio: {
      passive_rate: round(passiveRate, 3),
      samples: totalVoiceSamples,
    },
    hedge_density: round((hedgeCount / totalWords) * 100, 2),
    attribution_style: attrCounts,
    quote_ratio: round(quoteRatio, 3),
    time_anchor_density: round((timeAnchorCount / totalWords) * 100, 2),
    numerical_density: round((numericalCount / totalWords) * 100, 2),
    acronym_density: round((acronymCount / totalWords) * 100, 2),
    place_name_density: round((placeCount / totalWords) * 100, 2),
    headline_length: {
      median: round(median(headlineLengths)),
      n: headlineLengths.length,
    },
    lede_openers: ledeOpeners,
    repeated_phrases: repeatedPhrases,
  };
}

// ─── Banded labels (for the prompt) ────────────────────────────────────────
// Per plan decision 7: Claude sees banded labels ("short / medium / long")
// not raw numbers, so the model doesn't lock onto precise numerics. Editors
// see the raw numbers in the workspace inspector.

function band(value, breakpoints, labels) {
  for (let i = 0; i < breakpoints.length; i++) {
    if (value < breakpoints[i]) return labels[i];
  }
  return labels[labels.length - 1];
}

/**
 * Format the fingerprint into a compact "Quantified style:" block for
 * inclusion in Claude prompts. Returns an empty string when the fingerprint
 * is missing or unusable.
 */
function formatBandedBlock(fp) {
  if (!fp || !fp.sentence_rhythm) return '';
  const parts = [];

  const sentBand = band(fp.sentence_rhythm.median, [12, 20], ['short', 'medium', 'long']);
  parts.push(`Sentences: ${sentBand}`);

  const paraBand = band(fp.paragraph_rhythm.median, [40, 100], ['short', 'medium', 'long']);
  parts.push(`Paragraphs: ${paraBand}`);

  const regBand = band(fp.vocab_register.avg_word_length, [4.5, 5.0], ['plain', 'standard', 'elevated']);
  parts.push(`Register: ${regBand}`);

  parts.push(`Voice: ${fp.voice_ratio.passive_rate > 0.35 ? 'often passive' : 'mostly active'}`);

  if (fp.hedge_density > 0.4) parts.push(`Hedging: high`);
  else if (fp.hedge_density > 0.15) parts.push(`Hedging: moderate`);

  if (fp.quote_ratio > 0.25) parts.push(`Quoting: heavy`);
  else if (fp.quote_ratio > 0.10) parts.push(`Quoting: moderate`);

  if (fp.numerical_density > 1.5) parts.push(`Numbers: rich`);
  if (fp.acronym_density > 0.8) parts.push(`Acronyms: dense`);

  if (Array.isArray(fp.lede_openers) && fp.lede_openers.length > 0) {
    parts.push(`Lede openers: ${fp.lede_openers.slice(0, 3).map((l) => `"${l.phrase}…"`).join(', ')}`);
  }

  return parts.length > 0 ? `Quantified style: ${parts.join(' · ')}` : '';
}

module.exports = {
  computeFingerprint,
  formatBandedBlock,
  band,
  // exported for testing
  splitSentences,
  splitParagraphs,
  tokenWords,
  DEFAULT_GAZETTEER,
};
