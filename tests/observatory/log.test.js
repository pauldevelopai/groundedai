// Unit tests for the observatory log helpers. Database-free — exercise
// the only pure function, cheapDiffChars, against known shapes.

const test = require('node:test');
const assert = require('node:assert/strict');
const { cheapDiffChars } = require('../../lib/observatory/log');

test('cheapDiffChars: identical strings → 0', () => {
  assert.equal(cheapDiffChars('hello world', 'hello world'), 0);
});

test('cheapDiffChars: empty → 0', () => {
  assert.equal(cheapDiffChars('', ''), 0);
});

test('cheapDiffChars: pure append → counts the delta', () => {
  // "hello" → "hello world" : 6 extra chars (' world')
  assert.equal(cheapDiffChars('hello', 'hello world'), 6);
});

test('cheapDiffChars: pure replacement → counts mismatches', () => {
  // "hello" → "world" : 4 mismatches at positions 0,1,2,4 (h→w, e→o, l→r, o→d — same length, 0..4)
  // Actually positions where chars differ: h/w, e/o, l/r, l/l, o/d → 4 differs, 1 match.
  assert.equal(cheapDiffChars('hello', 'world'), 4);
});

test('cheapDiffChars: short + long → mismatches in overlap + delta', () => {
  // "abc" → "xyzde" : overlap is "abc" vs "xyz" → 3 mismatches; length delta = 2
  assert.equal(cheapDiffChars('abc', 'xyzde'), 5);
});

test('cheapDiffChars: null inputs → null', () => {
  assert.equal(cheapDiffChars(null, 'abc'), null);
  assert.equal(cheapDiffChars('abc', null), null);
});

test('cheapDiffChars: bounded to 10k chars per side', () => {
  const a = 'x'.repeat(20000);
  const b = 'y'.repeat(20000);
  // overlap is 10k, all mismatched; lenDelta = 0 (both clipped to 10k).
  assert.equal(cheapDiffChars(a, b), 10000);
});
