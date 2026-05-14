// Unit tests for the sensitivity classifier. Pure function; no DB.

const test = require('node:test');
const assert = require('node:assert/strict');
const { classify, DEFAULT_RULES } = require('../../lib/sensitivity/classify');

function rules(overrides = {}) {
  return {
    always_sensitive_keywords: [...DEFAULT_RULES.always_sensitive_keywords],
    always_sensitive_workflows: [...(DEFAULT_RULES.always_sensitive_workflows || [])],
    regex_patterns: [...(DEFAULT_RULES.regex_patterns || [])],
    default_label: DEFAULT_RULES.default_label,
    ...overrides,
  };
}

test('empty input → public with confidence 0.6', () => {
  const v = classify({ text: '', rules: rules() });
  assert.equal(v.label, 'public');
  assert.equal(v.confidence, 0.6);
});

test('default keyword "whistleblower" → sensitive', () => {
  const v = classify({ text: 'A whistleblower told us today.', rules: rules() });
  assert.equal(v.label, 'sensitive');
  assert.ok(v.reasons.some((r) => r.includes('whistleblower')));
});

test('"off-record" hyphenated → sensitive', () => {
  const v = classify({ text: 'Spoke to a source off-record.', rules: rules() });
  assert.equal(v.label, 'sensitive');
});

test('"off the record" three-word variant → sensitive', () => {
  const v = classify({ text: 'They asked to go off the record.', rules: rules() });
  assert.equal(v.label, 'sensitive');
});

test('SA ID number pattern → sensitive', () => {
  const v = classify({ text: 'Their ID 8001015009087 was on the form.', rules: rules() });
  assert.equal(v.label, 'sensitive');
  assert.ok(v.reasons.some((r) => r.includes('SA ID')));
});

test('plain article text → public', () => {
  const v = classify({
    text: 'Zimbabwe parliament debates new media regulation today.',
    rules: rules(),
  });
  assert.equal(v.label, 'public');
});

test('email address → internal (soft signal)', () => {
  const v = classify({
    text: 'Contact them at jane.doe@example.org for follow-up.',
    rules: rules(),
  });
  assert.equal(v.label, 'internal');
});

test('"draft" → internal (soft signal)', () => {
  const v = classify({
    text: 'Please review this draft before we publish.',
    rules: rules(),
  });
  assert.equal(v.label, 'internal');
});

test('newsroom override custom keyword promotes to sensitive', () => {
  const v = classify({
    text: 'Our Project Aurora source is anonymous.',
    rules: rules({ always_sensitive_keywords: [...DEFAULT_RULES.always_sensitive_keywords, 'Project Aurora'] }),
  });
  assert.equal(v.label, 'sensitive');
  assert.ok(v.reasons.some((r) => r.includes('Project Aurora')));
});

test('always_sensitive_workflows triggers regardless of text', () => {
  const v = classify({
    text: 'Plain old text here.',
    workflowSlug: 'leaked-document-triage',
    rules: rules({ always_sensitive_workflows: ['leaked-document-triage'] }),
  });
  assert.equal(v.label, 'sensitive');
  assert.ok(v.reasons.some((r) => r.includes('leaked-document-triage')));
});

test('custom regex_pattern → sensitive', () => {
  const v = classify({
    text: 'Reference ACME-7421 on the contract.',
    rules: rules({ regex_patterns: ['\\bACME-\\d{4}\\b'] }),
  });
  assert.equal(v.label, 'sensitive');
});

test('malformed custom regex is ignored (does not throw)', () => {
  assert.doesNotThrow(() => {
    classify({
      text: 'anything',
      rules: rules({ regex_patterns: ['[unclosed'] }),
    });
  });
});

test('default_label override of "internal" promotes neutral text', () => {
  const v = classify({
    text: 'Zimbabwe parliament debates.',
    rules: rules({ default_label: 'internal' }),
  });
  assert.equal(v.label, 'internal');
});

test('hard keyword wins over soft signal in same text', () => {
  const v = classify({
    text: 'Email source@example.org — this is off-record.',
    rules: rules(),
  });
  assert.equal(v.label, 'sensitive');
});

test('reasons are deterministic for the same input', () => {
  const a = classify({ text: 'whistleblower spoke today', rules: rules() });
  const b = classify({ text: 'whistleblower spoke today', rules: rules() });
  assert.deepEqual(a, b);
});
