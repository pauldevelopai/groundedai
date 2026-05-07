// Community-contributor helpers — list + format.
//
// Distinct from freelancers: contributors are unpaid / light-pay community
// sources (tipsters, eyewitnesses, civic monitors). Operations owns vetting
// and moderation routing per AGENTS.md.

const { pool } = require('../db');

async function listContributors(newsroomId, opts = {}) {
  const status = opts.vetting || null;
  const params = [newsroomId];
  let where = 'newsroom_id = $1';
  if (status) { params.push(status); where += ` AND vetting_status = $${params.length}`; }
  const { rows } = await pool.query(
    `SELECT id, name, contact, contact_kind, location,
            vetting_status, trust_score, attribution_name,
            payment_kind, total_paid_cents,
            submissions_count, submissions_published, last_submission_at,
            notes, metadata, created_at, updated_at
       FROM community_contributors
      WHERE ${where}
      ORDER BY
        CASE vetting_status WHEN 'in_review' THEN 0 WHEN 'unvetted' THEN 1 WHEN 'vetted' THEN 2 WHEN 'blocked' THEN 3 END,
        last_submission_at DESC NULLS LAST,
        lower(name)`,
    params
  );
  return rows;
}

function formatForPrompt(rows) {
  if (!rows || rows.length === 0) return '(no community contributors yet)';
  const inReview = rows.filter(r => r.vetting_status === 'in_review');
  const unvetted = rows.filter(r => r.vetting_status === 'unvetted');
  const vetted = rows.filter(r => r.vetting_status === 'vetted');
  const blocked = rows.filter(r => r.vetting_status === 'blocked');
  const lines = [];
  if (inReview.length) {
    lines.push(`In review (${inReview.length}):`);
    for (const c of inReview) lines.push(formatRow(c));
  }
  if (unvetted.length) {
    lines.push(`Unvetted (${unvetted.length}):`);
    for (const c of unvetted) lines.push(formatRow(c));
  }
  if (vetted.length) {
    lines.push(`Vetted (${vetted.length}):`);
    for (const c of vetted.slice(0, 12)) lines.push(formatRow(c));
    if (vetted.length > 12) lines.push(`  · …and ${vetted.length - 12} more vetted contributors`);
  }
  if (blocked.length) lines.push(`Blocked: ${blocked.length}`);
  return lines.join('\n');
}

function formatRow(c) {
  const bits = [c.name];
  if (c.contact_kind) bits.push(`(${c.contact_kind})`);
  if (c.location) bits.push(`location: ${c.location}`);
  bits.push(`subs: ${c.submissions_count}/${c.submissions_published} published`);
  if (typeof c.trust_score === 'number' || (c.trust_score && !isNaN(parseFloat(c.trust_score)))) {
    bits.push(`trust: ${(parseFloat(c.trust_score) * 100).toFixed(0)}%`);
  }
  return `  · ${bits.join(' · ')}`;
}

module.exports = { listContributors, formatForPrompt };
