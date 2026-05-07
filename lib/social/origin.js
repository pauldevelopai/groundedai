// Origin-forensics primitives: outbound URL extraction, per-domain SSL
// + WHOIS lookup, SimHash text fingerprinting, and Hamming-distance
// helpers for finding coordinated copy-paste siblings.
//
// All deterministic, all dependency-free (Node stdlib only). No paid
// APIs. Domain-age signal comes from SSL cert NotBefore (always
// available via TLS handshake) and optionally WHOIS when the `whois`
// CLI is present (post-GDPR many TLDs redact WHOIS, so we treat it as
// a bonus signal not a hard requirement).

const crypto = require('crypto');
const tls = require('tls');
const { spawn } = require('child_process');

// ─── Outbound URL extraction ─────────────────────────────────────────────

const URL_RE = /\bhttps?:\/\/[^\s<>"'`]+/gi;

/**
 * Pull all URLs from a piece of post text. Returns the unique apex
 * domains in lowercase. The full URL list is also returned so the
 * agent can reason about path-level signals (UTM sources, share
 * shorteners, etc).
 */
function extractOutboundUrls(text) {
  const urls = [];
  const domains = new Set();
  if (!text) return { urls, domains: [] };
  const matches = text.match(URL_RE) || [];
  for (const m of matches) {
    let cleaned = m.replace(/[.,;!?)>\]]+$/, '');
    urls.push(cleaned);
    try {
      const host = new URL(cleaned).hostname.toLowerCase().replace(/^www\./, '');
      if (host) domains.add(host);
    } catch { /* malformed — skip */ }
  }
  return { urls, domains: [...domains] };
}

// ─── SSL-certificate forensics ───────────────────────────────────────────

/**
 * Get the SSL certificate's NotBefore date for `domain` via a TLS
 * handshake. Returns { ssl_not_before, ssl_issuer_country } or null.
 *
 * NotBefore is a *lower bound* on domain operational age — many recent
 * domains have certs issued the day they came online via Let's Encrypt
 * automation, so a NotBefore of "3 weeks ago" on a Page that claims to
 * be a 5-year-old "African news outlet" is a strong signal.
 *
 * Times out after 5 seconds. No retries.
 */
function fetchSslCert(domain, opts = {}) {
  const timeoutMs = opts.timeoutMs || 5000;
  return new Promise((resolve) => {
    let settled = false;
    const finish = (v) => { if (!settled) { settled = true; resolve(v); } };
    let socket;
    try {
      socket = tls.connect({
        host: domain,
        port: 443,
        servername: domain,
        rejectUnauthorized: false, // we want the cert even if it's expired/invalid
        timeout: timeoutMs,
      }, () => {
        const cert = socket.getPeerCertificate(false);
        socket.end();
        if (!cert || Object.keys(cert).length === 0) return finish(null);
        finish({
          ssl_not_before: cert.valid_from || null,
          ssl_not_after: cert.valid_to || null,
          ssl_issuer_country: cert.issuer?.C || null,
          ssl_subject_country: cert.subject?.C || null,
          ssl_subject_org: cert.subject?.O || null,
        });
      });
      socket.on('timeout', () => { try { socket.destroy(); } catch {} finish(null); });
      socket.on('error', () => finish(null));
    } catch {
      finish(null);
    }
  });
}

// ─── WHOIS forensics (best-effort) ──────────────────────────────────────

/**
 * Try to glean creation date / registrant country from `whois` output.
 * Many TLDs redact WHOIS post-GDPR, so this often returns sparse data.
 * Bounded at 4 seconds. If the `whois` CLI isn't installed, returns null.
 */
function whoisLookup(domain, opts = {}) {
  const timeoutMs = opts.timeoutMs || 4000;
  return new Promise((resolve) => {
    let settled = false;
    let chunks = '';
    let timer;
    const finish = (v) => { if (!settled) { settled = true; clearTimeout(timer); resolve(v); } };
    const proc = spawn('whois', [domain], { stdio: ['ignore', 'pipe', 'ignore'] });
    timer = setTimeout(() => { try { proc.kill('SIGKILL'); } catch {} finish(null); }, timeoutMs);
    proc.stdout.on('data', (b) => { chunks += b.toString(); });
    proc.on('error', () => finish(null));
    proc.on('close', () => {
      if (!chunks) return finish(null);
      const text = chunks.toLowerCase();
      const find = (re) => { const m = chunks.match(re); return m ? m[1].trim() : null; };
      finish({
        whois_creation_date: find(/(?:creation date|created|registered on|registered):\s*([^\n]+)/i),
        whois_registrar: find(/registrar:\s*([^\n]+)/i),
        whois_registrant_country: find(/registrant country:\s*([^\n]+)/i),
        whois_country: find(/(?:country|registrant country|admin country):\s*([A-Z]{2})\b/),
        whois_redacted: text.includes('redacted for privacy') || text.includes('gdpr masked'),
      });
    });
  });
}

/**
 * Combined per-domain forensics: SSL + WHOIS, with sensible derived
 * fields like age_days for the SSL cert. Times out within 6 s total.
 */
async function lookupDomain(domain) {
  if (!domain) return null;
  const cleaned = domain.toLowerCase().replace(/^www\./, '');
  const [ssl, whois] = await Promise.all([
    fetchSslCert(cleaned),
    whoisLookup(cleaned),
  ]);
  const out = { domain: cleaned, ...(ssl || {}), ...(whois || {}) };
  if (out.ssl_not_before) {
    const dt = Date.parse(out.ssl_not_before);
    if (Number.isFinite(dt)) out.ssl_age_days = Math.max(0, Math.round((Date.now() - dt) / 86400000));
  }
  if (out.whois_creation_date) {
    const dt = Date.parse(out.whois_creation_date);
    if (Number.isFinite(dt)) out.whois_age_days = Math.max(0, Math.round((Date.now() - dt) / 86400000));
  }
  return out;
}

// ─── SimHash text fingerprinting ─────────────────────────────────────────

/**
 * Compute a 64-bit SimHash of `text`. Used for coordinated-copy-paste
 * detection: when 14 supposedly-independent accounts post text whose
 * SimHashes are within 6 bits of each other, that's a strong signal of
 * coordination even if the text isn't byte-identical.
 *
 * Algorithm:
 *   1. Lowercase + normalise the text
 *   2. Tokenise into 4-character shingles
 *   3. Hash each shingle to 64 bits via SHA-256[:8 bytes]
 *   4. SimHash: per bit position, sum +1 if hash bit is 1, -1 if 0
 *   5. Sign per position → 64-bit fingerprint
 *
 * Returns a BigInt (so the JS arithmetic stays correct) which the
 * caller serialises as a decimal string for BIGINT storage.
 */
function simhashOf(text, opts = {}) {
  const k = opts.shingleLen || 4;
  const cleaned = (text || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (cleaned.length < k * 2) return null;

  const counts = new Array(64).fill(0);
  const shingles = new Set();
  for (let i = 0; i + k <= cleaned.length; i++) {
    shingles.add(cleaned.slice(i, i + k));
  }
  if (shingles.size === 0) return null;

  for (const shingle of shingles) {
    const h = sha256BigInt64(shingle);
    for (let bit = 0; bit < 64; bit++) {
      const isSet = (h >> BigInt(bit)) & 1n;
      counts[bit] += (isSet === 1n ? 1 : -1);
    }
  }
  let sig = 0n;
  for (let bit = 0; bit < 64; bit++) {
    if (counts[bit] > 0) sig |= (1n << BigInt(bit));
  }
  // Convert to a signed 64-bit integer (so BIGINT INSERT works without
  // pg complaining about the unsigned form).
  return toSigned64(sig);
}

function sha256BigInt64(s) {
  const buf = crypto.createHash('sha256').update(s, 'utf8').digest();
  let n = 0n;
  for (let i = 0; i < 8; i++) n = (n << 8n) | BigInt(buf[i]);
  return n;
}

function toSigned64(unsigned) {
  // BigInt: if top bit set, treat as negative for two's-complement BIGINT.
  const TOP = 1n << 63n;
  return unsigned >= TOP ? unsigned - (1n << 64n) : unsigned;
}

function fromSigned64(signed) {
  return signed < 0n ? signed + (1n << 64n) : signed;
}

/**
 * Hamming distance between two 64-bit SimHashes (signed BIGINT form).
 * Distance ≤ 6 typically means "near-duplicate text"; ≤ 12 means
 * "thematically very similar"; > 20 means "mostly unrelated".
 */
function hamming(a, b) {
  let x = fromSigned64(BigInt(a)) ^ fromSigned64(BigInt(b));
  let dist = 0;
  while (x > 0n) {
    dist += Number(x & 1n);
    x >>= 1n;
  }
  return dist;
}

module.exports = {
  extractOutboundUrls,
  fetchSslCert,
  whoisLookup,
  lookupDomain,
  simhashOf,
  hamming,
  fromSigned64,
};
