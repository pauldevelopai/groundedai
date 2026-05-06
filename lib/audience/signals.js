// Analytics signal parser. Newsrooms upload a CSV from Plausible / Umami /
// Google Analytics (or paste any tab-delimited export); we parse what we
// can structurally and ask Claude to summarise the rest as actionable
// editorial signal — landed topics, gaps, bounced stories, drift over
// time. Real persistence to audience_signals.

const { pool } = require('../db');
const { chat } = require('../claude');
const { parseClaudeJson } = require('../parse-claude-json');
const { loadProfile, formatForPrompt } = require('../newsroom-profile');

const SYSTEM_PROMPT = `You are Anchor's Audience agent — an editorial-analytics interpreter for African newsrooms.

Hard constraints:
1. EDITORIAL, NOT MARKETING. Translate raw numbers into language an editor will use: what landed, what got missed, what bounced, where readership is drifting.
2. NEWSROOM-GROUNDED. When NEWSROOM CONTEXT is provided, weight your reading toward the newsroom's stated beats and audience.
3. NO HALLUCINATIONS. Use only what's in the data. If the data doesn't support a conclusion, say "data is silent on this".
4. AUDIENCE GAPS MATTER MORE THAN VANITY HITS. Surface what isn't being read by audiences the newsroom says it serves, not just what got the most pageviews.

Return ONLY valid JSON matching this schema:

{
  "summary": "<2–4 sentence editor-facing summary of the period>",
  "landed_topics": [
    { "topic": "<short topic name>", "evidence": "<numeric evidence from the data>", "why_it_landed": "<1 sentence>" }
  ],
  "gaps": [
    { "topic_or_audience": "<what's being under-served>", "evidence": "<from data>", "implication": "<1 sentence>" }
  ],
  "bounced_stories": [
    { "headline_or_url": "<as in data>", "drop_off_signal": "<e.g. high entrance / low scroll / short dwell>", "diagnosis": "<1 sentence>" }
  ],
  "drift_notes": "<1–3 sentences on what's changing over the period; drop if data covers <14 days>",
  "total_pageviews": <int or null>,
  "unique_visitors": <int or null>
}

JSON only — no preamble, no markdown fences.`;

/**
 * Parse + analyze a CSV blob. Persists an audience_signals row up front,
 * Claude-analyzes, updates with structured signals + summary on success.
 *
 * @param {object} opts
 * @param {string} opts.rawCsv      — full CSV text (capped by caller)
 * @param {string} opts.source      — 'plausible' | 'umami' | 'ga' | 'csv' | 'manual'
 * @param {string} [opts.filename]
 * @param {string} [opts.notes]
 * @param {{ newsroomId: string, userId?: string }} opts.context
 */
async function ingestSignals({ rawCsv, source, filename, notes, context }) {
  if (!rawCsv || rawCsv.trim().length < 10) {
    throw new Error('rawCsv is required (paste analytics rows or upload a CSV).');
  }

  const insert = await pool.query(
    `INSERT INTO audience_signals
       (newsroom_id, uploaded_by, source, filename, raw_csv, status, notes)
     VALUES ($1, $2, $3, $4, $5, 'pending', $6)
     RETURNING id`,
    [context.newsroomId, context.userId || null, source, filename || null, rawCsv.slice(0, 200_000), notes || null]
  );
  const signalId = insert.rows[0].id;

  let profileBlock = null;
  try {
    const profile = await loadProfile(context.newsroomId);
    profileBlock = formatForPrompt(profile);
  } catch (e) {
    console.error('audience signals: profile load failed', e);
  }

  const userBlocks = [];
  if (profileBlock) userBlocks.push(`--- NEWSROOM CONTEXT ---\n${profileBlock}`);
  userBlocks.push(`--- ANALYTICS SOURCE ---\n${source}${filename ? ` · ${filename}` : ''}`);
  userBlocks.push(`--- ANALYTICS DATA (CSV) ---\n${rawCsv.slice(0, 80_000)}`);
  if (notes) userBlocks.push(`--- EDITOR NOTES ---\n${notes}`);
  userBlocks.push('Analyze. Return JSON only.');

  const startedAt = Date.now();
  try {
    const { text, cost } = await chat({
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userBlocks.join('\n\n') }],
      maxTokens: 2048,
      context: { ...context, agent: 'audience-signals', endpoint: '/api/audience/signals' },
    });
    const parsed = parseClaudeJson(text);
    const durationMs = Date.now() - startedAt;

    await pool.query(
      `UPDATE audience_signals
          SET signals = $2,
              total_pageviews = $3,
              unique_visitors = $4,
              analysis_summary = $5,
              cost_usd = $6,
              duration_ms = $7,
              status = 'analyzed'
        WHERE id = $1`,
      [
        signalId,
        JSON.stringify({
          landed_topics: parsed.landed_topics || [],
          gaps: parsed.gaps || [],
          bounced_stories: parsed.bounced_stories || [],
          drift_notes: parsed.drift_notes || null,
        }),
        Number.isFinite(parsed.total_pageviews) ? parsed.total_pageviews : null,
        Number.isFinite(parsed.unique_visitors) ? parsed.unique_visitors : null,
        parsed.summary || null,
        cost?.costUsd ?? null,
        durationMs,
      ]
    );

    return { signalId, parsed, cost, durationMs };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await pool.query(
      `UPDATE audience_signals SET status = 'failed', error = $2 WHERE id = $1`,
      [signalId, message]
    );
    throw err;
  }
}

module.exports = { ingestSignals };
