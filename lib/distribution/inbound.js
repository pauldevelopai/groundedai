// Inbound submission helpers — list / load / format-for-prompt + the
// mutation primitives the API routes share with the agent.
//
// Routing is editor-confirmed: when the agent suggests a route, the
// editor approves; only then do we actually create the
// community_contributors row / editorial_calendar idea / verifier run
// reference. This avoids the agent silently spawning ghost rows.

const { pool } = require('../db');

async function listSubmissions(newsroomId, opts = {}) {
  const status = opts.status || null;
  const params = [newsroomId];
  let where = 'newsroom_id = $1';
  if (status) { params.push(status); where += ` AND status = $${params.length}`; }
  const { rows } = await pool.query(
    `SELECT id, source, sender_name, sender_contact, subject, body,
            attachments, status, classification, agent_triage,
            routed_to_contributor_id, routed_to_calendar_id, routed_to_verifier_run_id,
            routed_at, notes, created_at, updated_at
       FROM inbound_submissions
      WHERE ${where}
      ORDER BY
        CASE status WHEN 'new' THEN 0 WHEN 'in_triage' THEN 1 WHEN 'routed' THEN 2 ELSE 3 END,
        created_at DESC
      LIMIT 100`,
    params
  );
  return rows;
}

function formatForPrompt(rows) {
  if (!rows || rows.length === 0) return '(no inbound submissions)';
  const lines = [];
  for (const s of rows.slice(0, 20)) {
    const head = `[${s.source}] ${s.sender_name || s.sender_contact || 'anonymous'}`;
    lines.push(`  · ${head}${s.subject ? ` — ${truncate(s.subject, 80)}` : ''}`);
    if (s.body) lines.push(`      ${truncate(s.body, 280)}`);
  }
  return lines.join('\n');
}

function truncate(s, n) { if (!s) return ''; return s.length > n ? s.slice(0, n - 1) + '…' : s; }

module.exports = { listSubmissions, formatForPrompt };
