// Channel + credential listing helpers. The credentials side returns
// only metadata (label, channel_kind, display_metadata, status) — never
// the ciphertext or anything that could leak secrets to the UI.

const { pool } = require('../db');

async function listCredentials(newsroomId) {
  const { rows } = await pool.query(
    `SELECT id, label, channel_kind, display_metadata, status,
            last_used_at, expires_at, created_at, updated_at
       FROM distribution_credentials
      WHERE newsroom_id = $1
      ORDER BY status ASC, channel_kind, label`,
    [newsroomId]
  );
  return rows;
}

async function listChannels(newsroomId) {
  const { rows } = await pool.query(
    `SELECT c.id, c.name, c.channel_kind, c.external_handle, c.external_url,
            c.defaults, c.status, c.notes, c.credential_id,
            cred.label AS credential_label, cred.status AS credential_status,
            c.created_at, c.updated_at
       FROM distribution_channels c
       LEFT JOIN distribution_credentials cred ON cred.id = c.credential_id
      WHERE c.newsroom_id = $1
      ORDER BY c.status ASC, c.channel_kind, lower(c.name)`,
    [newsroomId]
  );
  return rows;
}

function formatChannelsForPrompt(rows) {
  if (!rows || rows.length === 0) return '(no outbound channels configured)';
  const lines = [];
  for (const c of rows) {
    const bits = [c.name, `kind:${c.channel_kind}`];
    if (c.external_handle) bits.push(`as ${c.external_handle}`);
    if (c.status !== 'active') bits.push(`status:${c.status}`);
    lines.push(`  · ${bits.join(' · ')}`);
  }
  return lines.join('\n');
}

module.exports = { listCredentials, listChannels, formatChannelsForPrompt };
