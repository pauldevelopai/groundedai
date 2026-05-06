// TranslationWorkspace — three-region client UI for the Translator agent.
// Top: new translation form. Below it: glossary editor + recent translations
// stacked. Built deliberately functional > polished — Slice 7c/7d will add
// phrase confidence and the editor edit-feedback loop.

'use client';

import { useState, FormEvent } from 'react';
import Link from 'next/link';

type Pair = { source: string; target: string; source_label: string; target_label: string; model: string };
type GlossaryEntry = {
  id: string;
  term: string;
  translation: string;
  source_language: string;
  target_language: string;
  notes: string | null;
  source: string;
  use_count: number;
  created_at: string;
  updated_at: string;
};
type GlossaryHit = { id: string; term: string; translation: string; occurrences: number };
type TranslationRow = {
  id: string;
  source_language: string;
  target_language: string;
  source_text: string;
  translated_text: string | null;
  edited_text: string | null;
  status: 'pending' | 'translated' | 'edited' | 'published' | 'failed';
  model_id: string | null;
  glossary_terms_seen: GlossaryHit[];
  duration_ms: number | null;
  error: string | null;
  created_at: string;
};

export default function TranslationWorkspace({
  pairs,
  languages,
  initialGlossary,
  initialTranslations,
  role,
}: {
  pairs: Pair[];
  languages: Record<string, string>;
  initialGlossary: GlossaryEntry[];
  initialTranslations: TranslationRow[];
  role: 'user' | 'builder' | 'admin';
}) {
  const canEdit = role === 'builder' || role === 'admin';
  const [glossary, setGlossary] = useState(initialGlossary);
  const [translations, setTranslations] = useState(initialTranslations);

  const defaultPair = pairs[0];
  const [source, setSource] = useState(defaultPair?.source || 'en');
  const [target, setTarget] = useState(defaultPair?.target || 'zu');
  const [sourceText, setSourceText] = useState('');
  const [translating, setTranslating] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function onTranslate(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    setTranslating(true);
    try {
      const res = await fetch('/api/translation/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_text: sourceText.trim(), source_language: source, target_language: target }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSubmitError(data.error || 'Translation failed');
        return;
      }
      // Reload the translations list so the new row appears at the top.
      const list = await fetch('/api/translation/translations').then((r) => r.json());
      setTranslations(list.translations || []);
      setSourceText('');
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setTranslating(false);
    }
  }

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', minHeight: '100vh', background: '#f7f8fa' }}>
      <header
        style={{
          background: 'white',
          borderBottom: '1px solid #e5e5e5',
          padding: '14px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <Link href="/" style={{ fontSize: 16, fontWeight: 600, color: 'inherit', textDecoration: 'none' }}>Anchor</Link>
        <span style={{ color: '#999' }}>/</span>
        <span style={{ fontSize: 14 }}>🌐 Translator</span>
        <span style={{ flex: 1 }} />
        <Link href="/run" style={{ fontSize: 13, color: '#0066cc' }}>Run →</Link>
        <Link href="/research" style={{ fontSize: 13, color: '#0066cc', marginLeft: 12 }}>Research →</Link>
        {(role === 'builder' || role === 'admin') && (
          <Link href="/builder" style={{ fontSize: 13, color: '#0066cc', marginLeft: 12 }}>Builder →</Link>
        )}
        <Link href="/guide" style={{ fontSize: 13, color: '#0066cc', marginLeft: 12 }}>Help →</Link>
      </header>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 20px' }}>
        <h1 style={{ margin: 0, fontSize: 24 }}>Translator</h1>
        <p style={{ color: '#666', fontSize: 14, marginTop: 4 }}>
          OSS open-source translation that respects your newsroom's house terminology. Slice 7a covers en↔af, en↔zu, en↔xh; more language pairs land with Slice 7b.
        </p>

        {/* New translation form */}
        <section style={{ background: 'white', border: '1px solid #e5e5e5', borderRadius: 8, padding: 18, marginTop: 16 }}>
          <h2 style={{ fontSize: 16, margin: '0 0 12px' }}>New translation</h2>
          <form onSubmit={onTranslate} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <label style={{ fontSize: 13, display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
                <span style={{ color: '#444' }}>From</span>
                <select value={source} onChange={(e) => setSource(e.target.value)} style={{ padding: 8, fontSize: 14, border: '1px solid #ccc', borderRadius: 4, background: 'white' }}>
                  {Array.from(new Set(pairs.map((p) => p.source))).map((code) => (
                    <option key={code} value={code}>{languages[code] || code}</option>
                  ))}
                </select>
              </label>
              <span style={{ color: '#999', fontSize: 18, marginTop: 18 }}>→</span>
              <label style={{ fontSize: 13, display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
                <span style={{ color: '#444' }}>To</span>
                <select value={target} onChange={(e) => setTarget(e.target.value)} style={{ padding: 8, fontSize: 14, border: '1px solid #ccc', borderRadius: 4, background: 'white' }}>
                  {Array.from(new Set(pairs.filter((p) => p.source === source).map((p) => p.target))).map((code) => (
                    <option key={code} value={code}>{languages[code] || code}</option>
                  ))}
                </select>
              </label>
            </div>
            <textarea
              value={sourceText}
              onChange={(e) => setSourceText(e.target.value)}
              required
              rows={5}
              placeholder="Paste the article, headline, or copy you want translated."
              style={{ width: '100%', fontSize: 14, padding: 10, border: '1px solid #ccc', borderRadius: 4, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }}
            />
            {submitError && <p style={{ color: '#b00', fontSize: 13, margin: 0 }}>{submitError}</p>}
            <div>
              <button
                type="submit"
                disabled={translating || !sourceText.trim() || source === target}
                style={{ padding: '10px 18px', background: '#0066cc', color: '#fff', border: 'none', borderRadius: 6, fontSize: 14, cursor: translating ? 'wait' : 'pointer', opacity: translating || !sourceText.trim() || source === target ? 0.5 : 1 }}
              >
                {translating ? 'Translating — first run downloads the model (1–2 min)…' : 'Translate'}
              </button>
              <span style={{ color: '#888', fontSize: 12, marginLeft: 12 }}>
                Local in-process via Helsinki-NLP opus-mt. Free, OSS, no external API.
              </span>
            </div>
          </form>
        </section>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginTop: 24 }}>
          <GlossarySection
            entries={glossary}
            languages={languages}
            pairs={pairs}
            canEdit={canEdit}
            onChange={setGlossary}
          />
          <TranslationsSection translations={translations} languages={languages} />
        </div>
      </div>
    </main>
  );
}

function GlossarySection({
  entries,
  languages,
  pairs,
  canEdit,
  onChange,
}: {
  entries: GlossaryEntry[];
  languages: Record<string, string>;
  pairs: Pair[];
  canEdit: boolean;
  onChange: (next: GlossaryEntry[]) => void;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [term, setTerm] = useState('');
  const [translation, setTranslation] = useState('');
  const [source, setSource] = useState(pairs[0]?.source || 'en');
  const [target, setTarget] = useState(pairs[0]?.target || 'zu');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/translation/glossary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          term: term.trim(),
          translation: translation.trim(),
          source_language: source,
          target_language: target,
          notes: notes.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not add entry');
        return;
      }
      onChange([...entries, data.entry].sort((a, b) =>
        a.source_language.localeCompare(b.source_language) ||
        a.target_language.localeCompare(b.target_language) ||
        a.term.toLowerCase().localeCompare(b.term.toLowerCase())
      ));
      setTerm('');
      setTranslation('');
      setNotes('');
      setShowAdd(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setSubmitting(false);
    }
  }

  async function onDelete(entryId: string, label: string) {
    if (!window.confirm(`Remove "${label}" from the glossary?`)) return;
    const res = await fetch(`/api/translation/glossary/${entryId}`, { method: 'DELETE' });
    if (res.ok) {
      onChange(entries.filter((e) => e.id !== entryId));
    } else {
      const d = await res.json().catch(() => ({}));
      setError(d.error || 'Delete failed');
    }
  }

  // Group by pair for readability.
  const grouped = new Map<string, GlossaryEntry[]>();
  for (const e of entries) {
    const k = `${e.source_language}-${e.target_language}`;
    if (!grouped.has(k)) grouped.set(k, []);
    grouped.get(k)!.push(e);
  }

  return (
    <section style={{ background: 'white', border: '1px solid #e5e5e5', borderRadius: 8, padding: 18 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
        <h2 style={{ fontSize: 16, margin: 0 }}>Glossary ({entries.length})</h2>
        {canEdit && (
          <button
            onClick={() => setShowAdd((s) => !s)}
            style={{ padding: '6px 12px', background: showAdd ? 'transparent' : '#111', color: showAdd ? '#666' : '#fff', border: showAdd ? '1px solid #ccc' : 'none', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}
          >
            {showAdd ? 'Cancel' : '+ Add term'}
          </button>
        )}
      </div>
      <p style={{ fontSize: 12, color: '#666', margin: '0 0 12px' }}>
        Approved terminology, place names, and idiom for your newsroom. The Translator flags when a glossary term appears in your source text so you can verify the translation honoured it. Slice 7d will close the loop — editor corrections feed back into the glossary automatically.
      </p>

      {showAdd && canEdit && (
        <form onSubmit={onAdd} style={{ background: '#fafafa', border: '1px solid #eee', borderRadius: 6, padding: 12, marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <select value={source} onChange={(e) => setSource(e.target.value)} style={{ padding: 6, fontSize: 12, border: '1px solid #ccc', borderRadius: 3, background: 'white', flex: 1 }}>
              {Array.from(new Set(pairs.map((p) => p.source))).map((c) => <option key={c} value={c}>{languages[c] || c}</option>)}
            </select>
            <span style={{ color: '#999', alignSelf: 'center' }}>→</span>
            <select value={target} onChange={(e) => setTarget(e.target.value)} style={{ padding: 6, fontSize: 12, border: '1px solid #ccc', borderRadius: 3, background: 'white', flex: 1 }}>
              {Array.from(new Set(pairs.filter((p) => p.source === source).map((p) => p.target))).map((c) => <option key={c} value={c}>{languages[c] || c}</option>)}
            </select>
          </div>
          <input type="text" placeholder="Source term (e.g. ZNHA)" value={term} onChange={(e) => setTerm(e.target.value)} required style={{ padding: 6, fontSize: 13, border: '1px solid #ccc', borderRadius: 3 }} />
          <input type="text" placeholder="Approved translation" value={translation} onChange={(e) => setTranslation(e.target.value)} required style={{ padding: 6, fontSize: 13, border: '1px solid #ccc', borderRadius: 3 }} />
          <input type="text" placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} style={{ padding: 6, fontSize: 12, border: '1px solid #ccc', borderRadius: 3 }} />
          {error && <p style={{ color: '#b00', fontSize: 12, margin: 0 }}>{error}</p>}
          <button type="submit" disabled={submitting} style={{ padding: '6px 10px', background: '#111', color: '#fff', border: 'none', borderRadius: 4, fontSize: 12, cursor: 'pointer', alignSelf: 'flex-start' }}>
            {submitting ? 'Adding…' : 'Add'}
          </button>
        </form>
      )}

      {entries.length === 0 ? (
        <p style={{ fontSize: 13, color: '#888' }}>No glossary entries yet. Add the proper names, place names, organisations, and idiom your newsroom always wants translated the same way.</p>
      ) : (
        [...grouped.entries()].map(([pair, items]) => {
          const [s, t] = pair.split('-');
          return (
            <div key={pair} style={{ marginBottom: 14 }}>
              <h3 style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: '#777', margin: '0 0 6px' }}>
                {languages[s] || s} → {languages[t] || t} ({items.length})
              </h3>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {items.map((e) => (
                  <li key={e.id} style={{ padding: '6px 0', borderTop: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, fontSize: 13 }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div><strong>{e.term}</strong> → <span style={{ color: '#0044aa' }}>{e.translation}</span></div>
                      {e.notes && <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>{e.notes}</div>}
                      <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>
                        used {e.use_count}× · {e.source === 'edit_feedback' ? 'auto-learned from editor edit' : 'manual'}
                      </div>
                    </div>
                    {canEdit && (
                      <button onClick={() => onDelete(e.id, e.term)} style={{ background: 'transparent', border: 'none', color: '#b00', fontSize: 11, cursor: 'pointer' }}>
                        remove
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          );
        })
      )}
    </section>
  );
}

function TranslationsSection({ translations, languages }: { translations: TranslationRow[]; languages: Record<string, string> }) {
  return (
    <section style={{ background: 'white', border: '1px solid #e5e5e5', borderRadius: 8, padding: 18 }}>
      <h2 style={{ fontSize: 16, margin: '0 0 12px' }}>Recent translations ({translations.length})</h2>
      {translations.length === 0 ? (
        <p style={{ fontSize: 13, color: '#888', margin: 0 }}>Run a translation above to see it here. Each translation is persisted with the source, the model output, the model used, and any glossary terms that appeared in the input.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {translations.map((t) => (
            <li key={t.id} style={{ padding: '10px 0', borderTop: '1px solid #f0f0f0' }}>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 6, display: 'flex', justifyContent: 'space-between' }}>
                <span>
                  <strong>{languages[t.source_language] || t.source_language}</strong> → <strong>{languages[t.target_language] || t.target_language}</strong>
                  <span style={{ marginLeft: 8, padding: '1px 8px', background: t.status === 'failed' ? '#ffe6e6' : t.status === 'translated' ? '#e7f6e7' : '#eee', color: t.status === 'failed' ? '#a02020' : t.status === 'translated' ? '#1a5d1a' : '#555', borderRadius: 10, fontSize: 11 }}>
                    {t.status}
                  </span>
                </span>
                <span style={{ fontSize: 11 }}>
                  {t.duration_ms ? `${(t.duration_ms / 1000).toFixed(1)}s` : ''} {t.created_at ? `· ${new Date(t.created_at).toLocaleString()}` : ''}
                </span>
              </div>
              <div style={{ fontSize: 13, marginBottom: 6 }}>
                <em style={{ color: '#666' }}>Source:</em> <span>{truncate(t.source_text, 220)}</span>
              </div>
              {t.translated_text && (
                <div style={{ fontSize: 13, padding: 8, background: '#f8fafc', borderLeft: '3px solid #0066cc', borderRadius: 3, marginBottom: 6 }}>
                  <em style={{ color: '#666' }}>Translation:</em> <span style={{ whiteSpace: 'pre-wrap' }}>{t.translated_text}</span>
                </div>
              )}
              {t.error && (
                <div style={{ fontSize: 12, color: '#b00', marginBottom: 4 }}>Error: {t.error}</div>
              )}
              {Array.isArray(t.glossary_terms_seen) && t.glossary_terms_seen.length > 0 && (
                <div style={{ fontSize: 11, color: '#555' }}>
                  📖 Glossary terms in source:&nbsp;
                  {t.glossary_terms_seen.map((g) => (
                    <span key={g.id} style={{ display: 'inline-block', marginRight: 6, padding: '1px 6px', background: '#fff8e6', borderRadius: 4 }}>
                      <strong>{g.term}</strong> → {g.translation} ({g.occurrences}×)
                    </span>
                  ))}
                </div>
              )}
              {t.model_id && <div style={{ fontSize: 10, color: '#aaa', marginTop: 4 }}>{t.model_id}</div>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function truncate(s: string, n: number) {
  if (!s) return '';
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + '…';
}
