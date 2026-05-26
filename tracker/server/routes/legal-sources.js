// Admin routes for the legal-ingest source pool: list, create, edit, delete,
// force-run, and view recent raw items + run history.
import { Router } from 'express';
import pool from '../db/pool.js';
import { dispatchSource, dispatchDueSources } from '../services/legal-ingest/dispatcher.js';
import { triagePendingItems } from '../services/legal-ingest/triage.js';
import { auditAllDates } from '../services/legal-ingest/date-audit.js';
import { generateInsightsFor } from '../services/legal-ingest/insights.js';
import { scrapeAllUrlsFor, backfillAllMentions } from '../services/legal-ingest/article-scraper.js';
import { syncLawsuitFromCourtListener, syncAllUsLawsuits, bindDocketManually, findDocketForCase } from '../services/legal-ingest/courtlistener.js';
import { buildTimelineFor } from '../services/legal-ingest/timeline-researcher.js';
import { deepResearch, deepResearchOldest } from '../services/legal-ingest/deep-research.js';
import { issueApiKey } from '../middleware/api-rate-limit.js';

const router = Router();

// ── API keys (for /api/v1/* public consumers) ───────────────────────────────

// List all keys (hashes + metadata; raw keys are never recoverable).
router.get('/api-keys', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, key_prefix, owner_name, owner_email, description, tier,
              daily_limit, requests_today, window_start, last_used_at, last_used_ip,
              revoked_at, created_at
         FROM ai_legal_api_keys
        ORDER BY revoked_at NULLS FIRST, created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error('[api-keys list]', err);
    res.status(500).json({ message: err.message });
  }
});

// Issue a new key. Body: { owner_name, owner_email?, description?, tier?, daily_limit? }.
// Returns the raw key ONCE — it cannot be retrieved again.
router.post('/api-keys', async (req, res) => {
  try {
    const { owner_name, owner_email, description, tier, daily_limit } = req.body || {};
    if (!owner_name?.trim()) return res.status(400).json({ message: 'owner_name required' });
    const result = await issueApiKey({
      ownerName:  owner_name.trim(),
      ownerEmail: owner_email || null,
      description: description || null,
      tier:       tier || 'free',
      dailyLimit: Number.isFinite(parseInt(daily_limit, 10)) ? parseInt(daily_limit, 10) : 10000,
    });
    res.status(201).json(result);
  } catch (err) {
    console.error('[api-keys create]', err);
    res.status(500).json({ message: err.message });
  }
});

// Revoke a key (soft — sets revoked_at; doesn't delete the row so the audit trail stays).
router.post('/api-keys/:id/revoke', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE ai_legal_api_keys SET revoked_at = NOW(), updated_at = NOW()
        WHERE id = $1 AND revoked_at IS NULL
        RETURNING id, key_prefix, owner_name, revoked_at`,
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ message: 'Key not found or already revoked' });
    res.json(rows[0]);
  } catch (err) {
    console.error('[api-keys revoke]', err);
    res.status(500).json({ message: err.message });
  }
});

// ── Sources ──────────────────────────────────────────────────────────────────

// List all sources with the freshest stats and last-run context.
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        s.*,
        (SELECT started_at FROM ai_legal_source_runs WHERE source_id = s.id ORDER BY started_at DESC LIMIT 1) AS last_run_started_at,
        (SELECT status     FROM ai_legal_source_runs WHERE source_id = s.id ORDER BY started_at DESC LIMIT 1) AS last_run_status
      FROM ai_legal_sources s
      ORDER BY s.active DESC, s.name ASC
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/stats', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE active)     AS active,
        COUNT(*) FILTER (WHERE NOT active) AS inactive,
        COUNT(*)                           AS total,
        SUM(items_seen)                    AS items_seen,
        SUM(items_new)                     AS items_new,
        SUM(items_promoted)                AS items_promoted
      FROM ai_legal_sources
    `);
    const { rows: rawStats } = await pool.query(`
      SELECT
        COUNT(*)::int                                       AS total,
        COUNT(*) FILTER (WHERE triage_status = 'pending')   AS pending,
        COUNT(*) FILTER (WHERE triage_status = 'promoted')  AS promoted,
        COUNT(*) FILTER (WHERE triage_status = 'rejected')  AS rejected,
        COUNT(*) FILTER (WHERE triage_status = 'duplicate') AS duplicate
      FROM ai_legal_raw_items
    `);
    res.json({ sources: rows[0], raw_items: rawStats[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Per-source health: last 10 runs, success rate, consecutive failures, avg items.
// Feeds the "Health" tab on the legal-sources admin page so Paul can spot
// broken scrapers at a glance.
router.get('/health', async (req, res) => {
  try {
    // Aggregate run stats over the last 10 runs per source (active ones only)
    const { rows } = await pool.query(`
      WITH ranked AS (
        SELECT r.*,
               ROW_NUMBER() OVER (PARTITION BY source_id ORDER BY started_at DESC) AS rn
          FROM ai_legal_source_runs r
      ), last10 AS (
        SELECT source_id,
               COUNT(*)                                                 AS runs,
               COUNT(*) FILTER (WHERE status = 'success')               AS success,
               COUNT(*) FILTER (WHERE status = 'error')                 AS error,
               AVG(items_seen)::numeric(10,2)                           AS avg_items,
               MAX(started_at)                                          AS last_run,
               -- Consecutive failures counting back from the most recent run
               SUM(CASE WHEN status = 'error' AND
                             NOT EXISTS (
                               SELECT 1 FROM ranked r2
                                WHERE r2.source_id = ranked.source_id
                                  AND r2.rn < ranked.rn
                                  AND r2.status = 'success'
                             )
                        THEN 1 ELSE 0 END)                              AS consecutive_failures
          FROM ranked
         WHERE rn <= 10
         GROUP BY source_id
      ), last_err AS (
        SELECT DISTINCT ON (source_id)
               source_id, error, started_at
          FROM ai_legal_source_runs
         WHERE status = 'error' AND error IS NOT NULL
         ORDER BY source_id, started_at DESC
      )
      SELECT s.id, s.name, s.kind, s.jurisdiction, s.active, s.last_error,
             s.items_seen, s.items_new, s.items_promoted,
             l.runs, l.success, l.error, l.avg_items, l.last_run, l.consecutive_failures,
             e.error AS last_error_message, e.started_at AS last_error_at
        FROM ai_legal_sources s
        LEFT JOIN last10    l ON l.source_id = s.id
        LEFT JOIN last_err  e ON e.source_id = s.id
       ORDER BY s.active DESC,
                COALESCE(l.consecutive_failures, 0) DESC,
                (l.runs - l.success) DESC NULLS LAST,
                s.name ASC
    `);

    // Categorise each source into healthy / degraded / broken
    const categorised = rows.map(r => {
      let status = 'unknown';
      if (!r.active) status = 'inactive';
      else if (!r.runs) status = 'unknown';
      else if ((r.consecutive_failures || 0) >= 3) status = 'broken';
      else if ((r.consecutive_failures || 0) >= 1) status = 'degraded';
      else if (r.runs && r.success === r.runs) status = 'healthy';
      else status = 'degraded';
      return { ...r, health_status: status };
    });

    const counts = categorised.reduce((acc, r) => {
      acc[r.health_status] = (acc[r.health_status] || 0) + 1;
      return acc;
    }, {});

    res.json({ counts, sources: categorised });
  } catch (err) {
    console.error('[legal-sources health]', err);
    res.status(500).json({ message: err.message });
  }
});

// Force-run every source that's due right now (must come before /:id routes)
router.post('/run-all-due', async (req, res) => {
  try {
    const summaries = await dispatchDueSources({ limit: 50 });
    res.json({ count: summaries.length, summaries });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Run Claude+web_search date audit on the N oldest-updated entities
router.post('/audit-dates', async (req, res) => {
  try {
    const limit = Math.min(50, parseInt(req.body?.limit, 10) || 10);
    const summary = await auditAllDates({ limit });
    res.json(summary);
  } catch (err) {
    console.error('[date-audit]', err);
    res.status(500).json({ message: err.message });
  }
});

// Timeline researcher: Claude + web_search enumerates every significant event
router.post('/timeline/:kind/:id', async (req, res) => {
  try {
    const { kind, id } = req.params;
    if (!['lawsuit', 'regulation'].includes(kind)) return res.status(400).json({ message: 'kind must be lawsuit or regulation' });
    const summary = await buildTimelineFor(kind, id);
    res.json(summary);
  } catch (err) {
    console.error('[timeline]', err);
    res.status(500).json({ message: err.message });
  }
});

// D4 deep research: Claude + web_search produces a multi-source dossier
// (analysis prose + 5-15 verified source mentions) per entity.
router.post('/deep-research/:kind/:id', async (req, res) => {
  try {
    const { kind, id } = req.params;
    if (!['lawsuit', 'regulation'].includes(kind)) return res.status(400).json({ message: 'kind must be lawsuit or regulation' });
    const summary = await deepResearch(kind, id);
    res.json(summary);
  } catch (err) {
    console.error('[deep-research]', err);
    res.status(500).json({ message: err.message });
  }
});

// Bulk: research the N oldest-analysed entities (deep-research-oldest?limit=10&kinds=lawsuit,regulation).
router.post('/deep-research-oldest', async (req, res) => {
  try {
    const limit = Math.min(30, parseInt(req.body?.limit, 10) || 5);
    const kindsParam = (req.body?.kinds || 'lawsuit,regulation').toString();
    const kinds = kindsParam.split(',').map(s => s.trim()).filter(Boolean);
    const results = await deepResearchOldest({ limit, kinds });
    res.json({ count: results.length, results });
  } catch (err) {
    console.error('[deep-research-oldest]', err);
    res.status(500).json({ message: err.message });
  }
});

// CourtListener: sync full docket for one US lawsuit
router.post('/courtlistener/sync/:id', async (req, res) => {
  try {
    const summary = await syncLawsuitFromCourtListener(req.params.id);
    res.json(summary);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// CourtListener: bulk sync every US case
router.post('/courtlistener/sync-all', async (req, res) => {
  try {
    const limit = Math.min(100, parseInt(req.body?.limit, 10) || 60);
    const summary = await syncAllUsLawsuits({ limit });
    res.json(summary);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// CourtListener: manually bind a docket id to a lawsuit (for ambiguous cases)
router.post('/courtlistener/bind/:id', async (req, res) => {
  try {
    const docketId = req.body?.docket_id;
    if (!docketId) return res.status(400).json({ message: 'docket_id required' });
    const summary = await bindDocketManually(req.params.id, docketId);
    res.json(summary);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// CourtListener: preview candidates for a case (used by admin UI)
router.get('/courtlistener/search', async (req, res) => {
  try {
    const q = (req.query.q || '').toString().trim();
    if (!q) return res.status(400).json({ message: 'q required' });
    const r = await findDocketForCase(q);
    res.json(r);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Scrape every source URL for one entity (fetches HTML, extracts OG/schema).
router.post('/scrape-sources/:kind/:id', async (req, res) => {
  try {
    const { kind, id } = req.params;
    if (!['lawsuit', 'regulation'].includes(kind)) return res.status(400).json({ message: 'kind must be lawsuit or regulation' });
    const summary = await scrapeAllUrlsFor(kind, id);
    res.json(summary);
  } catch (err) {
    console.error('[scrape-sources]', err);
    res.status(500).json({ message: err.message });
  }
});

// Bulk backfill — walks every entity's URLs. Fire and forget-ish; times out
// at the HTTP level for long runs, but the DB writes keep flowing.
router.post('/scrape-sources-all', async (req, res) => {
  try {
    const limit = Math.min(500, parseInt(req.body?.limit, 10) || 500);
    const summary = await backfillAllMentions({ limit });
    res.json(summary);
  } catch (err) {
    console.error('[scrape-sources-all]', err);
    res.status(500).json({ message: err.message });
  }
});

// Generate insights (industry_impact + predicted_outcome) for one entity
router.post('/insights/:kind/:id', async (req, res) => {
  try {
    const { kind, id } = req.params;
    if (!['lawsuit', 'regulation'].includes(kind)) return res.status(400).json({ message: 'kind must be lawsuit or regulation' });
    const summary = await generateInsightsFor(kind, id);
    res.json(summary);
  } catch (err) {
    console.error('[insights]', err);
    res.status(500).json({ message: err.message });
  }
});

// Manually edit an existing insight's content (admin correction).
// Leaves citations and the original model_used intact so the provenance is preserved.
router.put('/insights/:kind/:id/:type', async (req, res) => {
  try {
    const { kind, id, type } = req.params;
    const content = typeof req.body?.content === 'string' ? req.body.content.trim() : '';
    if (!['lawsuit', 'regulation'].includes(kind)) return res.status(400).json({ message: 'kind must be lawsuit or regulation' });
    if (!content) return res.status(400).json({ message: 'content required' });

    const { rows } = await pool.query(
      `UPDATE ai_legal_insights
          SET content = $1, generated_at = NOW()
        WHERE subject_kind = $2 AND subject_id = $3 AND insight_type = $4
        RETURNING insight_type, content, citations, confidence, generated_at`,
      [content, kind, id, type]
    );
    if (rows.length === 0) return res.status(404).json({ message: 'Insight not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('[insights-edit]', err);
    res.status(500).json({ message: err.message });
  }
});

// Submissions queue (admin view + review)
router.get('/submissions', async (req, res) => {
  try {
    const status = req.query.status || 'pending';
    const { rows } = await pool.query(
      `SELECT * FROM ai_legal_user_submissions
        WHERE status = $1
        ORDER BY created_at DESC
        LIMIT 100`,
      [status]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Promote a classified raw_item (use_case_candidate) into ai_legal_usecases.
// Admin may pass overrides that replace fields from the triage_result.
router.post('/raw-items/:id/promote-use-case', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT r.*, s.name AS source_name
         FROM ai_legal_raw_items r
         JOIN ai_legal_sources  s ON s.id = r.source_id
        WHERE r.id = $1`,
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ message: 'Raw item not found' });
    const item = rows[0];

    const proposed = item.triage_result?.use_case || {};
    const override = req.body?.overrides || {};

    const firm_name         = (override.firm_name         ?? proposed.firm_name         ?? '').trim();
    const firm_type         =  override.firm_type         ?? proposed.firm_type         ?? 'other';
    const jurisdiction      =  override.jurisdiction      ?? proposed.jurisdiction      ?? null;
    const use_case_title    = (override.use_case_title    ?? proposed.use_case_title    ?? item.title ?? '').trim();
    const summary           =  override.summary           ?? proposed.summary           ?? item.content?.slice(0, 2000) ?? null;
    const tools_used        =  override.tools_used        ?? proposed.tools_used        ?? [];
    const categories        =  override.categories        ?? proposed.categories        ?? [];
    const quantified_impact =  override.quantified_impact ?? proposed.quantified_impact ?? null;
    const source_url        =  override.source_url        ?? item.url;

    if (!firm_name || !use_case_title || !source_url) {
      return res.status(400).json({ message: 'firm_name, use_case_title, source_url all required' });
    }

    const { rows: inserted } = await pool.query(
      `INSERT INTO ai_legal_usecases
         (firm_name, firm_type, jurisdiction, use_case_title, summary,
          tools_used, categories, outcome, quantified_impact,
          source_url, source_urls, source_name, published_at, tags, verified_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::timestamptz,$14,NOW())
       RETURNING id`,
      [
        firm_name, firm_type, jurisdiction, use_case_title.slice(0, 500), summary,
        tools_used || [], categories || [],
        override.outcome || null, quantified_impact,
        source_url, [source_url], item.source_name || null,
        item.published_at || null,
        override.tags || ['triage-promoted'],
      ]
    );

    // Mark raw item as promoted so it doesn't reappear in the queue
    await pool.query(
      `UPDATE ai_legal_raw_items SET triage_status = 'promoted' WHERE id = $1`,
      [req.params.id]
    );

    res.json({ use_case_id: inserted[0].id, promoted: true });
  } catch (err) {
    console.error('[promote-use-case]', err);
    res.status(500).json({ message: err.message });
  }
});

router.post('/submissions/:id/review', async (req, res) => {
  try {
    const { decision, review_notes } = req.body || {};
    if (!['approved', 'rejected', 'duplicate'].includes(decision)) {
      return res.status(400).json({ message: 'decision must be approved, rejected, or duplicate' });
    }
    const { rows } = await pool.query(
      `UPDATE ai_legal_user_submissions
          SET status = $1, review_notes = $2, reviewed_at = NOW()
        WHERE id = $3
      RETURNING *`,
      [decision, review_notes || null, req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ message: 'Not found' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Triage pending raw items via Claude (must come before /:id routes)
router.post('/triage-pending', async (req, res) => {
  try {
    const limit = Math.min(200, parseInt(req.body?.limit, 10) || 20);
    const summary = await triagePendingItems({ limit });
    res.json(summary);
  } catch (err) {
    console.error('[triage]', err);
    res.status(500).json({ message: err.message });
  }
});

// Paginated raw-items view (must come before /:id routes)
router.get('/raw-items', async (req, res) => {
  try {
    const page     = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 20));
    const offset   = (page - 1) * pageSize;
    const triage   = req.query.triage;
    const sourceId = req.query.source_id;

    const where = [];
    const params = [];
    if (triage && ['pending','promoted','rejected','duplicate','classified'].includes(triage)) {
      params.push(triage);
      where.push(`r.triage_status = $${params.length}`);
    }
    if (sourceId) {
      params.push(sourceId);
      where.push(`r.source_id = $${params.length}`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const countRes = await pool.query(
      `SELECT COUNT(*)::int AS n FROM ai_legal_raw_items r ${whereSql}`,
      params
    );
    const total = countRes.rows[0].n;

    params.push(pageSize);
    params.push(offset);
    const { rows } = await pool.query(
      `SELECT r.id, r.source_id, s.name AS source_name, s.kind AS source_kind,
              r.external_id, r.url, r.title, r.author, r.published_at, r.fetched_at,
              r.triage_status, r.triage_result, r.lawsuit_id, r.regulation_id
         FROM ai_legal_raw_items r
         JOIN ai_legal_sources s ON s.id = r.source_id
        ${whereSql}
        ORDER BY r.fetched_at DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.json({ items: rows, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM ai_legal_sources WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ message: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

const WRITABLE = ['name','kind','url','jurisdiction','tags','active','run_frequency_hours','config'];

router.post('/', async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.name || !b.kind || !b.url) return res.status(400).json({ message: 'name, kind, url required' });
    const { rows } = await pool.query(
      `INSERT INTO ai_legal_sources (name, kind, url, jurisdiction, tags, active, run_frequency_hours, config)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
       RETURNING *`,
      [b.name, b.kind, b.url, b.jurisdiction || null, b.tags || [], b.active !== false, b.run_frequency_hours || 12, JSON.stringify(b.config || {})]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ message: 'Source with that kind+url already exists' });
    console.error(err);
    res.status(500).json({ message: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const updates = [];
    const params = [];
    for (const f of WRITABLE) {
      if (req.body[f] !== undefined) {
        params.push(f === 'config' ? JSON.stringify(req.body[f]) : req.body[f]);
        updates.push(`${f} = $${params.length}${f === 'config' ? '::jsonb' : ''}`);
      }
    }
    if (updates.length === 0) return res.status(400).json({ message: 'No fields to update' });
    params.push(req.params.id);
    updates.push('updated_at = NOW()');
    const { rows } = await pool.query(
      `UPDATE ai_legal_sources SET ${updates.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    );
    if (rows.length === 0) return res.status(404).json({ message: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM ai_legal_sources WHERE id = $1', [req.params.id]);
    if (rowCount === 0) return res.status(404).json({ message: 'Not found' });
    res.json({ deleted: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
});

// ── Runs ─────────────────────────────────────────────────────────────────────

// Force-run a single source immediately (fire-and-forget; return the summary)
router.post('/:id/run', async (req, res) => {
  try {
    const summary = await dispatchSource(req.params.id);
    res.json(summary);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Recent run history for one source
router.get('/:id/runs', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM ai_legal_source_runs
         WHERE source_id = $1
         ORDER BY started_at DESC
         LIMIT 20`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
