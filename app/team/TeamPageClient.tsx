// TeamPageClient — admin team management UI.
//
// Shows existing newsroom users with role + WhatsApp, plus an Invite form
// (email + WA number + role). On invite, the temp password is shown once;
// the admin shares it with the invitee out-of-band until WhatsApp delivery
// lands post-pilot.

'use client';

import { useState, FormEvent } from 'react';
import Link from 'next/link';

type User = {
  id: string;
  email: string;
  role: 'builder' | 'user' | 'admin';
  whatsapp_number: string | null;
  display_name: string | null;
  last_login_at: string | null;
  created_at: string;
};

const E164_HINT = 'E.164 format, e.g. +260977123456';

export default function TeamPageClient({
  initialUsers,
  newsroomName,
}: {
  initialUsers: User[];
  newsroomName: string;
}) {
  const [users, setUsers] = useState(initialUsers);
  const [showInvite, setShowInvite] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastInvited, setLastInvited] = useState<{ user: User; tempPassword: string } | null>(null);

  const [email, setEmail] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<'user' | 'builder' | 'admin'>('user');

  function resetForm() {
    setEmail('');
    setWhatsapp('');
    setDisplayName('');
    setRole('user');
  }

  async function onInvite(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          whatsapp_number: whatsapp.trim() || null,
          display_name: displayName.trim() || null,
          role,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Invite failed');
        return;
      }
      setUsers((us) => [...us, data.user]);
      setLastInvited({ user: data.user, tempPassword: data.temp_password });
      resetForm();
      setShowInvite(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main style={{ padding: 24, fontFamily: 'system-ui, sans-serif', maxWidth: 800, margin: '0 auto' }}>
      <header style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
        <h1 style={{ margin: 0 }}>Team</h1>
        <span>
          <Link href="/builder" style={{ fontSize: 13, color: '#0066cc' }}>← Back to Builder</Link>
          <Link href="/guide" style={{ fontSize: 13, color: '#0066cc', marginLeft: 12 }}>Help →</Link>
        </span>
      </header>
      <p style={{ color: '#666', fontSize: 14, marginTop: 0 }}>{newsroomName}</p>

      {lastInvited && (
        <div style={{ background: '#e8f6e8', border: '1px solid #98c898', borderRadius: 6, padding: 14, marginBottom: 20 }}>
          <h3 style={{ margin: '0 0 6px', fontSize: 14, color: '#1a5d1a' }}>
            Invited {lastInvited.user.display_name || lastInvited.user.email}
          </h3>
          <p style={{ margin: '0 0 8px', fontSize: 13, color: '#1a5d1a' }}>
            Share these credentials with them — this is the only time the temporary password is shown.
          </p>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
            <li>Email: <code>{lastInvited.user.email}</code></li>
            {lastInvited.user.whatsapp_number && <li>WhatsApp: <code>{lastInvited.user.whatsapp_number}</code></li>}
            <li>Temporary password: <code style={{ background: 'white', padding: '2px 6px', borderRadius: 3 }}>{lastInvited.tempPassword}</code></li>
            <li>Sign-in: <code>/login</code></li>
          </ul>
          <button
            onClick={() => setLastInvited(null)}
            style={{ marginTop: 10, padding: '4px 10px', background: 'transparent', border: '1px solid #98c898', borderRadius: 4, fontSize: 12, color: '#1a5d1a', cursor: 'pointer' }}
          >
            Dismiss
          </button>
        </div>
      )}

      <section style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
          <h2 style={{ fontSize: 17, margin: 0 }}>Members ({users.length})</h2>
          <button
            onClick={() => setShowInvite((s) => !s)}
            style={{ padding: '8px 14px', background: '#111', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}
          >
            {showInvite ? 'Cancel' : '+ Invite member'}
          </button>
        </div>

        {showInvite && (
          <form onSubmit={onInvite} style={{ background: '#fafafa', border: '1px solid #ddd', borderRadius: 6, padding: 16, marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
              <span style={{ color: '#444' }}>Display name (optional)</span>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g. Tendai Mukoyi"
                style={{ padding: 8, fontSize: 14, border: '1px solid #ccc', borderRadius: 4 }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
              <span style={{ color: '#444' }}>Email</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="reporter@newsroom.org"
                style={{ padding: 8, fontSize: 14, border: '1px solid #ccc', borderRadius: 4 }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
              <span style={{ color: '#444' }}>WhatsApp number (optional)</span>
              <input
                type="tel"
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                placeholder="+260977123456"
                style={{ padding: 8, fontSize: 14, border: '1px solid #ccc', borderRadius: 4, fontFamily: 'inherit' }}
              />
              <span style={{ color: '#888', fontSize: 11 }}>{E164_HINT}</span>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
              <span style={{ color: '#444' }}>Role</span>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as 'user' | 'builder' | 'admin')}
                style={{ padding: 8, fontSize: 14, border: '1px solid #ccc', borderRadius: 4, background: 'white' }}
              >
                <option value="user">User — runs workflows assigned to them</option>
                <option value="builder">Builder — composes workflows</option>
                <option value="admin">Admin — full newsroom access + invites</option>
              </select>
            </label>
            {error && <p style={{ color: '#b00', fontSize: 13, margin: 0 }}>{error}</p>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="submit"
                disabled={submitting || !email}
                style={{ padding: '8px 14px', background: '#111', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, cursor: 'pointer', opacity: submitting ? 0.5 : 1 }}
              >
                {submitting ? 'Inviting…' : 'Invite'}
              </button>
              <button
                type="button"
                onClick={() => { setShowInvite(false); resetForm(); setError(null); }}
                style={{ padding: '8px 14px', background: 'transparent', border: '1px solid #ccc', borderRadius: 6, fontSize: 13, cursor: 'pointer', color: '#666' }}
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {users.map((u) => (
            <li key={u.id} style={{ border: '1px solid #eee', borderRadius: 6, padding: 12, marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 500 }}>
                  {u.display_name || u.email}
                  <span style={{ color: '#999', fontWeight: 400, fontSize: 12, marginLeft: 8 }}>· {u.role}</span>
                </div>
                <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>
                  {u.email}
                  {u.whatsapp_number && <span style={{ marginLeft: 12 }}>📱 {u.whatsapp_number}</span>}
                </div>
              </div>
              <span style={{ fontSize: 11, color: '#999' }}>
                {u.last_login_at ? `last seen ${new Date(u.last_login_at).toLocaleDateString()}` : 'never signed in'}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
