// Deep per-case research agent (Phase D4).
//
// For one lawsuit or regulation, run Claude + web_search to build a
// multi-source dossier: a curated reading list (5–15 URLs) plus a written
// analysis that cites each source with a numbered footnote. Think
// "long-form explainer article" rather than the existing bullet-point
// outputs (timeline events, industry-impact paragraph, insights).
//
// What it produces:
//   - A 600–1200 word analysis written to ai_{lawsuits,regulations}.detailed_analysis
//   - A set of ai_legal_source_mentions rows (one per URL) with title, host,
//     excerpt, publish_date, author — scraped via the existing article-scraper.
//   - Overwrites any prior detailed_analysis. We keep the chronology of
//     mentions, so historical provenance isn't lost.
//
// Cost profile (Sonnet + web_search, ~10 tool uses):
//   - ~$0.05–0.10 per entity
//   - ~2 minutes wall-clock (web_search is slow)
//   - Full dataset (78 entities) ≈ $5, ~2h
//
// Hard guardrails (D5 philosophy):
//   - Every URL in the output reading list MUST resolve (HEAD check) before
//     being written to ai_legal_source_mentions. Unresolved URLs are dropped.
//   - If fewer than 3 URLs resolve, we reject the whole research run —
//     better to leave the detailed_analysis unchanged than overwrite with
//     weakly-sourced content.
//
// Usage:
//   import { deepResearch } from './deep-research.js';
//   const summary = await deepResearch('lawsuit', '<uuid>');
//   console.log(summary); // { written_mentions: 9, analysis_len: 842, rejected: [...] }

import pool from '../../db/pool.js';
import { callClaudeWithWebSearch } from '../claude.js';
import { urlResolves } from './url-verify.js';
import { scrapeAndStoreMention } from './article-scraper.js';

const MIN_RESOLVED_URLS = 3;
const MAX_ANALYSIS_CHARS = 6000;
const MAX_URLS_PER_RUN = 15;

// ── Prompt ──────────────────────────────────────────────────────────────────
function buildPrompt(kind, entity) {
  const name = kind === 'lawsuit'
    ? `${entity.case_name} (${entity.jurisdiction})`
    : `${entity.short_name || entity.regulation_name} (${entity.jurisdiction})`;

  const contextLines = [];
  if (kind === 'lawsuit') {
    contextLines.push(`Case: ${entity.case_name}`);
    contextLines.push(`Plaintiffs: ${(entity.plaintiffs || []).join(', ') || '—'}`);
    contextLines.push(`Defendants: ${(entity.defendants || []).join(', ') || '—'}`);
    contextLines.push(`Court: ${entity.court || '—'}`);
    contextLines.push(`Status: ${entity.status}`);
    contextLines.push(`Case type: ${entity.case_type || '—'}`);
    if (entity.filing_date) contextLines.push(`Filed: ${entity.filing_date}`);
    if (entity.key_issues?.length) contextLines.push(`Key issues: ${entity.key_issues.join(', ')}`);
  } else {
    contextLines.push(`Regulation: ${entity.regulation_name}`);
    if (entity.short_name)      contextLines.push(`Short name: ${entity.short_name}`);
    contextLines.push(`Jurisdiction: ${entity.jurisdiction}`);
    contextLines.push(`Regulator: ${entity.regulator || '—'}`);
    contextLines.push(`Status: ${entity.status}`);
    contextLines.push(`Type: ${entity.regulation_type || '—'}`);
    if (entity.effective_date)   contextLines.push(`Effective: ${entity.effective_date}`);
    if (entity.enforcement_date) contextLines.push(`Enforcement: ${entity.enforcement_date}`);
    if (entity.scope?.length)    contextLines.push(`Scope: ${entity.scope.join(', ')}`);
  }

  return {
    system: `You are a legal research agent writing a deeply-sourced, publication-quality explainer.

Output STRICT JSON with EXACTLY this shape and nothing else:
{
  "reading_list": [
    { "url": "https://...", "title": "Article / filing title", "publisher": "Reuters | court docket | etc.", "relevance": "why this source is authoritative for this case" },
    …  (5 to 15 entries)
  ],
  "analysis": "600–1200 word prose analysis of the case. Structure: (1) what the dispute is, (2) parties' core claims, (3) procedural posture, (4) significance for the industry, (5) how it fits into related cases/regulations. Each substantive claim should have an inline footnote like [^1] whose number matches the reading_list position. Plain text only — no markdown bold/italic."
}

Critical rules:
- Use the web_search tool to find real, currently-accessible sources. PRIMARY sources (court filings, regulator press releases, official texts) are worth more than news summaries.
- NEVER invent a URL. Only include URLs you've actually seen in search results.
- NEVER attribute a claim to a source you didn't verify exists.
- If the case is obscure and you can't find 5+ authoritative sources, include fewer but flag that the record is thin.
- Your analysis must read like a careful news analysis, not a marketing piece. Neutral tone.
- Do not repeat the entity's metadata back verbatim — go beyond the obvious.`,
    userContent: `Research this entity and produce the JSON described:

${contextLines.join('\n')}

Existing sources we already have on file (use these but also find new ones):
${(entity.source_urls || []).concat(entity.source_url || []).filter(Boolean).slice(0, 5).map(u => `- ${u}`).join('\n') || '(none)'}

Focus: ${name}. Produce the dossier now.`,
  };
}

function extractJson(raw) {
  if (!raw) throw new Error('empty response');
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('no JSON object in response');
  return JSON.parse(match[0]);
}

// ── Main entrypoint ─────────────────────────────────────────────────────────
export async function deepResearch(kind, id, { maxUses = 10 } = {}) {
  if (!['lawsuit', 'regulation'].includes(kind)) throw new Error(`bad kind: ${kind}`);

  const table = kind === 'lawsuit' ? 'ai_lawsuits' : 'ai_regulations';
  const { rows } = await pool.query(`SELECT * FROM ${table} WHERE id = $1`, [id]);
  const entity = rows[0];
  if (!entity) throw new Error(`${kind} ${id} not found`);

  const prompt = buildPrompt(kind, entity);
  const response = await callClaudeWithWebSearch({
    system:      prompt.system,
    userContent: prompt.userContent,
    maxTokens:   3000,
    maxUses,     // web_search tool budget — Sonnet at ~10 searches is ~$0.08
  });

  let parsed;
  try { parsed = extractJson(response); }
  catch (err) { throw new Error(`parse failed: ${err.message}`); }

  const readingList = Array.isArray(parsed.reading_list) ? parsed.reading_list.slice(0, MAX_URLS_PER_RUN) : [];
  const analysis = (parsed.analysis || '').trim().slice(0, MAX_ANALYSIS_CHARS);

  if (!analysis || analysis.length < 200) {
    return { skipped: 'analysis_too_short', analysis_len: analysis.length };
  }
  if (readingList.length < MIN_RESOLVED_URLS) {
    return { skipped: 'not_enough_sources_proposed', proposed: readingList.length };
  }

  // D5 guard: every URL must resolve. Drop dead ones; if we end up below the
  // floor, abort the whole run so we don't ship a poorly-sourced dossier.
  const verified = [];
  const rejected = [];
  for (const item of readingList) {
    if (!item.url || typeof item.url !== 'string') { rejected.push({ reason: 'missing_url', ...item }); continue; }
    // eslint-disable-next-line no-await-in-loop
    const ok = await urlResolves(item.url);
    if (ok) verified.push(item);
    else    rejected.push({ reason: 'url_not_resolving', url: item.url });
  }
  if (verified.length < MIN_RESOLVED_URLS) {
    return { skipped: 'too_few_resolved_urls', resolved: verified.length, rejected };
  }

  // Scrape each verified URL for snippet/date/publisher and upsert into
  // ai_legal_source_mentions. This is the same pipeline article-scraper.js
  // uses, so the public detail page renders them automatically.
  let mentionsWritten = 0;
  for (const item of verified) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const result = await scrapeAndStoreMention({
        subjectKind: kind,
        subjectId:   id,
        url:         item.url,
      });
      // persistSuccess returns the row (truthy). persistError returns an error
      // marker row but still "counts" as written because the mention is
      // recorded. We only count when http_status is 2xx.
      if (result?.http_status && result.http_status >= 200 && result.http_status < 300) {
        mentionsWritten++;
      } else if (result) {
        rejected.push({ reason: 'scrape_non2xx', url: item.url, http_status: result.http_status || null });
      }
    } catch (err) {
      rejected.push({ reason: 'scrape_failed', url: item.url, error: err.message });
    }
  }

  // Write the analysis. We overwrite detailed_analysis because D4 is the
  // canonical source for that field; timeline/insights have their own stores.
  await pool.query(
    `UPDATE ${table}
        SET detailed_analysis = $1,
            analysis_generated_at = NOW(),
            updated_at = NOW()
      WHERE id = $2`,
    [analysis, id]
  );

  return {
    kind, id,
    proposed_urls: readingList.length,
    resolved_urls: verified.length,
    mentions_written: mentionsWritten,
    analysis_len: analysis.length,
    rejected,
  };
}

// ── Batch runner ────────────────────────────────────────────────────────────
// Picks the N oldest-researched entities (analysis_generated_at ASC NULLS
// FIRST) and researches each. Pauses briefly between items so web_search
// rate limits stay happy.
export async function deepResearchOldest({ limit = 5, kinds = ['lawsuit', 'regulation'] } = {}) {
  const rows = [];
  if (kinds.includes('lawsuit')) {
    const { rows: ls } = await pool.query(
      `SELECT 'lawsuit' AS kind, id, case_name AS name
         FROM ai_lawsuits
        ORDER BY analysis_generated_at ASC NULLS FIRST, updated_at ASC
        LIMIT $1`, [limit]
    );
    rows.push(...ls);
  }
  if (kinds.includes('regulation')) {
    const { rows: rs } = await pool.query(
      `SELECT 'regulation' AS kind, id, COALESCE(short_name, regulation_name) AS name
         FROM ai_regulations
        ORDER BY analysis_generated_at ASC NULLS FIRST, updated_at ASC
        LIMIT $1`, [limit]
    );
    rows.push(...rs);
  }

  const results = [];
  for (const r of rows) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const summary = await deepResearch(r.kind, r.id);
      results.push({ name: r.name, ...summary });
      // eslint-disable-next-line no-await-in-loop
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (err) {
      results.push({ name: r.name, kind: r.kind, id: r.id, error: err.message });
    }
  }
  return results;
}
