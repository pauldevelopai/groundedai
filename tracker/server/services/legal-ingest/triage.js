// Claude-backed triage for the raw-item queue.
//
// For each pending ai_legal_raw_items row, we ask Claude:
//   1. Is this relevant to AI law / regulation? (yes/no)
//   2. If yes, does it match an existing lawsuit or regulation?
//   3. If it matches, propose an event row (type, date, title, description)
//   4. If it doesn't match and is genuinely new, flag it for human review as
//      a "candidate" — we do NOT auto-create lawsuits/regulations from raw
//      items (too risky without verification).
//
// Writes results to:
//   ai_legal_raw_items.triage_status     ('promoted' | 'rejected' | 'classified')
//   ai_legal_raw_items.triage_result     JSONB with Claude's reasoning
//   ai_legal_raw_items.lawsuit_id        if promoted as event on a lawsuit
//   ai_legal_raw_items.regulation_id     if promoted as event on a regulation
//   ai_legal_raw_items.event_id          id of the created event row
//
// Also inserts into ai_lawsuit_events / ai_regulation_events when promoted.

import pool from '../../db/pool.js';
import { callClaudeClassifier } from '../claude.js';
import { syncLawsuitToKnowledge, syncRegulationToKnowledge } from './knowledge-sync.js';
import { urlResolves } from './url-verify.js';

const TRIAGE_MODEL_TEMP = 0.1; // Deterministic classification

// ── Entity catalogue (fed to Claude so it can match) ─────────────────────────
async function loadEntityCatalogue() {
  const { rows: lawsuits } = await pool.query(`
    SELECT id, case_name, jurisdiction, status, case_type,
           array_to_string(defendants, ', ') AS defendants_str,
           array_to_string(plaintiffs, ', ') AS plaintiffs_str
    FROM ai_lawsuits
    ORDER BY case_name
  `);
  const { rows: regulations } = await pool.query(`
    SELECT id, regulation_name, short_name, jurisdiction, status, regulation_type
    FROM ai_regulations
    ORDER BY COALESCE(short_name, regulation_name)
  `);
  return { lawsuits, regulations };
}

function catalogueToPromptBlock({ lawsuits, regulations }) {
  // Slim format keeps the prompt under Groq's free-tier 8K TPM cap. Earlier
  // version included jurisdiction + defendants; trimming roughly halves the
  // catalogue token cost. Worst case the model can't disambiguate a few
  // similarly-named cases — those drop to "candidate" for human review.
  const lines = [];
  lines.push('## Known lawsuits (id · case_name)');
  for (const l of lawsuits) {
    lines.push(`- ${l.id} · ${l.case_name}`);
  }
  lines.push('');
  lines.push('## Known regulations (id · name)');
  for (const r of regulations) {
    const label = r.short_name ? `${r.short_name} — ${r.regulation_name}` : r.regulation_name;
    lines.push(`- ${r.id} · ${label}`);
  }
  return lines.join('\n');
}

// ── Prompt for a single raw item ─────────────────────────────────────────────
// The system block is constructed so the large, reusable part (instructions +
// entity catalogue) is cached. userContent holds only the per-item data.
function buildTriagePrompt(item, catalogueBlock) {
  const content = (item.content || '').slice(0, 1500);
  return {
    system: `You are a precise legal-news triage agent for an AI-legal tracker.

The tracker covers three kinds of content:
  1. AI LAWSUITS — court cases where the dispute involves AI (copyright, privacy, defamation, etc.)
  2. AI REGULATIONS — statutes, directives, guidance, enforcement actions
  3. AI LEGAL USE CASES — lawyers / law firms / legal departments deploying AI successfully

# Catalogue of known entities (match by UUID when you pick event_on_lawsuit / event_on_regulation)
${catalogueBlock}

Given one news item, output strict JSON in this exact shape:
{
  "relevant": true | false,
  "reason": "short explanation",
  "classification": "event_on_lawsuit" | "event_on_regulation" | "new_lawsuit_candidate" | "new_regulation_candidate" | "use_case_candidate" | "noise",
  "match_id": "<UUID>" | null,
  "match_name": "<name of matched entity>" | null,
  "confidence": 0.0 – 1.0,
  "event": {
    "event_type": "filing" | "hearing" | "ruling" | "settlement" | "dismissal" | "decision" | "appeal" | "amendment" | "update" | "enacted" | "took_effect" | "enforcement_action" | "guidance_issued" | "proposed" | "amended" | "repealed",
    "event_date": "YYYY-MM-DD" | null,
    "title": "short title, verbatim if possible",
    "description": "1–3 sentence summary"
  } | null,
  "use_case": {
    "firm_name": "name of the lawyer / firm / legal department",
    "firm_type": "biglaw" | "boutique" | "solo" | "inhouse" | "government" | "nonprofit" | "legaltech" | "other",
    "jurisdiction": "country / region",
    "use_case_title": "short headline",
    "summary": "2–3 sentence description of what they did",
    "tools_used": ["tool names"],
    "categories": ["drafting" | "research" | "review" | "ediscovery" | "analytics" | "intake" | "compliance" | "legal-ops" | "training" | "other"],
    "quantified_impact": "e.g. '75% faster review' or null"
  } | null
}

Rules:
- Be strict: general AI news with no specific legal actor/event → "noise".
- Use "event_on_lawsuit" / "event_on_regulation" only when you can match a specific entity from the catalogue (by UUID).
- Use "use_case_candidate" for stories about specific lawyers or firms deploying / using AI — include the use_case object.
- Use "new_lawsuit_candidate" / "new_regulation_candidate" for genuinely new cases/regs — these go to a human review queue, do not invent details.
- Output valid JSON only. No trailing commentary.
- Confidence below 0.5 → lean toward "noise" or "candidate".`,
    userContent: `# Item to triage
**Source:** ${item.source_name || 'unknown'}
**Published:** ${item.published_at ? new Date(item.published_at).toISOString().slice(0, 10) : 'unknown'}
**Title:** ${item.title || '(no title)'}
**URL:** ${item.url || '(no url)'}

**Content:**
${content}

Classify this item.`,
  };
}

// ── Batched prompt (N items per Claude call) ────────────────────────────────
// Further amortises the per-call fixed overhead. The catalogue is already
// cached via cache_control, so batching mostly saves API round-trips and
// output-wrapper tokens. In practice ~20–30% cheaper + faster than one-at-a-
// time for the noise-heavy feeds we ingest.
function buildBatchTriagePrompt(items, catalogueBlock) {
  const itemBlocks = items.map((item, i) => {
    const content = (item.content || '').slice(0, 1500);
    return `## ITEM ${i}
**Title:** ${item.title || '(no title)'}
**URL:** ${item.url || '(no url)'}
**Source:** ${item.source_name || 'unknown'}
**Published:** ${item.published_at ? new Date(item.published_at).toISOString().slice(0, 10) : 'unknown'}
**Content:** ${content}`;
  }).join('\n\n');

  return {
    system: `You are a precise legal-news triage agent for an AI-legal tracker.

The tracker covers three kinds of content:
  1. AI LAWSUITS — court cases where the dispute involves AI
  2. AI REGULATIONS — statutes, directives, guidance, enforcement actions
  3. AI LEGAL USE CASES — lawyers / law firms / legal departments deploying AI

# Catalogue of known entities (match by UUID when picking event_on_lawsuit / event_on_regulation)
${catalogueBlock}

Given a batch of news items (each starting with "## ITEM N"), output strict JSON:
{
  "results": [
    {
      "item_index": 0,
      "relevant": true | false,
      "reason": "short explanation",
      "classification": "event_on_lawsuit" | "event_on_regulation" | "new_lawsuit_candidate" | "new_regulation_candidate" | "use_case_candidate" | "noise",
      "match_id": "<UUID>" | null,
      "match_name": "<name>" | null,
      "confidence": 0.0 – 1.0,
      "event": { "event_type": "...", "event_date": "YYYY-MM-DD"|null, "title": "...", "description": "..." } | null,
      "use_case": { "firm_name": "...", "firm_type": "...", "jurisdiction": "...", "use_case_title": "...", "summary": "...", "tools_used": [...], "categories": [...], "quantified_impact": "..."|null } | null
    },
    ...
  ]
}

Output one entry per ITEM, in order, with item_index matching. Output valid JSON only.

Rules:
- Be strict: general AI news with no specific legal actor/event → "noise".
- event_on_lawsuit / event_on_regulation ONLY when you can match a specific UUID from the catalogue.
- use_case_candidate for specific lawyer/firm AI deployments — populate use_case.
- new_lawsuit_candidate / new_regulation_candidate for genuinely new entities — human review, do not invent.
- Confidence < 0.5 → prefer "noise" or a candidate classification.`,
    userContent: `# Batch (${items.length} items)

${itemBlocks}

Classify each item.`,
  };
}

async function triageBatch(items, catalogueBlock) {
  const prompt = buildBatchTriagePrompt(items, catalogueBlock);
  // ~400 tokens per item of output; give headroom.
  const maxTokens = Math.min(4000, 400 * items.length + 200);
  const rawResponse = await callClaudeClassifier({
    cachedSystem: prompt.system,
    userContent: prompt.userContent,
    maxTokens,
    temperature: TRIAGE_MODEL_TEMP,
  });
  if (!rawResponse) throw new Error('Claude returned empty response (batch)');

  const match = rawResponse.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON object in batch response');
  let parsed;
  try { parsed = JSON.parse(match[0]); }
  catch (err) { throw new Error(`Batch JSON parse failed: ${err.message}`); }

  if (!Array.isArray(parsed.results)) throw new Error('Batch response missing results array');

  // Map results back to items by item_index; fall back to positional match.
  const byIndex = new Map();
  for (const r of parsed.results) {
    if (typeof r.item_index === 'number') byIndex.set(r.item_index, r);
  }
  return items.map((_, i) => byIndex.get(i) || parsed.results[i] || null);
}

// ── Per-item processing ──────────────────────────────────────────────────────
async function triageOne(item, catalogueBlock) {
  const prompt = buildTriagePrompt(item, catalogueBlock);
  // Haiku + prompt-cached catalogue. ~4× cheaper than Sonnet, and the ~9k-token
  // catalogue is reused across every call in the batch — the cache cuts its
  // cost to ~10% on every call after the first.
  const rawResponse = await callClaudeClassifier({
    cachedSystem: prompt.system,
    userContent: prompt.userContent,
    maxTokens: 600,
    temperature: TRIAGE_MODEL_TEMP,
  });

  if (!rawResponse) {
    throw new Error('Claude returned empty response');
  }

  // Extract JSON — be tolerant of wrapping backticks / preamble
  const match = rawResponse.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON object in response');
  let result;
  try { result = JSON.parse(match[0]); }
  catch (err) { throw new Error(`JSON parse failed: ${err.message}`); }

  return result;
}

async function applyTriageResult(item, result) {
  // Update the raw item row with the triage decision.
  // Use-case and new-entity candidates land as 'classified' — they need human
  // review before becoming part of the public dataset.
  await pool.query(
    `UPDATE ai_legal_raw_items
        SET triage_status = $1, triage_result = $2::jsonb, triaged_at = NOW()
      WHERE id = $3`,
    [
      result.classification === 'noise' ? 'rejected'
        : (result.classification === 'event_on_lawsuit' || result.classification === 'event_on_regulation') && result.match_id
          ? 'promoted'
          : 'classified',
      JSON.stringify(result),
      item.id,
    ]
  );

  // If it's an event on an existing entity, create the event row.
  //
  // D5 anti-hallucination guard: we REFUSE to write an event without a
  // resolvable source_url. If the raw item's URL doesn't resolve, we mark
  // the raw item as 'rejected' with a reason — the "event" Claude proposed
  // could be real but we can't verify, so it doesn't go into the events table.
  if (result.classification === 'event_on_lawsuit' && result.match_id && result.event) {
    // Verify the match_id exists (Claude can hallucinate UUIDs)
    const { rowCount } = await pool.query('SELECT 1 FROM ai_lawsuits WHERE id = $1', [result.match_id]);
    if (rowCount > 0) {
      const sourceUrl = item.url || null;
      const verified = sourceUrl ? await urlResolves(sourceUrl) : false;
      if (!verified) {
        await pool.query(
          `UPDATE ai_legal_raw_items
              SET triage_status = 'rejected',
                  triage_result = jsonb_set(triage_result, '{guard}', '"source_url_unverified"')
            WHERE id = $1`,
          [item.id]
        );
        return { promoted: false, guard: 'source_url_unverified' };
      }

      const { rows } = await pool.query(
        `INSERT INTO ai_lawsuit_events (lawsuit_id, event_date, event_type, title, description, source_url, source_verified_at)
         VALUES ($1, $2::date, $3, $4, $5, $6, NOW())
         RETURNING id`,
        [
          result.match_id,
          result.event.event_date || null,
          result.event.event_type || 'update',
          (result.event.title || item.title || '').slice(0, 500),
          result.event.description || null,
          sourceUrl,
        ]
      );
      await pool.query(
        `UPDATE ai_legal_raw_items SET lawsuit_id = $1, event_id = $2 WHERE id = $3`,
        [result.match_id, rows[0].id, item.id]
      );
      await pool.query(
        `UPDATE ai_lawsuits SET last_scraped_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [result.match_id]
      );
      await pool.query(
        `UPDATE ai_legal_sources SET items_promoted = items_promoted + 1 WHERE id = $1`,
        [item.source_id]
      );
      // Sync the lawsuit to Holly's knowledge base so the AI assistant + RAG
      // pick up new events automatically. Non-fatal if sync fails.
      try { await syncLawsuitToKnowledge(result.match_id); }
      catch (err) { console.warn('[triage] knowledge sync failed:', err.message); }
      return { promoted: true, kind: 'lawsuit_event', event_id: rows[0].id };
    }
  }

  if (result.classification === 'event_on_regulation' && result.match_id && result.event) {
    const { rowCount } = await pool.query('SELECT 1 FROM ai_regulations WHERE id = $1', [result.match_id]);
    if (rowCount > 0) {
      const sourceUrl = item.url || null;
      const verified = sourceUrl ? await urlResolves(sourceUrl) : false;
      if (!verified) {
        await pool.query(
          `UPDATE ai_legal_raw_items
              SET triage_status = 'rejected',
                  triage_result = jsonb_set(triage_result, '{guard}', '"source_url_unverified"')
            WHERE id = $1`,
          [item.id]
        );
        return { promoted: false, guard: 'source_url_unverified' };
      }

      const { rows } = await pool.query(
        `INSERT INTO ai_regulation_events (regulation_id, event_date, event_type, title, description, source_url, source_verified_at)
         VALUES ($1, $2::date, $3, $4, $5, $6, NOW())
         RETURNING id`,
        [
          result.match_id,
          result.event.event_date || null,
          result.event.event_type || 'update',
          (result.event.title || item.title || '').slice(0, 500),
          result.event.description || null,
          sourceUrl,
        ]
      );
      await pool.query(
        `UPDATE ai_legal_raw_items SET regulation_id = $1, event_id = $2 WHERE id = $3`,
        [result.match_id, rows[0].id, item.id]
      );
      await pool.query(
        `UPDATE ai_regulations SET last_scraped_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [result.match_id]
      );
      await pool.query(
        `UPDATE ai_legal_sources SET items_promoted = items_promoted + 1 WHERE id = $1`,
        [item.source_id]
      );
      try { await syncRegulationToKnowledge(result.match_id); }
      catch (err) { console.warn('[triage] knowledge sync failed:', err.message); }
      return { promoted: true, kind: 'regulation_event', event_id: rows[0].id };
    }
  }

  return { promoted: false, classification: result.classification };
}

// ── Public entry point ───────────────────────────────────────────────────────
// batchSize = 1 → original per-item path (useful for debugging a specific item).
// batchSize = 5 → default; cheapest + fastest for noise-heavy feeds.
export async function triagePendingItems({ limit = 20, batchSize = 5 } = {}) {
  // Groq free tier has an 8K TPM cap that a 5-item batch trips reliably.
  // Force single-item mode there; client-side throttling in callGroqClassifier
  // keeps the per-minute budget under the cap.
  if (process.env.LLM_BACKEND === 'groq') batchSize = 1;

  const catalogue = await loadEntityCatalogue();
  const catalogueBlock = catalogueToPromptBlock(catalogue);

  const { rows: pending } = await pool.query(
    `SELECT r.id, r.source_id, r.url, r.title, r.content, r.author, r.published_at,
            s.name AS source_name
       FROM ai_legal_raw_items r
       JOIN ai_legal_sources   s ON s.id = r.source_id
      WHERE r.triage_status = 'pending'
      ORDER BY r.fetched_at DESC
      LIMIT $1`,
    [limit]
  );

  const summary = { seen: pending.length, promoted: 0, rejected: 0, classified: 0, errors: [], batches: 0, singletons: 0 };

  async function processOne(item) {
    try {
      const result = await triageOne(item, catalogueBlock);
      const applied = await applyTriageResult(item, result);
      if (applied.promoted) summary.promoted++;
      else if (result.classification === 'noise') summary.rejected++;
      else summary.classified++;
    } catch (err) {
      summary.errors.push({ item_id: item.id, error: err.message });
      await pool.query(
        `UPDATE ai_legal_raw_items
            SET triage_result = $1::jsonb, triaged_at = NOW()
          WHERE id = $2`,
        [JSON.stringify({ error: err.message }), item.id]
      );
    }
  }

  for (let i = 0; i < pending.length; i += batchSize) {
    const slice = pending.slice(i, i + batchSize);

    // Single-item path (or explicit batchSize=1)
    if (slice.length === 1 || batchSize === 1) {
      summary.singletons += slice.length;
      for (const item of slice) await processOne(item);
      continue;
    }

    try {
      const results = await triageBatch(slice, catalogueBlock);
      summary.batches++;
      for (let j = 0; j < slice.length; j++) {
        const item = slice[j];
        const result = results[j];
        if (!result) {
          // Batch response was shorter than input — fall back to per-item for this one
          await processOne(item);
          continue;
        }
        try {
          const applied = await applyTriageResult(item, result);
          if (applied.promoted) summary.promoted++;
          else if (result.classification === 'noise') summary.rejected++;
          else summary.classified++;
        } catch (err) {
          summary.errors.push({ item_id: item.id, error: `apply: ${err.message}` });
        }
      }
    } catch (err) {
      // Batch call itself failed (API error, parse error). Fall back to per-item
      // so the whole batch isn't lost when Claude mis-formats one response.
      summary.errors.push({ batch_size: slice.length, error: `batch fallback: ${err.message}` });
      for (const item of slice) await processOne(item);
    }
  }

  return summary;
}
