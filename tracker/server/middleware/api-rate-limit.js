// Rate limiter for /api/v1/* public endpoints.
//
// Two kinds of callers:
//   1. Anonymous (no X-API-Key header) → per-IP counter, generous but finite daily quota.
//   2. API-keyed (X-API-Key: <raw key>) → per-key counter from ai_legal_api_keys.daily_limit.
//
// Counters are kept in-memory AND (for keyed callers) synced to the DB so we
// can survive restarts for high-volume keys. Anonymous IP counters reset on
// process restart — intentional; at preview scale that's fine.
//
// Every response includes X-RateLimit-* headers so consumers can self-throttle.

import crypto from 'node:crypto';
import pool from '../db/pool.js';

const ANONYMOUS_DAILY_LIMIT = 1000;

// In-memory IP counter. Map<ip, { count, windowStart }>
const ipCounters = new Map();

// In-memory key cache so we don't SELECT on every request.
// Map<key_hash, { row, cachedAt }>
const keyCache = new Map();
const KEY_CACHE_TTL_MS = 60_000; // 1 minute

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function hashKey(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function clientIp(req) {
  // Trust X-Forwarded-For when behind nginx/lightsail. Falls back to socket.
  const xff = req.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

async function lookupKey(raw) {
  const h = hashKey(raw);
  const cached = keyCache.get(h);
  if (cached && (Date.now() - cached.cachedAt) < KEY_CACHE_TTL_MS) {
    return cached.row;
  }
  const { rows } = await pool.query(
    `SELECT id, key_hash, daily_limit, requests_today, window_start, revoked_at, tier, owner_name
       FROM ai_legal_api_keys
      WHERE key_hash = $1`,
    [h]
  );
  const row = rows[0] || null;
  keyCache.set(h, { row, cachedAt: Date.now() });
  return row;
}

async function consumeKeyedRequest(keyRow, ip) {
  const today = todayKey();
  // Reset the window at day rollover.
  const needsReset = !keyRow.window_start || keyRow.window_start.toISOString().slice(0, 10) !== today;
  const nextCount = needsReset ? 1 : (keyRow.requests_today || 0) + 1;
  const nextWindow = needsReset ? today : undefined;

  if (nextCount > keyRow.daily_limit) return { ok: false, current: keyRow.requests_today, limit: keyRow.daily_limit };

  // Fire-and-forget DB update — we don't want to slow the response.
  pool.query(
    `UPDATE ai_legal_api_keys
        SET requests_today = $1,
            window_start = COALESCE($2::date, window_start),
            last_used_at = NOW(),
            last_used_ip = $3::inet
      WHERE id = $4`,
    [nextCount, nextWindow || null, ip, keyRow.id]
  ).catch(err => console.warn('[api-rate-limit] key update failed:', err.message));

  // Invalidate cache so the next read sees the fresh count.
  keyCache.delete(keyRow.key_hash);

  return { ok: true, current: nextCount, limit: keyRow.daily_limit };
}

function consumeAnonRequest(ip) {
  const today = todayKey();
  const entry = ipCounters.get(ip);
  if (!entry || entry.windowStart !== today) {
    ipCounters.set(ip, { count: 1, windowStart: today });
    return { ok: true, current: 1, limit: ANONYMOUS_DAILY_LIMIT };
  }
  entry.count += 1;
  if (entry.count > ANONYMOUS_DAILY_LIMIT) {
    return { ok: false, current: entry.count, limit: ANONYMOUS_DAILY_LIMIT };
  }
  return { ok: true, current: entry.count, limit: ANONYMOUS_DAILY_LIMIT };
}

export function apiRateLimit() {
  return async (req, res, next) => {
    const ip = clientIp(req);
    const rawKey = req.get('x-api-key');

    let result;
    let mode = 'anonymous';
    if (rawKey) {
      try {
        const keyRow = await lookupKey(rawKey);
        if (!keyRow) {
          return res.status(401).json({ message: 'Invalid API key. Omit the X-API-Key header for anonymous access.' });
        }
        if (keyRow.revoked_at) {
          return res.status(401).json({ message: 'API key has been revoked.' });
        }
        mode = keyRow.tier || 'keyed';
        result = await consumeKeyedRequest(keyRow, ip);
      } catch (err) {
        console.error('[api-rate-limit] key lookup failed:', err);
        // Fail open to anonymous limit — we don't want a DB hiccup to take the API offline.
        result = consumeAnonRequest(ip);
      }
    } else {
      result = consumeAnonRequest(ip);
    }

    res.setHeader('X-RateLimit-Mode',      mode);
    res.setHeader('X-RateLimit-Limit',     String(result.limit));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, result.limit - result.current)));
    res.setHeader('X-RateLimit-Reset',     todayKey() + 'T23:59:59Z'); // daily reset at midnight UTC

    if (!result.ok) {
      return res.status(429).json({
        message: 'Rate limit exceeded',
        limit: result.limit,
        current: result.current,
        reset: `tomorrow (daily window, UTC)`,
        hint: rawKey
          ? 'Contact ailegal.co.za to raise your daily_limit.'
          : 'Anonymous usage is capped at 1000 requests/day per IP. Request an API key at ailegal.co.za for higher limits.',
      });
    }

    next();
  };
}

// Admin helper: generate a new API key, hash it, store it, return the raw key.
// The caller must show the raw key to the owner once — it cannot be recovered.
export async function issueApiKey({ ownerName, ownerEmail, description, tier = 'free', dailyLimit = 10000 }) {
  const raw = 'ailk_' + crypto.randomBytes(24).toString('base64url');
  const key_hash = hashKey(raw);
  const key_prefix = raw.slice(0, 12);
  const { rows } = await pool.query(
    `INSERT INTO ai_legal_api_keys (key_hash, key_prefix, owner_name, owner_email, description, tier, daily_limit)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, key_prefix, tier, daily_limit, created_at`,
    [key_hash, key_prefix, ownerName, ownerEmail || null, description || null, tier, dailyLimit]
  );
  return { ...rows[0], key: raw };
}
