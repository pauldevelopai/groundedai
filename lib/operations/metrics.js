// Metric snapshot helpers — list + format-for-prompt.
//
// Snapshots are deliberately free-form (JSONB metrics field) so each
// newsroom records what they actually care about. Common keys:
// stories_published, total_reach, unique_visitors, subscribers,
// revenue_cents, freelancer_spend_cents, audience_growth_pct.

const { pool } = require('../db');

async function listSnapshots(newsroomId, opts = {}) {
  const limit = opts.limit || 12;
  const { rows } = await pool.query(
    `SELECT id, period_start, period_end, label, metrics, notes, created_at
       FROM ops_metric_snapshots
      WHERE newsroom_id = $1
      ORDER BY period_end DESC, created_at DESC
      LIMIT $2`,
    [newsroomId, limit]
  );
  return rows;
}

function formatForPrompt(rows) {
  if (!rows || rows.length === 0) return '(no metric snapshots recorded yet)';
  const lines = [];
  // Newest first.
  for (let i = 0; i < Math.min(rows.length, 6); i++) {
    const s = rows[i];
    const head = `${s.label || `${s.period_start} → ${s.period_end}`}:`;
    lines.push(head);
    const m = s.metrics || {};
    for (const [k, v] of Object.entries(m).slice(0, 12)) {
      lines.push(`  · ${k}: ${formatValue(k, v)}`);
    }
    if (s.notes) lines.push(`  notes: ${truncate(s.notes, 200)}`);
  }
  return lines.join('\n');
}

function formatValue(key, v) {
  if (typeof v !== 'number') return String(v);
  if (key.endsWith('_cents')) return (v / 100).toFixed(2);
  if (key.endsWith('_pct') || key.endsWith('_percent')) return `${v.toFixed(1)}%`;
  return v.toLocaleString();
}
function truncate(s, n) { if (!s) return ''; return s.length > n ? s.slice(0, n - 1) + '…' : s; }

module.exports = { listSnapshots, formatForPrompt };
