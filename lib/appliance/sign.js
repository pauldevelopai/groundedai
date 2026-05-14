// HMAC-SHA256 signing helpers shared by the central app (dispatcher) and
// the appliance (verifier). V2 Step 6.
//
// Wire shape — three request headers carry the proof:
//   X-Grounded-Timestamp   ISO-8601 timestamp of when the request was signed
//   X-Grounded-Nonce       8-byte random hex; prevents accidental replay
//   X-Grounded-Signature   hex(HMAC-SHA256(secret, canonical))
//
// where canonical = `${method}\n${path}\n${timestamp}\n${nonce}\n${bodySha256Hex}`.
//
// Verification rejects:
//   - timestamp drift > MAX_CLOCK_SKEW_MS (5 min)
//   - signature mismatch
//   - body hash mismatch (catches a man-in-the-middle that tampers with
//     the body but forgets to re-sign).

const crypto = require('crypto');

const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

function sha256Hex(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

/**
 * Build the canonical string + HMAC signature for a request.
 *
 * @param {object} args
 * @param {string} args.secret         shared secret (utf-8 string)
 * @param {string} args.method         'POST' typically
 * @param {string} args.path           '/agents/run' — must match exactly
 *                                     what the server sees
 * @param {string} args.body           the raw JSON body string
 * @param {string} [args.timestamp]    override (testing)
 * @param {string} [args.nonce]        override (testing)
 * @returns {{ signature: string, timestamp: string, nonce: string, bodyHash: string }}
 */
function signRequest({ secret, method, path, body, timestamp, nonce }) {
  const ts = timestamp || new Date().toISOString();
  const nc = nonce || crypto.randomBytes(8).toString('hex');
  const bodyHash = sha256Hex(body || '');
  const canonical = `${method.toUpperCase()}\n${path}\n${ts}\n${nc}\n${bodyHash}`;
  const signature = crypto.createHmac('sha256', secret).update(canonical).digest('hex');
  return { signature, timestamp: ts, nonce: nc, bodyHash };
}

/**
 * Verify a request. Returns { ok: true } or { ok: false, reason }.
 */
function verifyRequest({ secret, method, path, body, headers }) {
  const ts = headers['x-grounded-timestamp'] || headers['X-Grounded-Timestamp'];
  const nonce = headers['x-grounded-nonce'] || headers['X-Grounded-Nonce'];
  const signature = headers['x-grounded-signature'] || headers['X-Grounded-Signature'];
  if (!ts || !nonce || !signature) {
    return { ok: false, reason: 'missing signature headers' };
  }
  const tsMs = Date.parse(ts);
  if (Number.isNaN(tsMs)) return { ok: false, reason: 'invalid timestamp' };
  if (Math.abs(Date.now() - tsMs) > MAX_CLOCK_SKEW_MS) {
    return { ok: false, reason: 'timestamp outside allowed window' };
  }
  const expected = signRequest({ secret, method, path, body, timestamp: ts, nonce });
  // Constant-time compare so timing leaks don't reveal partial matches.
  const a = Buffer.from(signature, 'hex');
  const b = Buffer.from(expected.signature, 'hex');
  if (a.length !== b.length) return { ok: false, reason: 'signature length mismatch' };
  if (!crypto.timingSafeEqual(a, b)) return { ok: false, reason: 'signature mismatch' };
  return { ok: true };
}

module.exports = { signRequest, verifyRequest, sha256Hex, MAX_CLOCK_SKEW_MS };
