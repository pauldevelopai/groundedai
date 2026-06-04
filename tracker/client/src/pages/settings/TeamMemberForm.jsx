import { useState } from 'react';
import { useSectors } from '../../context/SectorContext.jsx';
import { apiFetch } from '../../hooks/useApi.js';
import Modal from '../../components/Modal.jsx';

const ROLES = ['admin', 'programme_manager', 'trainer', 'mentor', 'curriculum_builder'];

export default function TeamMemberForm({ member, onClose, onSaved }) {
  const { sectors } = useSectors();
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: member?.name || '',
    email: member?.email || '',
    password: '',
    role: member?.role || 'trainer',
    sector_ids: member?.sector_ids || [],
    bio: member?.bio || '',
    is_active: member?.is_active !== false,
    holly_access: member?.holly_access || false,
  });

  function set(field) {
    return e => {
      const val = (field === 'is_active' || field === 'holly_access') ? e.target.checked : e.target.value;
      setForm(prev => ({ ...prev, [field]: val }));
    };
  }

  function toggleSector(sectorId) {
    setForm(prev => ({
      ...prev,
      sector_ids: prev.sector_ids.includes(sectorId)
        ? prev.sector_ids.filter(id => id !== sectorId)
        : [...prev.sector_ids, sectorId],
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const body = { ...form };
      if (!body.password) delete body.password;
      if (member) {
        await apiFetch(`/team-members/${member.id}`, { method: 'PUT', body: JSON.stringify(body) });
      } else {
        if (!body.password) {
          setError('Password is required for new team members');
          setSaving(false);
          return;
        }
        await apiFetch('/team-members', { method: 'POST', body: JSON.stringify(body) });
      }
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={member ? 'Edit Team Member' : 'Add Team Member'} onClose={onClose}>
      {error && <div className="login-error">{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="form-row">
          <div className="form-group">
            <label>Name *</label>
            <input value={form.name} onChange={set('name')} required />
          </div>
          <div className="form-group">
            <label>Email *</label>
            <input type="email" value={form.email} onChange={set('email')} required />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>{member ? 'New Password (leave blank to keep)' : 'Password *'}</label>
            <input type="password" value={form.password} onChange={set('password')} />
          </div>
          <div className="form-group">
            <label>Role</label>
            <select value={form.role} onChange={set('role')}>
              {ROLES.map(r => (
                <option key={r} value={r}>{r.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="form-group">
          <label>Sectors</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
            {sectors.filter(s => s.is_active).map(s => (
              <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 14, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={form.sector_ids.includes(s.id)}
                  onChange={() => toggleSector(s.id)}
                />
                <span className="sector-badge-dot" style={{ backgroundColor: s.colour, width: 10, height: 10, borderRadius: '50%', display: 'inline-block' }} />
                {s.name}
              </label>
            ))}
          </div>
        </div>
        <div className="form-group">
          <label>Bio</label>
          <textarea value={form.bio} onChange={set('bio')} />
        </div>
        <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, cursor: 'pointer' }}>
            <input type="checkbox" checked={form.is_active} onChange={set('is_active')} />
            Active
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, cursor: 'pointer' }}>
            <input type="checkbox" checked={form.holly_access} onChange={set('holly_access')} />
            Holly Access
          </label>
        </div>
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving...' : (member ? 'Update' : 'Create')}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}
