import { useState, useEffect } from 'react';
import { apiFetch } from '../../hooks/useApi.js';
import PageHeader from '../../components/PageHeader.jsx';

export default function GmailSettings() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  async function loadStatus() {
    try {
      const data = await apiFetch('/gmail/status');
      setStatus(data);
    } catch {
      setStatus({ connected: false });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadStatus(); }, []);

  async function handleConnect() {
    try {
      const { url } = await apiFetch('/gmail/auth-url');
      window.location.href = url;
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleDisconnect() {
    await apiFetch('/gmail/disconnect', { method: 'POST' });
    loadStatus();
  }

  if (loading) return <div>Loading...</div>;

  return (
    <div>
      <PageHeader title="Gmail Integration" />
      <div className="card" style={{ maxWidth: 500 }}>
        {status?.connected ? (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--success)' }} />
              <span style={{ fontWeight: 600, color: 'var(--success)' }}>Connected</span>
            </div>
            <div style={{ fontSize: 14, marginBottom: 8 }}>
              <strong>Account:</strong> {status.email}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
              Connected on {new Date(status.connectedAt).toLocaleString()}
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
              Outreach emails will be sent from this Gmail account.
            </p>
            <button className="btn btn-danger btn-small" onClick={handleDisconnect}>Disconnect</button>
          </div>
        ) : (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--text-secondary)' }} />
              <span style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>Not Connected</span>
            </div>
            <p style={{ fontSize: 14, marginBottom: 16 }}>
              Connect your Gmail account to send outreach emails directly from Holly.
            </p>
            <button className="btn btn-primary" onClick={handleConnect}>Connect Gmail</button>
          </div>
        )}
      </div>
    </div>
  );
}
