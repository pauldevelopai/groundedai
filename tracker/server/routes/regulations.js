import { Router } from 'express';
import pool from '../db/pool.js';
import { generateRegulationAnalysis, formatRegulationAsKnowledge } from '../services/claude.js';
import { scrapeArticle } from '../services/web-scraper.js';
import { createKnowledgeEntry } from '../services/knowledge.js';

const router = Router();

// List all regulations with optional filters
router.get('/', async (req, res) => {
  try {
    const { jurisdiction, status, scope, sector, q } = req.query;
    let query = 'SELECT * FROM ai_regulations WHERE 1=1';
    const params = [];

    if (jurisdiction && jurisdiction !== 'all') {
      params.push(jurisdiction);
      query += ` AND jurisdiction = $${params.length}`;
    }
    if (status && status !== 'all') {
      params.push(status);
      query += ` AND status = $${params.length}`;
    }
    if (scope) {
      params.push(scope);
      query += ` AND $${params.length} = ANY(scope)`;
    }
    if (sector) {
      params.push(sector);
      query += ` AND $${params.length} = ANY(affected_sectors)`;
    }
    if (q) {
      params.push(`%${q}%`);
      query += ` AND (regulation_name ILIKE $${params.length} OR short_name ILIKE $${params.length} OR summary ILIKE $${params.length})`;
    }

    // Sort by most recent real-world activity (effective_date, fallback to updated_at)
    query += ' ORDER BY COALESCE(effective_date, enacted_date, updated_at::date) DESC NULLS LAST, updated_at DESC';

    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Summary stats
router.get('/stats', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'in_force') AS in_force,
        COUNT(*) FILTER (WHERE status = 'enacted') AS enacted,
        COUNT(*) FILTER (WHERE status = 'partial_force') AS partial_force,
        COUNT(*) FILTER (WHERE status = 'proposed') AS proposed,
        COUNT(*) FILTER (WHERE status = 'draft') AS draft,
        COUNT(*) FILTER (WHERE status = 'consultation') AS consultation,
        COUNT(*) FILTER (WHERE status = 'amended') AS amended,
        COUNT(*) FILTER (WHERE status = 'repealed') AS repealed,
        COUNT(*) AS total,
        MAX(updated_at) AS last_updated
      FROM ai_regulations
    `);

    const { rows: byJurisdiction } = await pool.query(`
      SELECT jurisdiction, COUNT(*) AS count
      FROM ai_regulations
      GROUP BY jurisdiction
      ORDER BY count DESC
      LIMIT 15
    `);

    const { rows: recentlyUpdated } = await pool.query(`
      SELECT id, regulation_name, short_name, jurisdiction, status, regulation_type,
             effective_date, enforcement_date, next_milestone, next_milestone_notes, updated_at
      FROM ai_regulations
      ORDER BY COALESCE(effective_date, enacted_date, updated_at::date) DESC NULLS LAST, updated_at DESC
      LIMIT 5
    `);

    res.json({ ...rows[0], byJurisdiction, recentlyUpdated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Generate (or regenerate) a deep AI analysis for a single regulation
router.post('/:id/analyse', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM ai_regulations WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ message: 'Not found' });
    const r = rows[0];

    const urls = [r.official_url, r.source_url, ...(r.source_urls || [])].filter(Boolean).slice(0, 3);
    const sourceTexts = [];
    for (const url of urls) {
      try {
        const scraped = await scrapeArticle(url);
        if (scraped.success && scraped.text) {
          sourceTexts.push(`Source: ${url}\n${scraped.title || ''}\n${scraped.text.slice(0, 3000)}`);
        }
      } catch { /* skip */ }
    }

    const analysis = await generateRegulationAnalysis(r, sourceTexts);
    if (!analysis) return res.status(500).json({ message: 'Analysis generation failed' });

    await pool.query(
      'UPDATE ai_regulations SET detailed_analysis = $1, analysis_generated_at = NOW(), updated_at = NOW() WHERE id = $2',
      [analysis, req.params.id]
    );

    res.json({ detailed_analysis: analysis });
  } catch (err) {
    console.error('[Analyse regulation]', err);
    res.status(500).json({ message: err.message });
  }
});

// Add a regulation to Holly's knowledge base (or update existing entry)
router.post('/:id/add-to-knowledge', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM ai_regulations WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ message: 'Not found' });
    const r = rows[0];

    let regWithAnalysis = r;
    if (!r.detailed_analysis) {
      const urls = [r.official_url, r.source_url, ...(r.source_urls || [])].filter(Boolean).slice(0, 3);
      const sourceTexts = [];
      for (const url of urls) {
        try {
          const scraped = await scrapeArticle(url);
          if (scraped.success && scraped.text) sourceTexts.push(scraped.text.slice(0, 3000));
        } catch { /* skip */ }
      }
      const analysis = await generateRegulationAnalysis(r, sourceTexts);
      if (analysis) {
        await pool.query(
          'UPDATE ai_regulations SET detailed_analysis = $1, analysis_generated_at = NOW() WHERE id = $2',
          [analysis, r.id]
        );
        regWithAnalysis = { ...r, detailed_analysis: analysis };
      }
    }

    const content = formatRegulationAsKnowledge(regWithAnalysis);
    const tags = [
      'ai-law', 'ai-regulation', r.jurisdiction?.toLowerCase().replace(/\s+/g, '-'),
      r.regulation_type,
      ...(r.scope || []).map(s => s.toLowerCase().replace(/\s+/g, '-').slice(0, 30)),
      ...(r.affected_sectors || []).map(s => s.toLowerCase().replace(/\s+/g, '-').slice(0, 30)),
    ].filter(Boolean).slice(0, 15);

    const titleLine = r.short_name
      ? `${r.short_name} (${r.jurisdiction}) — AI Regulation`
      : `${r.regulation_name} — AI Regulation`;

    if (r.knowledge_entry_id) {
      await pool.query(
        'UPDATE knowledge_entries SET content = $1, title = $2 WHERE id = $3',
        [content, titleLine, r.knowledge_entry_id]
      );
      res.json({ knowledge_entry_id: r.knowledge_entry_id, updated: true });
    } else {
      const knowledgeId = await createKnowledgeEntry({
        category: 'regulatory_change',
        subcategory: 'ai_legal_framework',
        title: titleLine,
        content,
        sourceType: 'ai_regulation_tracker',
        sourceId: r.id,
        sourceDescription: `AI regulation tracker — ${r.regulation_type || 'regulation'}, ${r.jurisdiction}`,
        confidence: 0.9,
        tags,
      });

      await pool.query(
        'UPDATE ai_regulations SET knowledge_entry_id = $1, updated_at = NOW() WHERE id = $2',
        [knowledgeId, r.id]
      );

      res.json({ knowledge_entry_id: knowledgeId, created: true });
    }
  } catch (err) {
    console.error('[AddToKnowledge regulation]', err);
    res.status(500).json({ message: err.message });
  }
});

// Get events for a regulation (must be before /:id)
router.get('/:id/events', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM ai_regulation_events WHERE regulation_id = $1 ORDER BY event_date ASC NULLS LAST, created_at ASC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get single regulation
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM ai_regulations WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ message: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Writable field list (shared between POST and PUT)
const WRITABLE_FIELDS = [
  'regulation_name', 'short_name', 'jurisdiction', 'regulator', 'status', 'regulation_type',
  'scope', 'affected_sectors',
  'proposed_date', 'enacted_date', 'effective_date', 'enforcement_date',
  'next_milestone', 'next_milestone_notes',
  'key_provisions', 'penalties', 'extraterritorial_scope',
  'official_url', 'source_url', 'source_urls',
  'summary', 'curriculum_relevance', 'is_curriculum_relevant',
  'tags', 'external_id',
];

// Create a regulation
router.post('/', async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.regulation_name) return res.status(400).json({ message: 'regulation_name required' });
    if (!b.jurisdiction) return res.status(400).json({ message: 'jurisdiction required' });

    const cols = [];
    const placeholders = [];
    const params = [];
    for (const f of WRITABLE_FIELDS) {
      if (b[f] !== undefined) {
        cols.push(f);
        params.push(b[f]);
        placeholders.push(`$${params.length}`);
      }
    }
    // Ensure source_urls is never null (NOT NULL constraint)
    if (!cols.includes('source_urls')) {
      cols.push('source_urls');
      params.push([]);
      placeholders.push(`$${params.length}`);
    }

    const { rows } = await pool.query(
      `INSERT INTO ai_regulations (${cols.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`,
      params
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message || 'Internal server error' });
  }
});

// Update a regulation
router.put('/:id', async (req, res) => {
  try {
    const b = req.body || {};
    const updates = [];
    const params = [];
    for (const f of WRITABLE_FIELDS) {
      if (b[f] !== undefined) {
        params.push(b[f]);
        updates.push(`${f} = $${params.length}`);
      }
    }
    if (updates.length === 0) return res.status(400).json({ message: 'No fields to update' });
    params.push(req.params.id);
    updates.push(`updated_at = NOW()`);

    const { rows } = await pool.query(
      `UPDATE ai_regulations SET ${updates.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    );
    if (rows.length === 0) return res.status(404).json({ message: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Add an event to a regulation
router.post('/:id/events', async (req, res) => {
  try {
    const { event_date, event_type, title, description, source_url } = req.body;
    if (!title && !description) return res.status(400).json({ message: 'title or description required' });
    const { rows } = await pool.query(
      `INSERT INTO ai_regulation_events (regulation_id, event_date, event_type, title, description, source_url)
       VALUES ($1, $2::date, $3, $4, $5, $6) RETURNING *`,
      [req.params.id, event_date || null, event_type || 'update', title || null, description || null, source_url || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
