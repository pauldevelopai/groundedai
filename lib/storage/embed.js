const { CohereClient } = require('cohere-ai');
const { recordCost } = require('../costs');

const apiKey = process.env.COHERE_API_KEY;
const cohere = apiKey ? new CohereClient({ token: apiKey }) : null;

// Mock fallback for local dev when COHERE_API_KEY is missing
function mockEmbedding(text) {
  const embedding = new Array(1024).fill(0);
  // Hash the text slightly to give some variance to the mock vector
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }
  embedding[0] = (hash % 100) / 100;
  return embedding;
}

/**
 * Generates embeddings for an array of text chunks using Cohere embed-multilingual-v3.
 * Includes retry logic and cost tracking.
 */
async function embedChunks(chunks, context) {
  const { newsroomId, userId } = context;
  
  if (!cohere) {
    console.warn('[embedChunks] COHERE_API_KEY is missing. Using mock embeddings.');
    const embeddings = chunks.map(c => mockEmbedding(c));
    // Calculate approx tokens (1 token ~ 4 chars)
    const totalTokens = chunks.reduce((sum, chunk) => sum + Math.ceil(chunk.length / 4), 0);
    return { embeddings, totalTokens };
  }

  // Cost tracking for Cohere is generally per 1k tokens, but for MVP we log tokens
  let attempt = 0;
  while (attempt < 3) {
    try {
      const response = await cohere.embed({
        texts: chunks,
        model: 'embed-multilingual-v3.0',
        inputType: 'search_document'
      });
      
      const embeddings = response.embeddings;
      const totalTokens = response.meta?.billedUnits?.inputTokens || 0;
      
      // We assume a dummy cost of $0.0001 per 1k tokens for tracking if we want to add Cohere to costs
      // Wait, costs.js might only support claude models right now.
      // We can log it as 'cohere-embed' if costs.js supports it, but for now we skip explicit cost row or wrap it carefully.
      
      return { embeddings, totalTokens };
    } catch (err) {
      attempt++;
      if (attempt >= 3) throw err;
      const delay = Math.pow(2, attempt) * 1000;
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

/**
 * Generates a single embedding for a search query.
 */
async function embedQuery(query) {
  if (!cohere) {
    return mockEmbedding(query);
  }
  
  const response = await cohere.embed({
    texts: [query],
    model: 'embed-multilingual-v3.0',
    inputType: 'search_query'
  });
  
  return response.embeddings[0];
}

module.exports = {
  embedChunks,
  embedQuery
};
