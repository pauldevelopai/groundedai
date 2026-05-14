// NewsroomProfileForm — sectioned editor for the per-newsroom profile.
// Most fields are simple text; chip lists for arrays; small JSON tables
// for impact stories and awards. Saves via PATCH /api/newsroom/profile.

'use client';

import { useState, FormEvent } from 'react';
import Link from 'next/link';
import ExternalToolLinks from '@/app/components/ExternalToolLinks';
import GlobalNav from '@/app/components/GlobalNav';
import TopicTagsEditor from './TopicTagsEditor';
import TrustedSourcesEditor from './TrustedSourcesEditor';
import CrawlRulesEditor from './CrawlRulesEditor';
import StyleFingerprintInspector from './StyleFingerprintInspector';

type ImpactStory = { headline?: string; year?: string | number; outcome?: string; source_url?: string };
type Award = { name?: string; year?: string | number; body?: string };
type Profile = {
  id: string;
  newsroom_id: string;
  tagline: string | null;
  mission: string | null;
  strengths: string[];
  beats: string[];
  geography: string[];
  audience_summary: string | null;
  audience_size_monthly: number | null;
  audience_demographics: Record<string, unknown>;
  primary_platforms: string[];
  primary_languages: string[];
  voice: string | null;
  style_notes: string | null;
  ethics_policy: string | null;
  impact_stories: ImpactStory[];
  awards: Award[];
  additional_notes: string | null;
};

type Newsroom = { id: string; name: string; country: string | null };

const PLATFORMS = ['web', 'whatsapp', 'newsletter', 'fb', 'x', 'instagram', 'youtube', 'radio', 'podcast'];
const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'af', label: 'Afrikaans' },
  { code: 'zu', label: 'isiZulu' },
  { code: 'xh', label: 'isiXhosa' },
  { code: 'st', label: 'Sesotho' },
  { code: 'tn', label: 'Setswana' },
  { code: 'ss', label: 'Siswati' },
  { code: 'nr', label: 'isiNdebele' },
  { code: 'nso', label: 'Sepedi' },
  { code: 'sn', label: 'Shona' },
  { code: 'nd', label: 'Ndebele (ZW)' },
  { code: 'bem', label: 'Bemba' },
  { code: 'ny', label: 'Nyanja' },
  { code: 'sw', label: 'Swahili' },
];

export default function NewsroomProfileForm({
  newsroom,
  initialProfile,
  canEdit,
  role,
}: {
  newsroom: Newsroom;
  initialProfile: Profile | null;
  canEdit: boolean;
  role: 'user' | 'builder' | 'admin';
}) {
  // Build a working object — defaults when no profile exists yet.
  const startingState = initialProfile || {
    id: '',
    newsroom_id: newsroom.id,
    tagline: '',
    mission: '',
    strengths: [],
    beats: [],
    geography: [],
    audience_summary: '',
    audience_size_monthly: null,
    audience_demographics: {},
    primary_platforms: [],
    primary_languages: [],
    voice: '',
    style_notes: '',
    ethics_policy: '',
    impact_stories: [],
    awards: [],
    additional_notes: '',
  };
  const [state, setState] = useState(startingState as Profile);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof Profile>(key: K, value: Profile[K]) {
    setState((s) => ({ ...s, [key]: value }));
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const res = await fetch('/api/newsroom/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tagline: state.tagline,
          mission: state.mission,
          strengths: state.strengths,
          beats: state.beats,
          geography: state.geography,
          audience_summary: state.audience_summary,
          audience_size_monthly: state.audience_size_monthly,
          audience_demographics: state.audience_demographics,
          primary_platforms: state.primary_platforms,
          primary_languages: state.primary_languages,
          voice: state.voice,
          style_notes: state.style_notes,
          ethics_policy: state.ethics_policy,
          impact_stories: state.impact_stories,
          awards: state.awards,
          additional_notes: state.additional_notes,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Save failed');
        return;
      }
      setState(data.profile);
      setSavedAt(new Date().toLocaleTimeString());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', minHeight: '100vh', background: '#f7f8fa' }}>
      <GlobalNav currentApp="📋 Newsroom profile" />

      <form onSubmit={onSave} style={{ maxWidth: 880, margin: '0 auto', padding: '24px 20px' }}>
        <h1 style={{ margin: '0 0 4px', fontSize: 24 }}>{newsroom.name}</h1>
        <p style={{ color: '#666', fontSize: 14, marginTop: 0 }}>
          The newsroom profile is the load-bearing context the agents read before they work for you. Fundraiser uses it to fill grant briefs and donor reports. Audience Analytics Manager uses it to ground analytics consultations in YOUR readers. Audio &amp; Video Producer and Copywriter use it to shape the voice. Keep it current — the more concrete it is, the better the agents perform.
        </p>

        {!canEdit && (
          <p style={{ background: '#fff8e6', border: '1px solid #f5d77a', padding: 10, borderRadius: 6, fontSize: 13, color: '#6b5800' }}>
            Read-only — only your AI champion (builder) or an admin can edit this.
          </p>
        )}

        <Section title="Identity">
          <Field label="Tagline" hint="One short line that says what your newsroom is.">
            <input type="text" value={state.tagline || ''} disabled={!canEdit} onChange={(e) => set('tagline', e.target.value)} placeholder="e.g. Independent investigative reporting from Lusaka." style={textInputStyle} />
          </Field>
          <Field label="Mission" hint="One or two sentences.">
            <textarea value={state.mission || ''} disabled={!canEdit} onChange={(e) => set('mission', e.target.value)} rows={2} style={textareaStyle} />
          </Field>
        </Section>

        <Section title="Coverage">
          <ChipField
            label="Strengths"
            hint="What you do well. The Fundraiser leans on these in donor briefs."
            value={state.strengths}
            disabled={!canEdit}
            onChange={(v) => set('strengths', v)}
            placeholder="e.g. investigative, climate, local government"
          />
          <ChipField
            label="Beats"
            hint="The regular subjects you cover."
            value={state.beats}
            disabled={!canEdit}
            onChange={(v) => set('beats', v)}
            placeholder="e.g. courts, mining, education"
          />
          <ChipField
            label="Coverage areas"
            hint="Geographies you cover."
            value={state.geography}
            disabled={!canEdit}
            onChange={(v) => set('geography', v)}
            placeholder="e.g. Lusaka, Copperbelt"
          />
        </Section>

        <Section title="Audience">
          <Field label="Audience summary" hint="Prose description of your readers — who they are, why they read you.">
            <textarea value={state.audience_summary || ''} disabled={!canEdit} onChange={(e) => set('audience_summary', e.target.value)} rows={3} style={textareaStyle} />
          </Field>
          <Field label="Approximate monthly readers" hint="Round number.">
            <input
              type="number"
              value={state.audience_size_monthly ?? ''}
              disabled={!canEdit}
              onChange={(e) => set('audience_size_monthly', e.target.value ? parseInt(e.target.value, 10) : null)}
              placeholder="e.g. 80000"
              style={{ ...textInputStyle, maxWidth: 200 }}
            />
          </Field>
          <CheckboxList
            label="Primary platforms"
            options={PLATFORMS.map((p) => ({ value: p, label: p }))}
            value={state.primary_platforms}
            disabled={!canEdit}
            onChange={(v) => set('primary_platforms', v)}
          />
          <CheckboxList
            label="Primary languages"
            options={LANGUAGES.map((l) => ({ value: l.code, label: l.label }))}
            value={state.primary_languages}
            disabled={!canEdit}
            onChange={(v) => set('primary_languages', v)}
          />
        </Section>

        <Section title="House style">
          <Field label="Voice" hint="How your newsroom sounds. Copywriter and the Audio &amp; Video Producer pull this verbatim.">
            <textarea value={state.voice || ''} disabled={!canEdit} onChange={(e) => set('voice', e.target.value)} rows={3} style={textareaStyle} placeholder="e.g. Clear, sceptical, accessible. We avoid jargon and explain every acronym." />
          </Field>
          <Field label="Style notes" hint="Concrete rules — punctuation, units, capitalisation, what you do and don't do.">
            <textarea value={state.style_notes || ''} disabled={!canEdit} onChange={(e) => set('style_notes', e.target.value)} rows={3} style={textareaStyle} placeholder="e.g. No Oxford comma. Metric units only. Spell out 'percent'. No emojis." />
          </Field>
          <Field label="Ethics policy" hint="POPIA / corrections approach / your stated position on AI use.">
            <textarea value={state.ethics_policy || ''} disabled={!canEdit} onChange={(e) => set('ethics_policy', e.target.value)} rows={3} style={textareaStyle} />
          </Field>
        </Section>

        <Section title="Impact">
          <ImpactList value={state.impact_stories} disabled={!canEdit} onChange={(v) => set('impact_stories', v)} />
          <AwardsList value={state.awards} disabled={!canEdit} onChange={(v) => set('awards', v)} />
        </Section>

        <Section title="Notes">
          <Field label="Additional notes" hint="Anything else the agents should know about your newsroom.">
            <textarea value={state.additional_notes || ''} disabled={!canEdit} onChange={(e) => set('additional_notes', e.target.value)} rows={3} style={textareaStyle} />
          </Field>
        </Section>

        <TopicTagsEditor canEdit={canEdit} />
        <TrustedSourcesEditor canEdit={canEdit} />
        <CrawlRulesEditor canEdit={canEdit} />
        <StyleFingerprintInspector canEdit={canEdit} />

        {canEdit && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 24, padding: '12px 0', borderTop: '1px solid #e5e5e5' }}>
            <button
              type="submit"
              disabled={saving}
              style={{ padding: '10px 18px', background: '#111', color: '#fff', border: 'none', borderRadius: 6, fontSize: 14, cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.5 : 1 }}
            >
              {saving ? 'Saving…' : 'Save profile'}
            </button>
            {savedAt && <span style={{ fontSize: 13, color: '#0a0' }}>Saved at {savedAt}.</span>}
            {error && <span style={{ fontSize: 13, color: '#b00' }}>{error}</span>}
          </div>
        )}
      </form>
    </main>
  );
}

const textInputStyle: React.CSSProperties = {
  width: '100%',
  fontSize: 14,
  padding: 8,
  border: '1px solid #ccc',
  borderRadius: 4,
  fontFamily: 'inherit',
  boxSizing: 'border-box',
};
const textareaStyle: React.CSSProperties = {
  ...textInputStyle,
  resize: 'vertical' as const,
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ background: 'white', border: '1px solid #e5e5e5', borderRadius: 8, padding: 18, marginTop: 16 }}>
      <h2 style={{ fontSize: 14, textTransform: 'uppercase', letterSpacing: 0.5, color: '#666', margin: '0 0 14px' }}>{title}</h2>
      {children}
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block', marginBottom: 14 }}>
      <span style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 2 }}>{label}</span>
      {hint && <span style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 6 }}>{hint}</span>}
      {children}
    </label>
  );
}

function ChipField({
  label,
  hint,
  value,
  disabled,
  onChange,
  placeholder,
}: {
  label: string;
  hint?: string;
  value: string[];
  disabled: boolean;
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState('');
  function commit() {
    const t = draft.trim();
    if (!t) return;
    if (value.includes(t)) {
      setDraft('');
      return;
    }
    onChange([...value, t]);
    setDraft('');
  }
  return (
    <Field label={label} hint={hint}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
        {value.map((v) => (
          <span key={v} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, padding: '4px 10px', background: '#e8f1ff', color: '#0044aa', borderRadius: 12 }}>
            {v}
            {!disabled && (
              <button
                type="button"
                onClick={() => onChange(value.filter((x) => x !== v))}
                aria-label={`Remove ${v}`}
                style={{ background: 'transparent', border: 'none', color: '#0044aa', cursor: 'pointer', fontSize: 14, padding: 0, lineHeight: 1 }}
              >
                ×
              </button>
            )}
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          type="text"
          value={draft}
          disabled={disabled}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault();
              commit();
            }
          }}
          placeholder={placeholder || 'Type and press Enter'}
          style={{ ...textInputStyle, flex: 1 }}
        />
        {!disabled && draft && (
          <button type="button" onClick={commit} style={{ padding: '8px 12px', background: '#111', color: '#fff', border: 'none', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}>
            Add
          </button>
        )}
      </div>
    </Field>
  );
}

function CheckboxList({
  label,
  options,
  value,
  disabled,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string[];
  disabled: boolean;
  onChange: (next: string[]) => void;
}) {
  function toggle(v: string) {
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  }
  return (
    <Field label={label}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {options.map((o) => {
          const on = value.includes(o.value);
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => !disabled && toggle(o.value)}
              disabled={disabled}
              style={{
                fontSize: 12,
                padding: '5px 10px',
                background: on ? '#0066cc' : 'white',
                color: on ? 'white' : '#444',
                border: `1px solid ${on ? '#0066cc' : '#ccc'}`,
                borderRadius: 12,
                cursor: disabled ? 'not-allowed' : 'pointer',
              }}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </Field>
  );
}

function ImpactList({
  value,
  disabled,
  onChange,
}: {
  value: ImpactStory[];
  disabled: boolean;
  onChange: (next: ImpactStory[]) => void;
}) {
  function update(idx: number, patch: ImpactStory) {
    onChange(value.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  }
  function add() {
    onChange([...value, { headline: '', year: '', outcome: '' }]);
  }
  function remove(idx: number) {
    onChange(value.filter((_, i) => i !== idx));
  }
  return (
    <Field label="Impact stories" hint="Pieces of work that produced a real-world outcome — a resignation, a policy change, a recovered theft. Fundraiser uses these in donor reports.">
      {value.length === 0 && <p style={{ fontSize: 12, color: '#888', margin: '4px 0' }}>No impact stories logged yet.</p>}
      {value.map((s, i) => (
        <div key={i} style={{ background: '#fafafa', border: '1px solid #eee', borderRadius: 6, padding: 10, marginBottom: 8, display: 'grid', gridTemplateColumns: '1fr 80px auto', gap: 8 }}>
          <input type="text" value={s.headline || ''} disabled={disabled} placeholder="Headline / brief description" onChange={(e) => update(i, { headline: e.target.value })} style={textInputStyle} />
          <input type="text" value={String(s.year || '')} disabled={disabled} placeholder="Year" onChange={(e) => update(i, { year: e.target.value })} style={textInputStyle} />
          {!disabled && (
            <button type="button" onClick={() => remove(i)} style={{ background: 'transparent', border: 'none', color: '#b00', fontSize: 12, cursor: 'pointer' }}>remove</button>
          )}
          <textarea value={s.outcome || ''} disabled={disabled} placeholder="Outcome — what changed?" onChange={(e) => update(i, { outcome: e.target.value })} rows={2} style={{ ...textareaStyle, gridColumn: '1 / span 3' }} />
        </div>
      ))}
      {!disabled && (
        <button type="button" onClick={add} style={{ padding: '6px 12px', background: 'transparent', color: '#0066cc', border: '1px solid #0066cc', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}>+ Add impact story</button>
      )}
    </Field>
  );
}

function AwardsList({
  value,
  disabled,
  onChange,
}: {
  value: Award[];
  disabled: boolean;
  onChange: (next: Award[]) => void;
}) {
  function update(idx: number, patch: Award) {
    onChange(value.map((a, i) => (i === idx ? { ...a, ...patch } : a)));
  }
  function add() {
    onChange([...value, { name: '', year: '', body: '' }]);
  }
  function remove(idx: number) {
    onChange(value.filter((_, i) => i !== idx));
  }
  return (
    <Field label="Awards">
      {value.length === 0 && <p style={{ fontSize: 12, color: '#888', margin: '4px 0' }}>No awards logged yet.</p>}
      {value.map((a, i) => (
        <div key={i} style={{ background: '#fafafa', border: '1px solid #eee', borderRadius: 6, padding: 10, marginBottom: 8, display: 'grid', gridTemplateColumns: '1fr 1fr 80px auto', gap: 8 }}>
          <input type="text" value={a.name || ''} disabled={disabled} placeholder="Award" onChange={(e) => update(i, { name: e.target.value })} style={textInputStyle} />
          <input type="text" value={a.body || ''} disabled={disabled} placeholder="Awarding body" onChange={(e) => update(i, { body: e.target.value })} style={textInputStyle} />
          <input type="text" value={String(a.year || '')} disabled={disabled} placeholder="Year" onChange={(e) => update(i, { year: e.target.value })} style={textInputStyle} />
          {!disabled && (
            <button type="button" onClick={() => remove(i)} style={{ background: 'transparent', border: 'none', color: '#b00', fontSize: 12, cursor: 'pointer' }}>remove</button>
          )}
        </div>
      ))}
      {!disabled && (
        <button type="button" onClick={add} style={{ padding: '6px 12px', background: 'transparent', color: '#0066cc', border: '1px solid #0066cc', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}>+ Add award</button>
      )}
    </Field>
  );
}
