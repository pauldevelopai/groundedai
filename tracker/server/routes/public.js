// Public, no-auth endpoints for the ailegal.co.za reader-facing surface.
// Mount BEFORE any auth middleware.
import { Router } from 'express';
import pool from '../db/pool.js';
import { chatAboutAiLegal } from '../services/claude.js';

// Turn a natural-language question into a Postgres-FTS-friendly query by
// dropping question words / fillers that add no search signal.
const FTS_STOPWORDS = new Set([
  'what','when','where','which','who','whom','whose','why','how',
  'is','are','was','were','be','been','being','am','do','does','did','doing',
  'have','has','had','having','can','could','should','would','may','might','must','shall','will',
  'a','an','the','and','or','but','so','if','then','than','because','of','to','from','in','on','at','by','for','with','about','against','between','into','through','during','before','after','under','over','near',
  'this','that','these','those','there','here','me','my','i','you','your','we','us','our','they','them','their','it','its','he','she',
  'tell','please','explain','describe','list','show','give','summary','summarise','summarize','briefly','short','quickly','detail','details',
  'keep','its','just','only','more','most','some','any','all','each','every','no','not',
]);
function cleanQuestionForFts(q) {
  return (q || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .split(/\s+/)
    .filter(t => t && t.length > 1 && !FTS_STOPWORDS.has(t))
    .join(' ');
}

// In-memory IP rate limiter for the public chat endpoint.
// Not durable across restarts — that's fine for a basic abuse speed bump.
// 20 requests / hour per IP.
const CHAT_LIMIT = { maxPerWindow: 20, windowMs: 60 * 60 * 1000 };
const chatHits = new Map(); // ip → [timestamp, timestamp, …]
function checkChatRateLimit(ip) {
  const now = Date.now();
  const arr = chatHits.get(ip) || [];
  const recent = arr.filter(ts => now - ts < CHAT_LIMIT.windowMs);
  if (recent.length >= CHAT_LIMIT.maxPerWindow) {
    const oldest = recent[0];
    const retryAfter = Math.ceil((CHAT_LIMIT.windowMs - (now - oldest)) / 1000);
    return { ok: false, retryAfter };
  }
  recent.push(now);
  chatHits.set(ip, recent);
  return { ok: true };
}

const router = Router();

// Columns exposed to the public for regulations (omit internal-only fields)
const PUBLIC_REG_COLS = `
  id, regulation_name, short_name, jurisdiction, regulator, status, regulation_type,
  scope, affected_sectors,
  proposed_date, enacted_date, effective_date, enforcement_date,
  next_milestone, next_milestone_notes,
  key_provisions, penalties, extraterritorial_scope,
  official_url, source_url, source_urls,
  summary, detailed_analysis,
  tags, updated_at
`;

// Only these statuses are shown publicly
const PUBLIC_REG_STATUSES = ['enacted', 'in_force', 'partial_force', 'amended'];

// Columns exposed to the public for lawsuits
const PUBLIC_LAWSUIT_COLS = `
  id, case_name, plaintiffs, defendants, court, judge, jurisdiction, district, circuit,
  status, case_type, key_issues, filing_date, last_update, next_deadline, next_deadline_notes,
  outcome, settlement_amount, case_url, source_url, source_urls,
  summary, detailed_analysis,
  tags, updated_at
`;

// ── Regulations ────────────────────────────────────────────────────────────────

router.get('/regulations', async (req, res) => {
  try {
    const { jurisdiction, scope, sector, q, status } = req.query;
    const page     = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 20));
    const offset   = (page - 1) * pageSize;

    // Filters are shared by the count query and the data query.
    const filterParts = [`status = ANY($1::text[])`];
    const params = [PUBLIC_REG_STATUSES];

    if (status && PUBLIC_REG_STATUSES.includes(status)) {
      params.push(status);
      filterParts.push(`status = $${params.length}`);
    }
    if (jurisdiction && jurisdiction !== 'all') {
      params.push(jurisdiction);
      filterParts.push(`jurisdiction = $${params.length}`);
    }
    if (scope) {
      params.push(scope);
      filterParts.push(`$${params.length} = ANY(scope)`);
    }
    if (sector) {
      params.push(sector);
      filterParts.push(`$${params.length} = ANY(affected_sectors)`);
    }
    if (q) {
      params.push(`%${q}%`);
      filterParts.push(`(regulation_name ILIKE $${params.length} OR short_name ILIKE $${params.length} OR summary ILIKE $${params.length})`);
    }
    const whereSql = 'WHERE ' + filterParts.join(' AND ');

    const countRes = await pool.query(
      `SELECT COUNT(*)::int AS n,
              COUNT(*) FILTER (WHERE status = 'in_force')::int      AS in_force_count,
              COUNT(*) FILTER (WHERE status = 'partial_force')::int AS partial_force_count,
              COUNT(*) FILTER (WHERE status = 'enacted')::int       AS enacted_count,
              COUNT(*) FILTER (WHERE status = 'amended')::int       AS amended_count
         FROM ai_regulations ${whereSql}`,
      params
    );
    const total = countRes.rows[0].n;
    const statusCounts = {
      in_force:      countRes.rows[0].in_force_count,
      partial_force: countRes.rows[0].partial_force_count,
      enacted:       countRes.rows[0].enacted_count,
      amended:       countRes.rows[0].amended_count,
    };

    params.push(pageSize);
    params.push(offset);
    // LATERAL join: single most-recent event per regulation. Sort by event
    // date (fallback effective_date, then enacted_date, then updated_at) so
    // "recent developments" truly mean recent — not seed-frozen last_update.
    const { rows } = await pool.query(
      `SELECT ${PUBLIC_REG_COLS},
              le.event_date AS latest_event_date,
              le.event_type AS latest_event_type,
              le.title      AS latest_event_title,
              le.description AS latest_event_description
         FROM ai_regulations
    LEFT JOIN LATERAL (
           SELECT event_date, event_type, title, description
             FROM ai_regulation_events
            WHERE regulation_id = ai_regulations.id
            ORDER BY event_date DESC NULLS LAST, created_at DESC
            LIMIT 1
         ) le ON true
         ${whereSql}
       ORDER BY GREATEST(
                  CASE WHEN le.event_date  > CURRENT_DATE THEN NULL ELSE le.event_date  END,
                  CASE WHEN effective_date > CURRENT_DATE THEN NULL ELSE effective_date END,
                  CASE WHEN enacted_date   > CURRENT_DATE THEN NULL ELSE enacted_date   END,
                  updated_at
                ) DESC NULLS LAST,
                COALESCE(effective_date, enacted_date, proposed_date) DESC NULLS LAST,
                updated_at DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    res.json({ items: rows, total, statusCounts, page, pageSize, totalPages: Math.ceil(total / pageSize) });
  } catch (err) {
    console.error('[public/regulations]', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Globally most-recently-updated regulations, regardless of filters or page.
// Powers the "Recently updated" pinned strip on the regulations list so its
// freshness signal stays accurate on every page (not just the current 20).
router.get('/regulations/recent', async (req, res) => {
  try {
    const limit = Math.min(20, Math.max(1, parseInt(req.query.limit, 10) || 5));
    const { rows } = await pool.query(
      `SELECT ${PUBLIC_REG_COLS},
              le.event_date AS latest_event_date,
              le.event_type AS latest_event_type,
              le.title      AS latest_event_title
         FROM ai_regulations
    LEFT JOIN LATERAL (
           SELECT event_date, event_type, title
             FROM ai_regulation_events
            WHERE regulation_id = ai_regulations.id
            ORDER BY event_date DESC NULLS LAST, created_at DESC
            LIMIT 1
         ) le ON true
        WHERE status = ANY($1::text[])
        ORDER BY GREATEST(
                  CASE WHEN le.event_date  > CURRENT_DATE THEN NULL ELSE le.event_date  END,
                  CASE WHEN effective_date > CURRENT_DATE THEN NULL ELSE effective_date END,
                  CASE WHEN enacted_date   > CURRENT_DATE THEN NULL ELSE enacted_date   END,
                  updated_at
                ) DESC NULLS LAST,
                updated_at DESC
        LIMIT $2`,
      [PUBLIC_REG_STATUSES, limit]
    );
    res.json({ items: rows });
  } catch (err) {
    console.error('[public/regulations/recent]', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/regulations/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${PUBLIC_REG_COLS} FROM ai_regulations WHERE id = $1 AND status = ANY($2::text[])`,
      [req.params.id, PUBLIC_REG_STATUSES]
    );
    if (rows.length === 0) return res.status(404).json({ message: 'Not found' });

    const { rows: events } = await pool.query(
      `SELECT id, event_date, event_type, title, description, source_url,
              source_verified_at IS NOT NULL AS source_verified
         FROM ai_regulation_events
        WHERE regulation_id = $1
        ORDER BY event_date ASC NULLS LAST, created_at ASC`,
      [req.params.id]
    );

    const { rows: insights } = await pool.query(
      `SELECT insight_type, content, citations, confidence, generated_at
         FROM ai_legal_insights
        WHERE subject_kind = 'regulation' AND subject_id = $1`,
      [req.params.id]
    );

    const { rows: mentions } = await pool.query(
      `SELECT url, canonical_url, host, title, author, site_name, description,
              body_excerpt, image_url, published_at
         FROM ai_legal_source_mentions
        WHERE subject_kind = 'regulation' AND subject_id = $1
          AND error IS NULL
        ORDER BY published_at DESC NULLS LAST, fetched_at DESC
        LIMIT 30`,
      [req.params.id]
    );

    res.json({ ...rows[0], events, insights, mentions });
  } catch (err) {
    console.error('[public/regulations/:id]', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ── Lawsuits ───────────────────────────────────────────────────────────────────

router.get('/lawsuits', async (req, res) => {
  try {
    const { jurisdiction, status, case_type, q } = req.query;
    const page     = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 20));
    const offset   = (page - 1) * pageSize;

    const filterParts = ['1=1'];
    const params = [];

    if (status && status !== 'all') {
      params.push(status);
      filterParts.push(`status = $${params.length}`);
    }
    if (jurisdiction && jurisdiction !== 'all') {
      params.push(jurisdiction);
      filterParts.push(`jurisdiction = $${params.length}`);
    }
    if (case_type && case_type !== 'all') {
      params.push(case_type);
      filterParts.push(`case_type = $${params.length}`);
    }
    if (q) {
      params.push(`%${q}%`);
      filterParts.push(`(case_name ILIKE $${params.length} OR summary ILIKE $${params.length}
                     OR EXISTS (SELECT 1 FROM unnest(defendants) d WHERE d ILIKE $${params.length})
                     OR EXISTS (SELECT 1 FROM unnest(plaintiffs) p WHERE p ILIKE $${params.length}))`);
    }
    const whereSql = 'WHERE ' + filterParts.join(' AND ');

    // One query: total + per-status breakdown, both respecting the same WHERE
    // filters so header count and stats pane always agree.
    const countRes = await pool.query(
      `SELECT COUNT(*)::int AS n,
              COUNT(*) FILTER (WHERE status = 'active')::int    AS active_count,
              COUNT(*) FILTER (WHERE status = 'appealing')::int AS appealing_count,
              COUNT(*) FILTER (WHERE status = 'settled')::int   AS settled_count,
              COUNT(*) FILTER (WHERE status = 'dismissed')::int AS dismissed_count,
              COUNT(*) FILTER (WHERE status = 'decided')::int   AS decided_count
         FROM ai_lawsuits ${whereSql}`,
      params
    );
    const total = countRes.rows[0].n;
    const statusCounts = {
      active:    countRes.rows[0].active_count,
      appealing: countRes.rows[0].appealing_count,
      settled:   countRes.rows[0].settled_count,
      dismissed: countRes.rows[0].dismissed_count,
      decided:   countRes.rows[0].decided_count,
    };

    params.push(pageSize);
    params.push(offset);
    // LATERAL join: single most-recent event per case. Sort by it so the
    // front page shows genuinely recent developments — a case filed in 2023
    // with a ruling 2 days ago ranks above a case filed last month with no
    // activity.
    const { rows } = await pool.query(
      `SELECT ${PUBLIC_LAWSUIT_COLS},
              le.event_date AS latest_event_date,
              le.event_type AS latest_event_type,
              le.title      AS latest_event_title,
              le.description AS latest_event_description
         FROM ai_lawsuits
    LEFT JOIN LATERAL (
           SELECT event_date, event_type, title, description
             FROM ai_lawsuit_events
            WHERE lawsuit_id = ai_lawsuits.id
            ORDER BY event_date DESC NULLS LAST, created_at DESC
            LIMIT 1
         ) le ON true
         ${whereSql}
       ORDER BY GREATEST(
                  CASE WHEN le.event_date > CURRENT_DATE THEN NULL ELSE le.event_date END,
                  CASE WHEN last_update   > CURRENT_DATE THEN NULL ELSE last_update   END
                ) DESC NULLS LAST,
                COALESCE(
                  CASE WHEN le.event_date > CURRENT_DATE THEN NULL ELSE le.event_date END,
                  last_update, filing_date
                ) DESC NULLS LAST,
                updated_at DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    res.json({ items: rows, total, statusCounts, page, pageSize, totalPages: Math.ceil(total / pageSize) });
  } catch (err) {
    console.error('[public/lawsuits]', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Globally most-recently-updated lawsuits, regardless of filters or page.
// Same recency criteria as the list query.
router.get('/lawsuits/recent', async (req, res) => {
  try {
    const limit = Math.min(20, Math.max(1, parseInt(req.query.limit, 10) || 5));
    const { rows } = await pool.query(
      `SELECT ${PUBLIC_LAWSUIT_COLS},
              le.event_date AS latest_event_date,
              le.event_type AS latest_event_type,
              le.title      AS latest_event_title
         FROM ai_lawsuits
    LEFT JOIN LATERAL (
           SELECT event_date, event_type, title
             FROM ai_lawsuit_events
            WHERE lawsuit_id = ai_lawsuits.id
            ORDER BY event_date DESC NULLS LAST, created_at DESC
            LIMIT 1
         ) le ON true
        ORDER BY GREATEST(
                  CASE WHEN le.event_date > CURRENT_DATE THEN NULL ELSE le.event_date END,
                  CASE WHEN last_update   > CURRENT_DATE THEN NULL ELSE last_update   END
                ) DESC NULLS LAST,
                updated_at DESC
        LIMIT $1`,
      [limit]
    );
    res.json({ items: rows });
  } catch (err) {
    console.error('[public/lawsuits/recent]', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/lawsuits/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${PUBLIC_LAWSUIT_COLS} FROM ai_lawsuits WHERE id = $1`,
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ message: 'Not found' });

    const { rows: events } = await pool.query(
      `SELECT id, event_date, event_type, title, description, source_url,
              source_verified_at IS NOT NULL AS source_verified
         FROM ai_lawsuit_events
        WHERE lawsuit_id = $1
        ORDER BY event_date ASC NULLS LAST, created_at ASC`,
      [req.params.id]
    );

    const { rows: insights } = await pool.query(
      `SELECT insight_type, content, citations, confidence, generated_at
         FROM ai_legal_insights
        WHERE subject_kind = 'lawsuit' AND subject_id = $1`,
      [req.params.id]
    );

    const { rows: mentions } = await pool.query(
      `SELECT url, canonical_url, host, title, author, site_name, description,
              body_excerpt, image_url, published_at
         FROM ai_legal_source_mentions
        WHERE subject_kind = 'lawsuit' AND subject_id = $1
          AND error IS NULL
        ORDER BY published_at DESC NULLS LAST, fetched_at DESC
        LIMIT 30`,
      [req.params.id]
    );

    res.json({ ...rows[0], events, insights, mentions });
  } catch (err) {
    console.error('[public/lawsuits/:id]', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ── Public user-submission endpoint ──────────────────────────────────────────
// Anyone can submit a case / regulation / event. It lands in the
// ai_legal_user_submissions queue as status='pending'. An admin reviews.
// Rate-limited to prevent spam (5 submissions / hour per IP).
const SUBMIT_LIMIT = { max: 5, windowMs: 60 * 60 * 1000 };
const submitHits = new Map();
function checkSubmitLimit(ip) {
  const now = Date.now();
  const arr = (submitHits.get(ip) || []).filter(ts => now - ts < SUBMIT_LIMIT.windowMs);
  if (arr.length >= SUBMIT_LIMIT.max) return false;
  arr.push(now); submitHits.set(ip, arr);
  return true;
}

router.post('/submissions', async (req, res) => {
  try {
    const ip = (req.headers['x-forwarded-for'] || req.ip || 'unknown').toString().split(',')[0].trim();
    if (!checkSubmitLimit(ip)) return res.status(429).json({ message: 'Too many submissions. Try again in an hour.' });

    const b = req.body || {};
    const source_url = (b.source_url || '').trim();
    if (!source_url || !/^https?:\/\//i.test(source_url)) {
      return res.status(400).json({ message: 'A valid source URL is required.' });
    }
    const kind = ['lawsuit', 'regulation', 'event'].includes(b.submission_kind) ? b.submission_kind : 'lawsuit';
    const caseName = (b.case_name || '').toString().slice(0, 500);
    if (!caseName) return res.status(400).json({ message: 'case_name is required.' });

    const { rows } = await pool.query(
      `INSERT INTO ai_legal_user_submissions
         (submission_kind, case_name, jurisdiction, parties, source_url, summary,
          submitter_email, submitter_ip, submitter_ua)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, created_at`,
      [
        kind,
        caseName,
        (b.jurisdiction || '').toString().slice(0, 200) || null,
        (b.parties || '').toString().slice(0, 1000) || null,
        source_url.slice(0, 2000),
        (b.summary || '').toString().slice(0, 3000) || null,
        (b.submitter_email || '').toString().slice(0, 300) || null,
        ip.slice(0, 45),
        (req.headers['user-agent'] || '').toString().slice(0, 500) || null,
      ]
    );
    res.status(201).json({ id: rows[0].id, message: 'Thank you — your submission is queued for review.' });
  } catch (err) {
    console.error('[public/submissions]', err);
    res.status(500).json({ message: 'Submission failed. Please try again later.' });
  }
});

// ── Subscriptions: "watch this case / regulation" ──────────────────────────
// Double opt-in. POST creates a pending row + returns the confirm token in the
// response body. Email delivery is handled by a separate worker (out of scope
// for this endpoint) that reads ai_legal_notifications queue rows.
//
// Until SMTP is wired, the confirm_link is also returned in the response so
// manual testing and paper-trail workflows still work.

import crypto from 'node:crypto';
function newToken() { return crypto.randomBytes(24).toString('hex'); }
function isValidEmail(s) { return typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length <= 320; }

router.post('/subscriptions', async (req, res) => {
  try {
    const ip = (req.headers['x-forwarded-for'] || req.ip || 'unknown').toString().split(',')[0].trim();
    if (!checkSubmitLimit(ip)) return res.status(429).json({ message: 'Too many requests. Try again in an hour.' });

    const b = req.body || {};
    const email = (b.email || '').toString().trim().toLowerCase();
    if (!isValidEmail(email)) return res.status(400).json({ message: 'Valid email required.' });

    const entity_kind = ['lawsuit', 'regulation', 'all'].includes(b.entity_kind) ? b.entity_kind : null;
    if (!entity_kind) return res.status(400).json({ message: 'entity_kind must be lawsuit, regulation, or all.' });

    let entity_id = null;
    if (entity_kind !== 'all') {
      entity_id = (b.entity_id || '').toString();
      if (!/^[0-9a-f-]{36}$/i.test(entity_id)) return res.status(400).json({ message: 'entity_id must be a UUID.' });
      const table = entity_kind === 'lawsuit' ? 'ai_lawsuits' : 'ai_regulations';
      const exists = await pool.query(`SELECT 1 FROM ${table} WHERE id = $1`, [entity_id]);
      if (exists.rowCount === 0) return res.status(404).json({ message: `${entity_kind} not found.` });
    }

    const confirm_token     = newToken();
    const unsubscribe_token = newToken();

    let row;
    try {
      const ins = await pool.query(
        `INSERT INTO ai_legal_subscriptions (entity_kind, entity_id, email, confirm_token, unsubscribe_token)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, confirm_token, unsubscribe_token`,
        [entity_kind, entity_id, email, confirm_token, unsubscribe_token]
      );
      row = ins.rows[0];
    } catch (err) {
      if (err.code === '23505') {
        // Duplicate — an active subscription already exists. Return 200 with
        // a friendly message; don't leak whether the existing one is confirmed.
        return res.status(200).json({ message: 'If you have an active subscription, check your inbox for a confirmation link.' });
      }
      throw err;
    }

    const base = `${req.secure || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http'}://${req.get('host') || 'ailegal.co.za'}`;
    res.status(201).json({
      message: 'Subscription created. Check your email to confirm.',
      // Exposed in the response while SMTP isn't wired so testing still works.
      // Remove once the email worker ships — consumers should never rely on this.
      confirm_link:     `${base}/api/public/subscriptions/confirm/${row.confirm_token}`,
      unsubscribe_link: `${base}/api/public/subscriptions/unsubscribe/${row.unsubscribe_token}`,
    });
  } catch (err) {
    console.error('[public/subscriptions]', err);
    res.status(500).json({ message: 'Subscription failed. Please try again later.' });
  }
});

// Confirm via GET so links in emails Just Work. Clicking returns plain HTML
// the user can read; it also sets confirmed_at so notifications will flow.
router.get('/subscriptions/confirm/:token', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE ai_legal_subscriptions
          SET confirmed_at = COALESCE(confirmed_at, NOW())
        WHERE confirm_token = $1 AND unsubscribed_at IS NULL
        RETURNING id, entity_kind, entity_id`,
      [req.params.token]
    );
    if (rows.length === 0) {
      return res.status(404).type('html').send('<!doctype html><meta charset="utf-8"><title>Not found</title><p>This confirmation link is invalid or has been revoked.</p>');
    }
    res.type('html').send(`<!doctype html><meta charset="utf-8"><title>Subscription confirmed</title>
<body style="font-family:-apple-system,sans-serif;max-width:640px;margin:60px auto;padding:0 20px;line-height:1.5">
<h1>You're in.</h1>
<p>Your subscription is confirmed. You'll receive email when there's a new event on this ${rows[0].entity_kind === 'all' ? 'tracker' : rows[0].entity_kind}.</p>
<p><a href="/legal">Back to AI Legal</a></p></body>`);
  } catch (err) {
    console.error('[public/subscriptions/confirm]', err);
    res.status(500).type('html').send('<!doctype html><title>Error</title><p>Something went wrong confirming your subscription.</p>');
  }
});

router.get('/subscriptions/unsubscribe/:token', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE ai_legal_subscriptions
          SET unsubscribed_at = NOW()
        WHERE unsubscribe_token = $1 AND unsubscribed_at IS NULL
        RETURNING id, entity_kind`,
      [req.params.token]
    );
    if (rows.length === 0) {
      return res.status(404).type('html').send('<!doctype html><meta charset="utf-8"><title>Not found</title><p>Invalid or already-unsubscribed link.</p>');
    }
    res.type('html').send(`<!doctype html><meta charset="utf-8"><title>Unsubscribed</title>
<body style="font-family:-apple-system,sans-serif;max-width:640px;margin:60px auto;padding:0 20px;line-height:1.5">
<h1>Unsubscribed.</h1>
<p>You'll no longer receive email for this ${rows[0].entity_kind === 'all' ? 'tracker' : rows[0].entity_kind}.</p>
<p><a href="/legal">Back to AI Legal</a></p></body>`);
  } catch (err) {
    console.error('[public/subscriptions/unsubscribe]', err);
    res.status(500).type('html').send('<!doctype html><title>Error</title><p>Something went wrong.</p>');
  }
});

// ── Public AI Legal chatbot ──────────────────────────────────────────────────
// FTS-backed: we pull up to 6 relevant cases + regulations for the question
// and hand them to Claude as ONLY-ALLOWED context. Scoped strictly to AI law.

router.post('/chat', async (req, res) => {
  try {
    const ip = (req.headers['x-forwarded-for'] || req.ip || 'unknown').toString().split(',')[0].trim();
    const limit = checkChatRateLimit(ip);
    if (!limit.ok) {
      res.setHeader('Retry-After', String(limit.retryAfter));
      return res.status(429).json({ message: `Too many questions. Try again in ${Math.ceil(limit.retryAfter / 60)} minutes.` });
    }

    const { message, history = [] } = req.body || {};
    if (!message || typeof message !== 'string' || message.length < 2) {
      return res.status(400).json({ message: 'message required' });
    }
    if (message.length > 500) {
      return res.status(400).json({ message: 'Question is too long (max 500 characters).' });
    }

    // FTS retrieval. Strip question stopwords first so "What cases has
    // OpenAI been sued in?" becomes the much more useful "cases openai sued".
    const ftsQuery = cleanQuestionForFts(message);

    async function search({ lawsuits }) {
      if (lawsuits) {
        const res = await pool.query(
          `SELECT id, case_name AS name, jurisdiction, status, case_type AS type,
                  array_to_string(plaintiffs, ', ') || ' v. ' || array_to_string(defendants, ', ') AS parties,
                  CASE WHEN filing_date IS NOT NULL THEN 'filed ' || filing_date::text ELSE NULL END AS dates,
                  summary,
                  ts_rank(search_tsv, websearch_to_tsquery('english', $1)) AS rank
             FROM ai_lawsuits
            WHERE search_tsv @@ websearch_to_tsquery('english', $1)
            ORDER BY rank DESC
            LIMIT 4`,
          [ftsQuery]
        );
        if (res.rows.length > 0) return res.rows;
        // Fallback: ILIKE match against case_name / summary / defendants / plaintiffs
        const tokens = ftsQuery.split(/\s+/).filter(t => t.length > 2).slice(0, 5);
        if (tokens.length === 0) return [];
        const pattern = tokens.map(t => `%${t}%`).join(''); // OR via EXISTS
        const ors = tokens.map((_, i) => `(
          case_name ILIKE $${i + 1}
          OR summary ILIKE $${i + 1}
          OR EXISTS (SELECT 1 FROM unnest(defendants) d WHERE d ILIKE $${i + 1})
          OR EXISTS (SELECT 1 FROM unnest(plaintiffs) p WHERE p ILIKE $${i + 1})
        )`).join(' OR ');
        const params = tokens.map(t => `%${t}%`);
        const fb = await pool.query(
          `SELECT id, case_name AS name, jurisdiction, status, case_type AS type,
                  array_to_string(plaintiffs, ', ') || ' v. ' || array_to_string(defendants, ', ') AS parties,
                  CASE WHEN filing_date IS NOT NULL THEN 'filed ' || filing_date::text ELSE NULL END AS dates,
                  summary
             FROM ai_lawsuits
            WHERE ${ors}
            ORDER BY updated_at DESC
            LIMIT 4`,
          params
        );
        return fb.rows;
      }
      // regulations
      const res = await pool.query(
        `SELECT id, COALESCE(short_name, regulation_name) AS name, jurisdiction, status,
                regulation_type AS type, regulator,
                CASE WHEN effective_date IS NOT NULL THEN 'effective ' || effective_date::text
                     WHEN enacted_date   IS NOT NULL THEN 'enacted '   || enacted_date::text
                     ELSE NULL END AS dates,
                summary,
                ts_rank(search_tsv, websearch_to_tsquery('english', $1)) AS rank
           FROM ai_regulations
          WHERE search_tsv @@ websearch_to_tsquery('english', $1)
            AND status = ANY($2::text[])
          ORDER BY rank DESC
          LIMIT 3`,
        [ftsQuery, PUBLIC_REG_STATUSES]
      );
      if (res.rows.length > 0) return res.rows;
      const tokens = ftsQuery.split(/\s+/).filter(t => t.length > 2).slice(0, 5);
      if (tokens.length === 0) return [];
      const ors = tokens.map((_, i) => `(
        regulation_name ILIKE $${i + 1}
        OR short_name ILIKE $${i + 1}
        OR regulator ILIKE $${i + 1}
        OR summary ILIKE $${i + 1}
      )`).join(' OR ');
      const params = tokens.map(t => `%${t}%`);
      params.push(PUBLIC_REG_STATUSES);
      const fb = await pool.query(
        `SELECT id, COALESCE(short_name, regulation_name) AS name, jurisdiction, status,
                regulation_type AS type, regulator,
                CASE WHEN effective_date IS NOT NULL THEN 'effective ' || effective_date::text
                     WHEN enacted_date   IS NOT NULL THEN 'enacted '   || enacted_date::text
                     ELSE NULL END AS dates,
                summary
           FROM ai_regulations
          WHERE (${ors})
            AND status = ANY($${params.length}::text[])
          ORDER BY updated_at DESC
          LIMIT 3`,
        params
      );
      return fb.rows;
    }

    const [lRows, rRows] = await Promise.all([search({ lawsuits: true }), search({ lawsuits: false })]);
    const contextItems = [
      ...lRows.map(r => ({ kind: 'lawsuit',    ...r })),
      ...rRows.map(r => ({ kind: 'regulation', ...r })),
    ];

    // Sanitise history shape (defensive)
    const safeHistory = (Array.isArray(history) ? history : [])
      .slice(-8) // cap at last 8 turns
      .filter(h => h && (h.role === 'user' || h.role === 'assistant') && typeof h.content === 'string')
      .map(h => ({ role: h.role, content: h.content.slice(0, 2000) }));

    const { reply, citations } = await chatAboutAiLegal({
      history: safeHistory,
      message: message.slice(0, 500),
      contextItems,
    });

    res.json({ reply, citations, context_used: contextItems.length });
  } catch (err) {
    console.error('[public/chat]', err);
    res.status(500).json({ message: err.message || 'Chat failed' });
  }
});

// ── Use cases (lawyers + firms using AI) ─────────────────────────────────────
router.get('/usecases', async (req, res) => {
  try {
    const page     = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 20));
    const offset   = (page - 1) * pageSize;
    const { firm_type, jurisdiction, category, q } = req.query;

    const filters = [`is_published = true`];
    const params = [];
    if (firm_type && firm_type !== 'all')   { params.push(firm_type);   filters.push(`firm_type = $${params.length}`); }
    if (jurisdiction && jurisdiction !== 'all') { params.push(jurisdiction); filters.push(`jurisdiction = $${params.length}`); }
    if (category && category !== 'all')     { params.push(category);    filters.push(`$${params.length} = ANY(categories)`); }
    if (q) { params.push(`%${q}%`); filters.push(`(firm_name ILIKE $${params.length} OR use_case_title ILIKE $${params.length} OR summary ILIKE $${params.length})`); }
    const whereSql = 'WHERE ' + filters.join(' AND ');

    const countRes = await pool.query(`SELECT COUNT(*)::int AS n FROM ai_legal_usecases ${whereSql}`, params);
    const total = countRes.rows[0].n;

    params.push(pageSize); params.push(offset);
    const { rows } = await pool.query(
      `SELECT id, firm_name, firm_type, jurisdiction, use_case_title, summary,
              tools_used, categories, outcome, quantified_impact,
              source_url, source_urls, source_name, author, published_at, tags, updated_at
         FROM ai_legal_usecases ${whereSql}
        ORDER BY GREATEST(published_at, updated_at) DESC NULLS LAST
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.json({ items: rows, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
  } catch (err) { console.error('[public/usecases]', err); res.status(500).json({ message: 'Internal server error' }); }
});

// Globally most-recently-updated use cases for the freshness strip.
router.get('/usecases/recent', async (req, res) => {
  try {
    const limit = Math.min(20, Math.max(1, parseInt(req.query.limit, 10) || 5));
    const { rows } = await pool.query(
      `SELECT id, firm_name, firm_type, jurisdiction, use_case_title, summary,
              tools_used, categories, outcome, quantified_impact,
              source_url, source_urls, source_name, author, published_at, tags, updated_at
         FROM ai_legal_usecases
        WHERE is_published = true
        ORDER BY GREATEST(published_at, updated_at) DESC NULLS LAST
        LIMIT $1`,
      [limit]
    );
    res.json({ items: rows });
  } catch (err) {
    console.error('[public/usecases/recent]', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/usecases/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, firm_name, firm_type, jurisdiction, use_case_title, summary,
              tools_used, categories, outcome, quantified_impact,
              source_url, source_urls, source_name, author, published_at, tags, updated_at
         FROM ai_legal_usecases WHERE id = $1 AND is_published = true`,
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ message: 'Not found' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ message: 'Internal server error' }); }
});

// ── Tools + methods ──────────────────────────────────────────────────────────
router.get('/tools', async (req, res) => {
  try {
    const { kind, category, pricing, q } = req.query;

    const filters = [`is_published = true`];
    const params = [];
    if (kind && ['tool', 'method', 'framework'].includes(kind)) { params.push(kind); filters.push(`kind = $${params.length}`); }
    if (category && category !== 'all') { params.push(category); filters.push(`category = $${params.length}`); }
    if (pricing && pricing !== 'all')   { params.push(pricing);  filters.push(`pricing = $${params.length}`); }
    if (q) { params.push(`%${q}%`); filters.push(`(name ILIKE $${params.length} OR vendor ILIKE $${params.length} OR description ILIKE $${params.length})`); }
    const whereSql = 'WHERE ' + filters.join(' AND ');

    const { rows } = await pool.query(
      `SELECT id, name, kind, vendor, category, description, url, pricing,
              strengths, limitations, integrations, source_urls, logo_url, tags, updated_at
         FROM ai_legal_tools ${whereSql}
        ORDER BY kind ASC, name ASC`,
      params
    );
    res.json(rows);
  } catch (err) { console.error('[public/tools]', err); res.status(500).json({ message: 'Internal server error' }); }
});

router.get('/tools/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, kind, vendor, category, description, url, pricing,
              strengths, limitations, integrations, source_urls, logo_url, tags, updated_at
         FROM ai_legal_tools WHERE id = $1 AND is_published = true`,
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ message: 'Not found' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ message: 'Internal server error' }); }
});

// ── Sources (transparency: where our data comes from) ────────────────────────

router.get('/sources', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        s.id, s.name, s.kind, s.url, s.jurisdiction, s.tags,
        s.run_frequency_hours, s.last_success_at, s.last_run_at,
        s.items_seen, s.items_new, s.items_promoted,
        (s.last_error IS NOT NULL) AS has_error
      FROM ai_legal_sources s
      WHERE s.active = true
      ORDER BY s.kind ASC, s.name ASC
    `);
    res.json(rows);
  } catch (err) {
    console.error('[public/sources]', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ── Transparency stats: what the agent system did recently ───────────────────

router.get('/transparency', async (req, res) => {
  try {
    // Headline counts
    const { rows: srcStats } = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE active)                                AS active,
        COUNT(*)                                                       AS total_sources,
        SUM(items_seen)                                                AS items_seen_total,
        SUM(items_new)                                                 AS items_new_total,
        SUM(items_promoted)                                            AS items_promoted_total
      FROM ai_legal_sources
    `);

    const { rows: rawStats } = await pool.query(`
      SELECT
        COUNT(*)::int                                       AS total,
        COUNT(*) FILTER (WHERE triage_status = 'pending')   AS pending,
        COUNT(*) FILTER (WHERE triage_status = 'classified') AS classified,
        COUNT(*) FILTER (WHERE triage_status = 'promoted')  AS promoted,
        COUNT(*) FILTER (WHERE triage_status = 'rejected')  AS rejected,
        COUNT(*) FILTER (WHERE triage_status = 'duplicate') AS duplicate,
        COUNT(*) FILTER (WHERE fetched_at >= NOW() - INTERVAL '24 hours') AS fetched_24h,
        COUNT(*) FILTER (WHERE triaged_at  >= NOW() - INTERVAL '24 hours') AS triaged_24h,
        COUNT(*) FILTER (WHERE fetched_at >= NOW() - INTERVAL '7 days')   AS fetched_7d,
        COUNT(*) FILTER (WHERE triaged_at  >= NOW() - INTERVAL '7 days')   AS triaged_7d
      FROM ai_legal_raw_items
    `);

    // Per-day time series for the last 30 days
    const { rows: series } = await pool.query(`
      SELECT
        (fetched_at::date)::text AS day,
        COUNT(*)::int           AS items,
        COUNT(*) FILTER (WHERE triage_status = 'promoted')::int AS promoted
      FROM ai_legal_raw_items
      WHERE fetched_at >= NOW() - INTERVAL '30 days'
      GROUP BY fetched_at::date
      ORDER BY fetched_at::date ASC
    `);

    // Latest runs (last 20) for live "agent activity" feel
    const { rows: recentRuns } = await pool.query(`
      SELECT r.id, r.started_at, r.finished_at, r.items_seen, r.items_new, r.status,
             s.name AS source_name, s.kind AS source_kind
      FROM ai_legal_source_runs r
      JOIN ai_legal_sources s ON s.id = r.source_id
      ORDER BY r.started_at DESC
      LIMIT 20
    `);

    res.json({
      sources: srcStats[0],
      items:   rawStats[0],
      series,
      recent_runs: recentRuns,
    });
  } catch (err) {
    console.error('[public/transparency]', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ── Combined chronological feed ────────────────────────────────────────────────

async function loadCombinedFeed(limit) {
  const { rows } = await pool.query(
    `
    SELECT * FROM (
      SELECT
        'lawsuit_event'::text    AS type,
        e.id                     AS event_id,
        e.event_date             AS date,
        e.event_type             AS event_type,
        e.title                  AS title,
        e.description            AS description,
        e.source_url             AS source_url,
        l.id                     AS item_id,
        l.case_name              AS item_name,
        l.jurisdiction           AS jurisdiction,
        l.status                 AS item_status,
        e.created_at             AS created_at
      FROM ai_lawsuit_events e
      JOIN ai_lawsuits l ON l.id = e.lawsuit_id

      UNION ALL

      SELECT
        'regulation_event'::text AS type,
        e.id                     AS event_id,
        e.event_date             AS date,
        e.event_type             AS event_type,
        e.title                  AS title,
        e.description            AS description,
        e.source_url             AS source_url,
        r.id                     AS item_id,
        COALESCE(r.short_name, r.regulation_name) AS item_name,
        r.jurisdiction           AS jurisdiction,
        r.status                 AS item_status,
        e.created_at             AS created_at
      FROM ai_regulation_events e
      JOIN ai_regulations r ON r.id = e.regulation_id
      WHERE r.status = ANY($2::text[])
    ) combined
    ORDER BY date DESC NULLS LAST, created_at DESC
    LIMIT $1
    `,
    [limit, PUBLIC_REG_STATUSES]
  );
  return rows;
}

// Minimal XML escaper — only the 5 characters that matter for elements/attrs.
function escXml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function siteUrl(req) {
  // Prefer the Host header so both localhost and ailegal.co.za work. Fall back
  // to the production domain since that's what public consumers will hit.
  const host = req.get('host') || 'ailegal.co.za';
  const proto = req.secure || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
  return `${proto}://${host}`;
}

function buildFeedLinks(item, base) {
  const parentPath = item.type === 'lawsuit_event' ? 'lawsuits' : 'regulations';
  return {
    parent: `${base}/legal/${parentPath}/${item.item_id}`,
    // Anchor to the specific event on the detail page (SPA scroll-to-id).
    item:   `${base}/legal/${parentPath}/${item.item_id}#event-${item.event_id}`,
  };
}

function feedItemTitle(i) {
  const prefix = i.event_type ? `[${i.event_type.replace(/_/g, ' ')}] ` : '';
  return `${prefix}${i.item_name}: ${i.title || 'update'}`;
}

router.get('/feed', async (req, res) => {
  try {
    const rawLimit = parseInt(req.query.limit, 10);
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 200) : 20;
    const rows = await loadCombinedFeed(limit);
    res.json(rows);
  } catch (err) {
    console.error('[public/feed]', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// RSS 2.0 feed — for feed-reader clients (Feedly, NetNewsWire, etc.)
router.get('/feed.rss', async (req, res) => {
  try {
    const rawLimit = parseInt(req.query.limit, 10);
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 200) : 50;
    const rows = await loadCombinedFeed(limit);
    const base = siteUrl(req);
    const selfUrl = `${base}/api/v1/feed.rss`;

    const items = rows.map(r => {
      const links = buildFeedLinks(r, base);
      const pubDate = r.date ? new Date(r.date).toUTCString() : new Date(r.created_at).toUTCString();
      const desc = [
        r.description || '',
        r.source_url ? `\n\nSource: ${r.source_url}` : '',
        `\nJurisdiction: ${r.jurisdiction || '—'}`,
      ].filter(Boolean).join('');
      return `    <item>
      <title>${escXml(feedItemTitle(r))}</title>
      <link>${escXml(links.item)}</link>
      <guid isPermaLink="false">ailegal:${r.type}:${r.event_id}</guid>
      <pubDate>${pubDate}</pubDate>
      <category>${escXml(r.type)}</category>
      <category>${escXml(r.jurisdiction || '')}</category>
      <description>${escXml(desc)}</description>
    </item>`;
    }).join('\n');

    res.type('application/rss+xml').send(
`<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>AI Legal — combined activity feed</title>
    <link>${escXml(base + '/legal')}</link>
    <description>Global AI lawsuit and regulation events, newest first.</description>
    <language>en</language>
    <generator>AI Legal / ailegal.co.za</generator>
    <atom:link href="${escXml(selfUrl)}" rel="self" type="application/rss+xml" />
    <ttl>60</ttl>
${items}
  </channel>
</rss>`);
  } catch (err) {
    console.error('[public/feed.rss]', err);
    res.status(500).type('application/rss+xml').send('<?xml version="1.0"?><rss><channel><title>error</title></channel></rss>');
  }
});

// Atom 1.0 feed — same content, alternate format.
router.get('/feed.atom', async (req, res) => {
  try {
    const rawLimit = parseInt(req.query.limit, 10);
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 200) : 50;
    const rows = await loadCombinedFeed(limit);
    const base = siteUrl(req);
    const selfUrl = `${base}/api/v1/feed.atom`;
    const updated = rows[0]?.date
      ? new Date(rows[0].date).toISOString()
      : new Date().toISOString();

    const entries = rows.map(r => {
      const links = buildFeedLinks(r, base);
      const iso = r.date ? new Date(r.date).toISOString() : new Date(r.created_at).toISOString();
      return `  <entry>
    <id>urn:ailegal:${r.type}:${r.event_id}</id>
    <title>${escXml(feedItemTitle(r))}</title>
    <link href="${escXml(links.item)}" />
    <updated>${iso}</updated>
    <category term="${escXml(r.type)}" />
    <category term="${escXml(r.jurisdiction || '')}" />
    <summary type="text">${escXml(r.description || r.title || '')}</summary>
  </entry>`;
    }).join('\n');

    res.type('application/atom+xml').send(
`<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <id>urn:ailegal:feed:combined</id>
  <title>AI Legal — combined activity feed</title>
  <subtitle>Global AI lawsuit and regulation events, newest first.</subtitle>
  <link href="${escXml(base + '/legal')}" />
  <link href="${escXml(selfUrl)}" rel="self" />
  <updated>${updated}</updated>
  <author><name>AI Legal</name><uri>${escXml(base + '/legal')}</uri></author>
  <generator>AI Legal / ailegal.co.za</generator>
${entries}
</feed>`);
  } catch (err) {
    console.error('[public/feed.atom]', err);
    res.status(500).type('application/atom+xml').send('<?xml version="1.0"?><feed><title>error</title></feed>');
  }
});

export default router;
