// Admin action bar shown on lawsuit / regulation detail pages.
// Hidden entirely for anonymous visitors — only admins ever see it.
//
// Two actions:
//   • Generate insights — calls POST /legal-sources/insights/:kind/:id
//     (industry impact + predicted outcome via Claude + retrieval).
//   • Check timeline — calls POST /legal-sources/timeline/:kind/:id
//     (Claude + web_search enumerates significant events).
//
// Both are long-running (timeline can take ~60s), so we bump the fetch timeout
// and surface the result inline so the admin knows what changed.

import { useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { apiFetch } from '../../hooks/useApi.js';

export default function AdminCaseActions({ kind, id, onDone }) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [busy,   setBusy]   = useState(null);   // 'insights' | 'timeline' | null
  const [result, setResult] = useState(null);
  const [error,  setError]  = useState(null);

  if (!isAdmin) return null;

  async function run(action) {
    setBusy(action); setResult(null); setError(null);
    try {
      const path =
        action === 'insights' ? `/legal-sources/insights/${kind}/${id}`
                              : `/legal-sources/timeline/${kind}/${id}`;
      const data = await apiFetch(path, { method: 'POST', timeout: 180000 });
      setResult(describe(action, data));
      onDone?.();
    } catch (err) {
      setError(err.message || 'Action failed');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div style={{
      marginBottom: 14, padding: '10px 12px', borderRadius: 8,
      background: '#FEF3C7', border: '1px solid #FCD34D',
      display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
    }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: '#92400E', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Admin
      </span>
      <button type="button" onClick={() => run('insights')} disabled={busy !== null} style={btn}>
        {busy === 'insights' ? 'Generating…' : 'Generate insights'}
      </button>
      <button type="button" onClick={() => run('timeline')} disabled={busy !== null} style={btn}>
        {busy === 'timeline' ? 'Researching…' : 'Check / update timeline'}
      </button>
      {result && <span style={{ fontSize: 12, color: '#065F46' }}>{result}</span>}
      {error  && <span style={{ fontSize: 12, color: '#991B1B' }}>{error}</span>}
    </div>
  );
}

function describe(action, data) {
  if (action === 'insights') {
    if (data?.skipped) return `Skipped: ${data.skipped} (related=${data.related_count ?? 0}).`;
    const n = (data?.written || []).filter(w => !w.error).length;
    return `Wrote ${n} insight${n === 1 ? '' : 's'} (related=${data?.related_count ?? 0}). Refresh to see.`;
  }
  const ins = data?.inserted ?? 0;
  const rej = data?.rejected ?? 0;
  return `+${ins} event${ins === 1 ? '' : 's'}${rej ? ` (${rej} rejected)` : ''}. Refresh to see.`;
}

const btn = {
  fontSize: 12, padding: '5px 12px', borderRadius: 6, fontWeight: 600,
  border: '1px solid #92400E', background: 'white', color: '#92400E',
  cursor: 'pointer',
};
