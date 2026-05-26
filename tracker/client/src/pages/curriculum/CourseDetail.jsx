import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { apiFetch } from '../../hooks/useApi.js';
import SectorBadge from '../../components/SectorBadge.jsx';
import Modal from '../../components/Modal.jsx';
import CourseForm from './CourseForm.jsx';
import DocumentUpload from '../../components/DocumentUpload.jsx';
import ModuleForm from './ModuleForm.jsx';
import AIResearchPanel from './AIResearchPanel.jsx';
import SmartInput from '../../components/SmartInput.jsx';
import InlineEditField from '../../components/InlineEditField.jsx';

const STATUS_LABELS = { draft: 'Draft', active: 'Active', archived: 'Archived' };

export default function CourseDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [course, setCourse] = useState(null);
  const [modules, setModules] = useState([]);
  const [activeTab, setActiveTab] = useState('modules');
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [addingModule, setAddingModule] = useState(false);
  const [editingModule, setEditingModule] = useState(null);
  const [aiSuggestions, setAiSuggestions] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  function loadCourse() {
    apiFetch(`/courses/${id}`).then(setCourse).catch(() => navigate('/curriculum'));
  }
  function loadModules() {
    apiFetch(`/courses/${id}/modules`).then(setModules).catch(() => setModules([]));
  }

  useEffect(() => { loadCourse(); loadModules(); }, [id]);

  async function saveField(field, value) {
    await apiFetch(`/courses/${id}`, { method: 'PUT', body: JSON.stringify({ [field]: value }) });
    loadCourse();
  }

  async function handleDelete() {
    await apiFetch(`/courses/${id}`, { method: 'DELETE' });
    navigate('/curriculum');
  }

  async function removeModule(moduleId) {
    await apiFetch(`/courses/${id}/modules/${moduleId}`, { method: 'DELETE' });
    loadModules();
  }

  async function runAiAssist() {
    setAiLoading(true);
    setAiError('');
    try {
      const result = await apiFetch(`/courses/${id}/ai-assist`, { method: 'POST' });
      setAiSuggestions(result.suggestions);
    } catch (err) {
      setAiError(err.message);
    } finally {
      setAiLoading(false);
    }
  }

  if (!course) return null;

  // Simple inline markdown for AI suggestions
  function renderMarkdown(text) {
    return text.split('\n').map((line, i) => {
      if (line.startsWith('## ')) return <h3 key={i} style={{ fontSize: 15, fontWeight: 600, marginTop: 16, marginBottom: 6 }}>{line.slice(3)}</h3>;
      if (line.startsWith('- ') || line.startsWith('* ')) return <div key={i} style={{ paddingLeft: 14, marginBottom: 3, fontSize: 14 }}><span style={{ color: 'var(--accent)', marginRight: 6 }}>•</span>{line.slice(2)}</div>;
      if (line.trim() === '') return <div key={i} style={{ height: 6 }} />;
      return <p key={i} style={{ fontSize: 14, marginBottom: 3, lineHeight: 1.5 }}>{line}</p>;
    });
  }

  const ratingColors = ['#EF4444', '#F59E0B', '#F59E0B', '#10B981', '#10B981'];

  return (
    <div>
      <Link to="/curriculum" className="back-link">← Curriculum</Link>
      <div className="detail-header">
        <h1>{course.title}</h1>
        <SectorBadge name={course.sector_name} colour={course.sector_colour} />
        <span className={`stage-badge status-${course.status}`}>{STATUS_LABELS[course.status] || course.status}</span>
        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{course.version}</span>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 16 }}>
          <button className="btn btn-primary btn-small" onClick={runAiAssist} disabled={aiLoading}>
            {aiLoading ? 'Analysing...' : 'AI Assist'}
          </button>
          <button className="btn btn-secondary btn-small" onClick={() => setEditing(true)}>Edit</button>
          {user?.role === 'admin' && (
            <button className="btn btn-danger btn-small" onClick={() => setDeleting(true)}>Delete</button>
          )}
        </div>
        <InlineEditField
          label="Description"
          value={course.description}
          onSave={v => saveField('description', v)}
          type="textarea"
          placeholder="Add a description for this course..."
        />
        <div className="detail-grid">
          <InlineEditField
            label="Delivery"
            value={course.delivery_type}
            onSave={v => saveField('delivery_type', v)}
            type="select"
            options={[
              { value: 'online', label: 'Online' },
              { value: 'in_person', label: 'In-Person' },
              { value: 'both', label: 'Both' },
            ]}
            displayValue={course.delivery_type ? course.delivery_type.replace('_', '-') : null}
          />
          <InlineEditField
            label="Effectiveness"
            value={course.effectiveness_score}
            onSave={v => saveField('effectiveness_score', v)}
            type="number"
            placeholder="1–5"
            displayValue={course.effectiveness_score ? `${course.effectiveness_score}/5` : null}
          />
          <InlineEditField
            label="Modules"
            value={modules.length}
            onSave={() => {}}
            readOnly={true}
          />
          <InlineEditField
            label="Last Updated By"
            value={course.last_updated_by_name}
            onSave={() => {}}
            readOnly={true}
          />
        </div>

        <InlineEditField
          label="Notes"
          value={course.notes}
          onSave={v => saveField('notes', v)}
          type="textarea"
          placeholder="Add notes, context, delivery tips..."
        />
      </div>

      {/* AI Suggestions */}
      {(aiSuggestions || aiError) && (
        <div className="card" style={{ marginBottom: 24, borderLeft: '4px solid var(--accent)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600 }}>AI Suggestions</h3>
            <button className="btn btn-secondary btn-small" onClick={() => setAiSuggestions('')}>Dismiss</button>
          </div>
          {aiError ? (
            <div className="login-error">{aiError}</div>
          ) : (
            <div>{renderMarkdown(aiSuggestions)}</div>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="tabs">
        <button className={`tab ${activeTab === 'modules' ? 'active' : ''}`} onClick={() => setActiveTab('modules')}>
          Modules ({modules.length})
        </button>
        <button className={`tab ${activeTab === 'research' ? 'active' : ''}`} onClick={() => setActiveTab('research')}>
          AI Research
        </button>
        <button className={`tab ${activeTab === 'performance' ? 'active' : ''}`} onClick={() => setActiveTab('performance')}>
          Performance
        </button>
        <button className={`tab ${activeTab === 'documents' ? 'active' : ''}`} onClick={() => setActiveTab('documents')}>
          Documents
        </button>
      </div>

      {/* Modules Tab */}
      {activeTab === 'modules' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <button className="btn btn-primary btn-small" onClick={() => setAddingModule(true)}>+ Add Module</button>
          </div>
          {modules.length === 0 ? (
            <div className="empty-state"><h3>No modules yet. Add your first module.</h3></div>
          ) : (
            modules.map(m => (
              <div key={m.id} className="card" style={{ marginBottom: 8, padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>#{m.order_index}</span>
                      <span style={{ fontWeight: 600, fontSize: 15 }}>{m.title}</span>
                      {m.duration_minutes && <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{m.duration_minutes} min</span>}
                      {m.effectiveness_rating && (
                        <span style={{ fontSize: 12, fontWeight: 600, color: ratingColors[m.effectiveness_rating - 1] }}>
                          {m.effectiveness_rating}/5
                        </span>
                      )}
                    </div>
                    {m.description && <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0' }}>{m.description}</p>}
                    {m.feedback_notes && (
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6, padding: '6px 10px', background: '#FEF3C7', borderRadius: 4 }}>
                        <strong>Trainer notes:</strong> {m.feedback_notes}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 4, marginLeft: 12 }}>
                    <button className="btn btn-secondary btn-small" onClick={() => setEditingModule(m)}>Edit</button>
                    <button className="btn btn-danger btn-small" onClick={() => removeModule(m.id)}>Remove</button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* AI Research Tab */}
      {activeTab === 'research' && <AIResearchPanel courseId={id} />}

      {/* Performance Tab */}
      {activeTab === 'performance' && (
        <div>
          {modules.length === 0 ? (
            <div className="empty-state"><h3>Add modules to see performance data.</h3></div>
          ) : (
            <table className="data-table">
              <thead>
                <tr><th>#</th><th>Module</th><th>Duration</th><th>Rating</th><th>Status</th></tr>
              </thead>
              <tbody>
                {modules.sort((a, b) => (a.effectiveness_rating || 99) - (b.effectiveness_rating || 99)).map(m => (
                  <tr key={m.id} style={{ background: m.effectiveness_rating && m.effectiveness_rating <= 2 ? '#FEF2F2' : undefined }}>
                    <td>{m.order_index}</td>
                    <td style={{ fontWeight: 500 }}>{m.title}</td>
                    <td>{m.duration_minutes ? `${m.duration_minutes} min` : '—'}</td>
                    <td>
                      {m.effectiveness_rating ? (
                        <span style={{ fontWeight: 600, color: ratingColors[m.effectiveness_rating - 1] }}>
                          {m.effectiveness_rating}/5
                        </span>
                      ) : '—'}
                    </td>
                    <td>
                      {m.effectiveness_rating && m.effectiveness_rating <= 2 ? (
                        <span style={{ fontSize: 12, color: 'var(--danger)', fontWeight: 500 }}>Needs Review</span>
                      ) : m.effectiveness_rating ? (
                        <span style={{ fontSize: 12, color: 'var(--success)' }}>Good</span>
                      ) : (
                        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Not rated</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Documents Tab */}
      {activeTab === 'documents' && (
        <DocumentUpload entityType="course" entityId={id} sectorId={course.sector_id} onUploaded={() => { loadCourse(); loadModules(); }} />
      )}

      {/* Modals */}
      {editing && <CourseForm course={course} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); loadCourse(); }} />}
      {deleting && (
        <Modal title="Delete Course" onClose={() => setDeleting(false)}>
          <p>Delete {course.title}? This removes all modules and AI conversations. Cannot be undone.</p>
          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={() => setDeleting(false)}>Cancel</button>
            <button className="btn btn-danger" onClick={handleDelete}>Delete</button>
          </div>
        </Modal>
      )}
      {addingModule && <ModuleForm courseId={id} onClose={() => setAddingModule(false)} onSaved={() => { setAddingModule(false); loadModules(); }} />}
      {editingModule && <ModuleForm module={editingModule} courseId={id} onClose={() => setEditingModule(null)} onSaved={() => { setEditingModule(null); loadModules(); }} />}

      <SmartInput entityType="course" entityId={id} sectorId={course.sector_id} onUpdated={() => loadCourse()} />
    </div>
  );
}
