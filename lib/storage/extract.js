const pdf = require('pdf-parse');
const mammoth = require('mammoth');

/**
 * Extracts raw text from an uploaded file buffer based on its mime type.
 * Supported: PDF, DOCX, TXT, MD
 */
async function extractText(buffer, mimeType) {
  if (mimeType === 'application/pdf') {
    const data = await pdf(buffer);
    return data.text;
  }
  
  if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || mimeType === 'application/msword') {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }
  
  if (mimeType === 'text/plain' || mimeType === 'text/markdown' || mimeType.startsWith('text/')) {
    return buffer.toString('utf-8');
  }
  
  throw new Error(`Unsupported mime type for extraction: ${mimeType}`);
}

module.exports = {
  extractText
};
