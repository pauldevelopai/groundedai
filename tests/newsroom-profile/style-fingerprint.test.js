// Unit tests for the style-fingerprint analyser.

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  computeFingerprint,
  formatBandedBlock,
  splitSentences,
  splitParagraphs,
  tokenWords,
} = require('../../lib/newsroom-profile/style-fingerprint');

test('splitSentences: handles . ! ? boundaries', () => {
  const s = splitSentences('Hello. World! Right? Yes.');
  assert.equal(s.length, 4);
});

test('tokenWords: skips punctuation', () => {
  const w = tokenWords("It's, well, complicated — really.");
  // "It's", "well", "complicated", "really" → 4
  assert.equal(w.length, 4);
});

test('computeFingerprint: empty array throws', () => {
  assert.throws(() => computeFingerprint({ texts: [] }), /texts\[\] required/);
});

test('computeFingerprint: terse text → short sentence_rhythm band', () => {
  const text = 'Short. Sharp. Direct. No frills. We say what we mean. ' +
    'Then we stop. Hard stops. Quick reads. ';
  const fp = computeFingerprint({ texts: [{ text }] });
  assert.ok(fp.sentence_rhythm.median <= 6, `expected <= 6, got ${fp.sentence_rhythm.median}`);
});

test('computeFingerprint: long flowery text → longer sentence_rhythm', () => {
  const text =
    'In a sweeping address to the assembled gathering of regional dignitaries and members of the press corps, ' +
    'the minister outlined a comprehensive vision for the future of the country that, while ambitious in its ' +
    'scope and breadth, would require sustained political will and broad-based public support across the ' +
    'partisan divide. The opposition responded with a carefully constructed counter-narrative that emphasised ' +
    'fiscal prudence and the structural challenges facing the economy.';
  const fp = computeFingerprint({ texts: [{ text }] });
  assert.ok(fp.sentence_rhythm.median > 30, `expected > 30, got ${fp.sentence_rhythm.median}`);
});

test('computeFingerprint: hedge_density picks up hedging language', () => {
  const heavy = "Sources say the deal may collapse. The minister reportedly told allies it could be delayed. " +
    "Officials are said to be exploring alternatives. Industry observers allegedly cautioned against the move.";
  const fp = computeFingerprint({ texts: [{ text: heavy }] });
  assert.ok(fp.hedge_density > 1.0, `expected > 1.0/100w, got ${fp.hedge_density}`);
});

test('computeFingerprint: quote_ratio detects direct quotes', () => {
  const text = 'The minister said, "We will not back down on this issue." Reporters pressed for clarification. ' +
    '"This is a matter of principle," she added. The opposition countered.';
  const fp = computeFingerprint({ texts: [{ text }] });
  assert.ok(fp.quote_ratio > 0.3, `expected > 0.3, got ${fp.quote_ratio}`);
});

test('computeFingerprint: numerical_density bumps with numbers', () => {
  const text = 'The bill was tabled on March 15. GDP grew 3.2% in Q3, down from 4.1% last year. ' +
    'The reserve cut rates 50 basis points to 7.5%.';
  const fp = computeFingerprint({ texts: [{ text }] });
  assert.ok(fp.numerical_density > 5, `expected > 5/100w, got ${fp.numerical_density}`);
});

test('computeFingerprint: place_name_density catches African gazetteer', () => {
  const text = 'Cyril Ramaphosa met with Hakainde Hichilema in Pretoria. The delegation later visited ' +
    'Cape Town and Lusaka before returning to South Africa.';
  const fp = computeFingerprint({ texts: [{ text }] });
  assert.ok(fp.place_name_density > 0, 'should detect SA + ZM places');
});

test('computeFingerprint: lede_openers auto-learn repeated openers', () => {
  const texts = [
    { text: 'In a statement, the minister announced...' },
    { text: 'In a statement, the opposition countered...' },
    { text: 'In a statement, the union welcomed the deal.' },
    { text: 'The Reserve Bank cut rates today.' },
  ];
  const fp = computeFingerprint({ texts });
  const openers = fp.lede_openers.map((l) => l.phrase);
  assert.ok(openers.includes('in a statement,'), `expected "in a statement," in openers, got: ${JSON.stringify(openers)}`);
});

test('computeFingerprint: title metadata feeds headline_length', () => {
  const fp = computeFingerprint({
    texts: [
      { text: 'short', title: 'SA-Zambia trade talks' },
      { text: 'short', title: 'Anglo American sells diamond business' },
      { text: 'short', title: 'Cape Town heatwave continues' },
    ],
  });
  assert.equal(fp.headline_length.n, 3);
  assert.ok(fp.headline_length.median >= 4 && fp.headline_length.median <= 6);
});

test('computeFingerprint: geography list extends the gazetteer', () => {
  const text = 'The minister flew to Mbombela for talks. Officials in Polokwane also weighed in.';
  const baseFp = computeFingerprint({ texts: [{ text }] });
  const withGeo = computeFingerprint({ texts: [{ text }], geography: ['Mbombela', 'Polokwane'] });
  assert.ok(withGeo.place_name_density > baseFp.place_name_density,
    `geography should bump density: base=${baseFp.place_name_density} with=${withGeo.place_name_density}`);
});

test('formatBandedBlock: produces a compact one-liner with bands', () => {
  const text = 'Short. Sharp. Direct. We do not hedge here.';
  const fp = computeFingerprint({ texts: [{ text }] });
  const block = formatBandedBlock(fp);
  assert.ok(block.startsWith('Quantified style:'));
  assert.match(block, /Sentences: short/);
});

test('formatBandedBlock: empty input → empty string', () => {
  assert.equal(formatBandedBlock(null), '');
  assert.equal(formatBandedBlock({}), '');
});
