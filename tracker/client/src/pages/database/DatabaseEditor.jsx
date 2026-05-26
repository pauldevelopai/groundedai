import { useState, useEffect } from 'react';
import { useSectors } from '../../context/SectorContext.jsx';
import { apiFetch, buildUrl } from '../../hooks/useApi.js';
import PageHeader from '../../components/PageHeader.jsx';

const ENTITY_TABS = [
  { key: 'organisations', label: 'Organisations', endpoint: '/organisations', fields: ['name', 'type', 'relationship_type', 'programme_name', 'country', 'city', 'website', 'relationship_stage', 'notes'] },
  { key: 'contacts', label: 'Contacts', endpoint: '/contacts', fields: ['first_name', 'last_name', 'email', 'phone', 'job_title', 'pipeline_stage', 'notes'] },
  { key: 'courses', label: 'Courses', endpoint: '/courses', fields: ['title', 'description', 'delivery_type', 'version', 'status'] },
  { key: 'funders', label: 'Funders', endpoint: '/funders', fields: ['name', 'type', 'website', 'country', 'focus_areas', 'notes'] },
  { key: 'cohorts', label: 'Cohorts', endpoint: '/cohorts', fields: ['name', 'delivery_type', 'status', 'start_date', 'end_date', 'max_participants', 'notes'] },
  { key: 'knowledge', label: 'Knowledge', endpoint: '/knowledge', fields: ['title', 'category', 'content', 'confidence', 'is_verified', 'source_type'] },
];

function EditableCell({ value, onSave }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value || '');

  useEffect(() => setVal(value || ''), [value]);

  if (editing) {
    return (
      <input
        autoFocus
        value={val}
        onChange={e => setVal(e.target.value)}
        onBlur={() => { setEditing(false); if (val !== (value || '')) onSave(val); }}
        onKeyDown={e => { if (e.key === 'Enter') { setEditing(false); if (val !== (value || '')) onSave(val); } if (e.key === 'Escape') { setEditing(false); setVal(value || ''); } }}
        style={{ width: '100%', padding: '4px 6px', fontSize: 13, border: '2px solid var(--accent)', borderRadius: 3, outline: 'none' }}
      />
    );
  }

  return (
    <div
      onClick={() => setEditing(true)}
      style={{ cursor: 'text', padding: '4px 6px', minHeight: 24, fontSize: 13, borderRadius: 3, border: '1px solid transparent' }}
      title="Click to edit"
    >
      {value || <span style={{ color: '#CBD5E1' }}>—</span>}
    </div>
  );
}

export default function DatabaseEditor() {
  const { selectedSectorId } = useSectors();
  const [activeTab, setActiveTab] = useState('organisations');
  const [rows, setRows] = useState([]);
  const [saving, setSaving] = useState({});
  const [message, setMessage] = useState('');

  const tab = ENTITY_TABS.find(t => t.key === activeTab);

  function load() {
    if (!tab) return;
    apiFetch(buildUrl(tab.endpoint, selectedSectorId)).then(setRows).catch(() => setRows([]));
  }

  useEffect(load, [activeTab, selectedSectorId]);

  async function saveField(rowId, field, value) {
    setSaving(prev => ({ ...prev, [rowId + field]: true }));
    try {
      await apiFetch(`${tab.endpoint}/${rowId}`, {
        method: 'PUT',
        body: JSON.stringify({ [field]: value }),
      });
      setMessage(`Saved ${field}`);
      setTimeout(() => setMessage(''), 2000);
      load(); // Refresh
    } catch (err) {
      setMessage(`Error: ${err.message}`);
    } finally {
      setSaving(prev => ({ ...prev, [rowId + field]: false }));
    }
  }

  async function addRow() {
    try {
      const defaults = {};
      if (activeTab === 'organisations') {
        defaults.name = 'New Organisation';
        defaults.sector_id = selectedSectorId || undefined;
      } else if (activeTab === 'contacts') {
        defaults.first_name = 'New';
        defaults.last_name = 'Contact';
        defaults.sector_id = selectedSectorId || undefined;
      } else if (activeTab === 'courses') {
        defaults.title = 'New Course';
        defaults.sector_id = selectedSectorId || undefined;
      } else if (activeTab === 'funders') {
        defaults.name = 'New Funder';
      } else if (activeTab === 'cohorts') {
        defaults.name = 'New Cohort';
        defaults.sector_id = selectedSectorId || undefined;
      }
      await apiFetch(tab.endpoint, { method: 'POST', body: JSON.stringify(defaults) });
      load();
      setMessage('Row added');
      setTimeout(() => setMessage(''), 2000);
    } catch (err) {
      setMessage(`Error: ${err.message}`);
    }
  }

  async function deleteRow(id) {
    if (!confirm('Delete this row?')) return;
    try {
      await apiFetch(`${tab.endpoint}/${id}`, { method: 'DELETE' });
      load();
    } catch (err) {
      setMessage(`Error: ${err.message}`);
    }
  }

  return (
    <div>
      <PageHeader title="Database">
        <button className="btn btn-primary btn-small" onClick={addRow}>+ Add Row</button>
      </PageHeader>

      {message && (
        <div style={{ padding: '6px 12px', marginBottom: 12, borderRadius: 'var(--radius)', fontSize: 13,
          background: message.startsWith('Error') ? '#FEF2F2' : '#F0FDF4',
          color: message.startsWith('Error') ? 'var(--danger)' : 'var(--success)' }}>
          {message}
        </div>
      )}

      <div className="tabs">
        {ENTITY_TABS.map(t => (
          <button key={t.key} className={`tab ${activeTab === t.key ? 'active' : ''}`} onClick={() => setActiveTab(t.key)}>
            {t.label} ({rows.length === 0 || activeTab !== t.key ? '...' : rows.length})
          </button>
        ))}
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table className="data-table">
          <thead>
            <tr>
              {tab?.fields.map(f => (
                <th key={f} style={{ fontSize: 11, textTransform: 'uppercase' }}>{f.replace(/_/g, ' ')}</th>
              ))}
              <th style={{ width: 40 }}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.id}>
                {tab?.fields.map(f => (
                  <td key={f} style={{ padding: 2 }}>
                    <EditableCell
                      value={row[f]}
                      onSave={val => saveField(row.id, f, val)}
                    />
                  </td>
                ))}
                <td>
                  <button onClick={() => deleteRow(row.id)} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: 14, padding: 4 }} title="Delete">×</button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={tab?.fields.length + 1} style={{ textAlign: 'center', padding: 24, color: 'var(--text-secondary)' }}>No rows. Click "+ Add Row" to create one.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
