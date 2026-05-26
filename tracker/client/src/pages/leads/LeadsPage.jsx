import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSectors } from '../../context/SectorContext.jsx';
import { apiFetch, buildUrl } from '../../hooks/useApi.js';
import PageHeader from '../../components/PageHeader.jsx';
import DataTable from '../../components/DataTable.jsx';
import SectorBadge from '../../components/SectorBadge.jsx';
import AiBadge from '../../components/AiBadge.jsx';
import AgentChatPanel from '../../components/AgentChatPanel.jsx';

const PIPELINE_STAGES = ['pending_review', 'prospect', 'contacted', 'meeting', 'proposal', 'client'];
const STAGE_COLORS = {
  pending_review: '#F59E0B', prospect: '#94A3B8', contacted: '#6366F1', meeting: '#F59E0B', proposal: '#10B981', client: '#059669',
};
const STAGE_LABELS = {
  pending_review: 'Review', prospect: 'Prospect', contacted: 'Contacted', meeting: 'Meeting', proposal: 'Proposal', client: 'Client',
};

export default function LeadsPage() {
  const navigate = useNavigate();
  const { selectedSectorId } = useSectors();
  const [contacts, setContacts] = useState([]);
  const [activeTab, setActiveTab] = useState('pipeline');
  const [stageFilter, setStageFilter] = useState('');
  const [mining, setMining] = useState(false);
  const [mineResult, setMineResult] = useState('');
  const [mineMode, setMineMode] = useState('recent'); // 'recent' or 'deep'
  const [customKeywords, setCustomKeywords] = useState('');

  function load() {
    apiFetch(buildUrl('/contacts', selectedSectorId)).then(data => {
      setContacts(data.filter(c => ['pending_review', 'prospect', 'contacted', 'meeting', 'proposal'].includes(c.pipeline_stage) || c.source === 'email_mining'));
    }).catch(() => setContacts([]));
  }

  useEffect(load, [selectedSectorId]);

  // Check if a mine is running when page loads (in case user navigated away and came back)
  useEffect(() => {
    apiFetch('/background-jobs').then(jobs => {
      const miner = jobs.find(j => j.name === 'lead_miner');
      if (miner?.last_status === 'running') {
        setMining(true);
        setMineResult('⏳ Lead mining is running in the background... Refresh to see new leads.');
        // Poll until done
        const poll = setInterval(async () => {
          try {
            const updated = await apiFetch('/background-jobs');
            const m = updated.find(j => j.name === 'lead_miner');
            if (m?.last_status !== 'running') {
              clearInterval(poll);
              setMining(false);
              if (m?.last_status === 'success') {
                setMineResult(`✅ Done — found ${m.last_items_processed || 0} new lead(s).`);
                load();
              } else {
                setMineResult('❌ Mining finished with error.');
              }
            }
          } catch { /* ignore */ }
        }, 10000);
        return () => clearInterval(poll);
      }
    }).catch(() => {});
  }, []);

  async function runLeadMiner() {
    setMining(true);
    setMineResult('⏳ Lead Miner starting — connecting to Gmail...');
    try {
      await apiFetch('/agent-actions/leads/mine-gmail', {
        method: 'POST',
        body: JSON.stringify({ mode: mineMode, keywords: customKeywords }),
      });
      setMineResult(mineMode === 'deep'
        ? '⏳ Deep scan started — going through ALL your Gmail history. This will take 2-5 minutes...'
        : '⏳ Scanning recent Gmail for leads... (1-2 minutes)');

      // Poll for completion
      let attempts = 0;
      const maxAttempts = mineMode === 'deep' ? 30 : 15;
      const pollInterval = setInterval(async () => {
        attempts++;
        try {
          const jobData = await apiFetch('/background-jobs');
          const minerJob = jobData.find(j => j.name === 'lead_miner');
          if (minerJob?.last_run_at && (Date.now() - new Date(minerJob.last_run_at).getTime()) < 300000) {
            if (minerJob.last_status === 'success') {
              clearInterval(pollInterval);
              const items = minerJob.last_items_processed || 0;
              setMineResult(items > 0
                ? `✅ Done — found ${items} new lead${items > 1 ? 's' : ''}. They've been added to the pipeline below.`
                : '✅ Done — no new leads found this time. All contacts in your emails are already known.');
              setMining(false);
              load();
              return;
            } else if (minerJob.last_status === 'error') {
              clearInterval(pollInterval);
              setMineResult('❌ Mining failed: ' + (minerJob.last_error || 'Unknown error'));
              setMining(false);
              return;
            }
          }
        } catch (e) { /* ignore poll errors */ }

        if (attempts <= 3) setMineResult('⏳ Searching Gmail... (checking journalism, media, legal, AI conversations)');
        else if (attempts <= 8) setMineResult(`⏳ Found contacts, asking Claude to classify and score them... (${attempts * 10}s)`);
        else if (attempts <= maxAttempts) setMineResult(`⏳ Claude is analysing depth of relationships and seniority... (${attempts * 10}s)`);
        else {
          clearInterval(pollInterval);
          setMineResult('⏳ Still running in background. Refresh the page in a minute to see results.');
          setMining(false);
        }
      }, 10000);
    } catch (err) {
      setMineResult('❌ Mining failed: ' + err.message);
      setMining(false);
    }
  }

  async function updateStage(contactId, stage) {
    await apiFetch(`/contacts/${contactId}`, {
      method: 'PUT',
      body: JSON.stringify({ pipeline_stage: stage }),
    });
    load();
  }

  const filtered = stageFilter ? contacts.filter(c => c.pipeline_stage === stageFilter) : contacts;

  // Pipeline summary
  const stageCounts = {};
  PIPELINE_STAGES.forEach(s => { stageCounts[s] = contacts.filter(c => c.pipeline_stage === s).length; });

  const columns = [
    { key: 'first_name', label: 'Name', render: row => <span style={{ fontWeight: 500 }}>{row.first_name} {row.last_name}</span> },
    { key: 'organisation_name', label: 'Organisation', render: row => row.organisation_name || '—' },
    { key: 'sector_name', label: 'Sector', render: row => <SectorBadge name={row.sector_name} colour={row.sector_colour} /> },
    { key: 'pipeline_stage', label: 'Stage', render: row => (
      <select value={row.pipeline_stage} onChange={e => { e.stopPropagation(); updateStage(row.id, e.target.value); }}
        style={{ fontSize: 12, padding: '2px 6px', border: '1px solid var(--border-color)', borderRadius: 4, background: STAGE_COLORS[row.pipeline_stage] + '22', color: STAGE_COLORS[row.pipeline_stage] }}>
        {PIPELINE_STAGES.map(s => <option key={s} value={s}>{STAGE_LABELS[s] || s}</option>)}
      </select>
    )},
    { key: 'source', label: 'Source', render: row => (
      <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{row.source === 'email_mining' ? '📧 Email' : row.source || '—'}</span>
    )},
    { key: 'tags', label: 'Tags', render: row => {
      const tags = row.tags || [];
      const warmth = tags.find(t => ['hot', 'warm', 'cold'].includes(t));
      const warmColors = { hot: '#EF4444', warm: '#F59E0B', cold: '#94A3B8' };
      return (
        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
          {warmth && <span style={{ fontSize: 10, fontWeight: 600, color: warmColors[warmth], padding: '1px 5px', borderRadius: 8, background: warmColors[warmth] + '18' }}>{warmth.toUpperCase()}</span>}
          {tags.includes('senior') && <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 8, background: '#6366F122', color: '#6366F1' }}>Senior</span>}
          {tags.includes('high-influence') && <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 8, background: '#10B98122', color: '#10B981' }}>High Influence</span>}
          {tags.includes('deep-relationship') && <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 8, background: '#F59E0B22', color: '#F59E0B' }}>Deep</span>}
        </div>
      );
    }},
    { key: 'last_contacted_at', label: 'Last Contact', render: row => row.last_contacted_at ? new Date(row.last_contacted_at).toLocaleDateString() : '—' },
  ];

  return (
    <div>
      <PageHeader title="Leads">
        <button className="btn btn-primary" onClick={runLeadMiner} disabled={mining}>
          {mining ? 'Mining...' : '🔍 Mine Gmail for Leads'}
        </button>
      </PageHeader>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
        Manage your sales pipeline. Use the Lead Finder AI to discover new prospects from your email, or add leads manually.
      </p>

      {mineResult && (
        <div style={{ marginBottom: 16, padding: 10, background: '#F1F5F9', borderRadius: 6, fontSize: 13 }}>{mineResult}</div>
      )}

      {/* Lead Miner controls */}
      <div className="card" style={{ marginBottom: 20, padding: 20, borderLeft: '4px solid #6366F1' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 15, fontWeight: 600 }}>🔍 Lead Miner</span>
            <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 10, background: '#6366F1', color: 'white' }}>AI Agent</span>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--accent)' }}>{contacts.filter(c => c.source === 'email_mining').length}</div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Mined leads</div>
          </div>
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 14 }}>
          Scans Gmail for people you've corresponded with about journalism, media, legal, AI, and training.
          Claude scores each contact by relationship depth, seniority, and influence.
          Runs automatically Mon & Thu 8am.
        </div>

        {/* Mode toggle */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <button onClick={() => setMineMode('recent')}
            className={`btn btn-small ${mineMode === 'recent' ? 'btn-primary' : 'btn-secondary'}`}>
            Recent (last 90 days)
          </button>
          <button onClick={() => setMineMode('deep')}
            className={`btn btn-small ${mineMode === 'deep' ? 'btn-primary' : 'btn-secondary'}`}>
            Deep Scan (all time)
          </button>
        </div>

        {/* Custom keywords */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            value={customKeywords}
            onChange={e => setCustomKeywords(e.target.value)}
            placeholder="Add keywords to search (e.g. 'foundation', 'newsroom director', 'grant')..."
            style={{ flex: 1, padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: 'var(--radius)', fontSize: 13 }}
          />
          <button className="btn btn-primary" onClick={runLeadMiner} disabled={mining}>
            {mining ? 'Mining...' : '🔍 Mine Now'}
          </button>
        </div>
      </div>

      {/* Pipeline summary bar */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 20, borderRadius: 8, overflow: 'hidden' }}>
        {PIPELINE_STAGES.map(stage => (
          <button key={stage} onClick={() => setStageFilter(stageFilter === stage ? '' : stage)}
            style={{
              flex: stageCounts[stage] || 0.3, padding: '10px 12px', border: 'none', cursor: 'pointer',
              background: stageFilter === stage ? STAGE_COLORS[stage] : STAGE_COLORS[stage] + '33',
              color: stageFilter === stage ? 'white' : STAGE_COLORS[stage],
              fontWeight: 600, fontSize: 12, transition: 'all 0.15s',
            }}>
            {STAGE_LABELS[stage] || stage} ({stageCounts[stage]})
          </button>
        ))}
      </div>

      <div className="tabs">
        <button className={`tab ${activeTab === 'pipeline' ? 'active' : ''}`} onClick={() => setActiveTab('pipeline')}>
          Pipeline ({filtered.length})
        </button>
        <button className={`tab ${activeTab === 'finder' ? 'active' : ''}`} onClick={() => setActiveTab('finder')} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          Lead Finder <AiBadge />
        </button>
      </div>

      {activeTab === 'pipeline' && (
        <DataTable
          columns={columns}
          data={filtered}
          onRowClick={row => navigate(`/contacts/${row.id}`)}
          emptyMessage="No leads yet. Click 'Mine Gmail for Leads' to discover prospects from your email."
        />
      )}

      {activeTab === 'finder' && (
        <AgentChatPanel
          agentType="lead_finder"
          placeholder="Ask about target organisations, draft outreach emails, build campaign strategies..."
          emptyText="Lead Finder — find and engage new clients for Develop AI's training programmes"
        />
      )}
    </div>
  );
}
