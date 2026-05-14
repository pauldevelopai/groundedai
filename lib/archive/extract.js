// Haiku-driven extraction of:
//   - newsroom-specific entities (zero-shot, replaces GLiNER for pilot)
//   - relations (subject-predicate-object triples between entities)
//   - atomic claims (factual assertions with evidence)
//
// Why Haiku instead of dedicated models:
//   - REBEL (relation extraction) has no ONNX port; only Python.
//   - GLiNER (zero-shot NER) has an npm package but pulls in a vulnerable
//     old @xenova/transformers@2.x (5 critical CVEs). The Haiku path produces
//     comparable results at our pilot volume without the supply-chain risk.
//   - Claim extraction has no production-grade OSS module.
//
// Cost: a typical 1000-word document = ~1300 tokens. Three Haiku passes per
// chunk = ~4K input tokens per chunk = ~$0.003 per chunk. A 10-chunk document
// costs ~$0.03 to fully ingest. A newsroom with 1000 docs = ~$30.

const { chat } = require('../claude');
const { parseClaudeJson } = require('../parse-claude-json');

// Defensive wrapper around parseClaudeJson — Haiku occasionally returns
// non-JSON ('I'm unable to extract …'). Return null instead of throwing so
// the caller can degrade to "no mentions / triples / claims" gracefully.
function tryParseJson(text) {
  try { return parseClaudeJson(text); } catch { return null; }
}

// ─── Newsroom-specific entity extraction ────────────────────────────────────
// Given a chunk and a list of newsroom-defined types (each with prompt_hint),
// have Haiku find every mention. Returns mentions with approximate char
// offsets that we re-locate exactly via String.indexOf afterwards.

async function extractCustomEntities({ text, customTypes, context = {} }) {
  if (!text || !customTypes || customTypes.length === 0) {
    return { mentions: [], cost: null };
  }

  const typeBlock = customTypes
    .map((t) => `- ${t.slug}: ${t.prompt_hint}${t.description ? ` (${t.description})` : ''}`)
    .join('\n');

  const system = `You extract named entities of specific user-defined types from news articles. Return only JSON. Do not invent entities; only extract what literally appears in the text.`;

  const userMsg = `Find every mention of these entity types in the article below. Return JSON matching:
{
  "mentions": [
    { "surface_text": "<exact span as it appears>", "type_slug": "<one of the listed slugs>", "confidence": <0..1> }
  ]
}

If a passage has no matching entities, return { "mentions": [] }. Only include entities that are clearly of one of the listed types — when in doubt, skip.

Types to find:
${typeBlock}

Article:
${text}

Return JSON only.`;

  const { text: response, cost } = await chat({
    system,
    messages: [{ role: 'user', content: userMsg }],
    maxTokens: 2048,
    context: { ...context, agent: 'archivist', endpoint: 'archive-custom-ner' },
  });
  const parsed = tryParseJson(response);
  const mentions = Array.isArray(parsed?.mentions) ? parsed.mentions : [];

  // Re-locate each surface_text in the chunk to get exact offsets. Haiku
  // sometimes paraphrases — drop mentions we can't find verbatim.
  const located = [];
  for (const m of mentions) {
    const surface = (m.surface_text || '').trim();
    if (!surface) continue;
    const start = text.indexOf(surface);
    if (start < 0) continue;
    located.push({
      surface_text: surface,
      type_slug: m.type_slug,
      char_start: start,
      char_end: start + surface.length,
      confidence: Number(m.confidence) || 0.7,
    });
  }
  return { mentions: located, cost };
}

// ─── Relation extraction ────────────────────────────────────────────────────
// Given a chunk and the entities found in it, ask Haiku for subject-predicate-
// object triples. Predicates are open-vocabulary (natural-language verbs/
// phrases). Each triple ships with the source sentence as evidence.

async function extractRelations({ text, entities, context = {} }) {
  if (!text || !entities || entities.length < 2) {
    return { triples: [], cost: null };
  }

  const entityBlock = entities
    .map((e, i) => `[${i}] ${e.canonical_name} (${e.type_slug || 'entity'})`)
    .join('\n');

  const system = `You extract relations between named entities from news articles. Output only JSON. Be conservative — only extract relations that are explicitly asserted in the text, not implied. Use the entity indices from the list provided.`;

  const userMsg = `Extract subject-predicate-object triples from the article below. Both subject and object MUST be entities from the list (refer to them by their numeric index).

Rules:
- Predicate is a short natural-language phrase (e.g. "appointed", "acquired", "denied", "is_subsidiary_of").
- evidence_text is the 1-2 sentence span from the article that justifies the triple.
- Skip triples where you're not confident both endpoints are real entities from the list.
- Skip self-referential triples.

Return JSON matching:
{
  "triples": [
    {
      "subject_idx": <int>,
      "predicate": "<string>",
      "object_idx": <int>,
      "evidence_text": "<verbatim quote from article>",
      "confidence": <0..1>
    }
  ]
}

Entities (refer to them by index):
${entityBlock}

Article:
${text}

Return JSON only. If no clear relations, return { "triples": [] }.`;

  const { text: response, cost } = await chat({
    system,
    messages: [{ role: 'user', content: userMsg }],
    maxTokens: 2048,
    context: { ...context, agent: 'archivist', endpoint: 'archive-relations' },
  });
  const parsed = tryParseJson(response);
  const triples = Array.isArray(parsed?.triples) ? parsed.triples : [];

  // Map indices back to entity ids; drop invalid refs and self-relations
  const valid = [];
  for (const t of triples) {
    const sIdx = Number(t.subject_idx);
    const oIdx = Number(t.object_idx);
    if (!Number.isInteger(sIdx) || !Number.isInteger(oIdx)) continue;
    if (sIdx === oIdx) continue;
    if (sIdx < 0 || sIdx >= entities.length) continue;
    if (oIdx < 0 || oIdx >= entities.length) continue;
    const evidence = (t.evidence_text || '').trim();
    if (!evidence) continue;
    // Locate evidence in source text for char_offset
    const charOffset = text.indexOf(evidence.slice(0, 80));
    valid.push({
      subject_entity_id: entities[sIdx].id,
      predicate: (t.predicate || '').trim() || 'related_to',
      object_entity_id: entities[oIdx].id,
      evidence_text: evidence,
      char_offset: charOffset >= 0 ? charOffset : null,
      confidence: Number(t.confidence) || 0.7,
    });
  }
  return { triples: valid, cost };
}

// ─── Claim extraction ───────────────────────────────────────────────────────
// Atomic factual assertions. Distinct from relations: a claim is a complete
// citable factual statement ("Anglo American sold its diamond business to
// Botswana in 2024"). Optionally references entities; always has evidence.

async function extractClaims({ text, entities, context = {} }) {
  if (!text || text.trim().length < 50) {
    return { claims: [], cost: null };
  }

  const entityBlock = entities && entities.length > 0
    ? entities.map((e, i) => `[${i}] ${e.canonical_name}`).join('\n')
    : '(no entities pre-extracted; ignore the subject_idx/object_idx fields)';

  const system = `You extract atomic factual claims from news articles. A claim is one citable, verifiable assertion (e.g. "Anglo American sold its diamond business in 2024"). Output only JSON. Skip opinions, rhetorical questions, and speculation.`;

  const userMsg = `Extract atomic factual claims from the article below. Each claim should be:
- A single sentence stating one verifiable fact
- Citable — could be quoted in another piece with attribution
- Drawn verbatim or near-verbatim from the article (no inference)

Return JSON matching:
{
  "claims": [
    {
      "claim_text": "<complete factual sentence>",
      "subject_idx": <int or null>,
      "predicate": "<short verb phrase or null>",
      "object_idx": <int or null>,
      "evidence_text": "<verbatim quote from article>",
      "confidence": <0..1>
    }
  ]
}

Entities you can reference by index:
${entityBlock}

Article:
${text}

Return JSON only. Aim for 3-8 claims per ~500 words. Skip if the article is opinion or feature with no clear factual core.`;

  const { text: response, cost } = await chat({
    system,
    messages: [{ role: 'user', content: userMsg }],
    maxTokens: 3072,
    context: { ...context, agent: 'archivist', endpoint: 'archive-claims' },
  });
  const parsed = tryParseJson(response);
  const claims = Array.isArray(parsed?.claims) ? parsed.claims : [];

  const valid = [];
  for (const c of claims) {
    const claimText = (c.claim_text || '').trim();
    if (!claimText) continue;
    const evidence = (c.evidence_text || '').trim() || claimText;
    const charOffset = text.indexOf(evidence.slice(0, 80));

    // Number(null) === 0, so check the raw value's type first.
    const sIdx = typeof c.subject_idx === 'number' && Number.isInteger(c.subject_idx) ? c.subject_idx : -1;
    const oIdx = typeof c.object_idx === 'number' && Number.isInteger(c.object_idx) ? c.object_idx : -1;
    const subjectId = sIdx >= 0 && sIdx < (entities || []).length ? entities[sIdx].id : null;
    const objectId = oIdx >= 0 && oIdx < (entities || []).length ? entities[oIdx].id : null;

    valid.push({
      claim_text: claimText,
      subject_entity_id: subjectId,
      predicate: (c.predicate || '').trim() || null,
      object_entity_id: objectId,
      evidence_text: evidence,
      char_offset: charOffset >= 0 ? charOffset : null,
      confidence: Number(c.confidence) || 0.7,
    });
  }
  return { claims: valid, cost };
}

module.exports = { extractCustomEntities, extractRelations, extractClaims };
