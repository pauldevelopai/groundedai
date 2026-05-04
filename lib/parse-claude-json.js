// Robust parser for Claude JSON-structured responses. Handles common Claude
// formatting quirks: markdown fences, prose before/after JSON, trailing commas,
// single-quoted strings, unquoted object keys. Falls back across strategies.
// Lifted from surepath/vision.js parseVisionResponse.
//
// Throws if no recoverable JSON can be extracted.

function parseClaudeJson(text) {
  if (!text || typeof text !== 'string') {
    throw new Error('parseClaudeJson: empty or non-string input');
  }

  // 1. Try as-is.
  try {
    return JSON.parse(text);
  } catch {
    /* fall through */
  }

  // 2. Strip markdown code fences (```json ... ``` or ``` ... ```).
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fence) {
    try {
      return JSON.parse(fence[1]);
    } catch {
      /* fall through */
    }
  }

  // 3. Extract first plausible JSON object or array from surrounding prose.
  const jsonMatch = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (jsonMatch) {
    const candidate = jsonMatch[1];

    // 3a. Try the raw extracted candidate.
    try {
      return JSON.parse(candidate);
    } catch {
      /* fall through */
    }

    // 3b. Apply progressive normalisations and retry.
    const normalised = candidate
      .replace(/,(\s*[}\]])/g, '$1') // trailing commas before } or ]
      .replace(/'([^']*)'/g, (_, s) => JSON.stringify(s)) // single → double quotes
      .replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:/g, '$1"$2":'); // unquoted keys

    try {
      return JSON.parse(normalised);
    } catch {
      /* fall through */
    }
  }

  throw new Error(
    `parseClaudeJson: could not recover JSON from response (length ${text.length})`
  );
}

module.exports = { parseClaudeJson };
