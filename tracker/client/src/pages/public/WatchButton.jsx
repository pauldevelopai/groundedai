// Small "Watch this ___" subscribe control for public lawsuit / regulation
// detail pages. Inline form — no modal — so it works on mobile and doesn't
// pull a dependency. Posts to /api/public/subscriptions with double-opt-in;
// the confirmation link arrives by email (once SMTP is wired) or is logged
// server-side in the meantime.
import { useState } from 'react';
import { publicFetch } from '../../hooks/usePublicApi.js';

export default function WatchButton({ entityKind, entityId, label }) {
  const [state, setState] = useState('idle'); // idle | open | submitting | done | error
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');

  async function submit(e) {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setMessage('Please enter a valid email address.');
      return;
    }
    setState('submitting');
    try {
      const body = { email: trimmed, entity_kind: entityKind };
      if (entityKind !== 'all') body.entity_id = entityId;
      const res = await publicFetch('/public/subscriptions', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setState('done');
      setMessage(res?.message || 'Check your inbox to confirm.');
    } catch (err) {
      setState('error');
      setMessage(err.message || 'Something went wrong.');
    }
  }

  if (state === 'done') {
    return <div style={statusStyle('ok')}>{message}</div>;
  }

  if (state === 'idle') {
    return (
      <button type="button" onClick={() => setState('open')} style={btnStyle}>
        🔔 {label || `Watch this ${entityKind}`}
      </button>
    );
  }

  return (
    <form onSubmit={submit} style={formStyle}>
      <input
        type="email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        placeholder="you@example.com"
        autoFocus
        disabled={state === 'submitting'}
        style={inputStyle}
      />
      <button type="submit" disabled={state === 'submitting'} style={{ ...btnStyle, marginTop: 0 }}>
        {state === 'submitting' ? 'Subscribing…' : 'Subscribe'}
      </button>
      <button type="button" onClick={() => { setState('idle'); setEmail(''); setMessage(''); }} style={linkBtnStyle}>
        Cancel
      </button>
      {message && <div style={statusStyle('error')}>{message}</div>}
    </form>
  );
}

const btnStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '8px 14px',
  fontSize: 13,
  fontWeight: 500,
  borderRadius: 8,
  border: '1px solid var(--border-color, #e5e7eb)',
  background: 'var(--card-bg, #fff)',
  color: 'var(--text-primary, #111)',
  cursor: 'pointer',
  marginTop: 8,
};

const formStyle = {
  display: 'flex',
  gap: 8,
  alignItems: 'center',
  flexWrap: 'wrap',
  marginTop: 8,
};

const inputStyle = {
  padding: '8px 10px',
  fontSize: 13,
  borderRadius: 8,
  border: '1px solid var(--border-color, #e5e7eb)',
  minWidth: 220,
  flex: '1 1 220px',
};

const linkBtnStyle = {
  background: 'none',
  border: 'none',
  color: 'var(--text-secondary, #666)',
  cursor: 'pointer',
  fontSize: 13,
  textDecoration: 'underline',
  padding: 0,
};

function statusStyle(tone) {
  return {
    width: '100%',
    padding: '8px 10px',
    fontSize: 13,
    borderRadius: 6,
    background: tone === 'ok' ? '#ecfdf5' : '#fef2f2',
    color: tone === 'ok' ? '#065f46' : '#991b1b',
    marginTop: 6,
  };
}
