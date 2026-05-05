import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';
import { uploadToS3 } from '@/lib/storage/s3';
import { mirrorToDrive } from '@/lib/storage/drive';
import { extractText } from '@/lib/storage/extract';
import { chunkText } from '@/lib/storage/chunk';
import { embedChunks } from '@/lib/storage/embed';

export async function POST(req: Request) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const validTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'text/markdown',
      'application/msword'
    ];
    
    if (!validTypes.includes(file.type) && !file.name.endsWith('.md')) {
       return NextResponse.json({ error: 'Unsupported file type. Use PDF, DOCX, TXT, or MD.' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    
    const mimeType = file.type || 'application/octet-stream';
    const sizeBytes = file.size;
    
    // Generate a unique key for S3
    const s3Key = `${session.newsroomId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;

    // Upload to S3 (Mocked locally)
    const s3Result = await uploadToS3({
      buffer,
      key: s3Key,
      contentType: mimeType
    });

    // Mirror to Drive (Mocked locally)
    const driveResult = await mirrorToDrive({
      buffer,
      filename: file.name,
      parentFolderId: process.env.GOOGLE_DRIVE_UPLOADS_PARENT_FOLDER_ID || 'mock-folder-id'
    });

    // 1. Database insert (status = processing)
    const insertResult = await pool.query(
      `INSERT INTO archive_documents 
       (newsroom_id, user_id, filename, mime_type, size_bytes, s3_key, drive_file_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'processing')
       RETURNING id`,
      [
        session.newsroomId,
        session.userId,
        file.name,
        mimeType,
        sizeBytes,
        s3Result.key,
        driveResult.id
      ]
    );

    const documentId = insertResult.rows[0].id;

    // 2. Extract Text
    const rawText = await extractText(buffer, mimeType);

    // 3. Chunk Text
    const chunks = chunkText(rawText);

    // 4. Embed Chunks
    if (chunks.length > 0) {
      const { embeddings, totalTokens } = await embedChunks(chunks, {
        newsroomId: session.newsroomId,
        userId: session.userId
      });

      // 5. Store in vector DB
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (let i = 0; i < chunks.length; i++) {
          const chunkText = chunks[i];
          const embedding = embeddings[i];
          // convert js array to postgres vector syntax: [1.1, 2.2, ...]
          const vectorLiteral = `[${embedding.join(',')}]`;
          
          await client.query(
            `INSERT INTO archive_chunks 
             (document_id, newsroom_id, chunk_index, text, embedding, token_count)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              documentId,
              session.newsroomId,
              i,
              chunkText,
              vectorLiteral,
              Math.ceil(chunkText.length / 4) // simple token estimate
            ]
          );
        }
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    }

    // 6. Update document status to ready
    await pool.query(
      `UPDATE archive_documents SET status = 'ready' WHERE id = $1`,
      [documentId]
    );

    return NextResponse.json({ 
      ok: true, 
      document: {
        id: documentId,
        filename: file.name,
        status: 'ready',
        chunksProcessed: chunks.length
      }
    });
  } catch (err) {
    console.error('Upload error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
