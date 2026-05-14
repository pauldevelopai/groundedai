// Acronym ↔ expansion detection.
//
// Catches the "ANC" + "African National Congress" case that the embedding-
// based resolver can't (acronyms have low cosine similarity to their
// expansions — measured 0.62 in slice 2). The acronym + the expansion must
// co-occur in the SAME chunk for us to auto-merge, which keeps false
// positives low.
//
// Algorithm:
//   1. Find all ALL-CAPS runs of 3+ letters in the chunk text. These are
//      acronym candidates. (We also accept "ZANU-PF"-style hyphenated runs.)
//   2. For each acronym, scan the entities found in the chunk for one whose
//      canonical_name's significant-word initials match the acronym in
//      order. Significant = capitalised words; we skip stopwords like "of",
//      "the", "and", "for", "to", "in".
//   3. Same-type only — don't merge "ANC" (org) with "African National
//      Congress" (random misc); that'd need the cross-type merge UI (D2).
//
// Returns merge directives. The caller (ingest.js) applies them via
// mergeEntities(). Never crashes on bad input — returns [] instead.

const STOPWORDS = new Set([
  'of', 'the', 'and', 'for', 'to', 'in', 'on', 'at', 'by', 'with',
  'a', 'an', 'or', 'but', 'as', 'is', 'are', 'be',
]);

const ACRONYM_RE = /\b([A-Z]{3,}(?:[-][A-Z0-9]+)*)\b/g;

/**
 * Extract significant-word initials from a canonical name.
 * "African National Congress" → "ANC"
 * "Media Institute of Southern Africa" → "MISA"
 * "Pan African Parliament" → "PAP"
 * "U.S. Agency for International Development" → "USAID" (works because
 *   "U.S." is ALL-CAPS and contributes "U" + "S", then "Agency" → "A", skip
 *   "for", "International" → "I", "Development" → "D" → "USAID")
 */
function initialsOf(name) {
  if (!name) return '';
  // Tokenise on whitespace + hyphens, keep individual letters from dotted
  // acronyms (U.S. → ["U", "S"])
  const tokens = name.split(/[\s-]+/).flatMap((t) => {
    const dotted = t.match(/^([A-Z](?:\.[A-Z])+\.?)$/);
    if (dotted) return dotted[1].replace(/\./g, '').split('');
    return [t];
  });
  let out = '';
  for (const raw of tokens) {
    if (!raw) continue;
    const word = raw.replace(/[^A-Za-z'’]/g, '');
    if (!word) continue;
    const lower = word.toLowerCase();
    if (STOPWORDS.has(lower)) continue;
    // For words that are already capitalised (proper nouns), take the first letter
    if (word[0] >= 'A' && word[0] <= 'Z') {
      out += word[0].toUpperCase();
    } else {
      // Lowercase word that's NOT a stopword — still might be part of an
      // acronym (e.g. "deBeers" → 'd' or 'B'?). Take the first character.
      // Conservative: skip lowercase-leading words to avoid false positives.
      // This means "Pan african Parliament" wouldn't match PAP — that's OK,
      // the canonical name should be properly cased.
    }
  }
  return out;
}

/**
 * Find acronym-expansion merge directives for a chunk.
 *
 * @param {object} args
 * @param {string} args.chunkText            the raw text of one archive chunk
 * @param {Array<{ id, canonical_name, type_slug, type_id }>} args.entities
 *   The entities resolved-or-created for this chunk's mentions. Order matters
 *   only in the sense that ties are broken by first-occurrence.
 * @returns {Array<{ keepId, mergeId, reason }>} merge directives. Caller
 *   passes each to mergeEntities(). Empty array means nothing to do.
 */
function detectAcronymMerges({ chunkText, entities }) {
  if (!chunkText || !Array.isArray(entities) || entities.length < 2) return [];

  // Find acronym tokens that appear in the chunk
  const acronymsSeen = new Set();
  let m;
  ACRONYM_RE.lastIndex = 0;
  while ((m = ACRONYM_RE.exec(chunkText)) !== null) {
    acronymsSeen.add(m[1]);
  }
  if (acronymsSeen.size === 0) return [];

  // Bucket entities by type so we never cross-type-merge
  const byType = new Map();
  for (const e of entities) {
    const key = e.type_id || e.type_slug || '_';
    if (!byType.has(key)) byType.set(key, []);
    byType.get(key).push(e);
  }

  const directives = [];

  for (const [, sameTypeEntities] of byType) {
    // Within this type bucket: find (acronym-entity, expansion-entity) pairs
    const acronymEntities = sameTypeEntities.filter((e) => {
      const name = (e.canonical_name || '').trim();
      return /^[A-Z]{3,}(?:[-][A-Z0-9]+)*$/.test(name) && acronymsSeen.has(name);
    });
    if (acronymEntities.length === 0) continue;

    const expansionCandidates = sameTypeEntities.filter((e) => {
      const name = (e.canonical_name || '').trim();
      // Must be multi-word and not itself an acronym
      return name.split(/\s+/).length >= 2 && !/^[A-Z]{3,}/.test(name.split(/\s+/)[0]);
    });

    for (const acronymEnt of acronymEntities) {
      const targetAcronym = acronymEnt.canonical_name.toUpperCase();
      // Find the BEST matching expansion (initials match exactly)
      const matches = expansionCandidates.filter(
        (cand) => initialsOf(cand.canonical_name).toUpperCase() === targetAcronym
      );
      if (matches.length !== 1) continue;  // ambiguous → skip
      const expansionEnt = matches[0];
      if (expansionEnt.id === acronymEnt.id) continue;

      directives.push({
        keepId: expansionEnt.id,
        mergeId: acronymEnt.id,
        reason: `acronym "${acronymEnt.canonical_name}" expands to "${expansionEnt.canonical_name}"`,
      });
    }
  }

  return directives;
}

module.exports = { detectAcronymMerges, initialsOf, ACRONYM_RE };
