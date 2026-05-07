// Per-channel dispatch.
//
// During the pilot, dispatch is SIMULATED — we record the send row, mark
// it 'dispatched_simulated', generate a stub permalink that includes the
// send id, and return. This is the safest default while editors are
// learning the system; nothing leaves the machine. Real per-channel
// adapters (Twitter API, WordPress XML-RPC, WhatsApp Business Cloud API,
// etc) plug in here per channel_kind without changing the schema or the
// agent prompt.
//
// To wire a real adapter for channel kind 'twitter': add a function
// dispatchTwitter(channel, plaintextCreds, payload) and route to it from
// dispatchToChannel(). The decrypt happens inside this module; ciphertext
// never crosses out to the agent or the API layer.

const { pool } = require('../db');
const { decryptJson } = require('./crypto');

/**
 * Create a queued send row.
 *
 * @param {object} opts
 * @param {string} opts.newsroomId
 * @param {string} opts.channelId
 * @param {string} opts.sourceKind  'production' | 'draft' | 'translation' | 'manual'
 * @param {string} [opts.sourceId]
 * @param {string} [opts.sourceCalendarId]
 * @param {object} opts.payload      per-channel-shaped payload to send
 * @param {string} [opts.scheduledFor]
 * @param {string} [opts.userId]
 */
async function queueSend(opts) {
  const { rows } = await pool.query(
    `INSERT INTO distribution_sends
       (newsroom_id, channel_id, initiated_by, source_kind, source_id, source_calendar_id,
        payload, status, scheduled_for)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, 'queued', $8)
     RETURNING *`,
    [
      opts.newsroomId, opts.channelId, opts.userId || null,
      opts.sourceKind, opts.sourceId || null, opts.sourceCalendarId || null,
      JSON.stringify(opts.payload || {}),
      opts.scheduledFor || null,
    ]
  );
  return rows[0];
}

/**
 * Dispatch a queued send. Looks up the channel + credentials, decrypts
 * the credentials, then routes by channel_kind. Pilot default is to
 * simulate the dispatch; real adapters plug into the switch below.
 */
async function dispatchSend(sendId, newsroomId) {
  const sendRes = await pool.query(
    `SELECT s.*, c.channel_kind, c.name AS channel_name, c.credential_id, c.external_url
       FROM distribution_sends s
       JOIN distribution_channels c ON c.id = s.channel_id
      WHERE s.id = $1 AND s.newsroom_id = $2`,
    [sendId, newsroomId]
  );
  const send = sendRes.rows[0];
  if (!send) throw new Error('Send not found');
  if (send.status === 'dispatched' || send.status === 'dispatched_simulated') {
    return { send, alreadyDispatched: true };
  }

  await pool.query(
    `UPDATE distribution_sends SET status = 'dispatching', updated_at = NOW() WHERE id = $1`,
    [send.id]
  );

  // Decrypt creds (we don't pass plaintext anywhere except the per-channel
  // adapter we route to). For pilot simulation, we don't actually use them.
  let plaintextCreds = null;
  if (send.credential_id) {
    const credRes = await pool.query(
      `SELECT ciphertext, iv, auth_tag FROM distribution_credentials WHERE id = $1`,
      [send.credential_id]
    );
    if (credRes.rows[0]) {
      try { plaintextCreds = decryptJson(credRes.rows[0]); }
      catch (e) {
        await markFailed(send.id, `Could not decrypt channel credentials: ${e.message}`);
        throw new Error('Credential decryption failed (key changed or row tampered).');
      }
    }
  }

  // Per-channel routing. Add real adapters here as they ship.
  // For each, return { externalId, permalink } on success.
  let result;
  try {
    switch (send.channel_kind) {
      // case 'twitter': result = await dispatchTwitter(send, plaintextCreds); break;
      // case 'wordpress': result = await dispatchWordpress(send, plaintextCreds); break;
      // ...
      default:
        result = simulateDispatch(send, plaintextCreds);
        break;
    }
  } catch (err) {
    await markFailed(send.id, err instanceof Error ? err.message : String(err));
    throw err;
  }

  const status = result.simulated ? 'dispatched_simulated' : 'dispatched';
  const upd = await pool.query(
    `UPDATE distribution_sends
        SET status = $2, external_id = $3, permalink = $4, dispatched_at = NOW(), updated_at = NOW()
      WHERE id = $1
      RETURNING *`,
    [send.id, status, result.externalId || null, result.permalink || null]
  );
  if (send.credential_id) {
    await pool.query(`UPDATE distribution_credentials SET last_used_at = NOW() WHERE id = $1`, [send.credential_id]);
  }
  return { send: upd.rows[0], alreadyDispatched: false };
}

async function markFailed(sendId, message) {
  await pool.query(
    `UPDATE distribution_sends SET status = 'failed', error = $2, updated_at = NOW() WHERE id = $1`,
    [sendId, message]
  );
}

function simulateDispatch(send, _plaintextCreds) {
  // Stub permalink — looks like a real platform URL but is locally
  // identifiable as a simulated dispatch. Editors can click it; the
  // server returns a 404 in real life. Real adapters would replace this
  // with the actual platform-returned URL.
  const externalId = `sim-${send.id.slice(0, 8)}`;
  const baseHost = send.external_url ? new URL(send.external_url).host : 'simulated.anchor.local';
  const permalink = `https://${baseHost}/_simulated/${externalId}`;
  return { externalId, permalink, simulated: true };
}

module.exports = { queueSend, dispatchSend };
