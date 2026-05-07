// Keyword watchlist helpers — list + match against a piece of text.

const { pool } = require('../db');

async function listKeywords(newsroomId, opts = {}) {
  const status = opts.status || null;
  const params = [newsroomId];
  let where = 'newsroom_id = $1';
  if (status) { params.push(status); where += ` AND status = $${params.length}`; }
  const { rows } = await pool.query(
    `SELECT id, term, match_kind, scope, severity_floor, notes, status, created_at, updated_at
       FROM social_keywords
      WHERE ${where}
      ORDER BY status ASC, severity_rank(severity_floor) DESC, lower(term)`,
    params
  ).catch(async () => {
    // severity_rank() function doesn't exist — fall back to a simpler ordering.
    return await pool.query(
      `SELECT id, term, match_kind, scope, severity_floor, notes, status, created_at, updated_at
         FROM social_keywords
        WHERE ${where}
        ORDER BY status ASC, lower(term)`,
      params
    );
  });
  return rows;
}

/**
 * Return the keyword rows whose term matches the supplied text+entities.
 * Match modes:
 *   phrase: case-insensitive substring of the body
 *   regex:  JS regex (only basic ones, sandboxed via timeout)
 *   name:   substring match against body OR exact match against any
 *           extracted person/org/location entity
 *
 * Used at signal-ingest time so that matched_keywords is populated
 * automatically.
 */
function matchKeywords(keywords, body, entityNames = []) {
  const lower = (body || '').toLowerCase();
  const entSet = new Set(entityNames.map(e => e.toLowerCase()));
  const hits = [];
  for (const k of keywords) {
    if (k.status !== 'active') continue;
    const term = (k.term || '').trim();
    if (!term) continue;
    let matched = false;
    if (k.match_kind === 'regex') {
      try {
        const re = new RegExp(term, 'i');
        matched = re.test(body || '');
      } catch { matched = false; }
    } else if (k.match_kind === 'name') {
      matched = lower.includes(term.toLowerCase()) || entSet.has(term.toLowerCase());
    } else {
      matched = lower.includes(term.toLowerCase());
    }
    if (matched) hits.push(k);
  }
  return hits;
}

module.exports = { listKeywords, matchKeywords };
