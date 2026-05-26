// RAG-backed insights generator for AI Legal cases + regulations.
//
// Two insight types per entity:
//   - industry_impact   — what this case/regulation means for the AI industry,
//                         media, compliance, and adjacent fields.
//   - predicted_outcome — based on similar cases in our DB + Claude's legal
//                         knowledge, what is the likely path + outcome?
//
// Retrieval: FTS over ai_lawsuits + ai_regulations (shared `search_tsv`).
// We retrieve the top ~8 most related items and feed them as citation
// candidates. Claude is instructed to ONLY cite items from the provided
// context — preventing hallucinated precedents.
//
// Generation: callClaude (no web search) so we stay cheap and deterministic.
// If a web-search-backed pass is wanted later, swap to callClaudeWithWebSearch
// and add source URLs to citations.

import pool from '../../db/pool.js';
import { callClaude } from '../claude.js';

const INSIGHT_TYPES = ['industry_impact', 'predicted_outcome'];

// ── Retrieve similar entities via FTS on search_tsv ──────────────────────────
async function retrieveRelated(subject) {
  // Retrieval strategy: OR the most distinctive tokens so we get candidates
  // that share ANY meaningful signal (defendant, key issue, jurisdiction).
  // websearch_to_tsquery doesn't support OR directly, so we build a
  // to_tsquery string by hand. Example output: "openai | copyright | training"
  const isLawsuit = subject.kind === 'lawsuit';
  const r = subject.row;

  const rawTokens = [
    ...(isLawsuit ? (r.defendants || []) : []),
    ...(isLawsuit ? (r.plaintiffs || []) : []),
    ...(isLawsuit ? (r.key_issues || []) : (r.key_provisions || [])),
    r.jurisdiction,
    isLawsuit ? r.case_type : r.regulation_type,
  ].filter(Boolean);

  // Normalise → lowercase, split on non-word chars, drop short/stopword tokens,
  // dedupe, take up to 12. Keep multi-word names together where possible.
  const STOPS = new Set(['the','and','or','of','v','us','inc','llc','inc.','llc.','ltd','ltd.','co','corp','holdings','group']);
  const seen = new Set();
  const tokens = [];
  for (const raw of rawTokens) {
    for (const t of raw.toString().toLowerCase().split(/[^\w]+/)) {
      if (t && t.length >= 3 && !STOPS.has(t) && !seen.has(t)) {
        seen.add(t);
        tokens.push(t);
        if (tokens.length >= 12) break;
      }
    }
    if (tokens.length >= 12) break;
  }
  if (tokens.length === 0) return [];

  // to_tsquery requires explicit OR operator (|) between terms.
  const tsQueryStr = tokens.join(' | ');

  // Retrieve up to 6 lawsuits + 4 regulations matching ANY of the tokens.
  const excludeUuid = '00000000-0000-0000-0000-000000000000';
  const [lawsuits, regulations] = await Promise.all([
    pool.query(
      `SELECT id, case_name AS name, jurisdiction, status, case_type AS type,
              array_to_string(defendants, ', ') AS defendants_str,
              array_to_string(key_issues, ', ') AS key_issues_str,
              summary,
              ts_rank(search_tsv, to_tsquery('english', $1)) AS rank
         FROM ai_lawsuits
        WHERE search_tsv @@ to_tsquery('english', $1)
          AND id <> $2
        ORDER BY rank DESC
        LIMIT 6`,
      [tsQueryStr, isLawsuit ? r.id : excludeUuid]
    ),
    pool.query(
      `SELECT id, COALESCE(short_name, regulation_name) AS name, jurisdiction, status,
              regulation_type AS type, regulator,
              summary,
              ts_rank(search_tsv, to_tsquery('english', $1)) AS rank
         FROM ai_regulations
        WHERE search_tsv @@ to_tsquery('english', $1)
          AND id <> $2
        ORDER BY rank DESC
        LIMIT 4`,
      [tsQueryStr, isLawsuit ? excludeUuid : r.id]
    ),
  ]);

  const items = [
    ...lawsuits.rows.map(x => ({ kind: 'lawsuit',    ...x })),
    ...regulations.rows.map(x => ({ kind: 'regulation', ...x })),
  ];
  return items;
}

// ── Prompt builders ──────────────────────────────────────────────────────────
function describeSubject(subject) {
  const r = subject.row;
  if (subject.kind === 'lawsuit') {
    return [
      `CASE: ${r.case_name}`,
      `Jurisdiction: ${r.jurisdiction}`,
      `Court: ${r.court || 'Unknown'}${r.district ? ` (${r.district})` : ''}`,
      r.judge ? `Judge: ${r.judge}` : null,
      `Type: ${r.case_type} · Status: ${r.status}`,
      `Parties: ${(r.plaintiffs || []).join(', ')} v. ${(r.defendants || []).join(', ')}`,
      r.key_issues?.length ? `Key issues: ${r.key_issues.join('; ')}` : null,
      r.filing_date ? `Filed: ${r.filing_date}` : null,
      r.outcome ? `Outcome: ${r.outcome}` : null,
      r.summary ? `\nSummary: ${r.summary}` : null,
    ].filter(Boolean).join('\n');
  }
  return [
    `REGULATION: ${r.short_name || r.regulation_name}${r.short_name ? ` (full: ${r.regulation_name})` : ''}`,
    `Jurisdiction: ${r.jurisdiction}`,
    r.regulator ? `Regulator: ${r.regulator}` : null,
    `Type: ${r.regulation_type} · Status: ${r.status}`,
    r.effective_date ? `Effective: ${r.effective_date}` : null,
    r.enforcement_date ? `Enforcement: ${r.enforcement_date}` : null,
    r.key_provisions?.length ? `\nKey provisions:\n- ${r.key_provisions.join('\n- ')}` : null,
    r.penalties ? `\nPenalties: ${r.penalties}` : null,
    r.extraterritorial_scope ? `\nExtraterritorial scope: ${r.extraterritorial_scope}` : null,
    r.summary ? `\nSummary: ${r.summary}` : null,
  ].filter(Boolean).join('\n');
}

function describeContext(items) {
  if (items.length === 0) return '(no related entities found)';
  return items.map(i => {
    const base = `[${i.kind}:${i.id}] ${i.name} (${i.jurisdiction}, ${i.status})`;
    const extras = i.kind === 'lawsuit'
      ? (i.defendants_str ? ` · Defendants: ${i.defendants_str}` : '')
      + (i.key_issues_str ? ` · Issues: ${i.key_issues_str.slice(0, 200)}` : '')
      : (i.regulator ? ` · Regulator: ${i.regulator}` : '');
    const summary = i.summary ? `\n  ${i.summary.slice(0, 240)}` : '';
    return base + extras + summary;
  }).join('\n\n');
}

function industryImpactPrompt(subject, related) {
  return {
    system: `You are a senior policy analyst writing for the AI Legal tracker (ailegal.co.za).

Your job: explain, in 3–4 short paragraphs, what this specific case or regulation means for the AI industry — developers, deployers, media organisations, rights holders, regulators, and affected publics.

Hard rules:
- Only cite entities from the provided "Related context" section. Use the [lawsuit:UUID] or [regulation:UUID] marker inline when you reference one. Don't invent cases or regulations.
- Don't offer legal advice. You're summarising public records.
- Be concrete. Name the specific industries / kinds of actors affected and in what ways.
- If the context is thin, say so plainly and keep the analysis proportionate. Do NOT pad.
- End with a single self-reported confidence score on its own line: "confidence: 0.0–1.0".

Output format: plain paragraphs, no markdown headings, no bullet points. 180–350 words for the body, plus the final confidence line.`,
    userContent: `# Subject\n${describeSubject(subject)}\n\n# Related context (the ONLY entities you may cite)\n${describeContext(related)}\n\nWrite the industry-impact analysis now.`,
  };
}

function predictedOutcomePrompt(subject, related) {
  return {
    system: `You are a senior legal analyst writing for the AI Legal tracker (ailegal.co.za).

Your job: predict the likely trajectory and outcome of this case (or, for regulations, the enforcement arc). Ground every prediction in either:
  (a) a specific precedent from the provided "Related context" section, OR
  (b) a clearly labelled general rule of law / procedural norm.

Hard rules:
- Only cite entities from the provided "Related context". Use [lawsuit:UUID] or [regulation:UUID] inline. Never invent precedents.
- State the prediction, the reasoning, and the base rate if you can estimate one from the related cases. Be explicit about uncertainty — e.g. "likely dismissed" vs "possible but uncertain".
- DO NOT hedge endlessly. Pick a position and defend it briefly.
- For active cases, describe the next 1–3 milestones and what would move the odds.
- End with a single self-reported confidence score on its own line: "confidence: 0.0–1.0".

Output format: plain paragraphs, no markdown headings, no bullet points. 180–350 words plus confidence line.`,
    userContent: `# Subject\n${describeSubject(subject)}\n\n# Related context (the ONLY entities you may cite)\n${describeContext(related)}\n\nWrite the predicted-outcome analysis now.`,
  };
}

// ── Citation extraction ────────────────────────────────────────────────────
// Parse [lawsuit:UUID] / [regulation:UUID] markers from generated text, match
// against the provided context, and return the subset actually cited.
function extractCitations(text, context) {
  const re = /\[(lawsuit|regulation):([0-9a-f-]{8,})\]/gi;
  const cited = new Set();
  let m;
  while ((m = re.exec(text)) !== null) cited.add(`${m[1].toLowerCase()}:${m[2]}`);
  return context
    .filter(c => cited.has(`${c.kind}:${c.id}`))
    .map(c => ({ kind: c.kind, id: c.id, name: c.name, jurisdiction: c.jurisdiction }));
}

function extractConfidence(text) {
  const m = text.match(/confidence\s*[:=]\s*([0-9.]+)/i);
  if (!m) return null;
  const v = parseFloat(m[1]);
  return Number.isFinite(v) && v >= 0 && v <= 1 ? v : null;
}

// Strip the final "confidence: X" line from the body before persisting.
function stripConfidenceLine(text) {
  return text.replace(/\n*\s*confidence\s*[:=]\s*[0-9.]+\s*$/i, '').trim();
}

// ── Public entry points ─────────────────────────────────────────────────────
async function loadSubject(kind, id) {
  if (kind === 'lawsuit') {
    const { rows } = await pool.query('SELECT * FROM ai_lawsuits WHERE id = $1', [id]);
    return rows.length ? { kind, row: rows[0] } : null;
  }
  const { rows } = await pool.query('SELECT * FROM ai_regulations WHERE id = $1', [id]);
  return rows.length ? { kind, row: rows[0] } : null;
}

async function generateOneInsight(subject, insightType, related) {
  const prompt = insightType === 'industry_impact'
    ? industryImpactPrompt(subject, related)
    : predictedOutcomePrompt(subject, related);

  const raw = await callClaude({
    system: prompt.system,
    userContent: prompt.userContent,
    maxTokens: 800,
    temperature: 0.25,
  });

  if (!raw) throw new Error('Claude returned empty response');

  const citations = extractCitations(raw, related);
  const confidence = extractConfidence(raw);
  const content = stripConfidenceLine(raw);

  return { content, citations, confidence };
}

export async function generateInsightsFor(kind, id, { types = INSIGHT_TYPES, minRelated = 2 } = {}) {
  const subject = await loadSubject(kind, id);
  if (!subject) throw new Error(`${kind} not found`);

  const related = await retrieveRelated(subject);

  // Skip Claude entirely when retrieval didn't find enough context. The prompt
  // explicitly tells Claude to cite only from the provided context, so <2
  // related entities produces thin / uncitable insights — not worth the spend.
  if (related.length < minRelated) {
    return { kind, id, related_count: related.length, written: [], skipped: 'insufficient_context' };
  }

  const written = [];

  for (const insightType of types) {
    try {
      const { content, citations, confidence } = await generateOneInsight(subject, insightType, related);
      await pool.query(
        `INSERT INTO ai_legal_insights
           (subject_kind, subject_id, insight_type, content, citations, model_used, confidence, generated_at)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, NOW())
         ON CONFLICT (subject_kind, subject_id, insight_type)
         DO UPDATE SET content = EXCLUDED.content,
                       citations = EXCLUDED.citations,
                       model_used = EXCLUDED.model_used,
                       confidence = EXCLUDED.confidence,
                       generated_at = NOW()`,
        [kind, id, insightType, content, JSON.stringify(citations), 'claude-sonnet-4-6', confidence]
      );
      written.push({ insight_type: insightType, confidence, citations_count: citations.length });
    } catch (err) {
      written.push({ insight_type: insightType, error: err.message });
    }
  }

  return { kind, id, related_count: related.length, written };
}

// Fetch existing insights for a subject (for public detail page).
export async function getInsightsFor(kind, id) {
  const { rows } = await pool.query(
    `SELECT insight_type, content, citations, confidence, generated_at
       FROM ai_legal_insights
      WHERE subject_kind = $1 AND subject_id = $2`,
    [kind, id]
  );
  return rows;
}
