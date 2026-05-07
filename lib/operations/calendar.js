// Editorial-calendar helpers — list / load / format-for-prompt.
//
// The Operations agent reads upcoming + overdue calendar items when it
// drafts a weekly plan or check-in. formatForPrompt() turns rows into a
// compact text block Claude can consume.

const { pool } = require('../db');

async function listUpcoming(newsroomId, opts = {}) {
  const horizonDays = opts.horizonDays || 14;
  const { rows } = await pool.query(
    `SELECT c.id, c.title, c.summary, c.beat, c.format, c.priority, c.status,
            c.deadline_at, c.scheduled_publish_at,
            c.assigned_user_id, c.assigned_freelancer_id, c.assigned_contributor_id,
            u.display_name AS assigned_user_name,
            f.name AS assigned_freelancer_name,
            cc.name AS assigned_contributor_name,
            c.notes, c.created_at, c.updated_at
       FROM editorial_calendar c
       LEFT JOIN users u ON u.id = c.assigned_user_id
       LEFT JOIN freelancers f ON f.id = c.assigned_freelancer_id
       LEFT JOIN community_contributors cc ON cc.id = c.assigned_contributor_id
      WHERE c.newsroom_id = $1
        AND c.status NOT IN ('published', 'killed')
        AND (c.deadline_at IS NULL OR c.deadline_at <= NOW() + ($2 || ' days')::interval)
      ORDER BY
        CASE WHEN c.deadline_at IS NULL THEN 1 ELSE 0 END,
        c.deadline_at NULLS LAST,
        CASE c.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 WHEN 'low' THEN 3 END
      LIMIT 100`,
    [newsroomId, String(horizonDays)]
  );
  return rows;
}

async function listAll(newsroomId, opts = {}) {
  const limit = opts.limit || 100;
  const { rows } = await pool.query(
    `SELECT c.*,
            u.display_name AS assigned_user_name,
            f.name AS assigned_freelancer_name,
            cc.name AS assigned_contributor_name
       FROM editorial_calendar c
       LEFT JOIN users u ON u.id = c.assigned_user_id
       LEFT JOIN freelancers f ON f.id = c.assigned_freelancer_id
       LEFT JOIN community_contributors cc ON cc.id = c.assigned_contributor_id
      WHERE c.newsroom_id = $1
      ORDER BY c.updated_at DESC
      LIMIT $2`,
    [newsroomId, limit]
  );
  return rows;
}

/**
 * Compact text block describing the live calendar for the agent prompt.
 * Skips published/killed items (those are history, not planning).
 */
function formatForPrompt(items) {
  if (!Array.isArray(items) || items.length === 0) return '(calendar empty)';
  const lines = [];
  for (const c of items) {
    const bits = [];
    bits.push(c.title);
    if (c.beat) bits.push(`[${c.beat}]`);
    if (c.format) bits.push(`(${c.format})`);
    bits.push(`status:${c.status}`);
    bits.push(`priority:${c.priority}`);
    if (c.deadline_at) bits.push(`deadline:${formatDate(c.deadline_at)}`);
    if (c.scheduled_publish_at) bits.push(`publish:${formatDate(c.scheduled_publish_at)}`);
    const assignee = c.assigned_user_name || c.assigned_freelancer_name || c.assigned_contributor_name;
    if (assignee) bits.push(`assigned:${assignee}`);
    let line = `  · ${bits.join(' ')}`;
    if (c.summary) line += `\n      ${truncate(c.summary, 220)}`;
    lines.push(line);
  }
  return lines.join('\n');
}

function formatDate(d) {
  try { return new Date(d).toISOString().slice(0, 10); } catch { return String(d); }
}
function truncate(s, n) { if (!s) return ''; return s.length > n ? s.slice(0, n - 1) + '…' : s; }

module.exports = { listUpcoming, listAll, formatForPrompt };
