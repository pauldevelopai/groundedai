// Admin: manage the AI Legal use-case collection.
// List + add-new + edit + delete + publish toggle.
import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../../hooks/useApi.js';
import PageHeader from '../../components/PageHeader.jsx';

const FIRM_TYPES = ['biglaw', 'boutique', 'solo', 'inhouse', 'government', 'nonprofit', 'legaltech', 'other'];
const CATEGORIES = ['drafting', 'research', 'review', 'ediscovery', 'analytics', 'intake', 'compliance', 'legal-ops', 'translation', 'training', 'other'];

export default function UseCasesAdmin() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null); // null | 'new' | use-case object
  const [confirmDelete, setConfirmDelete] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    apiFetch('/usecases').then(setItems).catch(e => setError(e.message)).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function save(data) {
    try {
      if (editing === 'new') {
        await apiFetch('/usecases', { method: 'POST', body: JSON.stringify(data) });
      } else {
        await apiFetch(`/usecases/${editing.id}`, { method: 'PUT', body: JSON.stringify(data) });
      }
      setEditing(null);
      load();
    } catch (err) {
      alert('Save failed: ' + err.message);
    }
  }

  async function togglePublish(u) {
    try {
      await apiFetch(`/usecases/${u.id}`, { method: 'PUT', body: JSON.stringify({ is_published: !u.is_published }) });
      load();
    } catch (err) { alert(err.message); }
  }

  async function doDelete(id) {
    try {
      await apiFetch(`/usecases/${id}`, { method: 'DELETE' });
      setConfirmDelete(null);
      load();
    } catch (err) { alert(err.message); }
  }

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <PageHeader title="AI legal use cases" subtitle="Curated collection of lawyers + firms using AI successfully" />

      <div style={{ marginBottom: 16, display: 'flex', gap: 8, alignItems: 'center' }}>
        <button className="btn btn-primary btn-small" onClick={() => setEditing('new')}>+ Add use case</button>
        <button className="btn btn-secondary btn-small" onClick={load}>Refresh</button>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{items.length} total</span>
      </div>

      {loading && <div style={{ color: 'var(--text-secondary)' }}>Loading…</div>}
      {error && <div style={{ color: '#991B1B' }}>{error}</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {items.map(u => (
          <div key={u.id} className="card" style={{ padding: '12px 14px', opacity: u.is_published ? 1 : 0.55 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10, background: '#EEF2FF', color: '#4F46E5', textTransform: 'uppercase' }}>{u.firm_type || 'other'}</span>
                  {u.jurisdiction && <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, background: '#F1F5F9', color: '#475569' }}>{u.jurisdiction}</span>}
                  {!u.is_published && <span style={{ fontSize: 10, fontWeight: 700, color: '#991B1B' }}>UNPUBLISHED</span>}
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 2 }}>{u.firm_name}</div>
                <div style={{ fontSize: 13, marginBottom: 4 }}>{u.use_case_title}</div>
                {u.quantified_impact && <div style={{ fontSize: 12, color: '#065F46', fontWeight: 600, marginBottom: 2 }}>✓ {u.quantified_impact}</div>}
                <a href={u.source_url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: 'var(--accent)', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>{u.source_url}</a>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
                <button className="btn btn-secondary btn-small" style={{ fontSize: 11 }} onClick={() => setEditing(u)}>Edit</button>
                <button className="btn btn-secondary btn-small" style={{ fontSize: 11 }} onClick={() => togglePublish(u)}>
                  {u.is_published ? 'Unpublish' : 'Publish'}
                </button>
                <button className="btn btn-small" style={{ fontSize: 11, background: '#FEE2E2', color: '#991B1B', border: '1px solid #FCA5A5' }} onClick={() => setConfirmDelete(u.id)}>Delete</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {editing && <EditModal item={editing === 'new' ? null : editing} onSave={save} onCancel={() => setEditing(null)} />}
      {confirmDelete && (
        <ConfirmModal onConfirm={() => doDelete(confirmDelete)} onCancel={() => setConfirmDelete(null)} />
      )}
    </div>
  );
}

function EditModal({ item, onSave, onCancel }) {
  const [form, setForm] = useState({
    firm_name: item?.firm_name || '',
    firm_type: item?.firm_type || 'biglaw',
    jurisdiction: item?.jurisdiction || '',
    use_case_title: item?.use_case_title || '',
    summary: item?.summary || '',
    tools_used: (item?.tools_used || []).join(', '),
    categories: (item?.categories || []).join(', '),
    outcome: item?.outcome || '',
    quantified_impact: item?.quantified_impact || '',
    source_url: item?.source_url || '',
    source_name: item?.source_name || '',
    published_at: item?.published_at ? new Date(item.published_at).toISOString().slice(0, 10) : '',
    tags: (item?.tags || []).join(', '),
    is_published: item?.is_published !== false,
  });
  const [saving, setSaving] = useState(false);

  function update(k) { return e => setForm(f => ({ ...f, [k]: e.target.value })); }

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    const payload = {
      ...form,
      tools_used: form.tools_used.split(',').map(s => s.trim()).filter(Boolean),
      categories: form.categories.split(',').map(s => s.trim()).filter(Boolean),
      tags: form.tags.split(',').map(s => s.trim()).filter(Boolean),
      published_at: form.published_at || null,
    };
    await onSave(payload);
    setSaving(false);
  }

  return (
    <div style={overlay}>
      <form onSubmit={submit} className="card" style={modalCard}>
        <h3 style={{ margin: '0 0 14px 0', fontSize: 18 }}>{item ? 'Edit use case' : 'New use case'}</h3>
        <div style={twoCol}>
          <Field label="Firm name" required><input type="text" value={form.firm_name} onChange={update('firm_name')} required style={inp} /></Field>
          <Field label="Firm type">
            <select value={form.firm_type} onChange={update('firm_type')} style={inp}>
              {FIRM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Jurisdiction"><input type="text" value={form.jurisdiction} onChange={update('jurisdiction')} style={inp} /></Field>
          <Field label="Published date"><input type="date" value={form.published_at} onChange={update('published_at')} style={inp} /></Field>
        </div>
        <Field label="Use case title" required><input type="text" value={form.use_case_title} onChange={update('use_case_title')} required style={inp} /></Field>
        <Field label="Summary"><textarea value={form.summary} onChange={update('summary')} style={{ ...inp, minHeight: 80 }} /></Field>
        <Field label="Outcome"><textarea value={form.outcome} onChange={update('outcome')} style={{ ...inp, minHeight: 60 }} /></Field>
        <div style={twoCol}>
          <Field label="Quantified impact (e.g. 75% faster)"><input type="text" value={form.quantified_impact} onChange={update('quantified_impact')} style={inp} /></Field>
          <Field label="Source name (e.g. Allen & Overy press release)"><input type="text" value={form.source_name} onChange={update('source_name')} style={inp} /></Field>
        </div>
        <Field label="Source URL" required><input type="url" value={form.source_url} onChange={update('source_url')} required style={inp} /></Field>
        <div style={twoCol}>
          <Field label="Tools used (comma-separated)"><input type="text" value={form.tools_used} onChange={update('tools_used')} placeholder="Harvey, GPT-4, Microsoft Copilot" style={inp} /></Field>
          <Field label="Categories (comma-separated)"><input type="text" value={form.categories} onChange={update('categories')} placeholder="drafting, research, review" style={inp} /></Field>
        </div>
        <Field label="Tags (comma-separated)"><input type="text" value={form.tags} onChange={update('tags')} style={inp} /></Field>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, fontSize: 13 }}>
          <input type="checkbox" checked={form.is_published} onChange={e => setForm(f => ({ ...f, is_published: e.target.checked }))} />
          Published (visible on public site)
        </label>
        <div style={{ marginTop: 18, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-secondary btn-small" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn btn-primary btn-small" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </div>
  );
}

function ConfirmModal({ onConfirm, onCancel }) {
  return (
    <div style={overlay}>
      <div className="card" style={{ ...modalCard, maxWidth: 420 }}>
        <h3 style={{ margin: '0 0 10px 0', fontSize: 16 }}>Delete this use case?</h3>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 16px 0' }}>This cannot be undone.</p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary btn-small" onClick={onCancel}>Cancel</button>
          <button className="btn btn-small" style={{ background: '#EF4444', color: 'white' }} onClick={onConfirm}>Delete</button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children, required }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {label}{required && <span style={{ color: '#991B1B' }}> *</span>}
      </span>
      {children}
    </label>
  );
}

const overlay = {
  position: 'fixed', inset: 0, background: 'rgba(11, 18, 32, 0.6)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 1000,
};
const modalCard = {
  width: '100%', maxWidth: 720, maxHeight: '90vh', overflowY: 'auto', padding: 24,
};
const twoCol = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 };
const inp = {
  padding: '8px 12px', fontSize: 14, width: '100%',
  border: '1px solid var(--border-color)', borderRadius: 'var(--radius)',
  background: 'var(--card-bg)', color: 'var(--text-primary)',
  fontFamily: 'inherit',
};
