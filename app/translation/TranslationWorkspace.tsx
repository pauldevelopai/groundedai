// TranslationWorkspace — three-region client UI for the Translator agent.
// Top: new translation form. Below it: glossary editor + recent translations
// stacked. Built deliberately functional > polished — Slice 7c/7d will add
// phrase confidence and the editor edit-feedback loop.

'use client';

import { useState, FormEvent } from 'react';
import Link from 'next/link';
import ExternalToolLinks from '@/app/components/ExternalToolLinks';
import GlobalNav from '@/app/components/GlobalNav';

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
type Segment = { index: number; source: string; translated: string };
type Proposal = {
  id: string;
  from: string;
  to: string;
  occurrences: number;
  status: 'proposed' | 'accepted' | 'rejected';
  accepted_source_term?: string;
  resolved_at?: string;
};
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
  segments: Segment[];
  proposals: Proposal[];
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
      <GlobalNav currentApp="🌐 Translator" />

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
          <TranslationsSection
            translations={translations}
            languages={languages}
            canEdit={canEdit}
            onUpdate={(updated) =>
              setTranslations((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))
            }
          />
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

function TranslationsSection({
  translations,
  languages,
  canEdit,
  onUpdate,
}: {
  translations: TranslationRow[];
  languages: Record<string, string>;
  canEdit: boolean;
  onUpdate: (t: TranslationRow) => void;
}) {
  return (
    <section style={{ background: 'white', border: '1px solid #e5e5e5', borderRadius: 8, padding: 18 }}>
      <h2 style={{ fontSize: 16, margin: '0 0 12px' }}>Recent translations ({translations.length})</h2>
      {translations.length === 0 ? (
        <p style={{ fontSize: 13, color: '#888', margin: 0 }}>Run a translation above to see it here. Each translation is persisted with source, model output, model id, segments, and any glossary terms that appeared in the input.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {translations.map((t) => (
            <TranslationCard key={t.id} t={t} languages={languages} canEdit={canEdit} onUpdate={onUpdate} />
          ))}
        </ul>
      )}
    </section>
  );
}

function TranslationCard({
  t,
  languages,
  canEdit,
  onUpdate,
}: {
  t: TranslationRow;
  languages: Record<string, string>;
  canEdit: boolean;
  onUpdate: (t: TranslationRow) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editedDraft, setEditedDraft] = useState(t.edited_text || t.translated_text || '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const proposals = Array.isArray(t.proposals) ? t.proposals : [];
  const openProposals = proposals.filter((p) => p.status === 'proposed');

  async function onSave() {
    if (!editedDraft.trim()) return;
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch(`/api/translation/translations/${t.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ edited_text: editedDraft.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error || 'Save failed');
        return;
      }
      onUpdate(data.translation);
      setEditing(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Network error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <li style={{ padding: '12px 0', borderTop: '1px solid #f0f0f0' }}>
      <div style={{ fontSize: 12, color: '#666', marginBottom: 6, display: 'flex', justifyContent: 'space-between' }}>
        <span>
          <strong>{languages[t.source_language] || t.source_language}</strong> → <strong>{languages[t.target_language] || t.target_language}</strong>
          <span style={{ marginLeft: 8, padding: '1px 8px', background: statusBg(t.status), color: statusFg(t.status), borderRadius: 10, fontSize: 11 }}>
            {t.status}
          </span>
        </span>
        <span style={{ fontSize: 11 }}>
          {t.duration_ms ? `${(t.duration_ms / 1000).toFixed(1)}s` : ''} {t.created_at ? `· ${new Date(t.created_at).toLocaleString()}` : ''}
        </span>
      </div>

      {/* Side-by-side segment view if available, otherwise the legacy flat source / translated layout */}
      {Array.isArray(t.segments) && t.segments.length > 0 ? (
        <table style={{ width: '100%', tableLayout: 'fixed', fontSize: 12, borderCollapse: 'collapse', marginBottom: 8 }}>
          <thead>
            <tr style={{ color: '#888', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              <th style={{ textAlign: 'left', width: '50%', padding: '4px 6px' }}>{languages[t.source_language] || t.source_language}</th>
              <th style={{ textAlign: 'left', width: '50%', padding: '4px 6px' }}>{languages[t.target_language] || t.target_language}</th>
            </tr>
          </thead>
          <tbody>
            {t.segments.map((s) => (
              <tr key={s.index} style={{ verticalAlign: 'top' }}>
                <td style={{ padding: '4px 6px', borderTop: '1px dashed #eee' }}>{s.source}</td>
                <td style={{ padding: '4px 6px', borderTop: '1px dashed #eee', background: '#f8fafc' }}>{s.translated}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <>
          <div style={{ fontSize: 13, marginBottom: 6 }}>
            <em style={{ color: '#666' }}>Source:</em> <span>{truncate(t.source_text, 220)}</span>
          </div>
          {t.translated_text && (
            <div style={{ fontSize: 13, padding: 8, background: '#f8fafc', borderLeft: '3px solid #0066cc', borderRadius: 3, marginBottom: 6 }}>
              <em style={{ color: '#666' }}>Translation:</em> <span style={{ whiteSpace: 'pre-wrap' }}>{t.translated_text}</span>
            </div>
          )}
        </>
      )}

      {t.error && <div style={{ fontSize: 12, color: '#b00', marginBottom: 4 }}>Error: {t.error}</div>}

      {Array.isArray(t.glossary_terms_seen) && t.glossary_terms_seen.length > 0 && (
        <div style={{ fontSize: 11, color: '#555', marginBottom: 6 }}>
          📖 Glossary terms in source:&nbsp;
          {t.glossary_terms_seen.map((g) => (
            <span key={g.id} style={{ display: 'inline-block', marginRight: 6, padding: '1px 6px', background: '#fff8e6', borderRadius: 4 }}>
              <strong>{g.term}</strong> → {g.translation} ({g.occurrences}×)
            </span>
          ))}
        </div>
      )}

      {t.edited_text && !editing && (
        <div style={{ fontSize: 13, padding: 8, background: '#e7f6e7', borderLeft: '3px solid #1a5d1a', borderRadius: 3, marginBottom: 6 }}>
          <em style={{ color: '#1a5d1a' }}>Editor's version:</em>{' '}
          <span style={{ whiteSpace: 'pre-wrap' }}>{t.edited_text}</span>
        </div>
      )}

      {/* Edit affordance */}
      {canEdit && (
        editing ? (
          <div style={{ marginTop: 8 }}>
            <textarea
              value={editedDraft}
              onChange={(e) => setEditedDraft(e.target.value)}
              rows={4}
              style={{ width: '100%', fontSize: 13, padding: 8, border: '1px solid #ccc', borderRadius: 4, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }}
            />
            {err && <p style={{ color: '#b00', fontSize: 12, margin: '4px 0' }}>{err}</p>}
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <button
                onClick={onSave}
                disabled={saving || !editedDraft.trim()}
                style={{ padding: '6px 12px', background: '#111', color: '#fff', border: 'none', borderRadius: 4, fontSize: 12, cursor: saving ? 'wait' : 'pointer' }}
              >
                {saving ? 'Saving…' : 'Save edit'}
              </button>
              <button
                onClick={() => { setEditing(false); setEditedDraft(t.edited_text || t.translated_text || ''); }}
                disabled={saving}
                style={{ padding: '6px 12px', background: 'transparent', color: '#666', border: '1px solid #ccc', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}
              >
                Cancel
              </button>
            </div>
            <p style={{ fontSize: 11, color: '#666', marginTop: 6 }}>
              On save, Grounded diffs your edit against the model output and proposes glossary entries for any consistent substitutions you made.
            </p>
          </div>
        ) : (
          t.translated_text && !t.error ? (
            <button
              onClick={() => setEditing(true)}
              style={{ padding: '4px 10px', background: 'transparent', color: '#0066cc', border: '1px solid #0066cc', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}
            >
              {t.edited_text ? 'Refine edit' : 'Edit translation'}
            </button>
          ) : null
        )
      )}

      {openProposals.length > 0 && (
        <ProposalsPanel
          translationId={t.id}
          proposals={openProposals}
          onResolved={(proposalId, resolved) =>
            onUpdate({
              ...t,
              proposals: proposals.map((p) => (p.id === proposalId ? resolved : p)),
            })
          }
        />
      )}

      {t.model_id && <div style={{ fontSize: 10, color: '#aaa', marginTop: 4 }}>{t.model_id}</div>}
    </li>
  );
}

function ProposalsPanel({
  translationId,
  proposals,
  onResolved,
}: {
  translationId: string;
  proposals: Proposal[];
  onResolved: (proposalId: string, resolved: Proposal) => void;
}) {
  return (
    <div style={{ marginTop: 10, padding: 10, background: '#fff8e6', border: '1px solid #f5d77a', borderRadius: 6 }}>
      <h4 style={{ fontSize: 12, textTransform: 'uppercase', color: '#8a6d00', margin: '0 0 6px', letterSpacing: 0.5 }}>
        Glossary proposals from your edit ({proposals.length})
      </h4>
      <p style={{ fontSize: 11, color: '#6b5800', margin: '0 0 8px' }}>
        Grounded noticed you changed these phrases. Type the source-language term that should always translate this way, and we'll add a glossary entry so future translations honour it.
      </p>
      {proposals.map((p) => (
        <ProposalRow
          key={p.id}
          translationId={translationId}
          proposal={p}
          onResolved={(resolved) => onResolved(p.id, resolved)}
        />
      ))}
    </div>
  );
}

function ProposalRow({
  translationId,
  proposal,
  onResolved,
}: {
  translationId: string;
  proposal: Proposal;
  onResolved: (resolved: Proposal) => void;
}) {
  const [sourceTerm, setSourceTerm] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function call(action: 'accept' | 'reject') {
    if (action === 'accept' && !sourceTerm.trim()) {
      setErr('Type the source-language term that should always translate to "' + proposal.to + '".');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/translation/translations/${translationId}/proposals/${proposal.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, source_term: sourceTerm.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error || 'Action failed');
        return;
      }
      onResolved(data.proposal as Proposal);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Network error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ background: 'white', border: '1px solid #f0d784', borderRadius: 4, padding: 8, marginBottom: 6 }}>
      <div style={{ fontSize: 12, marginBottom: 6 }}>
        Model said <code style={{ background: '#fef3d7', padding: '0 4px', borderRadius: 2 }}>{proposal.from}</code>
        {' → '}you wrote <code style={{ background: '#e7f6e7', padding: '0 4px', borderRadius: 2 }}>{proposal.to}</code>
        {proposal.occurrences > 1 && <span style={{ marginLeft: 6, color: '#666' }}>({proposal.occurrences}×)</span>}
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <input
          type="text"
          value={sourceTerm}
          onChange={(e) => setSourceTerm(e.target.value)}
          placeholder="Source term (e.g. newsroom)"
          style={{ flex: 1, fontSize: 12, padding: 6, border: '1px solid #ccc', borderRadius: 3 }}
        />
        <button
          onClick={() => call('accept')}
          disabled={busy}
          style={{ padding: '6px 10px', background: '#1a5d1a', color: '#fff', border: 'none', borderRadius: 3, fontSize: 12, cursor: 'pointer' }}
        >
          {busy ? '…' : 'Add to glossary'}
        </button>
        <button
          onClick={() => call('reject')}
          disabled={busy}
          style={{ padding: '6px 10px', background: 'transparent', color: '#666', border: '1px solid #ccc', borderRadius: 3, fontSize: 12, cursor: 'pointer' }}
        >
          Dismiss
        </button>
      </div>
      {err && <p style={{ color: '#b00', fontSize: 11, margin: '4px 0 0' }}>{err}</p>}
    </div>
  );
}

function statusBg(s: TranslationRow['status']) {
  if (s === 'failed') return '#ffe6e6';
  if (s === 'translated') return '#e7f6e7';
  if (s === 'edited') return '#e0f0ff';
  return '#eee';
}
function statusFg(s: TranslationRow['status']) {
  if (s === 'failed') return '#a02020';
  if (s === 'translated') return '#1a5d1a';
  if (s === 'edited') return '#0044aa';
  return '#555';
}

function truncate(s: string, n: number) {
  if (!s) return '';
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + '…';
}
