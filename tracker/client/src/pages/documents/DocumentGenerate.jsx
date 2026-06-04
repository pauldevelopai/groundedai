import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSectors } from '../../context/SectorContext.jsx';
import { apiFetch, buildUrl } from '../../hooks/useApi.js';
import PageHeader from '../../components/PageHeader.jsx';

export default function DocumentGenerate() {
  const navigate = useNavigate();
  const { sectors, selectedSectorId } = useSectors();
  const [templates, setTemplates] = useState([]);
  const [orgs, setOrgs] = useState([]);
  const [assessments, setAssessments] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    template_id: '',
    sector_id: selectedSectorId || '',
    organisation_id: '',
    assessment_id: '',
    title: '',
  });

  // Load templates when sector changes
  useEffect(() => {
    if (form.sector_id) {
      apiFetch(`/document-templates?sector_id=${form.sector_id}`).then(setTemplates).catch(() => setTemplates([]));
      apiFetch(buildUrl('/organisations', form.sector_id)).then(setOrgs).catch(() => setOrgs([]));
      apiFetch(buildUrl('/needs-assessments', form.sector_id)).then(a => setAssessments(a.filter(x => x.status === 'analysed' || x.status === 'completed'))).catch(() => setAssessments([]));
    }
  }, [form.sector_id]);

  // Auto-set title from template
  useEffect(() => {
    if (form.template_id) {
      const tmpl = templates.find(t => t.id === form.template_id);
      if (tmpl && !form.title) {
        setForm(prev => ({ ...prev, title: tmpl.title }));
      }
    }
  }, [form.template_id]);

  function set(field) {
    return e => setForm(prev => ({ ...prev, [field]: e.target.value }));
  }

  async function handleGenerate(e) {
    e.preventDefault();
    if (!form.template_id || !form.sector_id) return;
    setError('');
    setGenerating(true);
    try {
      const body = {
        template_id: form.template_id,
        sector_id: form.sector_id,
        organisation_id: form.organisation_id || null,
        assessment_id: form.assessment_id || null,
        title: form.title || null,
      };
      const doc = await apiFetch('/generated-documents', { method: 'POST', body: JSON.stringify(body) });
      navigate(`/documents/${doc.id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div>
      <PageHeader title="Generate Document" />
      <div className="card" style={{ maxWidth: 600 }}>
        {error && <div className="login-error" style={{ marginBottom: 16 }}>{error}</div>}
        <form onSubmit={handleGenerate}>
          <div className="form-group">
            <label>Sector *</label>
            <select value={form.sector_id} onChange={set('sector_id')} required>
              <option value="">Select sector...</option>
              {sectors.filter(s => s.is_active).map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Template *</label>
            <select value={form.template_id} onChange={set('template_id')} required disabled={!form.sector_id}>
              <option value="">Select template...</option>
              {templates.map(t => (
                <option key={t.id} value={t.id}>{t.title} ({t.type.replace(/_/g, ' ')})</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Organisation</label>
            <select value={form.organisation_id} onChange={set('organisation_id')}>
              <option value="">None (generic)</option>
              {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Link Needs Assessment (optional — provides context for AI)</label>
            <select value={form.assessment_id} onChange={set('assessment_id')}>
              <option value="">None</option>
              {assessments.map(a => (
                <option key={a.id} value={a.id}>
                  {a.organisation_name || 'No org'} — {a.status} ({new Date(a.created_at).toLocaleDateString()})
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Document Title</label>
            <input value={form.title} onChange={set('title')} placeholder="Auto-filled from template" />
          </div>
          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={generating || !form.template_id}>
              {generating ? 'Generating with AI...' : 'Generate with AI'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => navigate('/documents')}>Cancel</button>
          </div>
          {generating && (
            <div style={{ marginTop: 16, padding: 16, background: '#F1F5F9', borderRadius: 'var(--radius)', textAlign: 'center' }}>
              <div style={{ fontWeight: 500 }}>Claude is generating your document...</div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>This may take 10-20 seconds.</div>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
