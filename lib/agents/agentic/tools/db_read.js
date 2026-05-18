// Tool: db_read
//
// Read-only, whitelisted SQL against newsroom-scoped tables. Every query
// is auto-filtered by ctx.newsroomId so the agent can never read another
// newsroom's data. Tables containing secrets (users, sessions,
// distribution_credentials, newsroom_appliances) are NOT in the whitelist.
//
// The agent supplies { table, where, select, order_by, limit }. WHERE is
// a structured filter (never raw SQL): { field: value } for equality,
// { field: { in: [...] } } for IN, { field: { gt|gte|lt|lte: value } }
// for range, { field: { like: '...' } } for ILIKE. AND across keys.
//
// LIMIT capped at 50.

const { pool } = require('../../../db');

const WHITELIST = new Set([
  'editorial_calendar',
  'freelancers',
  'community_contributors',
  'ops_briefs',
  'ops_finance_entries',
  'ops_metric_snapshots',
  'inbound_submissions',
  'research_dossiers',
  'research_documents',
  'research_entities',
  'research_relationships',
  'research_findings',
  'verifier_runs',
  'workflow_runs',
]);

const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 20;
const IDENT_RE = /^[a-z_][a-z0-9_]{0,63}$/;
const RANGE_OPS = { gt: '>', gte: '>=', lt: '<', lte: '<=' };

function buildWhere(where, paramStart) {
  // Returns { sql, params } for "field op value AND ..."
  const clauses = [];
  const params = [];
  let p = paramStart;
  for (const [field, raw] of Object.entries(where || {})) {
    if (!IDENT_RE.test(field)) throw new Error(`invalid field name: ${field}`);
    if (raw === null) { clauses.push(`${field} IS NULL`); continue; }
    if (typeof raw !== 'object' || Array.isArray(raw)) {
      // equality (scalar) — Array.isArray check guards against arrays-as-values
      params.push(raw);
      clauses.push(`${field} = $${p++}`);
      continue;
    }
    // object operator
    if (Array.isArray(raw.in)) {
      if (raw.in.length === 0) { clauses.push('FALSE'); continue; }
      const placeholders = raw.in.map(() => `$${p++}`).join(', ');
      params.push(...raw.in);
      clauses.push(`${field} IN (${placeholders})`);
      continue;
    }
    if (typeof raw.like === 'string') {
      params.push(raw.like);
      clauses.push(`${field}::text ILIKE $${p++}`);
      continue;
    }
    let matched = false;
    for (const [opKey, opSql] of Object.entries(RANGE_OPS)) {
      if (opKey in raw) {
        params.push(raw[opKey]);
        clauses.push(`${field} ${opSql} $${p++}`);
        matched = true;
        break;
      }
    }
    if (!matched) throw new Error(`unrecognised operator for field ${field}: ${JSON.stringify(raw)}`);
  }
  return { sql: clauses.length ? clauses.join(' AND ') : 'TRUE', params };
}

const tool = {
  name: 'db_read',
  description:
    'Read rows from a whitelisted, newsroom-scoped table. Use this when you need a quick structured fact about the newsroom — what stories are on the calendar, who the freelancers are, who recently submitted a tip, what your previous workflow runs looked like. Never returns another newsroom\'s data. Returns up to 50 rows.',
  input_schema: {
    type: 'object',
    properties: {
      table: {
        type: 'string',
        description: `One of: ${Array.from(WHITELIST).sort().join(', ')}.`,
      },
      where: {
        type: 'object',
        description: 'Filter map. { field: value } for equality, { field: { in: [...] } }, { field: { gt|gte|lt|lte: value } }, or { field: { like: \'%pattern%\' } }. AND across keys.',
      },
      select: {
        type: 'array',
        items: { type: 'string' },
        description: 'Column names to return. Defaults to all columns.',
      },
      order_by: {
        type: 'string',
        description: 'Column to order by, optionally suffixed with " desc" or " asc". Default: most recent first by created_at if present.',
      },
      limit: {
        type: 'integer',
        description: `Max rows. Capped at ${MAX_LIMIT}. Default ${DEFAULT_LIMIT}.`,
        minimum: 1,
        maximum: MAX_LIMIT,
      },
    },
    required: ['table'],
  },
  async run({ table, where, select, order_by, limit }, ctx) {
    if (!ctx?.newsroomId) return { error: 'newsroomId missing from agentic context' };
    if (typeof table !== 'string' || !WHITELIST.has(table)) {
      return { error: `table "${table}" is not in the read whitelist. Allowed: ${Array.from(WHITELIST).sort().join(', ')}` };
    }

    // SELECT clause
    let selectSql = '*';
    if (Array.isArray(select) && select.length > 0) {
      for (const col of select) {
        if (!IDENT_RE.test(col)) return { error: `invalid column name: ${col}` };
      }
      selectSql = select.join(', ');
    }

    // WHERE clause — auto-scope by newsroom_id, then user filters.
    let whereSql = 'newsroom_id = $1';
    const params = [ctx.newsroomId];
    try {
      const extra = buildWhere(where, 2);
      if (extra.sql !== 'TRUE') {
        whereSql += ` AND ${extra.sql}`;
        params.push(...extra.params);
      }
    } catch (err) {
      return { error: err.message };
    }

    // ORDER BY
    let orderSql = '';
    if (typeof order_by === 'string' && order_by.trim()) {
      const parts = order_by.trim().split(/\s+/);
      const col = parts[0];
      const dir = (parts[1] || 'desc').toLowerCase();
      if (!IDENT_RE.test(col)) return { error: `invalid order_by column: ${col}` };
      if (dir !== 'asc' && dir !== 'desc') return { error: 'order_by direction must be asc or desc' };
      orderSql = `ORDER BY ${col} ${dir.toUpperCase()}`;
    }

    const lim = Math.min(MAX_LIMIT, Math.max(1, parseInt(limit, 10) || DEFAULT_LIMIT));
    const sql = `SELECT ${selectSql} FROM ${table} WHERE ${whereSql} ${orderSql} LIMIT ${lim}`;
    try {
      const { rows, rowCount } = await pool.query(sql, params);
      return { table, rows, rowCount, truncated_at: rowCount === lim ? lim : null };
    } catch (err) {
      return { error: `query failed: ${err.message}` };
    }
  },
};

module.exports = { ...tool, WHITELIST };
