const { pool } = require('../db');
const { embedQuery } = require('../storage/embed');

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

const { register } = require('./registry');
register({
  slug: 'archivist',
  name: 'Archivist',
  description: 'Semantic search over this newsroom\'s private archive. Returns the top-K relevant passages plus a stitched context string for downstream agents.',
  triggers: ['archive', 'have we covered', 'past coverage', 'find related'],
  inputs: {
    query: { type: 'longtext', required: true, description: 'Search query — can be a question, a topic, or a snippet of an article.' },
    k: { type: 'string', description: 'Number of passages to return (default 5).' },
  },
  outputs: {
    results: { type: 'json', description: 'Array of {text, filename, similarity}.' },
    archiveContext: { type: 'longtext', description: 'Stitched [Source: filename] passages — wire this directly into Verifier.archiveContext.' },
  },
  route: '/api/archive/search',
  async run(input, ctx) {
    const startedAt = Date.now();
    const k = input.k ? parseInt(input.k, 10) : 5;
    const results = await search({ newsroomId: ctx.newsroomId, query: input.query, k });
    const archiveContext = results.length === 0
      ? 'No relevant past coverage found in the newsroom archive.'
      : results.map(r => `[Source: ${r.filename}]\n${r.text}`).join('\n\n');
    return {
      result: { results, archiveContext },
      cost: { costUsd: 0, model: 'bge-m3', inputTokens: 0, outputTokens: 0 },
      durationMs: Date.now() - startedAt,
    };
  },
});
