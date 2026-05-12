// Generic deep-merge for the "pan-African default + per-newsroom override"
// pattern that Step 0 (topic taxonomy) and Step 2 (trusted sources) both use.
//
// Semantics:
//   - null/undefined overrides do nothing (return the default)
//   - Arrays: concat + dedupe. Override entries are *added*, not replaced.
//     This is the right call for keyword lists and source lists where a
//     newsroom typically wants to extend the default. To *remove* a
//     default entry, use the same key with the same value in an override —
//     but for pilot we don't surface a remove primitive; future work.
//   - Objects: recursive merge. Override keys may add or override scalars.
//   - Scalars / type mismatch: override wins.
//
// Examples:
//   merge({ a: [1, 2] }, { a: [3] }) → { a: [1, 2, 3] }
//   merge({ a: { b: 1 } }, { a: { c: 2 } }) → { a: { b: 1, c: 2 } }
//   merge({ a: 'x' }, { a: 'y' }) → { a: 'y' }
//   merge({ a: 1 }, { a: [2] }) → { a: [2] }  (type mismatch → override wins)

function mergeWithOverrides(defaultValue, overrideValue) {
  if (overrideValue == null) return defaultValue;
  if (defaultValue == null) return overrideValue;

  // Both arrays — concat + dedupe (preserve default order, then add new override entries)
  if (Array.isArray(defaultValue) && Array.isArray(overrideValue)) {
    const seen = new Set();
    const out = [];
    for (const item of defaultValue.concat(overrideValue)) {
      const key = typeof item === 'string' ? item : JSON.stringify(item);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
    return out;
  }

  // Both plain objects — recursive merge
  if (
    typeof defaultValue === 'object' && !Array.isArray(defaultValue) &&
    typeof overrideValue === 'object' && !Array.isArray(overrideValue)
  ) {
    const out = { ...defaultValue };
    for (const k of Object.keys(overrideValue)) {
      out[k] = k in out
        ? mergeWithOverrides(out[k], overrideValue[k])
        : overrideValue[k];
    }
    return out;
  }

  // Scalar or type-mismatch — override wins
  return overrideValue;
}

module.exports = { mergeWithOverrides };
