// Tool: archive_search
//
// Searches the calling newsroom's archive knowledge-graph for evidence
// relevant to the agentic agent's current task. Wraps lib/archive/answer.js.
// Read-only; never writes. Newsroom-scoped via ctx.newsroomId.

const { answerQuestion } = require('../../../archive/answer');

const tool = {
  name: 'archive_search',
  description:
    'Ask the newsroom archive a natural-language question and get a cited answer with the strongest matching claims and documents. Use this whenever you want to check whether the newsroom has prior coverage of a topic, entity, or claim.',
  input_schema: {
    type: 'object',
    properties: {
      question: {
        type: 'string',
        description: 'The natural-language question to search the archive with. Be specific.',
      },
      max_evidence: {
        type: 'integer',
        description: 'How many claims/documents to consider as evidence. Default 8.',
        minimum: 1,
        maximum: 30,
      },
    },
    required: ['question'],
  },
  async run({ question, max_evidence = 8 }, ctx) {
    if (!ctx?.newsroomId) {
      return { error: 'newsroomId missing from agentic context' };
    }
    const result = await answerQuestion({
      newsroomId: ctx.newsroomId,
      question: String(question || ''),
      maxEvidence: max_evidence,
      context: { agent: 'agentic.archive_search', userId: ctx.userId },
    });
    return {
      answer: result.answer,
      citations: (result.citations || []).slice(0, 8),
      matched_entities: (result.matched_entities || []).slice(0, 8),
      evidence_count: result.evidence_count,
      fallback_used: result.fallback_used,
    };
  },
};

module.exports = tool;
