// Tests for lib/archive/extract.js. Stubs the chat() module so we control
// what "Haiku" returns and can verify the parsing + validation logic in
// extract.js without hitting the network.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

// Stub chat() BEFORE extract.js is required.
const claudePath = require.resolve('../../lib/claude');
let nextResponse = '{}';
require.cache[claudePath] = {
  exports: {
    chat: async () => ({ text: nextResponse, cost: { costUsd: 0, model: 'stub', inputTokens: 0, outputTokens: 0 } }),
    isFallbackModel: () => false,
    GROUNDED_MODEL: 'stub',
  },
  loaded: true,
  id: claudePath,
};

const { extractCustomEntities, extractRelations, extractClaims } = require('../../lib/archive/extract');

test('extractCustomEntities: empty / missing customTypes → no-op', async () => {
  const r = await extractCustomEntities({ text: 'whatever', customTypes: [] });
  assert.deepEqual(r.mentions, []);
});

test('extractCustomEntities: re-locates surface text via indexOf, drops paraphrases', async () => {
  const text = 'Anglo American mined the Cullinan pit through 2019.';
  nextResponse = JSON.stringify({
    mentions: [
      { surface_text: 'Anglo American', type_slug: 'mining_company', confidence: 0.95 },
      { surface_text: 'Cullinan pit', type_slug: 'mine_site', confidence: 0.9 },
      { surface_text: 'Anglo-American Plc', type_slug: 'mining_company', confidence: 0.7 }, // paraphrase — not literally in text
    ],
  });
  const r = await extractCustomEntities({
    text,
    customTypes: [{ slug: 'mining_company', prompt_hint: '' }, { slug: 'mine_site', prompt_hint: '' }],
  });
  // The paraphrased "Anglo-American Plc" should be dropped (not in text)
  assert.equal(r.mentions.length, 2);
  for (const m of r.mentions) {
    assert.equal(text.slice(m.char_start, m.char_end), m.surface_text, 'offsets line up with the source span');
  }
});

test('extractRelations: drops invalid indices + self-relations', async () => {
  const text = 'Cyril Ramaphosa met with Hakainde Hichilema in Pretoria.';
  const entities = [
    { id: 'e1', canonical_name: 'Cyril Ramaphosa', type_slug: 'person' },
    { id: 'e2', canonical_name: 'Hakainde Hichilema', type_slug: 'person' },
  ];
  nextResponse = JSON.stringify({
    triples: [
      { subject_idx: 0, predicate: 'met_with', object_idx: 1, evidence_text: 'Cyril Ramaphosa met with Hakainde Hichilema', confidence: 0.95 },
      { subject_idx: 0, predicate: 'is', object_idx: 0, evidence_text: 'self', confidence: 0.5 },           // self-relation
      { subject_idx: 5, predicate: 'x', object_idx: 1, evidence_text: 'bogus', confidence: 0.5 },           // out-of-range index
      { subject_idx: 0, predicate: 'met_with', object_idx: 1, evidence_text: '', confidence: 0.5 },         // empty evidence
    ],
  });
  const r = await extractRelations({ text, entities });
  assert.equal(r.triples.length, 1);
  assert.equal(r.triples[0].subject_entity_id, 'e1');
  assert.equal(r.triples[0].object_entity_id, 'e2');
  assert.equal(r.triples[0].predicate, 'met_with');
});

test('extractRelations: <2 entities → no-op', async () => {
  const r = await extractRelations({ text: 'foo', entities: [{ id: 'e1' }] });
  assert.deepEqual(r.triples, []);
});

test('extractClaims: emits claims with optional subject/object refs', async () => {
  const text = 'Ramaphosa announced a coalition framework with the DA.';
  nextResponse = JSON.stringify({
    claims: [
      { claim_text: 'Ramaphosa announced a coalition framework with the DA.', subject_idx: 0, predicate: 'announced', object_idx: null, evidence_text: 'Ramaphosa announced a coalition framework with the DA.', confidence: 0.95 },
      { claim_text: '', evidence_text: '', confidence: 0.5 }, // empty → dropped
    ],
  });
  const r = await extractClaims({ text, entities: [{ id: 'e1', canonical_name: 'Cyril Ramaphosa' }] });
  assert.equal(r.claims.length, 1);
  assert.equal(r.claims[0].subject_entity_id, 'e1');
  assert.equal(r.claims[0].object_entity_id, null);
  assert.match(r.claims[0].evidence_text, /Ramaphosa announced/);
});

test('extractClaims: short text → no-op', async () => {
  const r = await extractClaims({ text: 'short.', entities: [] });
  assert.deepEqual(r.claims, []);
});

test('extractClaims: gracefully handles non-JSON Haiku output', async () => {
  nextResponse = 'I am unable to extract claims from this text.';
  const r = await extractClaims({
    text: 'Ramaphosa announced a coalition framework with the DA. The opposition rejected it.',
    entities: [],
  });
  // Parser returns null → claims stays empty array
  assert.deepEqual(r.claims, []);
});
