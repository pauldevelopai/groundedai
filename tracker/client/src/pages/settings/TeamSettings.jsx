import { useState, useEffect } from 'react';
import { apiFetch } from '../../hooks/useApi.js';
import PageHeader from '../../components/PageHeader.jsx';
import TeamMemberForm from './TeamMemberForm.jsx';

export default function TeamSettings() {
  const [members, setMembers] = useState([]);
  const [editing, setEditing] = useState(null); // null, 'new', or member object

  function load() {
    apiFetch('/team-members').then(setMembers).catch(() => setMembers([]));
  }

  useEffect(load, []);

  return (
    <div>
      <PageHeader title="Team Members">
        <button className="btn btn-primary" onClick={() => setEditing('new')}>+ Add Team Member</button>
      </PageHeader>

      <table className="data-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Role</th>
            <th>Holly Access</th>
            <th>Active</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {members.map(m => (
            <tr key={m.id} style={{ opacity: m.is_active ? 1 : 0.5 }}>
              <td style={{ fontWeight: 500 }}>{m.name}</td>
              <td>{m.email}</td>
              <td><span className="stage-badge stage-active">{m.role}</span></td>
              <td>{m.holly_access ? 'Yes' : 'No'}</td>
              <td>{m.is_active ? 'Yes' : 'No'}</td>
              <td><button className="btn btn-secondary btn-small" onClick={() => setEditing(m)}>Edit</button></td>
            </tr>
          ))}
        </tbody>
      </table>

      {editing && (
        <TeamMemberForm
          member={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </div>
  );
}
