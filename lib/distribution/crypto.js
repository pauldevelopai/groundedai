// AES-256-GCM credential encryption for Distributor.
//
// Plaintext is a JSON object whose shape is per-channel-kind. The whole
// object is JSON.stringified, then encrypted with a 32-byte project key
// loaded from the GROUNDED_DISTRIBUTION_KEY env var (base64).
//
// In production, GROUNDED_DISTRIBUTION_KEY MUST be set and stable — losing
// it makes every stored credential unrecoverable. In dev, if it isn't
// set, we synthesise a stable per-machine key once and persist it to
// .grounded-distribution-key (gitignored), so dev work doesn't depend on
// remembering to export an env var. A console warning makes it obvious.
//
// Each ciphertext row stores (ciphertext, iv, auth_tag) all base64-encoded.
// IV is 12 bytes (GCM standard).

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

let cachedKey = null;

function getKey() {
  if (cachedKey) return cachedKey;
  const fromEnv = process.env.GROUNDED_DISTRIBUTION_KEY;
  if (fromEnv) {
    const buf = Buffer.from(fromEnv, 'base64');
    if (buf.length !== 32) {
      throw new Error('GROUNDED_DISTRIBUTION_KEY must be a base64-encoded 32-byte key.');
    }
    cachedKey = buf;
    return cachedKey;
  }
  // Dev fallback — write a stable key file once.
  const keyPath = path.join(process.cwd(), '.grounded-distribution-key');
  if (fs.existsSync(keyPath)) {
    const buf = Buffer.from(fs.readFileSync(keyPath, 'utf8').trim(), 'base64');
    if (buf.length === 32) {
      cachedKey = buf;
      return cachedKey;
    }
  }
  const fresh = crypto.randomBytes(32);
  fs.writeFileSync(keyPath, fresh.toString('base64'), { mode: 0o600 });
  console.warn(
    '[distribution/crypto] No GROUNDED_DISTRIBUTION_KEY env var set — wrote a dev key to ' +
      '.grounded-distribution-key (gitignored). Set the env var in production!'
  );
  cachedKey = fresh;
  return cachedKey;
}

/**
 * Encrypt a plaintext JSON-serialisable value into { ciphertext, iv, auth_tag }
 * (all base64). The caller stores all three in distribution_credentials.
 */
function encryptJson(plaintextValue) {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const text = JSON.stringify(plaintextValue);
  const enc = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    ciphertext: enc.toString('base64'),
    iv: iv.toString('base64'),
    auth_tag: authTag.toString('base64'),
  };
}

/**
 * Reverse of encryptJson. Throws if the auth tag mismatches (tampering /
 * key change / corrupted row).
 */
function decryptJson({ ciphertext, iv, auth_tag }) {
  const key = getKey();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(auth_tag, 'base64'));
  const dec = Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64')),
    decipher.final(),
  ]);
  return JSON.parse(dec.toString('utf8'));
}

module.exports = { encryptJson, decryptJson };
