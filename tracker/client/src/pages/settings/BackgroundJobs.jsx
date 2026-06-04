import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../../hooks/useApi.js';
import PageHeader from '../../components/PageHeader.jsx';
import AiBadge from '../../components/AiBadge.jsx';
import Modal from '../../components/Modal.jsx';

const CRON_LABELS = {
  '0 */6 * * *': 'Every 6 hours',
  '0 6 * * *': 'Daily at 6am',
  '0 5 * * 1': 'Mondays at 5am',
  '0 7 * * *': 'Daily at 7am',
  '0 20 * * 0': 'Sundays at 8pm',
  '0 5,17 * * *': 'Twice daily (5am & 5pm)',
  '0 4 * * *': 'Daily at 4am',
  '0 3 * * 0': 'Sundays at 3am',
};

const STATUS_STYLES = {
  completed: { background: '#D1FAE5', color: '#065F46' },
  failed: { background: '#FEE2E2', color: '#991B1B' },
  running: { background: '#DBEAFE', color: '#1E40AF' },
};

const INTERACTIVE_AGENTS = [
  {
    name: 'Curriculum Builder',
    description: 'Design courses, generate module content, research what to teach. Context-aware of your courses and sector intelligence.',
    link: '/agents/curriculum',
    actions: ['Generate Course Structure', 'Generate Module Content', 'Research Sector Trends'],
  },
  {
    name: 'Lead Finder & Outreach',
    description: 'Identify target clients, craft outreach strategies, draft personalised email and LinkedIn pitches.',
    link: '/agents/leads',
    actions: ['Suggest Targets', 'Draft Email', 'Draft LinkedIn', 'Build Strategy'],
  },
  {
    name: 'Implementation Coach',
    description: 'Monitor post-training implementation, generate follow-up tasks, nudge stalled learners, assess cohort progress.',
    link: '/agents/coach',
    actions: ['Generate Follow-up Tasks', 'Send Nudge', 'Cohort Progress Report'],
  },
];

function renderMarkdown(text) {
  if (!text) return null;
  return text.split('\n').map((line, i) => {
    if (line.startsWith('## ')) return <h4 key={i} style={{ fontSize: 14, fontWeight: 600, marginTop: 12, marginBottom: 4 }}>{line.slice(3)}</h4>;
    if (line.startsWith('- ')) return <div key={i} style={{ paddingLeft: 12, marginBottom: 2, fontSize: 13 }}><span style={{ color: 'var(--ai-purple)' }}>•</span> {line.slice(2)}</div>;
    if (line === '---') return <hr key={i} style={{ margin: '12px 0', borderColor: 'var(--border-color)' }} />;
    if (line.trim() === '') return <div key={i} style={{ height: 4 }} />;
    return <div key={i} style={{ fontSize: 13, lineHeight: 1.5 }}>{line}</div>;
  });
}

export default function BackgroundJobs() {
  const [jobs, setJobs] = useState([]);
  const [selectedJob, setSelectedJob] = useState(null);
  const [runs, setRuns] = useState([]);
  const [selectedRun, setSelectedRun] = useState(null);
  const [running, setRunning] = useState(new Set());

  function load() {
    apiFetch('/background-jobs').then(setJobs).catch(() => setJobs([]));
  }

  useEffect(load, []);

  async function toggleJob(job) {
    await apiFetch(`/background-jobs/${job.id}`, {
      method: 'PUT', body: JSON.stringify({ is_enabled: !job.is_enabled })
    });
    load();
  }

  async function runNow(job) {
    setRunning(prev => new Set(prev).add(job.id));
    await apiFetch(`/background-jobs/${job.id}/run`, { method: 'POST' });
    const poll = setInterval(async () => {
      const updated = await apiFetch('/background-jobs');
      setJobs(updated);
      const j = updated.find(u => u.id === job.id);
      if (j && j.last_status !== 'running') {
        clearInterval(poll);
        setRunning(prev => { const s = new Set(prev); s.delete(job.id); return s; });
      }
    }, 3000);
    setTimeout(() => {
      clearInterval(poll);
      setRunning(prev => { const s = new Set(prev); s.delete(job.id); return s; });
      load();
    }, 120000);
  }

  async function viewRuns(job) {
    setSelectedJob(job);
    const r = await apiFetch(`/background-jobs/${job.id}/runs`);
    setRuns(r);
  }

  async function viewRun(run) {
    const r = await apiFetch(`/background-jobs/runs/${run.id}`);
    setSelectedRun(r);
  }

  return (
    <div>
      <PageHeader title="Agents">
        <AiBadge variant="powered" />
      </PageHeader>

      {/* Interactive Agents */}
      <div style={{ marginBottom: 32 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Interactive Agents</h3>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
          AI assistants you work with directly. Each has a chat interface and action buttons.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          {INTERACTIVE_AGENTS.map(agent => (
            <Link key={agent.link} to={agent.link} style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="card" style={{
                padding: 16, height: '100%', transition: 'border-color 0.15s',
                borderLeft: '3px solid var(--accent)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 10, background: 'var(--accent)', color: 'white' }}>AI</span>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{agent.name}</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 8 }}>{agent.description}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {agent.actions.map(a => (
                    <span key={a} style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: '#F1F5F9', color: 'var(--text-secondary)' }}>{a}</span>
                  ))}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Scheduled Jobs */}
      <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Scheduled Background Jobs</h3>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
        AI jobs that run automatically on schedule — monitoring, generating content, and researching while you're away.
      </p>

      <table className="data-table">
        <thead>
          <tr><th>Job</th><th>Schedule</th><th>Enabled</th><th>Last Run</th><th>Status</th><th>Runs</th><th></th></tr>
        </thead>
        <tbody>
          {jobs.map(job => (
            <tr key={job.id}>
              <td>
                <div style={{ fontWeight: 500 }}>{job.name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{job.description}</div>
              </td>
              <td style={{ fontSize: 13 }}>{CRON_LABELS[job.cron_expression] || job.cron_expression}</td>
              <td>
                <button
                  onClick={() => toggleJob(job)}
                  style={{
                    padding: '4px 12px', borderRadius: 12, border: 'none', fontSize: 12, fontWeight: 500, cursor: 'pointer',
                    background: job.is_enabled ? '#D1FAE5' : '#F3F4F6',
                    color: job.is_enabled ? '#065F46' : '#6B7280',
                  }}
                >
                  {job.is_enabled ? 'On' : 'Off'}
                </button>
              </td>
              <td style={{ fontSize: 13 }}>{job.last_run_at ? new Date(job.last_run_at).toLocaleString() : '—'}</td>
              <td>
                {job.last_status ? (
                  <span style={{ ...STATUS_STYLES[job.last_status], padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 500 }}>
                    {job.last_status}
                  </span>
                ) : '—'}
              </td>
              <td>
                <button className="btn btn-secondary btn-small" onClick={() => viewRuns(job)}>{job.total_runs || 0}</button>
              </td>
              <td>
                <button
                  className="btn btn-primary btn-small"
                  onClick={() => runNow(job)}
                  disabled={running.has(job.id)}
                  style={{ background: 'var(--ai-purple)', borderColor: 'var(--ai-purple)' }}
                >
                  {running.has(job.id) ? 'Running...' : 'Run Now'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Run History Modal */}
      {selectedJob && !selectedRun && (
        <Modal title={`Run History: ${selectedJob.name.replace(/_/g, ' ')}`} onClose={() => { setSelectedJob(null); setRuns([]); }}>
          {runs.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)' }}>No runs yet. Click "Run Now" to trigger this job.</p>
          ) : (
            <table className="data-table" style={{ fontSize: 13 }}>
              <thead><tr><th>Started</th><th>Status</th><th>Items</th><th>Duration</th><th></th></tr></thead>
              <tbody>
                {runs.map(r => (
                  <tr key={r.id}>
                    <td>{new Date(r.started_at).toLocaleString()}</td>
                    <td><span style={{ ...STATUS_STYLES[r.status], padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 500 }}>{r.status}</span></td>
                    <td>{r.items_processed || 0}</td>
                    <td>{r.completed_at ? `${Math.round((new Date(r.completed_at) - new Date(r.started_at)) / 1000)}s` : '—'}</td>
                    <td><button className="btn btn-secondary btn-small" onClick={() => viewRun(r)}>View</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Modal>
      )}

      {/* Run Detail Modal */}
      {selectedRun && (
        <Modal title="Job Run Result" onClose={() => setSelectedRun(null)}>
          <div style={{ display: 'flex', gap: 12, marginBottom: 12, fontSize: 13 }}>
            <span style={{ ...STATUS_STYLES[selectedRun.status], padding: '2px 8px', borderRadius: 4, fontWeight: 500 }}>{selectedRun.status}</span>
            <span>{new Date(selectedRun.started_at).toLocaleString()}</span>
            <span>{selectedRun.items_processed || 0} items</span>
          </div>
          {selectedRun.error && (
            <div className="login-error" style={{ marginBottom: 12 }}>{selectedRun.error}</div>
          )}
          <div style={{ maxHeight: 400, overflowY: 'auto', padding: 12, background: '#F8FAFC', borderRadius: 'var(--radius)', border: '1px solid var(--border-color)' }}>
            {renderMarkdown(selectedRun.result || 'No output')}
          </div>
        </Modal>
      )}
    </div>
  );
}
