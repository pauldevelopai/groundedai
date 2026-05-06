// POST /api/translation/translate
//
// Body: { source_text, source_language, target_language }
// Runs the translator, persists a translations row, returns translated text +
// glossary hits + the translation row id.

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
const { runTranslation } = require('@/lib/agents/translator');

export async function POST(req: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  let body: { source_text?: string; source_language?: string; target_language?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const sourceText = body.source_text?.trim();
  const sourceLanguage = (body.source_language || 'en').toLowerCase();
  const targetLanguage = body.target_language?.toLowerCase();
  if (!sourceText) return NextResponse.json({ error: 'source_text is required' }, { status: 400 });
  if (!targetLanguage) return NextResponse.json({ error: 'target_language is required' }, { status: 400 });

  try {
    const result = await runTranslation({
      sourceText,
      sourceLanguage,
      targetLanguage,
      context: { newsroomId: session.newsroomId, userId: session.userId, endpoint: '/api/translation/translate' },
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
