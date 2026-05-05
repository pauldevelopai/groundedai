/**
 * Basic paragraph-aware text chunker.
 * Targets ~500 words per chunk with ~50 words overlap.
 */
function chunkText(text, maxWords = 500, overlapWords = 50) {
  // Normalize whitespace but keep paragraphs
  const paragraphs = text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  
  const chunks = [];
  let currentChunkWords = [];
  
  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/);
    
    // If a single paragraph is larger than maxWords, we just let it be slightly larger
    // or we could split it. For simplicity, we just add it and then flush.
    if (currentChunkWords.length + words.length > maxWords && currentChunkWords.length > 0) {
      chunks.push(currentChunkWords.join(' '));
      // Start new chunk with overlap
      const overlap = currentChunkWords.slice(-overlapWords);
      currentChunkWords = [...overlap];
    }
    
    currentChunkWords.push(...words);
  }
  
  if (currentChunkWords.length > 0) {
    chunks.push(currentChunkWords.join(' '));
  }
  
  return chunks;
}

module.exports = {
  chunkText
};
