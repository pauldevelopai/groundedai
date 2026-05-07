// Light cash-in / cash-out ledger helpers. Not a real accounting system —
// just enough to give Operations runway visibility, freelancer payable
// totals, and a finance summary. Amounts are stored as INTEGER cents.

const { pool } = require('../db');

async function listEntries(newsroomId, opts = {}) {
  const limit = opts.limit || 200;
  const direction = opts.direction || null;
  const params = [newsroomId, limit];
  let where = 'e.newsroom_id = $1';
  if (direction) { params.push(direction); where += ` AND e.direction = $${params.length}`; }
  const { rows } = await pool.query(
    `SELECT e.id, e.occurred_on, e.direction, e.category, e.description,
            e.amount_cents, e.currency, e.status, e.notes,
            e.freelancer_id, f.name AS freelancer_name,
            e.contributor_id, c.name AS contributor_name,
            e.calendar_id, cal.title AS calendar_title,
            e.funder_id,
            e.created_at
       FROM ops_finance_entries e
       LEFT JOIN freelancers f ON f.id = e.freelancer_id
       LEFT JOIN community_contributors c ON c.id = e.contributor_id
       LEFT JOIN editorial_calendar cal ON cal.id = e.calendar_id
      WHERE ${where}
      ORDER BY e.occurred_on DESC, e.created_at DESC
      LIMIT $2`,
    params
  );
  return rows;
}

/**
 * Aggregated totals by direction / category / status. Used by /api/operations/finance
 * GET to render a runway view and by the Operations agent when generating
 * a finance_summary brief.
 */
async function totals(newsroomId, opts = {}) {
  const sinceDays = opts.sinceDays || 90;
  const { rows } = await pool.query(
    `SELECT direction, category, status, currency,
            COUNT(*)::int AS n,
            COALESCE(SUM(amount_cents), 0)::bigint AS total_cents
       FROM ops_finance_entries
      WHERE newsroom_id = $1
        AND occurred_on >= CURRENT_DATE - ($2 || ' days')::interval
      GROUP BY direction, category, status, currency
      ORDER BY direction, status, total_cents DESC`,
    [newsroomId, String(sinceDays)]
  );
  return rows;
}

function formatTotalsForPrompt(rows) {
  if (!rows || rows.length === 0) return '(no finance entries in the window)';
  const groups = { income: {}, expense: {} };
  for (const r of rows) {
    const slot = (groups[r.direction] = groups[r.direction] || {});
    const key = r.currency;
    slot[key] = slot[key] || { paid: 0, pending: 0, recorded: 0, byCat: {} };
    slot[key][r.status === 'paid' ? 'paid' : r.status === 'pending' ? 'pending' : 'recorded'] += Number(r.total_cents);
    slot[key].byCat[r.category] = (slot[key].byCat[r.category] || 0) + Number(r.total_cents);
  }
  const lines = [];
  for (const dir of ['income', 'expense']) {
    const cur = groups[dir];
    if (!cur) continue;
    for (const [currency, b] of Object.entries(cur)) {
      const dollars = (n) => (n / 100).toFixed(2);
      lines.push(`${dir.toUpperCase()} (${currency}): paid ${dollars(b.paid)} · pending ${dollars(b.pending)} · recorded ${dollars(b.recorded)}`);
      const cats = Object.entries(b.byCat).sort((a, b) => b[1] - a[1]).slice(0, 5);
      for (const [cat, total] of cats) lines.push(`  · ${cat}: ${dollars(total)}`);
    }
  }
  return lines.join('\n');
}

module.exports = { listEntries, totals, formatTotalsForPrompt };
