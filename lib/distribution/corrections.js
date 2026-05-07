// Correction-loop helpers.
//
// A correction is raised against a source piece (production / draft /
// translation / manual). Anchor finds every send the source went out
// through and seeds a per-channel propagation row. As each per-channel
// correction is dispatched, the row updates. When all rows are
// dispatched (or skipped), the correction is closed.

const { pool } = require('../db');

async function listCorrections(newsroomId) {
  const { rows } = await pool.query(
    `SELECT id, source_kind, source_id, reason, correction_text, severity,
            channel_propagation, status, notes, created_at, updated_at
       FROM distribution_corrections
      WHERE newsroom_id = $1
      ORDER BY status ASC, created_at DESC LIMIT 50`,
    [newsroomId]
  );
  return rows;
}

/**
 * Open a correction. Looks up sends matching (source_kind, source_id) and
 * seeds channel_propagation with one entry per send (status='pending').
 */
async function openCorrection(opts) {
  const { newsroomId, raisedBy, sourceKind, sourceId, reason, correctionText, severity } = opts;

  // Find the relevant sends so we know how many channels to propagate to.
  const sendsRes = await pool.query(
    `SELECT id, channel_id, status FROM distribution_sends
      WHERE newsroom_id = $1 AND source_kind = $2 AND source_id = $3
        AND status IN ('dispatched', 'dispatched_simulated')`,
    [newsroomId, sourceKind, sourceId]
  );
  const propagation = {};
  for (const s of sendsRes.rows) propagation[s.id] = 'pending';

  const { rows } = await pool.query(
    `INSERT INTO distribution_corrections
       (newsroom_id, raised_by, source_kind, source_id, reason, correction_text,
        severity, channel_propagation, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, 'open')
     RETURNING *`,
    [
      newsroomId, raisedBy || null, sourceKind, sourceId,
      reason, correctionText, severity || 'minor',
      JSON.stringify(propagation),
    ]
  );
  return rows[0];
}

/**
 * Update one channel's propagation status on a correction. Recomputes the
 * overall status based on whether all channels have moved past 'pending'.
 */
async function setChannelPropagation(correctionId, newsroomId, sendId, newStatus) {
  const allowed = ['pending', 'drafted', 'dispatched', 'dispatched_simulated', 'failed', 'skipped'];
  if (!allowed.includes(newStatus)) throw new Error(`Invalid propagation status: ${newStatus}`);

  const cur = await pool.query(
    `SELECT id, channel_propagation FROM distribution_corrections WHERE id = $1 AND newsroom_id = $2`,
    [correctionId, newsroomId]
  );
  if (cur.rows.length === 0) throw new Error('Correction not found');
  const prop = cur.rows[0].channel_propagation || {};
  prop[sendId] = newStatus;

  // Roll up overall status.
  const values = Object.values(prop);
  let overall = 'open';
  if (values.length > 0) {
    if (values.every(v => v === 'pending')) overall = 'open';
    else if (values.every(v => v === 'dispatched' || v === 'dispatched_simulated' || v === 'skipped')) overall = 'dispatched';
    else if (values.some(v => v === 'dispatched' || v === 'dispatched_simulated')) overall = 'partially_dispatched';
    else if (values.some(v => v === 'drafted')) overall = 'drafted';
  }

  const { rows } = await pool.query(
    `UPDATE distribution_corrections
        SET channel_propagation = $2::jsonb, status = $3, updated_at = NOW()
      WHERE id = $1
      RETURNING *`,
    [correctionId, JSON.stringify(prop), overall]
  );
  return rows[0];
}

module.exports = { listCorrections, openCorrection, setChannelPropagation };
