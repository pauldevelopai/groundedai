import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useSectors } from '../context/SectorContext.jsx';
import NotificationBell from './NotificationBell.jsx';

const AI_FEATURES = new Set(['/assessments', '/curriculum', '/documents', '/marketing/campaigns', '/marketing/social', '/fundraising', '/agents/curriculum', '/agents/leads', '/agents/coach', '/lawsuits', '/regulation-tracker', '/legal-sources', '/use-cases-admin']);

const navItems = [
  { to: '/', label: 'Dashboard', icon: '~' },
  { to: '/agents', label: 'Agents', icon: '~' },
  { to: '/contacts', label: 'Contacts', icon: '~', group: 'CRM' },
  { to: '/organisations', label: 'Organisations', icon: '~', group: 'CRM' },
  { to: '/programmes', label: 'Cohorts', icon: '~', group: 'CRM' },
  { to: '/assessments', label: 'Assessments', icon: '~', group: 'CRM' },
  { to: '/leads', label: 'Leads', icon: '~', group: 'CRM' },
  { to: '/map', label: 'Map', icon: '~', group: 'CRM' },
  { to: '/training-materials', label: 'Training Materials', icon: '~', group: 'Curriculum' },
  { to: '/course-builder', label: 'Course Builder', icon: '~', group: 'Curriculum' },
  { to: '/documents', label: 'Policies, Frameworks & Security', icon: '~', group: 'Compliance' },
  { to: '/lawsuits', label: 'AI Lawsuit Tracker', icon: '~', group: 'AI Legal' },
  { to: '/regulation-tracker', label: 'AI Regulation Tracker', icon: '~', group: 'AI Legal' },
  { to: '/use-cases-admin', label: 'AI Legal Use Cases', icon: '~', group: 'AI Legal' },
  { to: '/legal-sources', label: 'Legal Sources & Agents', icon: '~', group: 'AI Legal' },
  { to: '/mentoring', label: 'Mentoring', icon: '~', group: 'Delivery' },
  { to: '/marketing/campaigns', label: 'Campaigns', icon: '~', group: 'Outreach' },
  { to: '/marketing/social', label: 'Social Content', icon: '~', group: 'Outreach' },
  { to: '/fundraising', label: 'Pipeline', icon: '~', group: 'Fundraising' },
  { to: '/fundraising/funders', label: 'Funders', icon: '~', group: 'Fundraising' },
  { to: '/newsletter', label: 'Briefings', icon: '~', group: 'AI' },
  { to: '/intelligence', label: 'Intelligence', icon: '~', group: 'AI' },
  { to: '/knowledge', label: 'Knowledge', icon: '~', group: 'AI' },
  { to: '/database', label: 'Database', icon: '~', group: 'Data' },
  { to: '/feedback', label: 'Feedback', icon: '~', group: 'Data' },
];

const adminItems = [
  { to: '/settings/sectors', label: 'Sectors', icon: '~', group: 'Settings' },
  { to: '/settings/team', label: 'Team Members', icon: '~', group: 'Settings' },
  { to: '/settings/gmail', label: 'Gmail', icon: '~', group: 'Settings' },
];

function NavItem({ item }) {
  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      style={({ isActive }) => ({
        display: 'block',
        padding: '8px 20px',
        fontSize: '14px',
        color: isActive ? 'white' : 'var(--sidebar-text)',
        background: isActive ? 'var(--sidebar-active)' : 'transparent',
        textDecoration: 'none',
        transition: 'background 0.15s',
      })}
      onMouseEnter={e => { if (!e.currentTarget.classList.contains('active')) e.currentTarget.style.background = 'var(--sidebar-hover)'; }}
      onMouseLeave={e => { if (!e.currentTarget.classList.contains('active')) e.currentTarget.style.background = 'transparent'; }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {item.label}
        {AI_FEATURES.has(item.to) && (
          <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#A78BFA' }} />
        )}
      </span>
    </NavLink>
  );
}

export default function Sidebar() {
  const { user, logout } = useAuth();
  const { sectors, selectedSectorId, setSelectedSectorId } = useSectors();

  const isAdmin = user?.role === 'admin';
  const allItems = isAdmin ? [...navItems, ...adminItems] : [];

  // Non-admin: minimal sidebar — lawsuits only
  if (!isAdmin) {
    return (
      <aside style={{
        position: 'fixed', top: 0, left: 0,
        width: 'var(--sidebar-width)', height: '100vh',
        background: 'var(--sidebar-bg)', color: 'var(--sidebar-text)',
        display: 'flex', flexDirection: 'column', zIndex: 50,
      }}>
        {/* Logo */}
        <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ fontSize: '22px', fontWeight: '700', letterSpacing: '-0.02em' }}>Holly</div>
          <div style={{ fontSize: '11px', color: 'var(--sidebar-text-muted)', marginTop: '2px' }}>Develop AI</div>
        </div>

        {/* Navigation — members only get compliance tools */}
        <nav style={{ flex: 1, padding: '8px 0', overflowY: 'auto' }}>
          <div style={{ padding: '16px 20px 6px', fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--sidebar-text-muted)' }}>
            Compliance
          </div>
          <NavItem item={{ to: '/lawsuits', label: 'AI Lawsuit Tracker' }} />
        </nav>

        {/* User footer */}
        <div style={{ padding: '16px 20px', borderTop: '1px solid rgba(255,255,255,0.08)', fontSize: '13px' }}>
          <div style={{ fontWeight: '500', marginBottom: 4 }}>{user?.name}</div>
          <div style={{ fontSize: '11px', color: 'var(--sidebar-text-muted)', marginBottom: 8, textTransform: 'capitalize' }}>
            {user?.role || 'Member'}
          </div>
          <button onClick={logout} style={{ background: 'none', border: 'none', color: 'var(--sidebar-text-muted)', fontSize: '13px', padding: 0, cursor: 'pointer' }}>
            Sign out
          </button>
        </div>
      </aside>
    );
  }

  // Admin: full sidebar
  let currentGroup = null;

  return (
    <aside style={{
      position: 'fixed', top: 0, left: 0,
      width: 'var(--sidebar-width)', height: '100vh',
      background: 'var(--sidebar-bg)', color: 'var(--sidebar-text)',
      display: 'flex', flexDirection: 'column', zIndex: 50,
    }}>
      {/* Logo */}
      <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ fontSize: '22px', fontWeight: '700', letterSpacing: '-0.02em' }}>Holly</div>
        <div style={{ fontSize: '11px', color: 'var(--sidebar-text-muted)', marginTop: '2px' }}>Develop AI</div>
      </div>

      {/* Sector Selector */}
      <div style={{ padding: '12px 16px' }}>
        <select
          value={selectedSectorId || ''}
          onChange={e => setSelectedSectorId(e.target.value || null)}
          style={{
            width: '100%', padding: '8px 10px',
            background: 'var(--sidebar-hover)', color: 'var(--sidebar-text)',
            border: '1px solid rgba(255,255,255,0.1)', borderRadius: 'var(--radius)', fontSize: '13px',
          }}
        >
          <option value="">All Sectors</option>
          {sectors.filter(s => s.is_active).map(s => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1, padding: '8px 0', overflowY: 'auto' }}>
        {allItems.map((item) => {
          const showGroup = item.group && item.group !== currentGroup;
          if (showGroup) currentGroup = item.group;
          return (
            <div key={item.to}>
              {showGroup && (
                <div style={{ padding: '16px 20px 6px', fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--sidebar-text-muted)' }}>
                  {item.group}
                </div>
              )}
              <NavItem item={item} />
            </div>
          );
        })}
      </nav>

      {/* User */}
      <div style={{ padding: '16px 20px', borderTop: '1px solid rgba(255,255,255,0.08)', fontSize: '13px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
          <span style={{ fontWeight: '500' }}>{user?.name}</span>
          <NotificationBell />
        </div>
        <button onClick={logout} style={{ background: 'none', border: 'none', color: 'var(--sidebar-text-muted)', fontSize: '13px', padding: 0, cursor: 'pointer' }}>
          Sign out
        </button>
      </div>
    </aside>
  );
}
