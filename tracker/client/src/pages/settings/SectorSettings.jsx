import { useState } from 'react';
import { useSectors } from '../../context/SectorContext.jsx';
import { apiFetch } from '../../hooks/useApi.js';
import PageHeader from '../../components/PageHeader.jsx';
import Modal from '../../components/Modal.jsx';

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

export default function SectorSettings() {
  const { sectors, refreshSectors } = useSectors();
  const [editing, setEditing] = useState(null); // null or sector object or 'new'
  const [form, setForm] = useState({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function openNew() {
    setForm({ name: '', slug: '', description: '', colour: '#6B7280', is_active: true });
    setEditing('new');
    setError('');
  }

  function openEdit(sector) {
    setForm({ ...sector });
    setEditing(sector);
    setError('');
  }

  function set(field) {
    return e => {
      const val = field === 'is_active' ? e.target.checked : e.target.value;
      setForm(prev => {
        const updated = { ...prev, [field]: val };
        if (field === 'name' && (editing === 'new' || !prev.slug)) {
          updated.slug = slugify(val);
        }
        return updated;
      });
    };
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      if (editing === 'new') {
        await apiFetch('/sectors', { method: 'POST', body: JSON.stringify(form) });
      } else {
        await apiFetch(`/sectors/${editing.id}`, { method: 'PUT', body: JSON.stringify(form) });
      }
      await refreshSectors();
      setEditing(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader title="Sectors">
        <button className="btn btn-primary" onClick={openNew}>+ Add Sector</button>
      </PageHeader>

      <table className="data-table">
        <thead>
          <tr>
            <th>Colour</th>
            <th>Name</th>
            <th>Slug</th>
            <th>Description</th>
            <th>Active</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {sectors.map(s => (
            <tr key={s.id} style={{ opacity: s.is_active ? 1 : 0.5 }}>
              <td><span style={{ display: 'inline-block', width: 20, height: 20, borderRadius: 4, background: s.colour }} /></td>
              <td style={{ fontWeight: 500 }}>{s.name}</td>
              <td style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{s.slug}</td>
              <td style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{s.description || '—'}</td>
              <td>{s.is_active ? 'Yes' : 'No'}</td>
              <td><button className="btn btn-secondary btn-small" onClick={() => openEdit(s)}>Edit</button></td>
            </tr>
          ))}
        </tbody>
      </table>

      {editing && (
        <Modal title={editing === 'new' ? 'Add Sector' : 'Edit Sector'} onClose={() => setEditing(null)}>
          {error && <div className="login-error">{error}</div>}
          <form onSubmit={handleSubmit}>
            <div className="form-row">
              <div className="form-group">
                <label>Name *</label>
                <input value={form.name} onChange={set('name')} required />
              </div>
              <div className="form-group">
                <label>Slug *</label>
                <input value={form.slug} onChange={set('slug')} required />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Colour</label>
                <input type="color" value={form.colour} onChange={set('colour')} style={{ height: 38 }} />
              </div>
              <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 20 }}>
                <input type="checkbox" checked={form.is_active} onChange={set('is_active')} id="is_active" />
                <label htmlFor="is_active" style={{ marginBottom: 0 }}>Active</label>
              </div>
            </div>
            <div className="form-group">
              <label>Description</label>
              <textarea value={form.description || ''} onChange={set('description')} />
            </div>
            <div className="form-actions">
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Saving...' : (editing === 'new' ? 'Create' : 'Update')}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
