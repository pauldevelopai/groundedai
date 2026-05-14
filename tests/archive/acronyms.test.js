// Unit tests for the acronym auto-merge detector.

const test = require('node:test');
const assert = require('node:assert/strict');
const { detectAcronymMerges, initialsOf } = require('../../lib/archive/acronyms');

test('initialsOf: simple multi-word name', () => {
  assert.equal(initialsOf('African National Congress'), 'ANC');
});

test('initialsOf: skips stopwords', () => {
  assert.equal(initialsOf('Media Institute of Southern Africa'), 'MISA');
  assert.equal(initialsOf('World Health Organization'), 'WHO');
});

test('initialsOf: dotted acronyms expand', () => {
  assert.equal(initialsOf('U.S. Agency for International Development'), 'USAID');
});

test('initialsOf: hyphens treated as word separator', () => {
  assert.equal(initialsOf('Sub-Saharan Africa'), 'SSA');
});

test('initialsOf: empty input → empty string', () => {
  assert.equal(initialsOf(''), '');
  assert.equal(initialsOf(null), '');
});

test('detectAcronymMerges: ANC + African National Congress in same chunk → merge', () => {
  const chunkText = 'The African National Congress (ANC) won the by-election.';
  const entities = [
    { id: 'e1', canonical_name: 'African National Congress', type_id: 'org' },
    { id: 'e2', canonical_name: 'ANC', type_id: 'org' },
  ];
  const directives = detectAcronymMerges({ chunkText, entities });
  assert.equal(directives.length, 1);
  assert.equal(directives[0].keepId, 'e1');
  assert.equal(directives[0].mergeId, 'e2');
});

test('detectAcronymMerges: requires same type', () => {
  const chunkText = 'The ANC and the African National Congress are the same thing.';
  const entities = [
    { id: 'e1', canonical_name: 'African National Congress', type_id: 'org' },
    { id: 'e2', canonical_name: 'ANC', type_id: 'person' },  // wrong type
  ];
  const directives = detectAcronymMerges({ chunkText, entities });
  assert.equal(directives.length, 0);
});

test('detectAcronymMerges: requires acronym to actually appear in chunk', () => {
  const chunkText = 'The African National Congress won.';   // no "ANC" token
  const entities = [
    { id: 'e1', canonical_name: 'African National Congress', type_id: 'org' },
    { id: 'e2', canonical_name: 'ANC', type_id: 'org' },
  ];
  assert.equal(detectAcronymMerges({ chunkText, entities }).length, 0);
});

test('detectAcronymMerges: requires both entities present', () => {
  const chunkText = 'The ANC won, and so did the African National Congress branch.';
  const entities = [
    { id: 'e1', canonical_name: 'African National Congress', type_id: 'org' },
    // no ANC entity in this list
  ];
  assert.equal(detectAcronymMerges({ chunkText, entities }).length, 0);
});

test('detectAcronymMerges: ambiguous expansion → skip', () => {
  const chunkText = 'The ANC and the Australian National Council and the African National Congress all met.';
  const entities = [
    { id: 'e1', canonical_name: 'African National Congress', type_id: 'org' },
    { id: 'e2', canonical_name: 'Australian National Council', type_id: 'org' },
    { id: 'e3', canonical_name: 'ANC', type_id: 'org' },
  ];
  // Both expansions match "ANC". Refuse to merge — editor must decide.
  assert.equal(detectAcronymMerges({ chunkText, entities }).length, 0);
});

test('detectAcronymMerges: WHO + World Health Organization', () => {
  const chunkText = 'The World Health Organization (WHO) issued an advisory.';
  const entities = [
    { id: 'e1', canonical_name: 'World Health Organization', type_id: 'org' },
    { id: 'e2', canonical_name: 'WHO', type_id: 'org' },
  ];
  const directives = detectAcronymMerges({ chunkText, entities });
  assert.equal(directives.length, 1);
  assert.equal(directives[0].keepId, 'e1');
});

test('detectAcronymMerges: ZANU-PF (hyphenated acronym, no expansion present) → no merge', () => {
  // Edge case: a hyphenated acronym alone, with no proper expansion in the
  // entity list. Should not produce any directives.
  const chunkText = 'ZANU-PF won the seat.';
  const entities = [
    { id: 'e1', canonical_name: 'ZANU-PF', type_id: 'org' },
  ];
  assert.equal(detectAcronymMerges({ chunkText, entities }).length, 0);
});

test('detectAcronymMerges: empty or undefined inputs → []', () => {
  assert.deepEqual(detectAcronymMerges({ chunkText: '', entities: [] }), []);
  assert.deepEqual(detectAcronymMerges({ chunkText: null, entities: [] }), []);
  assert.deepEqual(detectAcronymMerges({ chunkText: 'x', entities: null }), []);
});
