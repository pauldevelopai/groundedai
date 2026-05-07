// Freelancer roster helpers.

const { pool } = require('../db');

async function listFreelancers(newsroomId, opts = {}) {
  const status = opts.status || null;
  const params = [newsroomId];
  let where = 'newsroom_id = $1';
  if (status) { params.push(status); where += ` AND status = $${params.length}`; }
  const { rows } = await pool.query(
    `SELECT id, name, email, phone, city, country, beats, languages,
            rate_per_piece_cents, rate_per_word_cents, preferred_currency,
            status, notes, created_at, updated_at
       FROM freelancers
      WHERE ${where}
      ORDER BY status ASC, lower(name)`,
    params
  );
  return rows;
}

/**
 * Outstanding payments owed to each freelancer. Sums all 'pending'-status
 * expense entries that name a freelancer. Used by the operations agent
 * when generating freelancer check-ins.
 */
async function outstandingPayments(newsroomId) {
  const { rows } = await pool.query(
    `SELECT f.id, f.name, f.preferred_currency,
            COALESCE(SUM(e.amount_cents) FILTER (WHERE e.status = 'pending'), 0)::bigint AS pending_cents,
            COALESCE(SUM(e.amount_cents) FILTER (WHERE e.status = 'paid'), 0)::bigint AS paid_cents
       FROM freelancers f
       LEFT JOIN ops_finance_entries e ON e.freelancer_id = f.id AND e.direction = 'expense'
      WHERE f.newsroom_id = $1
      GROUP BY f.id, f.name, f.preferred_currency
      ORDER BY pending_cents DESC, lower(f.name)`,
    [newsroomId]
  );
  return rows;
}

function formatForPrompt(rows) {
  if (!rows || rows.length === 0) return '(no freelancers on roster)';
  const lines = [];
  for (const f of rows) {
    const bits = [f.name];
    if (Array.isArray(f.beats) && f.beats.length) bits.push(`beats: ${f.beats.join(', ')}`);
    if (Array.isArray(f.languages) && f.languages.length) bits.push(`languages: ${f.languages.join(', ')}`);
    if (f.city || f.country) bits.push(`based: ${[f.city, f.country].filter(Boolean).join(', ')}`);
    if (f.rate_per_piece_cents) bits.push(`piece rate: ${(f.rate_per_piece_cents / 100).toFixed(2)} ${f.preferred_currency}`);
    if (f.rate_per_word_cents) bits.push(`word rate: ${(f.rate_per_word_cents / 100).toFixed(3)} ${f.preferred_currency}`);
    bits.push(`status: ${f.status}`);
    if (typeof f.pending_cents !== 'undefined' && Number(f.pending_cents) > 0) {
      bits.push(`OUTSTANDING ${(Number(f.pending_cents) / 100).toFixed(2)} ${f.preferred_currency}`);
    }
    lines.push(`  · ${bits.join(' · ')}`);
  }
  return lines.join('\n');
}

module.exports = { listFreelancers, outstandingPayments, formatForPrompt };
