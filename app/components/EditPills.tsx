// EditPills — V2 Step 1.
//
// Three buttons: Accept / Edit / Reject. POSTs to /api/observatory/edits
// to record a human-in-the-loop signal about an agent's output.
//
// Designed to be embedded in any UI that has an agent output + the
// workflow_runs.id that produced it. The component shows compact icon
// buttons; clicking Edit reveals an inline textarea for the corrected
// text. After submit, the buttons collapse to a single "✓ Recorded" hint
// so the user can see the feedback landed.

'use client';

import { useState } from 'react';

type EditKind = 'accepted' | 'edited' | 'rejected';

export default function EditPills({
  workflowRunId,
  originalText,
  onRecorded,
  size = 'sm',
}: {
  workflowRunId: string;
  originalText: string;
  onRecorded?: (kind: EditKind) => void;
  size?: 'sm' | 'md';
}) {
  const [busy, setBusy] = useState(false);
  const [recorded, setRecorded] = useState<EditKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editedText, setEditedText] = useState('');
  const [notes, setNotes] = useState('');

  async function submit(kind: EditKind, edited?: string) {
    setBusy(true); setError(null);
    try {
      const body: any = {
        workflow_run_id: workflowRunId,
        edit_kind: kind,
        original_text: originalText,
      };
      if (kind === 'edited') body.edited_text = edited;
      if (notes.trim()) body.notes = notes.trim();
      const res = await fetch('/api/observatory/edits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setRecorded(kind);
      setEditing(false);
      if (onRecorded) onRecorded(kind);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (recorded) {
    return (
      <span style={recordedHintStyle(size)} title={`Recorded as ${recorded}`}>
        ✓ Feedback recorded ({recorded})
      </span>
    );
  }

  if (editing) {
    return (
      <div style={{ marginTop: 6 }}>
        <textarea
          value={editedText}
          onChange={(e) => setEditedText(e.target.value)}
          placeholder="Your corrected version…"
          rows={Math.min(8, Math.max(3, Math.ceil(originalText.length / 80)))}
          style={{
            width: '100%', fontSize: 13, padding: 8, border: '1px solid #ccc', borderRadius: 4,
            fontFamily: 'inherit',
          }}
        />
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional note: what was wrong?"
          style={{ width: '100%', fontSize: 12, padding: 6, marginTop: 4, border: '1px solid #ccc', borderRadius: 4 }}
        />
        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
          <button type="button" onClick={() => submit('edited', editedText)}
            disabled={busy || !editedText.trim()} style={primaryBtnStyle(size)}>
            {busy ? 'Saving…' : 'Save edit'}
          </button>
          <button type="button" onClick={() => { setEditing(false); setEditedText(''); }}
            disabled={busy} style={secondaryBtnStyle(size)}>
            Cancel
          </button>
        </div>
        {error && <div style={errorStyle}>{error}</div>}
      </div>
    );
  }

  return (
    <div style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
      <button type="button" onClick={() => submit('accepted')}
        disabled={busy} style={pillBtnStyle(size, '#0a7d2a', '#e6f4ea')}>
        ✓ Accept
      </button>
      <button type="button" onClick={() => { setEditing(true); setEditedText(originalText); }}
        disabled={busy} style={pillBtnStyle(size, '#0066cc', '#e6f0fb')}>
        ✎ Edit
      </button>
      <button type="button" onClick={() => submit('rejected')}
        disabled={busy} style={pillBtnStyle(size, '#a00', '#fde8e8')}>
        ✗ Reject
      </button>
      {error && <span style={errorInlineStyle}>{error}</span>}
    </div>
  );
}

function pillBtnStyle(size: 'sm' | 'md', fg: string, bg: string): React.CSSProperties {
  return {
    background: bg, color: fg, border: 'none', borderRadius: 12,
    padding: size === 'sm' ? '2px 8px' : '4px 12px',
    fontSize: size === 'sm' ? 11 : 12,
    cursor: 'pointer', fontWeight: 600,
  };
}
function recordedHintStyle(size: 'sm' | 'md'): React.CSSProperties {
  return {
    color: '#0a7d2a', fontSize: size === 'sm' ? 11 : 12, fontWeight: 600,
  };
}
function primaryBtnStyle(size: 'sm' | 'md'): React.CSSProperties {
  return {
    background: '#0066cc', color: 'white', border: 'none', borderRadius: 4,
    padding: size === 'sm' ? '4px 10px' : '6px 12px',
    fontSize: size === 'sm' ? 12 : 13, cursor: 'pointer', fontWeight: 600,
  };
}
function secondaryBtnStyle(size: 'sm' | 'md'): React.CSSProperties {
  return {
    background: 'white', color: '#444', border: '1px solid #ccc', borderRadius: 4,
    padding: size === 'sm' ? '4px 10px' : '6px 12px',
    fontSize: size === 'sm' ? 12 : 13, cursor: 'pointer',
  };
}
const errorStyle: React.CSSProperties = {
  color: '#a00', fontSize: 12, marginTop: 4,
};
const errorInlineStyle: React.CSSProperties = {
  color: '#a00', fontSize: 11, marginLeft: 8,
};
