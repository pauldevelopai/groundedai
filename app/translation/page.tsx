// /translation — Translator workspace. Three regions:
//   1. New translation form (source text, source/target language, run)
//   2. Glossary editor (per-newsroom approved terms)
//   3. Recent translations list (status + glossary hits + the output)
//
// Server pre-loads the catalog of supported pairs + the newsroom glossary +
// the 50 most recent translations; the client component handles submit/edit/
// delete via fetches.

import { redirect } from 'next/navigation';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';
import TranslationWorkspace from './TranslationWorkspace';
const { supportedPairs, SUPPORTED_LANGUAGES } = require('@/lib/translation/engine');

export default async function TranslationPage() {
  const session = await getCurrentSession();
  if (!session) redirect('/login?next=/translation');

  const [glossaryRes, translationsRes] = await Promise.all([
    pool.query(
      `SELECT id, term, translation, source_language, target_language, notes, source, use_count,
              created_at, updated_at
         FROM translation_glossary
        WHERE newsroom_id = $1
        ORDER BY source_language, target_language, lower(term)`,
      [session.newsroomId]
    ),
    pool.query(
      `SELECT id, source_language, target_language, source_text, translated_text, edited_text,
              status, model_id, glossary_terms_seen, segments, proposals, duration_ms, error, created_at
         FROM translations
        WHERE newsroom_id = $1
        ORDER BY created_at DESC
        LIMIT 50`,
      [session.newsroomId]
    ),
  ]);

  return (
    <TranslationWorkspace
      pairs={supportedPairs()}
      languages={SUPPORTED_LANGUAGES}
      initialGlossary={glossaryRes.rows}
      initialTranslations={translationsRes.rows}
      role={session.role}
    />
  );
}
