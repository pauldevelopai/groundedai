const { pool } = require('../db');
const { embedQuery } = require('../storage/embed');
const { answerQuestion } = require('../archive/answer');

/**
 * Searches the vector database for chunks relevant to the query.
 * Strictly scoped by newsroom_id.
 */
async function search({ newsroomId, query, k = 5 }) {
  const queryEmbedding = await embedQuery(query);
  const vectorLiteral = `[${queryEmbedding.join(',')}]`;

  // We use pgvector's <=> operator for cosine distance.
  const result = await pool.query(
    `SELECT 
       c.id, 
       c.text, 
       c.chunk_index,
       d.filename,
       1 - (c.embedding <=> $2::vector) AS similarity
     FROM archive_chunks c
     JOIN archive_documents d ON c.document_id = d.id
     WHERE c.newsroom_id = $1
     ORDER BY c.embedding <=> $2::vector
     LIMIT $3`,
    [newsroomId, vectorLiteral, k]
  );

  return result.rows.map(row => ({
    text: row.text,
    filename: row.filename,
    similarity: row.similarity
  }));
}

/**
 * Helper specifically formatted to feed the Verifier agent with relevant archive context.
 */
async function retrieveContext({ newsroomId, query }) {
  const results = await search({ newsroomId, query, k: 3 });
  if (results.length === 0) {
    return "No relevant past coverage found in the newsroom archive.";
  }
  
  return results.map(r => `[Source: ${r.filename}]\n${r.text}`).join('\n\n');
}

module.exports = {
  search,
  retrieveContext
};

const { register, resolveConfig } = require('./registry');
register({
  slug: 'archivist',
  name: 'Archivist',
  icon: '📚',
  description: 'Semantic search over the newsroom\'s own archive. Remains private to each newsroom. Turns decades of locked-up output into an asset the newsroom can actively use and, where appropriate, responsibly monetise — the connective tissue feeding citations, footage, and context into other workflows.',
  triggers: ['archive', 'have we covered', 'past coverage', 'find related'],
  inputs: {
    query: {
      type: 'longtext',
      required: true,
      label: 'What to search for',
      description: 'A question, topic, or snippet of the article. The user types this when running the workflow — or wire it from another node (e.g. the article body).',
    },
  },
  config: {
    mode: {
      type: 'select',
      default: 'semantic',
      label: 'Query mode',
      description: 'How Archivist answers the query.',
      options: [
        { value: 'semantic', label: 'Semantic passage search (default)', description: 'Returns top-K most-similar passages from the archive. Pure embedding match. Free.' },
        { value: 'structured', label: 'Structured Q&A over the knowledge graph', description: 'Parses the question, walks entities + claims + relationships, returns a cited answer. Uses Haiku.' },
      ],
    },
    top_k: {
      type: 'number',
      default: 5,
      min: 1,
      max: 20,
      step: 1,
      label: 'Top-K passages',
      description: 'Number of most-similar passages to return.',
    },
    min_similarity: {
      type: 'number',
      default: 0,
      min: 0,
      max: 1,
      step: 0.05,
      label: 'Minimum similarity',
      description: 'Drop passages below this cosine similarity. 0 keeps all top-K.',
    },
    citation_format: {
      type: 'select',
      default: 'inline_source',
      label: 'Citation format',
      description: 'How the stitched archiveContext labels each passage.',
      options: [
        { value: 'inline_source', label: '[Source: filename] (default)' },
        { value: 'numbered', label: '[1], [2], … with a footnote list' },
        { value: 'plain', label: 'No citation markers (passage text only)' },
      ],
    },
    fail_open: {
      type: 'boolean',
      default: true,
      label: 'Return empty context on no matches',
      description: 'If off, the agent raises when no relevant passages are found instead of returning the "no past coverage" placeholder.',
    },
  },
  outputs: {
    results: { type: 'json', description: 'Array of {text, filename, similarity}. Populated in semantic mode; empty array in structured mode.' },
    archiveContext: { type: 'longtext', description: 'Stitched passages — wire directly into Verifier.archiveContext. Empty in structured mode.' },
    structuredAnswer: { type: 'json', description: 'Structured-mode answer with citations, matched entities, and intent. Empty in semantic mode.' },
  },
  route: '/api/archive/search',
  async run(input, ctx) {
    const cfg = resolveConfig('archivist', input);
    const startedAt = Date.now();

    // ─── Structured mode ───────────────────────────────────────────
    if (cfg.mode === 'structured') {
      const answer = await answerQuestion({
        newsroomId: ctx.newsroomId,
        question: input.query,
        context: { newsroomId: ctx.newsroomId, userId: ctx.userId, endpoint: '/api/agents/archivist' },
      });
      return {
        result: {
          results: [],
          archiveContext: answer.answer,
          structuredAnswer: answer,
        },
        cost: answer.cost,
        durationMs: Date.now() - startedAt,
      };
    }

    // ─── Semantic mode (default, backward-compatible) ──────────────
    const k = Math.max(1, Math.min(20, parseInt(cfg.top_k, 10) || 5));
    const minSim = parseFloat(cfg.min_similarity) || 0;
    let results = await search({ newsroomId: ctx.newsroomId, query: input.query, k });
    if (minSim > 0) results = results.filter((r) => (r.similarity || 0) >= minSim);

    if (results.length === 0 && cfg.fail_open === false) {
      throw new Error('Archivist: no passages above the similarity threshold (fail_open is off).');
    }

    let archiveContext;
    if (results.length === 0) {
      archiveContext = 'No relevant past coverage found in the newsroom archive.';
    } else if (cfg.citation_format === 'numbered') {
      archiveContext = results.map((r, i) => `[${i + 1}] ${r.text}`).join('\n\n')
        + '\n\nSources:\n'
        + results.map((r, i) => `[${i + 1}] ${r.filename}`).join('\n');
    } else if (cfg.citation_format === 'plain') {
      archiveContext = results.map((r) => r.text).join('\n\n');
    } else {
      archiveContext = results.map((r) => `[Source: ${r.filename}]\n${r.text}`).join('\n\n');
    }

    return {
      result: { results, archiveContext, structuredAnswer: null },
      cost: { costUsd: 0, model: 'bge-m3', inputTokens: 0, outputTokens: 0 },
      durationMs: Date.now() - startedAt,
    };
  },
});
