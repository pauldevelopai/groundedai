// Unit tests for the topic-tag scorer + merge helper.
// Run: node --test tests/copywriter/topic-tags.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  loadDefaultTopics,
  scoreArticle,
  formatScoreLine,
  countOccurrences,
  countWords,
  _resetCache,
} = require('../../lib/copywriter/topic-tags');
const { mergeWithOverrides } = require('../../lib/newsroom-profile/merge-overrides');

test('mergeWithOverrides: null override returns default', () => {
  assert.deepEqual(mergeWithOverrides({ a: 1 }, null), { a: 1 });
});

test('mergeWithOverrides: arrays concat + dedupe', () => {
  assert.deepEqual(
    mergeWithOverrides({ k: ['a', 'b'] }, { k: ['b', 'c'] }),
    { k: ['a', 'b', 'c'] }
  );
});

test('mergeWithOverrides: nested objects merge recursively', () => {
  assert.deepEqual(
    mergeWithOverrides(
      { topics: { politics: { keywords: ['a'] } } },
      { topics: { politics: { keywords: ['b'] }, custom: { keywords: ['x'] } } }
    ),
    {
      topics: {
        politics: { keywords: ['a', 'b'] },
        custom: { keywords: ['x'] },
      },
    }
  );
});

test('mergeWithOverrides: scalar override wins on type mismatch', () => {
  assert.deepEqual(mergeWithOverrides({ a: 1 }, { a: 'two' }), { a: 'two' });
});

test('loadDefaultTopics: YAML parses with all 10 buckets + utility lists', () => {
  _resetCache();
  const def = loadDefaultTopics();
  const slugs = Object.keys(def.topics);
  assert.equal(slugs.length, 10, '10 topic buckets');
  for (const slug of slugs) {
    const bucket = def.topics[slug];
    assert.ok(bucket.label, `${slug} has a label`);
    assert.ok(Array.isArray(bucket.keywords) && bucket.keywords.length > 0, `${slug} has keywords`);
  }
  assert.ok(Array.isArray(def.strong_verbs) && def.strong_verbs.length > 5);
  assert.ok(Array.isArray(def.attribution_words) && def.attribution_words.length > 3);
});

test('countWords: basic English', () => {
  assert.equal(countWords(''), 0);
  assert.equal(countWords('hello world'), 2);
  assert.equal(countWords("it's a one-day event"), 4);  // "it's", "a", "one-day", "event"
});

test('countOccurrences: case-insensitive word boundary', () => {
  const txt = 'Parliament passed the bill. Parliamentary procedure was orderly.';
  assert.equal(countOccurrences(txt, 'parliament'), 1, 'single-word match, no false positive on parliamentary');
  assert.equal(countOccurrences(txt, 'Parliament'), 1);
});

test('countOccurrences: multi-word phrase', () => {
  const txt = 'According to the minister, the deal is final. According to industry sources, it could collapse.';
  assert.equal(countOccurrences(txt, 'according to'), 2);
});

test('countOccurrences: hyphenated tokens preserved', () => {
  const txt = 'ZANU-PF won the by-election. ZANU PF (without hyphen) is different.';
  assert.equal(countOccurrences(txt, 'ZANU-PF'), 1);
});

test('scoreArticle: empty text scores zero for every bucket', () => {
  const score = scoreArticle('', loadDefaultTopics());
  assert.equal(score.total_words, 0);
  for (const slug of Object.keys(loadDefaultTopics().topics)) {
    assert.equal(score.topics[slug], 0);
  }
});

test('scoreArticle: politics text scores high on politics_governance', () => {
  const text =
    'Zimbabwe parliament debates new media regulation. The minister told MPs the bill would protect press freedom. ' +
    'The ruling party defended its position against the opposition.';
  const score = scoreArticle(text, loadDefaultTopics());
  assert.ok(score.topics.politics_governance > 0.1, 'politics_governance > 0.1');
  // Media-freedom bucket should also fire because of "media regulation" + "press freedom"
  assert.ok(score.topics.media_freedom > 0.05, 'media_freedom > 0.05');
});

test('scoreArticle: economy text scores high on economy_trade', () => {
  const text =
    'The Reserve Bank cut the repo rate to curb inflation. Trade between South Africa and Kenya rose, with the AfCFTA' +
    ' boosting export volumes. The JSE and the NSE both rallied.';
  const score = scoreArticle(text, loadDefaultTopics());
  assert.ok(score.topics.economy_trade > 0.2, `expected > 0.2, got ${score.topics.economy_trade}`);
});

test('scoreArticle: strong verbs and attribution are counted', () => {
  const text =
    'The minister announced the policy yesterday. According to the spokesperson, the decision was signed off ' +
    'last week. The opposition rejected the move and said it was unconstitutional.';
  const score = scoreArticle(text, loadDefaultTopics());
  assert.ok(score.strong_verbs_per_100 > 0, 'strong verbs counted');
  assert.ok(score.attribution_density > 0, 'attribution counted');
});

test('mergeWithOverrides: override adds custom topic + keyword', () => {
  const def = loadDefaultTopics();
  const override = {
    topics: {
      politics_governance: { keywords: ['ConCourt'] },  // adds a newsroom-specific term
      mining: { label: 'Mining', keywords: ['shaft', 'tailings', 'underground'] },  // brand new bucket
    },
  };
  const merged = mergeWithOverrides(def, override);
  assert.ok(merged.topics.politics_governance.keywords.includes('ConCourt'));
  assert.ok(merged.topics.politics_governance.keywords.includes('parliament'), 'default keywords retained');
  assert.deepEqual(merged.topics.mining.keywords, ['shaft', 'tailings', 'underground']);

  // Now score against the merged taxonomy
  const score = scoreArticle('The ConCourt ruling on the tailings spill was unanimous.', merged);
  assert.ok(score.topics.politics_governance > 0, 'override keyword fires');
  assert.ok(score.topics.mining > 0, 'custom bucket fires');
});

test('formatScoreLine: empty score returns empty string', () => {
  const empty = scoreArticle('', loadDefaultTopics());
  assert.equal(formatScoreLine(empty), '');
});

test('formatScoreLine: produces a useful one-liner', () => {
  const text =
    'Parliament announced new media regulation. The minister told reporters the bill would protect press freedom. ' +
    'The opposition condemned the move and said it was unconstitutional.';
  const score = scoreArticle(text, loadDefaultTopics());
  const line = formatScoreLine(score);
  assert.match(line, /Topic match:/);
  assert.match(line, /strong verbs/);
  assert.match(line, /attribution/);
});
