import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { apiFetch } from '../../hooks/useApi.js';
import SectorBadge from '../../components/SectorBadge.jsx';
import Modal from '../../components/Modal.jsx';
import AssessmentFill from './AssessmentFill.jsx';
import AnalysisReport from './AnalysisReport.jsx';

const STATUS_LABELS = { draft: 'Draft', sent: 'Sent', completed: 'Completed', analysed: 'Analysed' };

export default function AssessmentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [assessment, setAssessment] = useState(null);
  const [filling, setFilling] = useState(false);
  const [analysing, setAnalysing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  function load() {
    apiFetch(`/needs-assessments/${id}`).then(setAssessment).catch(() => navigate('/assessments'));
  }

  useEffect(load, [id]);

  async function handleAnalyse() {
    setAnalysing(true);
    setError('');
    try {
      const updated = await apiFetch(`/needs-assessments/${id}/analyse`, { method: 'POST' });
      setAssessment(updated);
    } catch (err) {
      setError(err.message);
    } finally {
      setAnalysing(false);
    }
  }

  async function handleDelete() {
    await apiFetch(`/needs-assessments/${id}`, { method: 'DELETE' });
    navigate('/assessments');
  }

  if (!assessment) return null;

  const canFill = ['draft', 'sent'].includes(assessment.status);
  const canAnalyse = assessment.status === 'completed';
  const hasResponses = assessment.responses?.length > 0;
  const hasAnalysis = !!assessment.ai_analysis;

  return (
    <div>
      <Link to="/assessments" className="back-link">← Assessments</Link>
      <div className="detail-header">
        <h1>Needs Assessment</h1>
        <SectorBadge name={assessment.sector_name} colour={assessment.sector_colour} />
        <span className={`stage-badge status-${assessment.status}`}>{STATUS_LABELS[assessment.status] || assessment.status}</span>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginBottom: '16px' }}>
          {canFill && (
            <button className="btn btn-primary btn-small" onClick={() => setFilling(true)}>
              {hasResponses ? 'Edit Responses' : 'Fill In'}
            </button>
          )}
          {canAnalyse && (
            <button className="btn btn-primary btn-small" onClick={handleAnalyse} disabled={analysing}>
              {analysing ? 'Analysing...' : 'Analyse with AI'}
            </button>
          )}
          {user?.role === 'admin' && (
            <button className="btn btn-danger btn-small" onClick={() => setDeleting(true)}>Delete</button>
          )}
        </div>
        {error && <div className="login-error" style={{ marginBottom: 16 }}>{error}</div>}
        <div className="detail-grid">
          <div className="detail-field">
            <div className="detail-field-label">Organisation</div>
            <div className="detail-field-value">
              {assessment.organisation_id ? (
                <Link to={`/organisations/${assessment.organisation_id}`}>{assessment.organisation_name}</Link>
              ) : '—'}
            </div>
          </div>
          <div className="detail-field">
            <div className="detail-field-label">Contact</div>
            <div className="detail-field-value">
              {assessment.contact_id ? (
                <Link to={`/contacts/${assessment.contact_id}`}>{assessment.contact_first_name} {assessment.contact_last_name}</Link>
              ) : '—'}
            </div>
          </div>
          <div className="detail-field">
            <div className="detail-field-label">Created</div>
            <div className="detail-field-value">{new Date(assessment.created_at).toLocaleDateString()}</div>
          </div>
          <div className="detail-field">
            <div className="detail-field-label">Submitted</div>
            <div className="detail-field-value">{assessment.submitted_at ? new Date(assessment.submitted_at).toLocaleDateString() : '—'}</div>
          </div>
        </div>
      </div>

      {/* Responses Section */}
      {hasResponses && !filling && (
        <div className="detail-section">
          <h2>Responses</h2>
          {assessment.responses.map((r, i) => (
            <div key={i} className="card" style={{ marginBottom: 8, padding: 12 }}>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 2 }}>Q{i + 1}: {r.question_text}</div>
              <div style={{ fontSize: 14 }}>{r.answer || <em style={{ color: 'var(--text-secondary)' }}>No response</em>}</div>
            </div>
          ))}
        </div>
      )}

      {/* Fill In Mode */}
      {filling && (
        <div className="detail-section">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ margin: 0, border: 'none', padding: 0 }}>Fill In Assessment</h2>
            <button className="btn btn-secondary btn-small" onClick={() => setFilling(false)}>Cancel</button>
          </div>
          <AssessmentFill assessment={assessment} onSaved={() => { setFilling(false); load(); }} />
        </div>
      )}

      {/* Analysis Section */}
      {hasAnalysis && (
        <div className="detail-section">
          <h2>AI Analysis</h2>
          <AnalysisReport
            analysis={assessment.ai_analysis}
            recommendedTier={assessment.recommended_tier}
            analysedAt={assessment.analysed_at}
          />
        </div>
      )}

      {/* Analysing indicator */}
      {analysing && (
        <div className="detail-section">
          <h2>AI Analysis</h2>
          <div className="card" style={{ textAlign: 'center', padding: 40 }}>
            <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 8 }}>Analysing with Claude AI...</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 14 }}>This may take a few seconds.</div>
          </div>
        </div>
      )}

      {deleting && (
        <Modal title="Delete Assessment" onClose={() => setDeleting(false)}>
          <p>Are you sure you want to delete this assessment? This cannot be undone.</p>
          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={() => setDeleting(false)}>Cancel</button>
            <button className="btn btn-danger" onClick={handleDelete}>Delete</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
