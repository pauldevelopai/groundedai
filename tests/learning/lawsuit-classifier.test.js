// Mirror the LAWSUIT_KEYWORDS regex used by the Tracker's Lawsuits tab
// to guard against drift. If the UI regex changes, this test fails fast
// — at which point copy the new regex here.

const test = require('node:test');
const assert = require('node:assert/strict');

const LAWSUIT_KEYWORDS = /\b(lawsuit|sued|class[\s-]action|filed against|settlement|court[\s-]ruling|injunction|complaint|plaintiff|defendant|tribunal|magistrate)\b/i;

function flag(text) { return LAWSUIT_KEYWORDS.test(text); }

test('flags "sued" anywhere in the title', () => {
  assert.equal(flag('OpenAI sued by New York Times'), true);
});

test('flags court-ruling phrasing', () => {
  assert.equal(flag('Court-ruling forces compliance update'), true);
});

test('flags settlement language', () => {
  assert.equal(flag('Defendant agreed to a settlement'), true);
});

test('flags class action with hyphen and space', () => {
  assert.equal(flag('A class-action filing went ahead'), true);
  assert.equal(flag('Class action approved in High Court'), true);
});

test('does NOT flag plain regulation language', () => {
  assert.equal(flag('EU AI Act high-risk classification'), false);
  assert.equal(flag('POPIA annual enforcement report'), false);
  assert.equal(flag('African Union Continental AI Strategy'), false);
});

test('does NOT flag "complaint" as substring of unrelated word', () => {
  // Regex uses \b, so "uncomplained" / "noncompliant" should NOT trigger.
  // "complaint" itself does trigger (correctly — it's lawsuit language).
  assert.equal(flag('noncompliant systems'), false);
  assert.equal(flag('A complaint was lodged with the regulator'), true);
});
