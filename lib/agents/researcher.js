// Researcher agent — pulls entities, relationships, key claims, follow-up
// questions, and suggested records-to-pull out of a document. Two callers:
//
//   1. The /api/research/dossiers/:id/analyze endpoint runs analyzeText()
//      across all parsed documents in a dossier, then merges the structured
//      output into the research_entities / research_relationships /
//      research_findings tables (slice 6b). That's the "real system" path.
//
//   2. The agent registry's run() also calls analyzeText() but returns the
//      structured JSON without persisting anywhere. Workflow nodes pipe the
//      result into downstream agents (e.g. Drafter to write a story
//      from the dossier).

const { chat } = require('../claude');
const { parseClaudeJson } = require('../parse-claude-json');

const SYSTEM_BASE = `You are Grounded's Researcher agent — a research assistant for African newsrooms working with court filings, regulatory disclosures, financial documents, and other primary source material.

Your job: read the document and extract structured findings a journalist can act on. You are NOT writing a story. You are doing the structured legwork that makes the story possible.

Hard constraints:
1. EVIDENCE-BASED. Every entity, relationship, and claim must be supported by what's in the document. Do not invent facts beyond the text.
2. NEVER ACCUSE. Where the document implies wrongdoing, surface it as a "claim" with neutral phrasing or as a "question" the journalist should follow up. Don't editorialise.
3. CITE THE SOURCE. Where useful, quote a short fragment from the document as evidence on a claim or relationship.
4. PRIORITISE THE BURIED. Pull out facts the average reader would miss — buried numbers, hidden parties, undated events that should be dated.

Entity kinds (open-vocab — these are canonical, but you can invent specifics like "court_case", "registration_number", "statute" when they fit):
- person — a named individual
- organisation — companies, NGOs, government bodies
- place — countries, cities, addresses
- date — specific dates or windows mentioned
- amount — monetary values with currency
- event — named events (e.g. "the 2018 elections", "the Mopani audit")

Relationship kinds (open-vocab; common ones): director_of, owns, paid, paid_by, received_from, member_of, registered_at, signed, employed_by, related_to, succeeded, replaced_by.`;

const DEPTH_HINT = {
  quick: 'Quick depth — surface 5–10 entities and 3–5 most important findings. Speed over completeness.',
  thorough: 'Thorough depth — extract all named entities and every substantive claim. This is the default.',
  forensic: 'Forensic depth — exhaustive. Capture every date, every number, every named party, every implied relationship. Aim for >25 entities if the document supports it.',
};

const COVERAGE_HINT = {
  basic: 'Cover people, organisations, places, and dates. Skip amounts and relationships.',
  full: 'Cover everything: people, organisations, places, dates, amounts, events, AND map relationships between entities you extract.',
  financial: 'Focus on monetary amounts, transactions, and the parties they flow between. Skip purely descriptive entities.',
};

const JURISDICTION_HINT = {
  none: '',
  SA: 'Jurisdiction: South Africa. Recognise StatsSA, SARB, JSE, the Companies and Intellectual Property Commission (CIPC), Master of the High Court, the IEC, the Public Protector. POPIA frames data-protection. Currency: ZAR.',
  ZW: 'Jurisdiction: Zimbabwe. Recognise ZimStats, RBZ, ZSE, the Companies Office, the ZACC, the High Court, ZEC, the Auditor-General. Currency: USD or ZWL.',
  ZM: 'Jurisdiction: Zambia. Recognise ZamStats, BOZ, LuSE, PACRA, the ACC, the High Court, the ECZ. Currency: ZMW.',
  KE: 'Jurisdiction: Kenya. Recognise KNBS, CBK, NSE, the BRS, the EACC, the High Court, the IEBC, the Auditor-General. Currency: KES.',
};

function buildJsonSchema({ generateQuestions, suggestRecords, maxEntities }) {
  return `Return ONLY valid JSON matching this schema:
{
  "summary": "<3–4 sentence editor-facing summary of what's in the document>",
  "entities": [
    {
      "kind": "person | organisation | place | date | amount | event | <other>",
      "name": "<canonical name as written>",
      "role": "<role / context within this document, if any>",
      "metadata": { /* free-form: e.g. { "currency": "ZMW", "amount_value": 1200000 } */ }
    }
  ],
  "relationships": [
    {
      "from": "<entity name from entities[]>",
      "to":   "<entity name from entities[]>",
      "kind": "<relationship type, see system prompt>",
      "evidence": "<short quote or paraphrase from the document>"
    }
  ],
  "claims": [
    { "body": "<the factual claim>", "rationale": "<why this matters>", "confidence": <0.0–1.0> }
  ]${generateQuestions ? `,\n  "questions": [\n    { "body": "<follow-up question the journalist should chase>" }\n  ]` : ''}${suggestRecords ? `,\n  "records_to_pull": [\n    { "body": "<specific record to obtain>", "rationale": "<what it would confirm or contradict>" }\n  ]` : ''},
  "gaps": [
    { "body": "<information missing from the document that would change the story>" }
  ]
}

Cap entities at ${maxEntities}. Output JSON only — no preamble, no markdown fences.`;
}

/**
 * @param {object} opts
 * @param {string} opts.documentText        — the source text. ≥50 chars required.
 * @param {string} [opts.topic]             — optional focus topic.
 * @param {string} [opts.depth]             — quick | thorough | forensic
 * @param {string} [opts.jurisdiction]      — none | SA | ZW | ZM | KE
 * @param {string} [opts.coverage]          — basic | full | financial
 * @param {boolean} [opts.generateQuestions]— default true
 * @param {boolean} [opts.suggestRecords]   — default true
 * @param {number}  [opts.maxEntities]      — default 25
 * @param {{ newsroomId: string, userId: string, endpoint: string }} opts.context
 * @returns {Promise<{ result: object, cost: any, durationMs: number }>}
 */
async function analyzeText({
  documentText,
  topic,
  depth = 'thorough',
  jurisdiction = 'none',
  coverage = 'full',
  generateQuestions = true,
  suggestRecords = true,
  maxEntities = 25,
  context,
}) {
  if (!documentText || typeof documentText !== 'string' || documentText.trim().length < 50) {
    throw new Error('documentText is required (min 50 chars).');
  }
  const lines = [SYSTEM_BASE];
  lines.push(DEPTH_HINT[depth] || DEPTH_HINT.thorough);
  lines.push(COVERAGE_HINT[coverage] || COVERAGE_HINT.full);
  if (JURISDICTION_HINT[jurisdiction]) lines.push(JURISDICTION_HINT[jurisdiction]);
  lines.push(buildJsonSchema({ generateQuestions, suggestRecords, maxEntities }));
  const systemPrompt = lines.join('\n\n');

  const userMessage = topic
    ? `Topic the journalist is researching: ${topic}\n\nDocument:\n\n${documentText}\n\nReturn JSON only.`
    : `Document:\n\n${documentText}\n\nReturn JSON only.`;

  const startedAt = Date.now();
  const { text, cost } = await chat({
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
    maxTokens: 4096,
    context: { ...context, agent: 'researcher' },
  });

  const result = parseClaudeJson(text);
  // Defensive normalisation — guarantee arrays exist.
  result.entities = Array.isArray(result.entities) ? result.entities : [];
  result.relationships = Array.isArray(result.relationships) ? result.relationships : [];
  result.claims = Array.isArray(result.claims) ? result.claims : [];
  result.questions = Array.isArray(result.questions) ? result.questions : [];
  result.records_to_pull = Array.isArray(result.records_to_pull) ? result.records_to_pull : [];
  result.gaps = Array.isArray(result.gaps) ? result.gaps : [];

  return { result, cost, durationMs: Date.now() - startedAt };
}

module.exports = { analyzeText };

// ─── Agent registry entry ──────────────────────────────────────────────────
const { register, resolveConfig } = require('./registry');
register({
  slug: 'researcher',
  name: 'Researcher',
  icon: '🔎',
  description: 'Pulls and scrapes public records, court filings, regulatory disclosures, and financial documents. Extracts entities, relationships, key claims, follow-up questions, and suggested records to chase. Pairs with research dossiers in /research for ongoing investigations.',
  triggers: ['research', 'extract', 'who is in this document', 'find entities'],
  inputs: {
    documentText: {
      type: 'longtext',
      required: true,
      label: 'Document to research',
      description: 'The court filing, disclosure, financial doc, or any source text the user pastes in. For ongoing investigations, use /research dossiers instead — they keep findings around.',
    },
    topic: {
      type: 'string',
      label: 'Research focus (optional)',
      description: 'Optional. A specific angle the researcher should weight (e.g. "land tenure", "shell companies", "tax fraud").',
    },
  },
  config: {
    depth: {
      type: 'select',
      default: 'thorough',
      label: 'Depth',
      description: 'How exhaustively the agent works. Forensic is slow but catches buried details.',
      options: [
        { value: 'quick', label: 'Quick — top 5–10 entities, headline findings', description: 'Speed over completeness.' },
        { value: 'thorough', label: 'Thorough (default)', description: 'All named entities and substantive claims.' },
        { value: 'forensic', label: 'Forensic — exhaustive', description: 'Captures every date, number, party, implied relationship.' },
      ],
    },
    jurisdiction: {
      type: 'select',
      default: 'none',
      label: 'Jurisdiction',
      description: 'Tells the agent which agencies, courts, and currency to recognise.',
      options: [
        { value: 'none', label: 'No jurisdiction context' },
        { value: 'SA', label: 'South Africa (StatsSA, SARB, JSE, CIPC, IEC, Public Protector, ZAR)' },
        { value: 'ZW', label: 'Zimbabwe (ZimStats, RBZ, ZSE, ZACC, ZEC, USD/ZWL)' },
        { value: 'ZM', label: 'Zambia (ZamStats, BOZ, LuSE, PACRA, ACC, ECZ, ZMW)' },
        { value: 'KE', label: 'Kenya (KNBS, CBK, NSE, BRS, EACC, IEBC, KES)' },
      ],
    },
    coverage: {
      type: 'select',
      default: 'full',
      label: 'Entity coverage',
      description: 'Which entity kinds to extract.',
      options: [
        { value: 'basic', label: 'Basic — people, orgs, places, dates' },
        { value: 'full', label: 'Full — basic + amounts + events + relationships (default)' },
        { value: 'financial', label: 'Financial — money flows and the parties involved' },
      ],
    },
    generate_questions: {
      type: 'boolean',
      default: true,
      label: 'Generate follow-up questions',
      description: 'Suggest questions the journalist should chase based on what\'s implied but not answered.',
    },
    suggest_records: {
      type: 'boolean',
      default: true,
      label: 'Suggest records to pull',
      description: 'Suggest specific records (registrations, filings, court lists) that would confirm or contradict what\'s in the document.',
    },
    max_entities: {
      type: 'number',
      default: 25,
      min: 5,
      max: 80,
      step: 5,
      label: 'Maximum entities',
      description: 'Cap on how many entities the agent extracts per document.',
    },
  },
  outputs: {
    result: {
      type: 'json',
      description: 'Full structured findings: summary, entities, relationships, claims, questions, records_to_pull, gaps.',
    },
  },
  route: '/api/agents/researcher',
  async run(input, ctx) {
    const cfg = resolveConfig('researcher', input);
    const { result, cost, durationMs } = await analyzeText({
      documentText: input.documentText,
      topic: input.topic,
      depth: cfg.depth,
      jurisdiction: cfg.jurisdiction,
      coverage: cfg.coverage,
      generateQuestions: cfg.generate_questions !== false && cfg.generate_questions !== 'false',
      suggestRecords: cfg.suggest_records !== false && cfg.suggest_records !== 'false',
      maxEntities: parseInt(cfg.max_entities, 10) || 25,
      context: ctx,
    });
    return { result: { result }, cost, durationMs };
  },
});
