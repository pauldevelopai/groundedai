// Edit-feedback diff for the Translator. When an editor saves an edited
// translation, we diff their version against the model output at the word
// level and extract substitutions — places where the model said X and the
// editor said Y. These become glossary proposals the editor reviews; on
// accept they land in translation_glossary with source='edit_feedback'.
//
// Pure functions — no DB. The PATCH endpoint persists the result.
//
// The diff is a word-level Longest Common Subsequence (LCS) backtrack.
// Substitutions are adjacent del/ins runs. We cap each side at 6 words to
// avoid pulling whole-sentence rewrites in as glossary candidates.

function tokenise(s) {
  // Keep punctuation attached to adjacent words so "Banda." vs "Banda"
  // doesn't get treated as a substitution. Split on whitespace only.
  return (s || '').split(/\s+/).filter(Boolean);
}

function eq(a, b) {
  return a.toLowerCase() === b.toLowerCase();
}

/**
 * Word-level LCS diff. Returns ops in source order:
 *   { type: 'eq' | 'del' | 'ins', token }
 */
function diffWords(a, b) {
  const aT = tokenise(a);
  const bT = tokenise(b);
  const n = aT.length;
  const m = bT.length;
  // Build LCS DP table.
  const dp = Array(n + 1)
    .fill(null)
    .map(() => Array(m + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      dp[i][j] = eq(aT[i - 1], bT[j - 1])
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  // Backtrack.
  const ops = [];
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    if (eq(aT[i - 1], bT[j - 1])) {
      ops.unshift({ type: 'eq', token: aT[i - 1] });
      i--;
      j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      ops.unshift({ type: 'del', token: aT[i - 1] });
      i--;
    } else {
      ops.unshift({ type: 'ins', token: bT[j - 1] });
      j--;
    }
  }
  while (i > 0) {
    ops.unshift({ type: 'del', token: aT[i - 1] });
    i--;
  }
  while (j > 0) {
    ops.unshift({ type: 'ins', token: bT[j - 1] });
    j--;
  }
  return ops;
}

/**
 * Walk the diff ops and pull out adjacent del+ins runs as substitutions.
 * Keeps short runs only (≤6 words a side) and discards substitutions that
 * are pure punctuation differences.
 *
 * @returns {Array<{ from: string, to: string }>}
 */
function extractSubstitutions(ops) {
  const subs = [];
  let i = 0;
  while (i < ops.length) {
    if (ops[i].type === 'eq') {
      i++;
      continue;
    }
    // Collect a contiguous divergence run (any mix of del/ins, no eq).
    const dels = [];
    const ins = [];
    while (i < ops.length && ops[i].type !== 'eq') {
      if (ops[i].type === 'del') dels.push(ops[i].token);
      else if (ops[i].type === 'ins') ins.push(ops[i].token);
      i++;
    }
    if (dels.length === 0 || ins.length === 0) continue;
    if (dels.length > 6 || ins.length > 6) continue;

    const from = dels.join(' ').trim();
    const to = ins.join(' ').trim();
    if (!from || !to) continue;
    if (from.replace(/[^\w]/g, '') === to.replace(/[^\w]/g, '')) continue; // pure punctuation diff
    subs.push({ from, to });
  }
  return subs;
}

/**
 * Build glossary proposals from a single edit. Combines duplicate
 * substitutions into one proposal each with an occurrence count.
 *
 * @param {string} modelOutput
 * @param {string} editedOutput
 * @returns {Array<{ id: string, from: string, to: string, occurrences: number, status: 'proposed' }>}
 */
function buildProposalsFromEdit(modelOutput, editedOutput) {
  if (!modelOutput || !editedOutput) return [];
  const ops = diffWords(modelOutput, editedOutput);
  const subs = extractSubstitutions(ops);
  // Cluster duplicates (case-insensitive on the `from` side).
  const byFrom = new Map();
  for (const s of subs) {
    const key = s.from.toLowerCase();
    if (!byFrom.has(key)) {
      byFrom.set(key, { from: s.from, to: s.to, occurrences: 1 });
    } else {
      byFrom.get(key).occurrences++;
    }
  }
  // Stable id from the (from,to) pair so re-saving an edit doesn't churn ids.
  return [...byFrom.values()].map((p, idx) => ({
    id: `prop_${idx}_${slug(p.from)}_${slug(p.to)}`,
    from: p.from,
    to: p.to,
    occurrences: p.occurrences,
    status: 'proposed',
  }));
}

function slug(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 24);
}

module.exports = { diffWords, extractSubstitutions, buildProposalsFromEdit };
