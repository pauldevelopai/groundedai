// URL verification helper used by the anti-hallucination guard.
// We do a HEAD first (cheap) and fall back to a truncated GET if the server
// disagrees with HEAD or blocks it. Success = 2xx or 3xx (redirects handled
// automatically by axios via maxRedirects).
import axios from 'axios';

const UA = 'AI Legal Tracker / ailegal.co.za (verification bot)';
const TIMEOUT = 8000;

// Tiny in-process cache so repeated checks (same audit run) don't re-fetch.
const cache = new Map(); // url → { ok, at }
const TTL = 60 * 60 * 1000; // 1h

export async function urlResolves(url) {
  if (!url || typeof url !== 'string') return false;
  try { new URL(url); } catch { return false; }

  const cached = cache.get(url);
  if (cached && Date.now() - cached.at < TTL) return cached.ok;

  const ok = await tryHead(url) || await tryTinyGet(url);
  cache.set(url, { ok, at: Date.now() });
  return ok;
}

async function tryHead(url) {
  try {
    const res = await axios.head(url, {
      timeout: TIMEOUT,
      maxRedirects: 5,
      headers: { 'User-Agent': UA },
      validateStatus: s => s >= 200 && s < 400,
    });
    return res.status >= 200 && res.status < 400;
  } catch {
    return false;
  }
}

async function tryTinyGet(url) {
  try {
    const res = await axios.get(url, {
      timeout: TIMEOUT,
      maxRedirects: 5,
      responseType: 'text',
      headers: { 'User-Agent': UA, 'Range': 'bytes=0-512' },
      validateStatus: s => s >= 200 && s < 400,
    });
    return res.status >= 200 && res.status < 400;
  } catch {
    return false;
  }
}
