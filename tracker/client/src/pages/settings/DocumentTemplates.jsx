import { useState, useEffect } from 'react';
import { useSectors } from '../../context/SectorContext.jsx';
import { apiFetch } from '../../hooks/useApi.js';
import PageHeader from '../../components/PageHeader.jsx';
import Modal from '../../components/Modal.jsx';

const TYPE_LABELS = { ethical_ai_policy: 'Ethical AI Policy', ai_legal_framework: 'AI Legal Framework' };
const TYPES = ['ethical_ai_policy', 'ai_legal_framework'];

export default function DocumentTemplates() {
  const { sectors } = useSectors();
  const [templates, setTemplates] = useState([]);
  const [editing, setEditing] = useState(null);

  function load() {
    apiFetch('/document-templates/all').then(setTemplates).catch(() => setTemplates([]));
  }

  useEffect(load, []);

  return (
    <div>
      <PageHeader title="Document Templates">
        <button className="btn btn-primary" onClick={() => setEditing('new')}>+ Add Template</button>
      </PageHeader>
      <table className="data-table">
        <thead>
          <tr><th>Title</th><th>Type</th><th>Sector</th><th>Active</th><th></th></tr>
        </thead>
        <tbody>
          {templates.map(t => (
            <tr key={t.id} style={{ opacity: t.is_active ? 1 : 0.5 }}>
              <td style={{ fontWeight: 500 }}>{t.title}</td>
              <td><span className="stage-badge stage-active">{TYPE_LABELS[t.type] || t.type}</span></td>
              <td>{t.sector_name}</td>
              <td>{t.is_active ? 'Yes' : 'No'}</td>
              <td><button className="btn btn-secondary btn-small" onClick={() => setEditing(t)}>Edit</button></td>
            </tr>
          ))}
        </tbody>
      </table>

      {editing && (
        <TemplateForm
          template={editing === 'new' ? null : editing}
          sectors={sectors}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </div>
  );
}

function TemplateForm({ template, sectors, onClose, onSaved }) {
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    sector_id: template?.sector_id || '',
    type: template?.type || 'ethical_ai_policy',
    title: template?.title || '',
    description: template?.description || '',
    template_prompt: template?.template_prompt || '',
    structure: template?.structure ? JSON.stringify(template.structure, null, 2) : '[]',
    is_active: template?.is_active !== false,
  });

  function set(field) {
    return e => {
      const val = field === 'is_active' ? e.target.checked : e.target.value;
      setForm(prev => ({ ...prev, [field]: val }));
    };
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      let structure;
      try { structure = JSON.parse(form.structure); } catch { structure = []; }
      const body = { ...form, structure };
      if (template) {
        await apiFetch(`/document-templates/${template.id}`, { method: 'PUT', body: JSON.stringify(body) });
      } else {
        await apiFetch('/document-templates', { method: 'POST', body: JSON.stringify(body) });
      }
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={template ? 'Edit Template' : 'Add Template'} onClose={onClose}>
      {error && <div className="login-error">{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>Title *</label>
          <input value={form.title} onChange={set('title')} required />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Sector *</label>
            <select value={form.sector_id} onChange={set('sector_id')} required>
              <option value="">Select...</option>
              {sectors.filter(s => s.is_active).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Type *</label>
            <select value={form.type} onChange={set('type')}>
              {TYPES.map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
            </select>
          </div>
        </div>
        <div className="form-group">
          <label>Description</label>
          <textarea value={form.description} onChange={set('description')} rows={2} />
        </div>
        <div className="form-group">
          <label>Generation Prompt (system prompt for Claude) *</label>
          <textarea value={form.template_prompt} onChange={set('template_prompt')} rows={6} required style={{ fontFamily: 'monospace', fontSize: 13 }} />
        </div>
        <div className="form-group">
          <label>Structure (JSON array of section headings)</label>
          <textarea value={form.structure} onChange={set('structure')} rows={4} style={{ fontFamily: 'monospace', fontSize: 13 }} />
        </div>
        {template && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
            <input type="checkbox" checked={form.is_active} onChange={set('is_active')} id="t_active" />
            <label htmlFor="t_active" style={{ marginBottom: 0 }}>Active</label>
          </div>
        )}
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving...' : (template ? 'Update' : 'Create')}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}
