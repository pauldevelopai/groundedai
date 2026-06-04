import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { apiFetch } from '../../hooks/useApi.js';
import SectorBadge from '../../components/SectorBadge.jsx';
import Modal from '../../components/Modal.jsx';
import OpportunityForm from './OpportunityForm.jsx';
import SmartInput from '../../components/SmartInput.jsx';
import InlineEditField from '../../components/InlineEditField.jsx';

const STAGE_LABELS = { identified: 'Identified', qualified: 'Qualified', applying: 'Applying', submitted: 'Submitted', decision: 'Decision', won: 'Won', lost: 'Lost' };
const APP_STATUSES = ['drafting', 'internal_review', 'submitted', 'shortlisted', 'awarded', 'rejected'];
const REPORT_TYPES = ['interim', 'final', 'financial', 'impact'];

export default function OpportunityDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [opp, setOpp] = useState(null);
  const [applications, setApplications] = useState([]);
  const [reports, setReports] = useState([]);
  const [activeTab, setActiveTab] = useState('overview');
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [researchLoading, setResearchLoading] = useState(false);
  const [appDrafting, setAppDrafting] = useState(false);
  const [editingApp, setEditingApp] = useState(null);
  const [editingBudget, setEditingBudget] = useState(false);
  const [addingReport, setAddingReport] = useState(false);

  function loadOpp() { apiFetch(`/funding-opportunities/${id}`).then(setOpp).catch(() => navigate('/fundraising')); }
  function loadApps() { apiFetch(`/funding-opportunities/${id}/applications`).then(setApplications).catch(() => setApplications([])); }

  useEffect(() => { loadOpp(); loadApps(); }, [id]);

  async function saveField(field, value) {
    await apiFetch(`/funding-opportunities/${id}`, { method: 'PUT', body: JSON.stringify({ [field]: value }) });
    loadOpp();
  }

  // Load reports for first application
  useEffect(() => {
    if (applications[0]) {
      apiFetch(`/funding-opportunities/${id}/applications/${applications[0].id}/reports`).then(setReports).catch(() => setReports([]));
    }
  }, [applications]);

  const app = applications[0]; // Primary application

  async function handleDelete() {
    await apiFetch(`/funding-opportunities/${id}`, { method: 'DELETE' });
    navigate('/fundraising');
  }

  async function runAiResearch() {
    setResearchLoading(true);
    try {
      const result = await apiFetch(`/funding-opportunities/${id}/ai-research`, { method: 'POST' });
      setOpp(prev => ({ ...prev, ai_research_notes: result.research }));
    } catch (err) { alert(err.message); }
    finally { setResearchLoading(false); }
  }

  async function createApplication() {
    const newApp = await apiFetch(`/funding-opportunities/${id}/applications`, {
      method: 'POST', body: JSON.stringify({ title: opp.title })
    });
    loadApps();
    setActiveTab('application');
  }

  async function aiDraftApplication() {
    if (!app) return;
    setAppDrafting(true);
    try {
      const updated = await apiFetch(`/funding-opportunities/${id}/applications/${app.id}/ai-draft`, { method: 'POST' });
      loadApps();
    } catch (err) { alert(err.message); }
    finally { setAppDrafting(false); }
  }

  async function updateAppContent(content) {
    await apiFetch(`/funding-opportunities/${id}/applications/${app.id}`, {
      method: 'PUT', body: JSON.stringify({ content })
    });
    loadApps();
  }

  async function updateAppStatus(status) {
    const body = { status };
    if (status === 'submitted') body.submitted_at = new Date().toISOString();
    await apiFetch(`/funding-opportunities/${id}/applications/${app.id}`, { method: 'PUT', body: JSON.stringify(body) });
    loadApps();
  }

  async function updateBudget(budget) {
    await apiFetch(`/funding-opportunities/${id}/applications/${app.id}`, {
      method: 'PUT', body: JSON.stringify({ budget_breakdown: budget })
    });
    setEditingBudget(false);
    loadApps();
  }

  async function createReport(data) {
    await apiFetch(`/funding-opportunities/${id}/applications/${app.id}/reports`, {
      method: 'POST', body: JSON.stringify(data)
    });
    setAddingReport(false);
    apiFetch(`/funding-opportunities/${id}/applications/${app.id}/reports`).then(setReports);
  }

  async function aiDraftReport(reportId) {
    await apiFetch(`/funding-opportunities/${id}/applications/${app.id}/reports/${reportId}/ai-draft`, { method: 'POST' });
    apiFetch(`/funding-opportunities/${id}/applications/${app.id}/reports`).then(setReports);
  }

  function renderMarkdown(text) {
    if (!text) return null;
    return text.split('\n').map((line, i) => {
      if (line.startsWith('## ')) return <h3 key={i} style={{ fontSize: 16, fontWeight: 600, marginTop: 18, marginBottom: 6 }}>{line.slice(3)}</h3>;
      if (line.startsWith('### ')) return <h4 key={i} style={{ fontSize: 14, fontWeight: 600, marginTop: 14, marginBottom: 4 }}>{line.slice(4)}</h4>;
      if (line.startsWith('- ') || line.startsWith('* ')) return <div key={i} style={{ paddingLeft: 14, marginBottom: 3, fontSize: 14 }}><span style={{ color: 'var(--accent)', marginRight: 6 }}>•</span>{line.slice(2)}</div>;
      if (line.trim() === '') return <div key={i} style={{ height: 6 }} />;
      return <p key={i} style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 3 }}>{line}</p>;
    });
  }

  if (!opp) return null;

  const formatCurrency = v => v ? `£${Number(v).toLocaleString()}` : '—';
  const isAwarded = app?.status === 'awarded';

  return (
    <div>
      <Link to="/fundraising" className="back-link">← Pipeline</Link>
      <div className="detail-header">
        <h1>{opp.title}</h1>
        {opp.sector_name && <SectorBadge name={opp.sector_name} colour={opp.sector_colour} />}
        <span className={`stage-badge pipe-${opp.pipeline_stage}`}>{STAGE_LABELS[opp.pipeline_stage]}</span>
        <span className={`priority-badge priority-${opp.priority}`}>{opp.priority}</span>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 16 }}>
          <button className="btn btn-primary btn-small" onClick={runAiResearch} disabled={researchLoading}>
            {researchLoading ? 'Researching...' : 'AI Research'}
          </button>
          <button className="btn btn-secondary btn-small" onClick={() => setEditing(true)}>Edit</button>
          {user?.role === 'admin' && <button className="btn btn-danger btn-small" onClick={() => setDeleting(true)}>Delete</button>}
        </div>
        <div className="detail-grid">
          <div className="detail-field"><div className="detail-field-label">Funder</div><div className="detail-field-value">{opp.funder_name ? <Link to={`/fundraising/funders/${opp.funder_id}`}>{opp.funder_name}</Link> : '—'}</div></div>
          <InlineEditField
            label="Pipeline Stage"
            value={opp.pipeline_stage}
            onSave={v => saveField('pipeline_stage', v)}
            type="select"
            options={Object.entries(STAGE_LABELS).map(([v, l]) => ({ value: v, label: l }))}
            displayValue={<span className={`stage-badge pipe-${opp.pipeline_stage}`}>{STAGE_LABELS[opp.pipeline_stage]}</span>}
          />
          <InlineEditField
            label="Amount Min"
            value={opp.amount_min}
            onSave={v => saveField('amount_min', v)}
            type="number"
            placeholder="e.g. 5000"
            displayValue={opp.amount_min ? formatCurrency(opp.amount_min) : null}
          />
          <InlineEditField
            label="Amount Max"
            value={opp.amount_max}
            onSave={v => saveField('amount_max', v)}
            type="number"
            placeholder="e.g. 50000"
            displayValue={opp.amount_max ? formatCurrency(opp.amount_max) : null}
          />
          <InlineEditField
            label="Deadline"
            value={opp.deadline ? opp.deadline.slice(0, 10) : ''}
            onSave={v => saveField('deadline', v)}
            type="date"
            displayValue={opp.deadline ? new Date(opp.deadline).toLocaleDateString() : null}
          />
          <div className="detail-field"><div className="detail-field-label">Match Funding</div><div className="detail-field-value">{opp.match_funding_required ? `Yes — ${formatCurrency(opp.match_funding_amount)}` : 'No'}</div></div>
          <InlineEditField
            label="Funding Call URL"
            value={opp.url}
            onSave={v => saveField('url', v)}
            type="url"
            placeholder="https://..."
            displayValue={opp.url ? <a href={opp.url} target="_blank" rel="noopener" style={{ fontSize: 13 }}>View funding call →</a> : null}
          />
        </div>
        <InlineEditField
          label="Description"
          value={opp.description}
          onSave={v => saveField('description', v)}
          type="textarea"
          placeholder="Add a description of this funding opportunity..."
        />
      </div>

      {/* AI Research Notes */}
      {opp.ai_research_notes && (
        <div className="card" style={{ marginBottom: 24, borderLeft: '4px solid var(--accent)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600 }}>AI Research</h3>
          </div>
          {renderMarkdown(opp.ai_research_notes)}
        </div>
      )}

      {/* Tabs */}
      <div className="tabs">
        <button className={`tab ${activeTab === 'overview' ? 'active' : ''}`} onClick={() => setActiveTab('overview')}>Overview</button>
        <button className={`tab ${activeTab === 'application' ? 'active' : ''}`} onClick={() => setActiveTab('application')}>
          Application {app ? `(${app.status})` : ''}
        </button>
        {isAwarded && (
          <button className={`tab ${activeTab === 'reports' ? 'active' : ''}`} onClick={() => setActiveTab('reports')}>
            Reports ({reports.length})
          </button>
        )}
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="card" style={{ padding: 24 }}>
          {opp.eligibility_notes && <div><h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Eligibility</h4><p style={{ fontSize: 14 }}>{opp.eligibility_notes}</p></div>}
          {!opp.eligibility_notes && !opp.description && <p style={{ color: 'var(--text-secondary)' }}>No additional details. Use AI Research to learn more about this opportunity.</p>}
        </div>
      )}

      {/* Application Tab */}
      {activeTab === 'application' && (
        <div>
          {!app ? (
            <div className="empty-state">
              <h3>No application started</h3>
              <button className="btn btn-primary" onClick={createApplication} style={{ marginTop: 12 }}>Start Application</button>
            </div>
          ) : (
            <div>
              {/* Status bar */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 16, alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Status:</span>
                {APP_STATUSES.map(s => (
                  <button key={s} className={`btn btn-small ${app.status === s ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => updateAppStatus(s)} style={{ fontSize: 12 }}>
                    {s.replace('_', ' ').replace(/^\w/, c => c.toUpperCase())}
                  </button>
                ))}
              </div>

              {/* AI Draft */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                <button className="btn btn-primary btn-small" onClick={aiDraftApplication} disabled={appDrafting}>
                  {appDrafting ? 'AI Drafting...' : 'AI Draft Application'}
                </button>
              </div>

              {/* Content editor */}
              <div className="card" style={{ marginBottom: 16 }}>
                <AppContentEditor content={app.content || ''} onSave={updateAppContent} />
              </div>

              {/* Budget Breakdown */}
              <div className="card" style={{ padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <h4 style={{ fontSize: 14, fontWeight: 600 }}>Budget Breakdown</h4>
                  <button className="btn btn-secondary btn-small" onClick={() => setEditingBudget(true)}>Edit Budget</button>
                </div>
                {(app.budget_breakdown || []).length === 0 ? (
                  <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>No budget items. Click Edit Budget to add.</p>
                ) : (
                  <table className="data-table">
                    <thead><tr><th>Item</th><th>Amount</th><th>Notes</th></tr></thead>
                    <tbody>
                      {(app.budget_breakdown || []).map((b, i) => (
                        <tr key={i}><td>{b.item}</td><td>£{Number(b.amount || 0).toLocaleString()}</td><td style={{ fontSize: 13 }}>{b.notes || ''}</td></tr>
                      ))}
                      <tr style={{ fontWeight: 600 }}>
                        <td>Total</td>
                        <td>£{(app.budget_breakdown || []).reduce((s, b) => s + Number(b.amount || 0), 0).toLocaleString()}</td>
                        <td></td>
                      </tr>
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Reports Tab */}
      {activeTab === 'reports' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <button className="btn btn-primary btn-small" onClick={() => setAddingReport(true)}>+ Add Report</button>
          </div>
          {reports.length === 0 ? (
            <div className="empty-state"><h3>No reports yet.</h3></div>
          ) : (
            reports.map(r => (
              <div key={r.id} className="card" style={{ marginBottom: 8, padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{r.title}</div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                      <span className={`stage-badge report-${r.type}`}>{r.type}</span>
                      <span className={`stage-badge status-${r.status}`}>{r.status}</span>
                      {r.due_date && <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Due: {new Date(r.due_date).toLocaleDateString()}</span>}
                    </div>
                    {r.content && <div style={{ marginTop: 8, fontSize: 13, color: 'var(--text-secondary)' }}>{r.content.slice(0, 200)}...</div>}
                  </div>
                  <button className="btn btn-secondary btn-small" onClick={() => aiDraftReport(r.id)}>AI Draft</button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Modals */}
      {editing && <OpportunityForm opportunity={opp} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); loadOpp(); }} />}
      {deleting && (
        <Modal title="Delete Opportunity" onClose={() => setDeleting(false)}>
          <p>Delete this opportunity and all applications?</p>
          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={() => setDeleting(false)}>Cancel</button>
            <button className="btn btn-danger" onClick={handleDelete}>Delete</button>
          </div>
        </Modal>
      )}
      {editingBudget && <BudgetEditor budget={app?.budget_breakdown || []} onSave={updateBudget} onClose={() => setEditingBudget(false)} />}
      {addingReport && <ReportFormModal onSave={createReport} onClose={() => setAddingReport(false)} />}

      <SmartInput entityType="opportunity" entityId={id} sectorId={opp.sector_id} onUpdated={() => loadOpp()} />
    </div>
  );
}

function AppContentEditor({ content, onSave }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(content);
  useEffect(() => setText(content), [content]);

  function renderMarkdown(t) {
    if (!t) return <p style={{ color: 'var(--text-secondary)' }}>No content yet. Use AI Draft or write manually.</p>;
    return t.split('\n').map((line, i) => {
      if (line.startsWith('## ')) return <h3 key={i} style={{ fontSize: 16, fontWeight: 600, marginTop: 18, marginBottom: 6 }}>{line.slice(3)}</h3>;
      if (line.startsWith('### ')) return <h4 key={i} style={{ fontSize: 14, fontWeight: 600, marginTop: 14, marginBottom: 4 }}>{line.slice(4)}</h4>;
      if (line.startsWith('- ')) return <div key={i} style={{ paddingLeft: 14, marginBottom: 3, fontSize: 14 }}>• {line.slice(2)}</div>;
      if (line.trim() === '') return <div key={i} style={{ height: 6 }} />;
      return <p key={i} style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 3 }}>{line}</p>;
    });
  }

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <h4 style={{ fontSize: 14, fontWeight: 600 }}>Application Content</h4>
        <button className="btn btn-secondary btn-small" onClick={() => { if (editing) { onSave(text); } setEditing(!editing); }}>
          {editing ? 'Save' : 'Edit'}
        </button>
      </div>
      {editing ? (
        <textarea value={text} onChange={e => setText(e.target.value)} rows={20}
          style={{ width: '100%', padding: 16, border: '1px solid var(--border-color)', borderRadius: 'var(--radius)', fontSize: 14, fontFamily: 'monospace', lineHeight: 1.6, resize: 'vertical' }} />
      ) : (
        <div>{renderMarkdown(content)}</div>
      )}
    </div>
  );
}

function BudgetEditor({ budget, onSave, onClose }) {
  const [items, setItems] = useState(budget.length > 0 ? budget : [{ item: '', amount: '', notes: '' }]);

  function update(i, field, value) {
    setItems(prev => prev.map((row, idx) => idx === i ? { ...row, [field]: value } : row));
  }
  function addRow() { setItems(prev => [...prev, { item: '', amount: '', notes: '' }]); }
  function removeRow(i) { setItems(prev => prev.filter((_, idx) => idx !== i)); }

  return (
    <Modal title="Edit Budget" onClose={onClose}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr><th style={{ textAlign: 'left', padding: 6, fontSize: 13 }}>Item</th><th style={{ textAlign: 'left', padding: 6, fontSize: 13 }}>Amount (£)</th><th style={{ textAlign: 'left', padding: 6, fontSize: 13 }}>Notes</th><th></th></tr></thead>
        <tbody>
          {items.map((row, i) => (
            <tr key={i}>
              <td style={{ padding: 4 }}><input value={row.item} onChange={e => update(i, 'item', e.target.value)} style={{ width: '100%' }} /></td>
              <td style={{ padding: 4 }}><input type="number" value={row.amount} onChange={e => update(i, 'amount', e.target.value)} style={{ width: 100 }} /></td>
              <td style={{ padding: 4 }}><input value={row.notes} onChange={e => update(i, 'notes', e.target.value)} style={{ width: '100%' }} /></td>
              <td style={{ padding: 4 }}><button className="btn btn-danger btn-small" onClick={() => removeRow(i)}>x</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" className="btn btn-secondary btn-small" onClick={addRow} style={{ marginTop: 8 }}>+ Add Row</button>
      <div className="form-actions" style={{ marginTop: 16 }}>
        <button className="btn btn-primary" onClick={() => onSave(items.filter(r => r.item))}>Save Budget</button>
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
      </div>
    </Modal>
  );
}

function ReportFormModal({ onSave, onClose }) {
  const [form, setForm] = useState({ title: '', type: 'interim', due_date: '' });
  return (
    <Modal title="Add Report" onClose={onClose}>
      <div className="form-group"><label>Title *</label><input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} required /></div>
      <div className="form-row">
        <div className="form-group"><label>Type</label>
          <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}>
            {REPORT_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
          </select>
        </div>
        <div className="form-group"><label>Due Date</label><input type="date" value={form.due_date} onChange={e => setForm(p => ({ ...p, due_date: e.target.value }))} /></div>
      </div>
      <div className="form-actions">
        <button className="btn btn-primary" onClick={() => { if (form.title) onSave({ ...form, due_date: form.due_date || null }); }}>Add</button>
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
      </div>
    </Modal>
  );
}
