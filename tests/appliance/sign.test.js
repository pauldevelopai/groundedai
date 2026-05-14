// Unit tests for lib/appliance/sign.js. DB-free.
// Exercises the HMAC roundtrip + every rejection path.

const test = require('node:test');
const assert = require('node:assert/strict');
const { signRequest, verifyRequest, sha256Hex, MAX_CLOCK_SKEW_MS } =
  require('../../lib/appliance/sign');

const SECRET = 'test-shared-secret-1234567890';

function headersFromSignature({ signature, timestamp, nonce }) {
  return {
    'x-grounded-timestamp': timestamp,
    'x-grounded-nonce': nonce,
    'x-grounded-signature': signature,
  };
}

test('signRequest produces deterministic signature for fixed inputs', () => {
  const a = signRequest({
    secret: SECRET, method: 'POST', path: '/test', body: '{"x":1}',
    timestamp: '2026-05-14T12:00:00.000Z', nonce: 'abcdef0123456789',
  });
  const b = signRequest({
    secret: SECRET, method: 'POST', path: '/test', body: '{"x":1}',
    timestamp: '2026-05-14T12:00:00.000Z', nonce: 'abcdef0123456789',
  });
  assert.equal(a.signature, b.signature);
  assert.equal(a.signature.length, 64);  // SHA-256 hex digest is 64 chars
});

test('verifyRequest accepts a freshly signed request', () => {
  const signed = signRequest({ secret: SECRET, method: 'POST', path: '/test', body: '{"hello":"world"}' });
  const ok = verifyRequest({
    secret: SECRET, method: 'POST', path: '/test', body: '{"hello":"world"}',
    headers: headersFromSignature(signed),
  });
  assert.deepEqual(ok, { ok: true });
});

test('verifyRequest rejects a tampered body', () => {
  const signed = signRequest({ secret: SECRET, method: 'POST', path: '/test', body: '{"a":1}' });
  const v = verifyRequest({
    secret: SECRET, method: 'POST', path: '/test', body: '{"a":2}',
    headers: headersFromSignature(signed),
  });
  assert.equal(v.ok, false);
  assert.match(v.reason, /signature mismatch/);
});

test('verifyRequest rejects a tampered path', () => {
  const signed = signRequest({ secret: SECRET, method: 'POST', path: '/test', body: '{}' });
  const v = verifyRequest({
    secret: SECRET, method: 'POST', path: '/agents/run', body: '{}',
    headers: headersFromSignature(signed),
  });
  assert.equal(v.ok, false);
});

test('verifyRequest rejects with wrong secret', () => {
  const signed = signRequest({ secret: SECRET, method: 'POST', path: '/test', body: '{}' });
  const v = verifyRequest({
    secret: 'different-secret', method: 'POST', path: '/test', body: '{}',
    headers: headersFromSignature(signed),
  });
  assert.equal(v.ok, false);
});

test('verifyRequest rejects expired timestamp', () => {
  const oldTs = new Date(Date.now() - MAX_CLOCK_SKEW_MS - 1000).toISOString();
  const signed = signRequest({
    secret: SECRET, method: 'POST', path: '/test', body: '{}',
    timestamp: oldTs, nonce: 'aabbccdd',
  });
  const v = verifyRequest({
    secret: SECRET, method: 'POST', path: '/test', body: '{}',
    headers: headersFromSignature(signed),
  });
  assert.equal(v.ok, false);
  assert.match(v.reason, /timestamp/);
});

test('verifyRequest rejects future timestamp past the skew window', () => {
  const futureTs = new Date(Date.now() + MAX_CLOCK_SKEW_MS + 5000).toISOString();
  const signed = signRequest({
    secret: SECRET, method: 'POST', path: '/test', body: '{}',
    timestamp: futureTs, nonce: 'eeff0011',
  });
  const v = verifyRequest({
    secret: SECRET, method: 'POST', path: '/test', body: '{}',
    headers: headersFromSignature(signed),
  });
  assert.equal(v.ok, false);
});

test('verifyRequest rejects missing headers', () => {
  const v = verifyRequest({
    secret: SECRET, method: 'POST', path: '/test', body: '{}',
    headers: {},
  });
  assert.equal(v.ok, false);
  assert.match(v.reason, /missing/);
});

test('verifyRequest rejects malformed timestamp', () => {
  const v = verifyRequest({
    secret: SECRET, method: 'POST', path: '/test', body: '{}',
    headers: {
      'x-grounded-timestamp': 'not-a-date',
      'x-grounded-nonce': 'abc',
      'x-grounded-signature': 'deadbeef',
    },
  });
  assert.equal(v.ok, false);
  assert.match(v.reason, /timestamp/);
});

test('sha256Hex produces a 64-char hex string', () => {
  const h = sha256Hex('hello');
  assert.equal(h.length, 64);
  assert.match(h, /^[0-9a-f]+$/);
});

test('verifyRequest is case-insensitive on header names', () => {
  const signed = signRequest({ secret: SECRET, method: 'POST', path: '/test', body: '{}' });
  // Simulate Node lowercases incoming headers, fetch-style.
  const v = verifyRequest({
    secret: SECRET, method: 'POST', path: '/test', body: '{}',
    headers: {
      'X-Grounded-Timestamp': signed.timestamp,
      'X-Grounded-Nonce': signed.nonce,
      'X-Grounded-Signature': signed.signature,
    },
  });
  assert.deepEqual(v, { ok: true });
});
