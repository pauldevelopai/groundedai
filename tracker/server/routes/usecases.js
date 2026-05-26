// Admin CRUD for ai_legal_usecases. Mounted at /api/usecases behind requireAuth.
import { Router } from 'express';
import pool from '../db/pool.js';

const router = Router();

const WRITABLE = [
  'firm_name', 'firm_type', 'jurisdiction', 'use_case_title', 'summary',
  'tools_used', 'categories', 'outcome', 'quantified_impact',
  'source_url', 'source_urls', 'source_name', 'author', 'published_at',
  'tags', 'is_published',
];

router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM ai_legal_usecases ORDER BY updated_at DESC LIMIT 500`
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM ai_legal_usecases WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ message: 'Not found' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.post('/', async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.firm_name || !b.use_case_title || !b.source_url) {
      return res.status(400).json({ message: 'firm_name, use_case_title, source_url required' });
    }
    const cols = [];
    const placeholders = [];
    const params = [];
    for (const f of WRITABLE) {
      if (b[f] !== undefined) {
        cols.push(f);
        params.push(b[f]);
        placeholders.push(`$${params.length}${f === 'published_at' ? '::timestamptz' : ''}`);
      }
    }
    // If source_urls isn't set, derive it from source_url
    if (!cols.includes('source_urls')) {
      cols.push('source_urls');
      params.push([b.source_url]);
      placeholders.push(`$${params.length}::text[]`);
    }
    cols.push('verified_at');
    placeholders.push('NOW()');

    const { rows } = await pool.query(
      `INSERT INTO ai_legal_usecases (${cols.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`,
      params
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const b = req.body || {};
    const updates = [];
    const params = [];
    for (const f of WRITABLE) {
      if (b[f] !== undefined) {
        params.push(b[f]);
        updates.push(`${f} = $${params.length}${f === 'published_at' ? '::timestamptz' : ''}`);
      }
    }
    if (updates.length === 0) return res.status(400).json({ message: 'No fields to update' });
    params.push(req.params.id);
    updates.push('updated_at = NOW()');
    const { rows } = await pool.query(
      `UPDATE ai_legal_usecases SET ${updates.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    );
    if (rows.length === 0) return res.status(404).json({ message: 'Not found' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM ai_legal_usecases WHERE id = $1', [req.params.id]);
    if (rowCount === 0) return res.status(404).json({ message: 'Not found' });
    res.json({ deleted: true });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

export default router;
