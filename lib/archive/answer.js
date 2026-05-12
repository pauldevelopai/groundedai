// Structured question-answering over the knowledge graph.
//
// Flow:
//   1. Haiku interprets the question — extracts named-entity candidates,
//      time scope, and a question type (who-is-X / what-do-we-know-about /
//      when-did-X / who-is-connected-to / etc.).
//   2. For each candidate entity name, look it up via fuzzyEntitySearch.
//      Pick the top hit if its composite score >= ENTITY_MATCH_THRESHOLD.
//   3. Pull entityProfile (with optional asOf cutoff) for each matched entity.
//      Falls back to semanticClaimSearch when no entity matched (a "claim
//      proposition" question, e.g. "did anyone deny the deal").
//      Final fallback: semanticChunkSearch over raw passages.
//   4. Haiku synthesizes a final answer that cites each retrieved fact with
//      a source document id + byline + asserted_at.
//
// Cost: ~$0.002-$0.008 per question (two Haiku calls). On Ollama fallback,
// cost is 0 but latency is higher.
//
// Returns:
//   {
//     answer: "<natural-language answer>",
//     citations: [{ doc_id, title, byline, published_at, quote, claim_id?, relationship_id? }],
//     matched_entities: [{ id, canonical_name, score }],
//     intent: { question_type, entity_names, as_of, ... },
//     fallback_used: 'entity' | 'semantic_claims' | 'semantic_chunks' | 'none',
//     cost: { costUsd, model, ... }
//   }

const { chat } = require('../claude');
const { parseClaudeJson } = require('../parse-claude-json');
const {
  fuzzyEntitySearch,
  entityProfile,
  semanticClaimSearch,
  semanticChunkSearch,
} = require('./query');

const ENTITY_MATCH_THRESHOLD = 0.5;

const INTENT_PROMPT = `You parse newsroom-archive questions into structured intent. The newsroom queries its own archive of past coverage — they want to find what THEY have already reported. Return only JSON.

Possible question_type values:
  who_is              — "who is Cyril Ramaphosa"
  what_do_we_know     — "what do we know about Eskom"
  when_did            — "when did Ramaphosa meet Hichilema"
  who_is_connected_to — "who is connected to Anglo American"
  claim_proposition   — "did anyone deny the deal" or "any past reporting that the ANC supports load-shedding"
  general             — anything else

Extract entity_names verbatim — exactly as the question states the name. Do not normalise (we resolve them later against the archive).
Extract an as_of ISO date (YYYY-MM-DD) only if the question literally bounds it in time ("as of 2024", "before the election", "in January 2024"). Otherwise null.
`;

async function interpretIntent({ question, context }) {
  const userMsg = `Question: "${question}"

Return JSON:
{
  "question_type": "<one of: who_is | what_do_we_know | when_did | who_is_connected_to | claim_proposition | general>",
  "entity_names": ["<name 1>", "<name 2>"],
  "as_of": "<YYYY-MM-DD or null>",
  "rephrased_proposition": "<for claim_proposition: the single statement to look for in claims; else null>"
}`;
  const { text, cost } = await chat({
    system: INTENT_PROMPT,
    messages: [{ role: 'user', content: userMsg }],
    maxTokens: 512,
    context: { ...context, agent: 'archivist', endpoint: 'archive-intent' },
  });
  const parsed = parseClaudeJson(text) || {};
  return {
    question_type: parsed.question_type || 'general',
    entity_names: Array.isArray(parsed.entity_names) ? parsed.entity_names.filter((s) => typeof s === 'string' && s.trim()) : [],
    as_of: typeof parsed.as_of === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.as_of) ? parsed.as_of : null,
    rephrased_proposition: typeof parsed.rephrased_proposition === 'string' ? parsed.rephrased_proposition.trim() : null,
    cost,
  };
}

const SYNTHESIS_PROMPT = `You answer newsroom-archive questions using ONLY the provided facts. Every claim in your answer must be traceable to one of the numbered citations. Do not invent facts. If the facts are thin, say so explicitly — "The archive has limited coverage of this".

Tone: direct, editorial, concise. No "Based on the provided sources..." preamble. State the answer, cite as you go.`;

async function synthesizeAnswer({ question, intent, evidence, context }) {
  // evidence is an array of citation-ready items, each with a [n] index
  const evidenceBlock = evidence
    .map((e, i) => {
      const date = e.published_at ? new Date(e.published_at).toISOString().slice(0, 10) : 'undated';
      const author = Array.isArray(e.byline) && e.byline.length > 0 ? e.byline.join(', ') : 'no byline';
      return `[${i + 1}] (${date}, by ${author}) "${e.quote}"`;
    })
    .join('\n\n');

  if (evidenceBlock.trim() === '') {
    return {
      text: "The archive has no coverage relevant to this question.",
      cost: null,
    };
  }

  const userMsg = `Question: ${question}

Question intent: ${intent.question_type}
${intent.as_of ? `As-of cutoff: ${intent.as_of}` : ''}

Numbered facts from the newsroom archive:

${evidenceBlock}

Write a concise, direct answer using ONLY these facts. Cite each claim inline as [1], [2], etc. (matching the numbered list above). If the facts contradict, say so. If they don't cover something the question asks about, say so explicitly.`;

  const { text, cost } = await chat({
    system: SYNTHESIS_PROMPT,
    messages: [{ role: 'user', content: userMsg }],
    maxTokens: 1024,
    context: { ...context, agent: 'archivist', endpoint: 'archive-synthesis' },
  });
  return { text: text.trim(), cost };
}

/**
 * Main entry point.
 *
 * @param {object} args
 * @param {string} args.newsroomId
 * @param {string} args.question
 * @param {number} [args.maxEvidence]  Default 12 — cap evidence items sent to synthesis
 * @param {object} [args.context]
 */
async function answerQuestion({ newsroomId, question, maxEvidence = 12, context = {} }) {
  const intent = await interpretIntent({ question, context });
  let totalCost = intent.cost?.costUsd || 0;

  // ─── Try to resolve entity names → entity ids ─────────────────────────
  const matchedEntities = [];
  const unmatchedNames = [];
  for (const name of intent.entity_names) {
    const hits = await fuzzyEntitySearch({ newsroomId, query: name, k: 3 });
    const best = hits[0];
    if (best && best.score >= ENTITY_MATCH_THRESHOLD) {
      matchedEntities.push(best);
    } else {
      unmatchedNames.push(name);
    }
  }

  // ─── Gather evidence ──────────────────────────────────────────────────
  let evidence = [];
  let fallbackUsed = 'none';

  if (matchedEntities.length > 0) {
    fallbackUsed = 'entity';
    // For each matched entity, pull profile (claims + relationships) and
    // flatten into evidence items.
    for (const ent of matchedEntities) {
      const profile = await entityProfile({
        newsroomId,
        entityId: ent.id,
        asOf: intent.as_of,
        claimLimit: 10,
        relLimit: 5,
        docLimit: 5,
      });
      if (!profile) continue;
      // Claims first (they're the most citable units)
      for (const c of profile.claims) {
        evidence.push({
          kind: 'claim',
          claim_id: c.id,
          doc_id: c.document_id,
          title: c.document_title,
          byline: c.byline,
          published_at: c.asserted_at,
          quote: c.evidence_text || c.claim_text,
          claim_text: c.claim_text,
          confidence: Number(c.confidence),
        });
      }
      // Then relationships
      for (const r of profile.relationships) {
        evidence.push({
          kind: 'relationship',
          doc_id: r.document_id,
          title: r.document_title,
          byline: r.byline,
          published_at: r.published_at,
          quote: r.evidence_text,
          predicate: r.predicate,
          subject_name: r.direction === 'outgoing' ? ent.canonical_name : r.other_name,
          object_name: r.direction === 'outgoing' ? r.other_name : ent.canonical_name,
          confidence: Number(r.confidence),
        });
      }
    }
  }

  // If entity path produced no evidence, OR if no entities matched, try
  // semantic claim search using the rephrased proposition or the raw question
  if (evidence.length === 0) {
    const semanticQuery = intent.rephrased_proposition || question;
    const claims = await semanticClaimSearch({
      newsroomId,
      query: semanticQuery,
      k: maxEvidence,
      asOf: intent.as_of,
    });
    if (claims.length > 0) {
      fallbackUsed = 'semantic_claims';
      evidence = claims.map((c) => ({
        kind: 'claim',
        claim_id: c.id,
        doc_id: c.document_id,
        title: c.document_title,
        byline: c.byline,
        published_at: c.asserted_at,
        quote: c.evidence_text || c.claim_text,
        claim_text: c.claim_text,
        confidence: Number(c.confidence),
        similarity: Number(c.similarity),
      }));
    }
  }

  // Last-resort fallback: chunk search (the legacy semantic-search path)
  if (evidence.length === 0) {
    const chunks = await semanticChunkSearch({ newsroomId, query: question, k: maxEvidence });
    if (chunks.length > 0) {
      fallbackUsed = 'semantic_chunks';
      evidence = chunks.map((c) => ({
        kind: 'chunk',
        doc_id: c.document_id,
        title: c.document_title,
        byline: c.byline,
        published_at: c.published_at,
        quote: (c.text || '').slice(0, 400),
        similarity: Number(c.similarity),
      }));
    }
  }

  // Dedup evidence by doc_id+quote so Haiku doesn't see redundant items
  const seen = new Set();
  evidence = evidence
    .filter((e) => {
      const k = `${e.doc_id}::${(e.quote || '').slice(0, 100)}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, maxEvidence);

  // ─── Synthesize answer with Haiku ────────────────────────────────────
  const synth = await synthesizeAnswer({ question, intent, evidence, context });
  if (synth.cost) totalCost += synth.cost.costUsd || 0;

  // Compact citations for the API consumer
  const citations = evidence.map((e, i) => ({
    n: i + 1,
    doc_id: e.doc_id,
    title: e.title,
    byline: e.byline,
    published_at: e.published_at,
    quote: e.quote,
    kind: e.kind,
    claim_id: e.claim_id || null,
  }));

  return {
    answer: synth.text,
    citations,
    matched_entities: matchedEntities.map((e) => ({ id: e.id, canonical_name: e.canonical_name, score: e.score })),
    unmatched_names: unmatchedNames,
    intent: {
      question_type: intent.question_type,
      entity_names: intent.entity_names,
      as_of: intent.as_of,
    },
    fallback_used: fallbackUsed,
    evidence_count: evidence.length,
    cost: { costUsd: totalCost, model: 'haiku-or-ollama', inputTokens: 0, outputTokens: 0 },
  };
}

module.exports = { answerQuestion, interpretIntent, ENTITY_MATCH_THRESHOLD };
