import { useState } from 'react';

/**
 * InlineEditField — click-to-edit field that replaces the static detail-field pattern.
 *
 * Props:
 *   label      — field label shown above the value
 *   value      — current raw value (string / number / null)
 *   onSave     — async (newValue) => void — called with the new value; should throw on error
 *   type       — 'text' | 'textarea' | 'select' | 'number' | 'url' | 'email' | 'date' (default: 'text')
 *   options    — [{ value, label }] — required when type='select'
 *   displayValue — optional custom display element/string (e.g. a badge); falls back to value
 *   placeholder — optional placeholder text
 *   readOnly   — if true, clicking shows nothing (computed fields like module count)
 */
export default function InlineEditField({
  label,
  value,
  onSave,
  type = 'text',
  options = [],
  displayValue,
  placeholder = '',
  readOnly = false,
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function startEdit() {
    if (readOnly) return;
    setDraft(value != null ? String(value) : '');
    setError('');
    setEditing(true);
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      await onSave(type === 'number' ? (draft === '' ? null : Number(draft)) : draft);
      setEditing(false);
    } catch (err) {
      setError(err.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Escape') { setEditing(false); return; }
    if (e.key === 'Enter' && type !== 'textarea') handleSave();
  }

  const inputStyle = {
    width: '100%', fontSize: 13, padding: '5px 8px',
    border: '1px solid var(--border-color)', borderRadius: 'var(--radius)',
    fontFamily: 'inherit', boxSizing: 'border-box',
  };

  const displayContent = displayValue != null
    ? displayValue
    : (value != null && value !== '' ? String(value) : null);

  return (
    <div className="detail-field">
      <div className="detail-field-label">{label}</div>

      {editing ? (
        <div>
          {type === 'textarea' ? (
            <textarea
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              autoFocus
              rows={3}
              placeholder={placeholder}
              style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }}
            />
          ) : type === 'select' ? (
            <select
              value={draft}
              onChange={e => setDraft(e.target.value)}
              autoFocus
              style={inputStyle}
            >
              {options.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          ) : (
            <input
              type={type}
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              autoFocus
              placeholder={placeholder}
              style={inputStyle}
            />
          )}
          {error && (
            <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 3 }}>{error}</div>
          )}
          <div style={{ display: 'flex', gap: 4, marginTop: 5 }}>
            <button
              className="btn btn-primary btn-small"
              onClick={handleSave}
              disabled={saving}
              style={{ fontSize: 11, padding: '3px 10px' }}
            >
              {saving ? '…' : 'Save'}
            </button>
            <button
              className="btn btn-secondary btn-small"
              onClick={() => setEditing(false)}
              style={{ fontSize: 11, padding: '3px 10px' }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div
          className="detail-field-value"
          onClick={startEdit}
          title={readOnly ? undefined : 'Click to edit'}
          style={{
            cursor: readOnly ? 'default' : 'pointer',
            minHeight: 22,
            borderRadius: 3,
            padding: '1px 3px',
            margin: '-1px -3px',
            transition: 'background 0.1s',
          }}
          onMouseEnter={e => { if (!readOnly) e.currentTarget.style.background = 'var(--hover-bg, #F3F4F6)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
        >
          {displayContent ?? (
            <span style={{ color: 'var(--text-secondary)', fontStyle: 'italic', fontSize: 12 }}>
              {readOnly ? '—' : 'Click to add…'}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
