import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { apiFetch } from '../../hooks/useApi.js';
import SectorBadge from '../../components/SectorBadge.jsx';
import Modal from '../../components/Modal.jsx';

const TYPE_LABELS = { ethical_ai_policy: 'Ethical AI Policy', ai_legal_framework: 'AI Legal Framework', ai_security_framework: 'AI Security Framework' };
const STATUS_LABELS = { draft: 'Draft', review: 'Review', final: 'Final' };
const STATUS_OPTIONS = ['draft', 'review', 'final'];

export default function DocumentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [doc, setDoc] = useState(null);
  const [editingContent, setEditingContent] = useState(false);
  const [content, setContent] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function load() {
    apiFetch(`/generated-documents/${id}`).then(d => { setDoc(d); setContent(d.content || ''); }).catch(() => navigate('/documents'));
  }

  useEffect(load, [id]);

  async function handleSave() {
    setSaving(true);
    try {
      const updated = await apiFetch(`/generated-documents/${id}`, {
        method: 'PUT', body: JSON.stringify({ content })
      });
      setDoc(updated);
      setEditingContent(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(status) {
    const updated = await apiFetch(`/generated-documents/${id}`, {
      method: 'PUT', body: JSON.stringify({ status })
    });
    setDoc(updated);
  }

  async function handleRegenerate() {
    setRegenerating(true);
    setError('');
    try {
      const updated = await apiFetch(`/generated-documents/${id}/regenerate`, { method: 'POST' });
      setDoc(updated);
      setContent(updated.content || '');
    } catch (err) {
      setError(err.message);
    } finally {
      setRegenerating(false);
    }
  }

  async function handleDelete() {
    await apiFetch(`/generated-documents/${id}`, { method: 'DELETE' });
    navigate('/documents');
  }

  // Simple markdown renderer
  function renderMarkdown(text) {
    if (!text) return null;
    return text.split('\n').map((line, i) => {
      if (line.startsWith('# ')) return <h2 key={i} style={{ fontSize: 20, fontWeight: 700, marginTop: 24, marginBottom: 8 }}>{line.slice(2)}</h2>;
      if (line.startsWith('## ')) return <h3 key={i} style={{ fontSize: 17, fontWeight: 600, marginTop: 20, marginBottom: 6 }}>{line.slice(3)}</h3>;
      if (line.startsWith('### ')) return <h4 key={i} style={{ fontSize: 15, fontWeight: 600, marginTop: 16, marginBottom: 4 }}>{line.slice(4)}</h4>;
      if (line.startsWith('- ') || line.startsWith('* ')) return <div key={i} style={{ paddingLeft: 16, marginBottom: 4, fontSize: 14 }}><span style={{ color: 'var(--accent)', marginRight: 8 }}>•</span>{line.slice(2)}</div>;
      if (/^\d+\.\s/.test(line)) return <div key={i} style={{ paddingLeft: 16, marginBottom: 4, fontSize: 14 }}>{line}</div>;
      if (line.trim() === '') return <div key={i} style={{ height: 8 }} />;
      return <p key={i} style={{ fontSize: 14, lineHeight: 1.7, marginBottom: 4 }}>{line}</p>;
    });
  }

  if (!doc) return null;

  return (
    <div>
      <Link to="/documents" className="back-link">← Documents</Link>
      <div className="detail-header">
        <h1>{doc.title}</h1>
        <SectorBadge name={doc.sector_name} colour={doc.sector_colour} />
        {doc.template_type && (
          <span className="stage-badge stage-active">{TYPE_LABELS[doc.template_type] || doc.template_type}</span>
        )}
        <span className={`stage-badge status-${doc.status}`}>{STATUS_LABELS[doc.status] || doc.status}</span>
      </div>

      {error && <div className="login-error" style={{ marginBottom: 16 }}>{error}</div>}

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Status:</span>
            {STATUS_OPTIONS.map(s => (
              <button
                key={s}
                className={`btn btn-small ${doc.status === s ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => updateStatus(s)}
              >
                {STATUS_LABELS[s]}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary btn-small" onClick={handleRegenerate} disabled={regenerating}>
              {regenerating ? 'Regenerating...' : 'Regenerate'}
            </button>
            <button className="btn btn-secondary btn-small" onClick={() => setEditingContent(!editingContent)}>
              {editingContent ? 'Preview' : 'Edit'}
            </button>
            {user?.role === 'admin' && (
              <button className="btn btn-danger btn-small" onClick={() => setDeleting(true)}>Delete</button>
            )}
          </div>
        </div>
        {doc.organisation_name && (
          <div style={{ marginTop: 12, fontSize: 13, color: 'var(--text-secondary)' }}>
            Organisation: <Link to={`/organisations/${doc.organisation_id}`}>{doc.organisation_name}</Link>
          </div>
        )}
      </div>

      {/* Document Content */}
      {editingContent ? (
        <div>
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            style={{
              width: '100%', minHeight: 600, padding: 20, border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius)', fontSize: 14, fontFamily: 'monospace', lineHeight: 1.6, resize: 'vertical',
            }}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
            <button className="btn btn-secondary" onClick={() => { setContent(doc.content || ''); setEditingContent(false); }}>Cancel</button>
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: 32, maxWidth: 800 }}>
          {renderMarkdown(doc.content)}
        </div>
      )}

      {deleting && (
        <Modal title="Delete Document" onClose={() => setDeleting(false)}>
          <p>Delete this document? This cannot be undone.</p>
          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={() => setDeleting(false)}>Cancel</button>
            <button className="btn btn-danger" onClick={handleDelete}>Delete</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
