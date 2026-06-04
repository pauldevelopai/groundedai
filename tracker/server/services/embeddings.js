import { pipeline } from '@xenova/transformers';

let embedder = null;
let loading = false;
let loadPromise = null;

async function getEmbedder() {
  if (embedder) return embedder;
  if (loading) return loadPromise;

  loading = true;
  loadPromise = (async () => {
    console.log('[Embeddings] Loading model Xenova/all-MiniLM-L6-v2...');
    const start = Date.now();
    embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    console.log(`[Embeddings] Model loaded in ${Date.now() - start}ms`);
    loading = false;
    return embedder;
  })();

  return loadPromise;
}

/**
 * Generate a 384-dimension embedding vector for a text string.
 * First call downloads the model (~30MB). Subsequent calls are ~50ms.
 */
export async function generateEmbedding(text) {
  try {
    const model = await getEmbedder();
    // Truncate to ~500 words for the model's context window
    const truncated = text.slice(0, 2000);
    const output = await model(truncated, { pooling: 'mean', normalize: true });
    return Array.from(output.data);
  } catch (err) {
    console.error('[Embeddings] Error generating embedding:', err.message);
    return null;
  }
}

/**
 * Format embedding array as pgvector string: '[0.1,0.2,...]'
 */
export function toPgVector(embedding) {
  if (!embedding) return null;
  return `[${embedding.join(',')}]`;
}

/**
 * Check if embeddings are available (model loaded or loadable)
 */
export async function isAvailable() {
  try {
    await getEmbedder();
    return true;
  } catch {
    return false;
  }
}
