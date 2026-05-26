import fs from 'fs';
import path from 'path';
import pool from '../db/pool.js';
import { extractDocumentData } from './claude.js';
import { createKnowledgeEntry } from './knowledge.js';

/**
 * Extract text from a file based on its mime type.
 */
export async function extractText(filePath, mimeType) {
  if (mimeType === 'application/pdf') {
    const pdfParse = (await import('pdf-parse')).default;
    const buffer = fs.readFileSync(filePath);
    const data = await pdfParse(buffer);
    return data.text;
  }

  if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value;
  }

  if (mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || mimeType === 'text/csv') {
    const xlsx = (await import('xlsx')).default;
    const wb = xlsx.readFile(filePath);
    let text = '';
    for (const name of wb.SheetNames) {
      const ws = wb.Sheets[name];
      text += `=== ${name} ===\n`;
      text += xlsx.utils.sheet_to_csv(ws) + '\n\n';
    }
    return text;
  }

  if (mimeType === 'text/plain') {
    return fs.readFileSync(filePath, 'utf-8');
  }

  throw new Error(`Unsupported file type: ${mimeType}`);
}

/**
 * Process an uploaded document: extract text, run AI analysis, create knowledge entries.
 */
export async function processUpload(documentId) {
  // Get the document record
  const { rows: [doc] } = await pool.query('SELECT * FROM uploaded_documents WHERE id = $1', [documentId]);
  if (!doc) throw new Error('Document not found');

  try {
    // Step 1: Extract text
    await pool.query("UPDATE uploaded_documents SET extraction_status = 'extracting' WHERE id = $1", [documentId]);
    const text = await extractText(doc.file_path, doc.mime_type);
    await pool.query(
      "UPDATE uploaded_documents SET extracted_text = $1, extraction_status = 'extracted' WHERE id = $2",
      [text, documentId]
    );

    if (!text || text.trim().length < 20) {
      await pool.query(
        "UPDATE uploaded_documents SET ai_analysis_status = 'complete', ai_summary = 'Document contained insufficient text for analysis.' WHERE id = $1",
        [documentId]
      );
      return;
    }

    // Step 2: AI analysis
    await pool.query("UPDATE uploaded_documents SET ai_analysis_status = 'analysing' WHERE id = $1", [documentId]);

    // Get entity context if linked
    let entityContext = null;
    if (doc.entity_type && doc.entity_id) {
      const tableMap = { organisation: 'organisations', course: 'courses', funding_opportunity: 'funding_opportunities', contact: 'contacts' };
      const table = tableMap[doc.entity_type];
      if (table) {
        const { rows } = await pool.query(`SELECT * FROM ${table} WHERE id = $1`, [doc.entity_id]);
        entityContext = rows[0] || null;
      }
    }

    const aiResult = await extractDocumentData(text, doc.entity_type || 'general', entityContext);

    // Try to parse as JSON
    let extractedData = null;
    let summary = aiResult;
    try {
      extractedData = JSON.parse(aiResult);
      summary = extractedData.summary || Object.entries(extractedData).map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`).join('\n').slice(0, 500);
    } catch {
      // Not JSON — store as plain text summary
      summary = aiResult.slice(0, 500);
    }

    await pool.query(
      "UPDATE uploaded_documents SET ai_summary = $1, ai_extracted_data = $2, ai_analysis_status = 'complete', updated_at = NOW() WHERE id = $3",
      [summary, extractedData ? JSON.stringify(extractedData) : null, documentId]
    );

    // Step 3: Create knowledge entry from extraction
    const sectorName = doc.sector_id ? (await pool.query('SELECT name FROM sectors WHERE id = $1', [doc.sector_id])).rows[0]?.name : null;
    await createKnowledgeEntry({
      category: doc.entity_type === 'course' ? 'course_outcome' : doc.entity_type === 'funding_opportunity' ? 'proposal_outcome' : 'client_insight',
      title: `Extracted from: ${doc.original_name}`,
      content: summary,
      sectorId: doc.sector_id,
      organisationId: doc.entity_type === 'organisation' ? doc.entity_id : null,
      courseId: doc.entity_type === 'course' ? doc.entity_id : null,
      sourceType: 'document_upload',
      sourceId: documentId,
      sourceDescription: `Uploaded document: ${doc.original_name}`,
      confidence: 0.6,
      tags: [doc.entity_type || 'general', 'uploaded'],
    });

    console.log(`Document processed: ${doc.original_name} (${documentId})`);
  } catch (err) {
    console.error(`Document processing failed for ${documentId}:`, err.message);
    await pool.query(
      "UPDATE uploaded_documents SET extraction_status = CASE WHEN extraction_status = 'extracting' THEN 'failed' ELSE extraction_status END, ai_analysis_status = 'failed', extraction_error = $1 WHERE id = $2",
      [err.message, documentId]
    );
  }
}
