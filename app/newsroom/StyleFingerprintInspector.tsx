// StyleFingerprintInspector — collapsible sub-section in the newsroom-profile
// editor for computing and inspecting the house-style fingerprint.
//
// The job is async (pg-boss), so this component fires the POST then polls
// the GET until either (a) the fingerprint's computed_at moves forward or
// (b) we hit a timeout.
//
// Talks to:
//   GET  /api/newsroom/style-fingerprint            current fingerprint
//   POST /api/newsroom/style-fingerprint            enqueue compute job

'use client';

import { useEffect, useState } from 'react';

type Fingerprint = {
  source_count: number;
  total_words: number;
  computed_at: string;
  sentence_rhythm: { median: number; variance: number };
  paragraph_rhythm: { median: number; variance: number };
  vocab_register: { avg_word_length: number; long_word_ratio: number };
  voice_ratio: { passive_rate: number; samples: number };
  hedge_density: number;
  attribution_style: Record<string, number>;
  quote_ratio: number;
  time_anchor_density: number;
  numerical_density: number;
  acronym_density: number;
  place_name_density: number;
  headline_length: { median: number; n: number };
  lede_openers: Array<{ phrase: string; count: number }>;
  repeated_phrases: Array<{ phrase: string; count: number }>;
};

export default function StyleFingerprintInspector({ canEdit }: { canEdit: boolean }) {
  const [open, setOpen] = useState(false);
  const [fp, setFp] = useState<Fingerprint | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [computing, setComputing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pollMessage, setPollMessage] = useState<string | null>(null);

  async function load(): Promise<Fingerprint | null> {
    setLoading(true); setError(null);
    try {
      const res = await fetch('/api/newsroom/style-fingerprint');
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setFp(j.fingerprint || null);
      setUpdatedAt(j.profileUpdatedAt || null);
      return j.fingerprint || null;
    } catch (e: any) {
      setError(e.message);
      return null;
    } finally {
      setLoading(false);
    }
  }

  function toggleOpen() {
    const next = !open;
    setOpen(next);
    if (next && !fp && !loading) load();
  }

  async function compute() {
    setComputing(true); setError(null); setPollMessage(null);
    try {
      const previousComputedAt = fp?.computed_at;
      const res = await fetch('/api/newsroom/style-fingerprint', { method: 'POST' });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setPollMessage(`Enqueued job over ${j.documentIds.length} document(s). Waiting for worker…`);
      // Poll for up to 90s
      const deadline = Date.now() + 90_000;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 3000));
        const next = await load();
        if (next && next.computed_at !== previousComputedAt) {
          setPollMessage(null);
          setComputing(false);
          return;
        }
      }
      setPollMessage('Timed out waiting for the worker. The job may still be running — refresh in a minute.');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setComputing(false);
    }
  }

  function formatBands(fp: Fingerprint): string[] {
    const bands: string[] = [];
    const sBand = fp.sentence_rhythm.median < 12 ? 'short' : fp.sentence_rhythm.median < 20 ? 'medium' : 'long';
    bands.push(`Sentences: ${sBand}`);
    const pBand = fp.paragraph_rhythm.median < 40 ? 'short' : fp.paragraph_rhythm.median < 100 ? 'medium' : 'long';
    bands.push(`Paragraphs: ${pBand}`);
    const rBand = fp.vocab_register.avg_word_length < 4.5 ? 'plain' : fp.vocab_register.avg_word_length < 5.0 ? 'standard' : 'elevated';
    bands.push(`Register: ${rBand}`);
    bands.push(`Voice: ${fp.voice_ratio.passive_rate > 0.35 ? 'often passive' : 'mostly active'}`);
    if (fp.hedge_density > 0.4) bands.push('Hedging: high');
    else if (fp.hedge_density > 0.15) bands.push('Hedging: moderate');
    if (fp.quote_ratio > 0.25) bands.push('Quoting: heavy');
    else if (fp.quote_ratio > 0.10) bands.push('Quoting: moderate');
    if (fp.numerical_density > 1.5) bands.push('Numbers: rich');
    if (fp.acronym_density > 0.8) bands.push('Acronyms: dense');
    return bands;
  }

  if (!open) {
    return (
      <section style={panelStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={sectionHeadStyle}>House-style fingerprint (advanced)</h2>
          <button onClick={toggleOpen} style={chevronBtnStyle}>Expand ▾</button>
        </div>
        <p style={{ fontSize: 12, color: '#666', margin: '6px 0 0' }}>
          Quantified style measured from your archive. Read by Copywriter and Audio &amp; Video Producer when present.
        </p>
      </section>
    );
  }

  return (
    <section style={panelStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={sectionHeadStyle}>House-style fingerprint (advanced)</h2>
        <button onClick={toggleOpen} style={chevronBtnStyle}>Collapse ▴</button>
      </div>
      <p style={{ fontSize: 12, color: '#666', margin: '6px 0 12px' }}>
        14 quantitative dimensions measured from your archive — Copywriter
        sees a banded summary (no raw numbers) when GROUNDED_STYLE_FINGERPRINT_IN_PROMPT
        is on. The editor-authored Voice / Style notes / Ethics policy fields
        remain primary; the fingerprint is a data-grounded second voice.
      </p>

      {loading && !fp && <div style={{ fontSize: 13, color: '#666' }}>Loading…</div>}
      {error && <div style={{ color: '#900', fontSize: 13, margin: '6px 0' }}>{error}</div>}
      {pollMessage && <div style={{ fontSize: 13, color: '#666', marginBottom: 8 }}>{pollMessage}</div>}

      {!fp && !loading && (
        <div style={{ padding: 16, background: '#fafafa', borderRadius: 6, marginBottom: 8 }}>
          <p style={{ fontSize: 13, color: '#444', margin: '0 0 12px' }}>
            No fingerprint yet. Compute one from your archive — needs at least one document with chunks.
            Pulls the most-recent 30 by default.
          </p>
          {canEdit && (
            <button type="button" onClick={compute} disabled={computing}
              style={primaryBtnStyle}>
              {computing ? 'Computing…' : 'Compute fingerprint from archive'}
            </button>
          )}
        </div>
      )}

      {fp && (
        <div>
          <div style={{ background: '#f9fbff', border: '1px solid #d4e3f5', padding: 10, borderRadius: 6, marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: '#666', marginBottom: 4 }}>What Claude sees:</div>
            <div style={{ fontSize: 13, fontFamily: 'system-ui, sans-serif' }}>
              <strong>Quantified style:</strong> {formatBands(fp).join(' · ')}
            </div>
          </div>

          <div style={{ fontSize: 11, color: '#666', marginBottom: 8 }}>
            Computed {new Date(fp.computed_at).toLocaleString()} from {fp.source_count} document(s) /
            {' '}{fp.total_words.toLocaleString()} words.
          </div>

          <table style={tableStyle}>
            <tbody>
              <Row label="Sentence rhythm (median words)" value={fp.sentence_rhythm.median} />
              <Row label="Sentence variance" value={fp.sentence_rhythm.variance} />
              <Row label="Paragraph rhythm (median words)" value={fp.paragraph_rhythm.median} />
              <Row label="Avg word length" value={fp.vocab_register.avg_word_length} />
              <Row label="Long-word (>7 char) ratio" value={fp.vocab_register.long_word_ratio} />
              <Row label="Passive voice rate" value={fp.voice_ratio.passive_rate} />
              <Row label="Hedge density (per 100 w)" value={fp.hedge_density} />
              <Row label="Quote ratio (sentences w/ quote)" value={fp.quote_ratio} />
              <Row label="Numerical density (per 100 w)" value={fp.numerical_density} />
              <Row label="Acronym density (per 100 w)" value={fp.acronym_density} />
              <Row label="Place-name density (per 100 w)" value={fp.place_name_density} />
              <Row label="Headline length (median words)" value={fp.headline_length.median} />
              <Row label="Time-anchor density (per 100 w)" value={fp.time_anchor_density} />
            </tbody>
          </table>

          {fp.lede_openers.length > 0 && (
            <div style={{ marginTop: 14, fontSize: 13 }}>
              <strong>Repeated lede openers:</strong>{' '}
              {fp.lede_openers.map((l) => <span key={l.phrase} style={chipStyle}>"{l.phrase}…" × {l.count}</span>)}
            </div>
          )}
          {fp.repeated_phrases.length > 0 && (
            <div style={{ marginTop: 8, fontSize: 13 }}>
              <strong>Repeated phrases:</strong>{' '}
              {fp.repeated_phrases.slice(0, 6).map((p) => <span key={p.phrase} style={chipStyle}>"{p.phrase}" × {p.count}</span>)}
            </div>
          )}

          {canEdit && (
            <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid #eee', display: 'flex', alignItems: 'center', gap: 12 }}>
              <button type="button" onClick={compute} disabled={computing}
                style={primaryBtnStyle}>
                {computing ? 'Recomputing…' : 'Recompute from archive'}
              </button>
              {updatedAt && <span style={{ fontSize: 12, color: '#666' }}>Profile last touched {new Date(updatedAt).toLocaleString()}.</span>}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function Row({ label, value }: { label: string; value: number | string }) {
  return (
    <tr>
      <td style={{ padding: '4px 8px', fontSize: 12, color: '#666' }}>{label}</td>
      <td style={{ padding: '4px 8px', fontSize: 13, fontFamily: 'ui-monospace, monospace', textAlign: 'right' }}>
        {typeof value === 'number' ? value.toFixed(value < 1 && value > 0 ? 3 : 2).replace(/\.?0+$/, '') : value}
      </td>
    </tr>
  );
}

const panelStyle: React.CSSProperties = { background: 'white', border: '1px solid #e5e5e5', borderRadius: 8, padding: 18, marginTop: 16 };
const sectionHeadStyle: React.CSSProperties = { fontSize: 14, textTransform: 'uppercase', letterSpacing: 0.5, color: '#666', margin: 0 };
const chevronBtnStyle: React.CSSProperties = { fontSize: 12, background: 'none', border: '1px solid #ddd', borderRadius: 4, padding: '2px 10px', cursor: 'pointer', color: '#666' };
const primaryBtnStyle: React.CSSProperties = { padding: '8px 14px', background: '#0066cc', color: 'white', border: 'none', borderRadius: 4, fontSize: 13, cursor: 'pointer' };
const tableStyle: React.CSSProperties = { borderCollapse: 'collapse', width: '100%', maxWidth: 480 };
const chipStyle: React.CSSProperties = { fontSize: 12, padding: '2px 8px', background: '#f0f0f0', color: '#444', borderRadius: 4, marginRight: 4, display: 'inline-block', marginBottom: 4 };
