import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../hooks/useApi.js';

const TYPE_ICONS = { job_complete: '✓', alert: '!', digest: '◈', reminder: '↻' };
const TYPE_COLORS = { job_complete: '#10B981', alert: '#F59E0B', digest: '#7C3AED', reminder: '#3B82F6' };

function timeAgo(date) {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export default function NotificationBell() {
  const [unread, setUnread] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();

  function loadCount() {
    apiFetch('/notifications/unread-count').then(r => setUnread(r.count)).catch(() => {});
  }

  useEffect(() => {
    loadCount();
    const interval = setInterval(loadCount, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  async function toggle() {
    if (!open) {
      const items = await apiFetch('/notifications');
      setNotifications(items);
    }
    setOpen(!open);
  }

  async function markAllRead() {
    await apiFetch('/notifications/read-all', { method: 'PUT' });
    setUnread(0);
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
  }

  async function clickNotification(n) {
    if (!n.is_read) {
      await apiFetch(`/notifications/${n.id}/read`, { method: 'PUT' });
      setUnread(prev => Math.max(0, prev - 1));
    }
    setOpen(false);
    if (n.link) navigate(n.link);
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={toggle} style={{
        background: 'none', border: 'none', color: 'var(--sidebar-text-muted)', fontSize: 16,
        cursor: 'pointer', position: 'relative', padding: '4px 8px',
      }}>
        ◉
        {unread > 0 && (
          <span style={{
            position: 'absolute', top: -2, right: 0, background: '#EF4444', color: 'white',
            fontSize: 10, fontWeight: 700, borderRadius: 10, padding: '1px 5px', minWidth: 16, textAlign: 'center',
          }}>{unread > 9 ? '9+' : unread}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute', bottom: '100%', left: 0, width: 340, maxHeight: 420,
          background: 'white', border: '1px solid var(--border-color)', borderRadius: 'var(--radius)',
          boxShadow: '0 8px 24px rgba(0,0,0,0.15)', overflow: 'hidden', zIndex: 200,
          marginBottom: 8,
        }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)' }}>Notifications</span>
            {unread > 0 && (
              <button onClick={markAllRead} style={{ background: 'none', border: 'none', color: 'var(--ai-purple)', fontSize: 12, cursor: 'pointer' }}>
                Mark all read
              </button>
            )}
          </div>
          <div style={{ maxHeight: 360, overflowY: 'auto' }}>
            {notifications.length === 0 && (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>No notifications</div>
            )}
            {notifications.map(n => (
              <div
                key={n.id}
                onClick={() => clickNotification(n)}
                style={{
                  padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #F1F5F9',
                  background: n.is_read ? 'white' : '#FAFAFE',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#F8FAFC'}
                onMouseLeave={e => e.currentTarget.style.background = n.is_read ? 'white' : '#FAFAFE'}
              >
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <span style={{
                    width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 700, flexShrink: 0, marginTop: 2,
                    background: `${TYPE_COLORS[n.type] || '#6B7280'}20`, color: TYPE_COLORS[n.type] || '#6B7280',
                  }}>
                    {TYPE_ICONS[n.type] || '•'}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: n.is_read ? 400 : 600, color: 'var(--text-primary)', lineHeight: 1.3 }}>{n.title}</div>
                    {n.message && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2, lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.message.slice(0, 80)}</div>}
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 3 }}>{timeAgo(n.created_at)}</div>
                  </div>
                  {!n.is_read && <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--ai-purple)', flexShrink: 0, marginTop: 6 }} />}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
