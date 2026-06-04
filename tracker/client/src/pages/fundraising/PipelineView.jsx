import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSectors } from '../../context/SectorContext.jsx';
import { apiFetch, buildUrl } from '../../hooks/useApi.js';
import PageHeader from '../../components/PageHeader.jsx';
import OpportunityForm from './OpportunityForm.jsx';

const STAGES = [
  { key: 'identified', label: 'Identified', colour: '#94A3B8' },
  { key: 'qualified', label: 'Qualified', colour: '#60A5FA' },
  { key: 'applying', label: 'Applying', colour: '#F59E0B' },
  { key: 'submitted', label: 'Submitted', colour: '#8B5CF6' },
  { key: 'decision', label: 'Decision', colour: '#EC4899' },
  { key: 'won', label: 'Won', colour: '#10B981' },
  { key: 'lost', label: 'Lost', colour: '#EF4444' },
];

export default function PipelineView() {
  const navigate = useNavigate();
  const { selectedSectorId } = useSectors();
  const [opportunities, setOpportunities] = useState([]);
  const [stats, setStats] = useState({});
  const [showForm, setShowForm] = useState(false);
  const [filterPriority, setFilterPriority] = useState('');

  function load() {
    apiFetch(buildUrl('/funding-opportunities', selectedSectorId)).then(setOpportunities).catch(() => setOpportunities([]));
    apiFetch(buildUrl('/funding-opportunities/pipeline-stats', selectedSectorId)).then(setStats).catch(() => setStats({}));
  }
  useEffect(load, [selectedSectorId]);

  async function moveStage(oppId, newStage) {
    await apiFetch(`/funding-opportunities/${oppId}`, {
      method: 'PUT', body: JSON.stringify({ pipeline_stage: newStage })
    });
    load();
  }

  const filtered = filterPriority ? opportunities.filter(o => o.priority === filterPriority) : opportunities;
  const byStage = {};
  STAGES.forEach(s => { byStage[s.key] = filtered.filter(o => o.pipeline_stage === s.key); });

  const formatCurrency = (v) => v ? `£${Number(v).toLocaleString()}` : '—';
  const daysUntil = (d) => {
    if (!d) return null;
    const diff = Math.ceil((new Date(d) - new Date()) / (1000 * 60 * 60 * 24));
    return diff;
  };

  return (
    <div>
      <PageHeader title="Leads & Opportunities">
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ Add Opportunity</button>
      </PageHeader>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
        {[
          { label: 'Pipeline Value', value: formatCurrency(stats.pipeline_value) },
          { label: 'Won Total', value: formatCurrency(stats.won_total), colour: 'var(--success)' },
          { label: 'Active', value: stats.active_count || 0 },
          { label: 'Pending Decisions', value: stats.pending_decisions || 0 },
          { label: 'Deadlines (30d)', value: stats.upcoming_deadlines || 0, colour: stats.upcoming_deadlines > 0 ? 'var(--danger)' : undefined },
        ].map((s, i) => (
          <div key={i} className="card" style={{ flex: 1, padding: '12px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: s.colour || 'var(--text-primary)' }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)} style={{ padding: '6px 10px', borderRadius: 'var(--radius)', border: '1px solid var(--border-color)', fontSize: 13 }}>
          <option value="">All Priorities</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </div>

      {/* Kanban Board */}
      <div className="pipeline-board">
        {STAGES.map(stage => (
          <div key={stage.key} className="pipeline-column">
            <div className="pipeline-column-header" style={{ borderTopColor: stage.colour }}>
              <span>{stage.label}</span>
              <span className="pipeline-count">{byStage[stage.key].length}</span>
            </div>
            <div className="pipeline-cards">
              {byStage[stage.key].map(opp => {
                const days = daysUntil(opp.deadline);
                return (
                  <div key={opp.id} className="pipeline-card" onClick={() => navigate(`/fundraising/opportunities/${opp.id}`)}>
                    <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{opp.title}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>{opp.funder_name || 'No funder'}</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                      <span className={`priority-badge priority-${opp.priority}`}>{opp.priority}</span>
                      {opp.sector_name && <span style={{ fontSize: 11, background: opp.sector_colour ? opp.sector_colour + '20' : '#F3F4F6', color: opp.sector_colour || '#6B7280', padding: '1px 6px', borderRadius: 4 }}>{opp.sector_name}</span>}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                      <span style={{ fontWeight: 500 }}>{opp.amount_max ? formatCurrency(opp.amount_max) : '—'}</span>
                      {days !== null && (
                        <span style={{ color: days < 7 ? 'var(--danger)' : days < 30 ? '#F59E0B' : 'var(--text-secondary)' }}>
                          {days < 0 ? 'Overdue' : `${days}d`}
                        </span>
                      )}
                    </div>
                    {/* Stage move buttons */}
                    <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                      {stage.key !== 'won' && stage.key !== 'lost' && (
                        <>
                          {STAGES.indexOf(stage) > 0 && (
                            <button className="pipe-move-btn" onClick={e => { e.stopPropagation(); moveStage(opp.id, STAGES[STAGES.indexOf(stage) - 1].key); }}>←</button>
                          )}
                          {STAGES.indexOf(stage) < STAGES.length - 2 && (
                            <button className="pipe-move-btn" onClick={e => { e.stopPropagation(); moveStage(opp.id, STAGES[STAGES.indexOf(stage) + 1].key); }}>→</button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {showForm && <OpportunityForm onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load(); }} />}
    </div>
  );
}
