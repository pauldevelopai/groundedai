// AI Legal, Ethics & Regulation Tracker — the 12th agent per the GROUNDED
// concept note.
//
// Today's storage lives in `learning_updates` (migration 026) — that table
// is the Tracker's primary index. The richer 7-tab UX described in the
// concept note (Lawsuits / Regulations / Connections map / Use cases /
// Sources / Submit / weekly digest) is V2 work; this shell exposes the
// agent in the registry so it appears in the dropdown + can be wired into
// workflows.
//
// Workflow surface: given a query (a topic, a draft article, a jurisdiction),
// returns the top-K relevant Tracker entries the editor needs to think
// about before publishing.

const { pool } = require('../db');

const KIND_LABEL = {
  ethics: 'Ethics',
  data_law: 'Data law',
  security: 'Security',
  governance: 'Governance',
  model_change: 'Model change',
  platform_takedown: 'Platform takedown',
  press_freedom: 'Press freedom',
};

const SEVERITY_RANK = { urgent: 3, advisory: 2, info: 1 };

/**
 * Search the Tracker index for items relevant to a query. Hybrid lookup:
 *   - exact word-boundary match on title / body / source_publisher
 *   - severity-weighted ranking (urgent > advisory > info)
 *   - cohort + newsroom-private scoped by newsroom_id
 *
 * @param {object} args
 * @param {string} args.newsroomId
 * @param {string} args.query
 * @param {number} [args.k]
 * @param {string} [args.jurisdiction]  e.g. 'ZA', 'EU' — matches country_scope
 * @param {string[]} [args.kinds]       filter by kind
 */
async function search({ newsroomId, query, k = 10, jurisdiction, kinds }) {
  const q = (query || '').trim();
  if (!q) return [];

  // Split into tokens — each token must appear in at least one of the
  // searchable fields (AND across tokens, OR across fields per-token).
  // This makes a multi-word query like "POPIA data protection" hit the
  // POPIA entry even though those three words aren't contiguous in it.
  const tokens = q.split(/\s+/).filter((t) => t.length >= 2).slice(0, 8);
  if (tokens.length === 0) return [];

  // V2 Step 3: hide pending submissions + archived entries from search.
  const conds = [`(newsroom_id IS NULL OR newsroom_id = $1)`, `status = 'live'`];
  const params = [newsroomId];
  for (const tok of tokens) {
    params.push('%' + tok + '%');
    conds.push(`(title ILIKE $${params.length} OR body ILIKE $${params.length} OR source_publisher ILIKE $${params.length})`);
  }
  if (jurisdiction) {
    params.push(jurisdiction);
    conds.push(`$${params.length} = ANY(country_scope)`);
  }
  if (Array.isArray(kinds) && kinds.length > 0) {
    params.push(kinds);
    conds.push(`kind = ANY($${params.length}::text[])`);
  }
  params.push(k);

  const { rows } = await pool.query(
    `SELECT id, title, body, kind, severity, source_publisher, source_url,
            published_at, applies_to_agents, country_scope, is_default
       FROM learning_updates
      WHERE ${conds.join(' AND ')}
      ORDER BY
        CASE severity WHEN 'urgent' THEN 3 WHEN 'advisory' THEN 2 ELSE 1 END DESC,
        published_at DESC NULLS LAST,
        created_at DESC
      LIMIT $${params.length}`,
    params
  );
  return rows;
}

/**
 * Format an array of matches as a compact prompt block for downstream
 * agents (e.g. when Copywriter calls the Tracker for context before
 * drafting a piece about an AI lawsuit).
 */
function formatForPrompt(matches) {
  if (!matches || matches.length === 0) {
    return 'No relevant legal/ethical/regulatory entries in the Tracker for this query.';
  }
  return matches.map((m, i) => {
    const date = m.published_at ? new Date(m.published_at).toISOString().slice(0, 10) : 'undated';
    const sev = m.severity.toUpperCase();
    const kind = KIND_LABEL[m.kind] || m.kind;
    const src = m.source_publisher ? ` — ${m.source_publisher}` : '';
    const url = m.source_url ? `\n   ${m.source_url}` : '';
    return `[${i + 1}] (${sev} · ${kind} · ${date})${src}\n   ${m.title}${url}`;
  }).join('\n\n');
}

module.exports = { search, formatForPrompt, KIND_LABEL };

// ─── Agent registry entry ──────────────────────────────────────────────────
const { register, resolveConfig } = require('./registry');
register({
  slug: 'legal_tracker',
  name: 'AI Legal, Ethics & Regulation Tracker',
  icon: '⚖️',
  description:
    'The 12th agent. Finds, collects and stores legal, ethical and regulatory shifts in the AI and media landscape on a daily basis. Search and cross-reference cases relevant to your newsroom. Helps each newsroom build its own living AI governance framework — based on the specific AI implementations you actually run, your location, and your editorial values — rather than handing down a generic policy.',
  triggers: ['legal', 'regulation', 'governance', 'ai law', 'compliance', 'tracker', 'lawsuit', 'POPIA', 'EU AI Act'],
  inputs: {
    query: {
      type: 'longtext',
      required: true,
      label: 'Topic or draft to check against',
      description: 'A topic, jurisdiction, or paragraph from a draft article. The Tracker returns relevant law, regulation, and ethics entries.',
    },
    jurisdiction: {
      type: 'string',
      label: 'Jurisdiction filter (optional)',
      description: 'ISO country code (ZA, ZW, ZM, KE, EU, US, ...). Filters to entries with this jurisdiction in scope.',
    },
  },
  config: {
    top_k: {
      type: 'number',
      default: 8,
      min: 1,
      max: 30,
      step: 1,
      label: 'Top-K entries',
      description: 'How many Tracker entries to return.',
    },
    kinds: {
      type: 'select',
      default: 'all',
      label: 'Kind filter',
      description: 'Which kinds of entries to include.',
      options: [
        { value: 'all', label: 'All kinds' },
        { value: 'data_law', label: 'Data law only (POPIA / GDPR / EU AI Act)' },
        { value: 'press_freedom', label: 'Press freedom only' },
        { value: 'ethics', label: 'Ethics only' },
        { value: 'security', label: 'Security only' },
      ],
    },
  },
  outputs: {
    matches: { type: 'json', description: 'Array of Tracker entries matching the query (id, title, body, kind, severity, source).' },
    promptBlock: { type: 'longtext', description: 'Formatted summary suitable for inclusion in another agent\'s prompt as context.' },
  },
  route: '/learning',
  async run(input, ctx) {
    const cfg = resolveConfig('legal_tracker', input);
    const startedAt = Date.now();
    const kinds = cfg.kinds && cfg.kinds !== 'all' ? [cfg.kinds] : undefined;
    const k = Math.max(1, Math.min(30, parseInt(cfg.top_k, 10) || 8));
    const matches = await search({
      newsroomId: ctx.newsroomId,
      query: input.query,
      jurisdiction: input.jurisdiction,
      kinds,
      k,
    });
    return {
      result: { matches, promptBlock: formatForPrompt(matches) },
      cost: { costUsd: 0, model: 'sql', inputTokens: 0, outputTokens: 0 },
      durationMs: Date.now() - startedAt,
    };
  },
});
