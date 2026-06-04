// Local, fully-free embeddings via BAAI/bge-m3 (Xenova ONNX build) running
// in-process through @huggingface/transformers (Transformers.js). Replaces
// Cohere embed-multilingual-v3. Output is 1024-dim normalized vectors, which
// matches the existing pgvector schema (VECTOR(1024)) — no migration needed.

const MODEL_ID = 'Xenova/bge-m3';

// @huggingface/transformers v3 is ESM-only; load via dynamic import inside an
// async initializer so this CJS module stays consumable from the rest of the app.
let pipelinePromise = null;

async function getPipeline() {
  // Lean deployment guard: GROUNDED_LEAN=1 disables the local embedding model so
  // it never downloads its ~1.3 GB of weights (used by the Archivist + archive
  // search). Callers (archive search, etc.) must handle this rejection gracefully.
  if (process.env.GROUNDED_LEAN === '1') {
    const err = new Error('Local embeddings are disabled on this lean deployment (GROUNDED_LEAN=1). Archive/semantic search is part of the "coming soon" Archivist.');
    err.code = 'LOCAL_MODELS_DISABLED';
    throw err;
  }
  if (pipelinePromise) return pipelinePromise;

  pipelinePromise = (async () => {
    const { pipeline, env } = await import('@huggingface/transformers');

    // Allow remote model download on first run, then operate offline from cache.
    env.allowRemoteModels = true;
    env.allowLocalModels = true;

    // Load the feature-extraction pipeline. First call downloads ~1.3 GB of
    // quantized ONNX weights into the HF cache (~/.cache/huggingface). Cached
    // thereafter. Cold start is on the order of 10–20s; warm is sub-second.
    return pipeline('feature-extraction', MODEL_ID);
  })();

  return pipelinePromise;
}

function tensorToVectors(tensor) {
  // Tensor shape is [batch, dim]. Convert each row to a plain Array<number>
  // so it serializes cleanly into the pgvector literal.
  const data = Array.from(tensor.data);
  const [batch, dim] = tensor.dims;
  const vectors = [];
  for (let i = 0; i < batch; i++) {
    vectors.push(data.slice(i * dim, (i + 1) * dim));
  }
  return vectors;
}

/**
 * Embeds an array of text chunks. Uses CLS pooling + L2 normalization, which
 * is what BGE-M3 expects for cosine-similarity retrieval.
 *
 * @param {string[]} chunks
 * @param {{ newsroomId: string, userId: string }} _context  Kept for API parity
 *   with the previous Cohere implementation; embeddings are now free, so no
 *   per-call cost row is written.
 * @returns {Promise<{ embeddings: number[][], totalTokens: number }>}
 */
async function embedChunks(chunks, _context) {
  const extractor = await getPipeline();
  const tensor = await extractor(chunks, { pooling: 'cls', normalize: true });
  const embeddings = tensorToVectors(tensor);

  // Approximate token count for audit/observability only (no billing).
  const totalTokens = chunks.reduce((sum, c) => sum + Math.ceil(c.length / 4), 0);
  return { embeddings, totalTokens };
}

/**
 * Embeds a single search query. BGE-M3 uses the same encoding for queries and
 * documents — no separate prefix needed.
 *
 * @param {string} query
 * @returns {Promise<number[]>}
 */
async function embedQuery(query) {
  const extractor = await getPipeline();
  const tensor = await extractor([query], { pooling: 'cls', normalize: true });
  return tensorToVectors(tensor)[0];
}

module.exports = {
  embedChunks,
  embedQuery
};
