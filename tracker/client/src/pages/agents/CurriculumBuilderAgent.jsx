import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSectors } from '../../context/SectorContext.jsx';
import { apiFetch } from '../../hooks/useApi.js';
import PageHeader from '../../components/PageHeader.jsx';
import AiBadge from '../../components/AiBadge.jsx';
import Modal from '../../components/Modal.jsx';
import AgentChatPanel from '../../components/AgentChatPanel.jsx';

export default function CurriculumBuilderAgent() {
  const navigate = useNavigate();
  const { sectors, selectedSectorId } = useSectors();
  const [courses, setCourses] = useState([]);
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generatedStructure, setGeneratedStructure] = useState(null);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    apiFetch(`/courses?sector_id=${selectedSectorId || ''}`).then(setCourses).catch(() => setCourses([]));
  }, [selectedSectorId]);

  const [genForm, setGenForm] = useState({ topic: '', target_audience: '' });

  async function handleGenerateStructure() {
    setGenerating(true);
    try {
      const result = await apiFetch('/agent-actions/curriculum/generate-structure', {
        method: 'POST',
        body: JSON.stringify({ sector_id: selectedSectorId, topic: genForm.topic, target_audience: genForm.target_audience }),
      });
      setGeneratedStructure(result);
    } catch (err) {
      alert('Generation failed: ' + err.message);
    } finally {
      setGenerating(false);
    }
  }

  async function handleApplyStructure() {
    if (!generatedStructure) return;
    setApplying(true);
    try {
      const result = await apiFetch('/agent-actions/curriculum/apply-structure', {
        method: 'POST',
        body: JSON.stringify({ sector_id: selectedSectorId, structure: generatedStructure }),
      });
      setShowGenerateModal(false);
      setGeneratedStructure(null);
      navigate(`/curriculum/${result.course_id}`);
    } catch (err) {
      alert('Failed: ' + err.message);
    } finally {
      setApplying(false);
    }
  }

  return (
    <div>
      <PageHeader title="Curriculum Builder">
        <AiBadge />
      </PageHeader>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16, marginTop: -8 }}>
        AI agent that helps you design courses, generate module content, and research what to teach. Conversations are context-aware — select a course to focus on.
      </p>

      {/* Actions bar */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <button className="btn btn-primary btn-small" onClick={() => setShowGenerateModal(true)}>
          Generate Course Structure
        </button>
        <select value={selectedCourseId} onChange={e => setSelectedCourseId(e.target.value)}
          style={{ padding: '6px 10px', border: '1px solid var(--border-color)', borderRadius: 'var(--radius)', fontSize: 13 }}>
          <option value="">No course selected (general chat)</option>
          {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
        </select>
      </div>

      <AgentChatPanel
        agentType="curriculum_builder"
        placeholder="Ask about course design, module content, sector trends, learning outcomes..."
        emptyText="Curriculum Builder — design and build AI training courses"
        contextData={{ course_id: selectedCourseId || null, sector_id: selectedSectorId || null }}
      />

      {showGenerateModal && (
        <Modal title="Generate Course Structure" onClose={() => { setShowGenerateModal(false); setGeneratedStructure(null); }}>
          {!generatedStructure ? (
            <div>
              <div className="form-group">
                <label>Topic / Course Title *</label>
                <input value={genForm.topic} onChange={e => setGenForm(prev => ({ ...prev, topic: e.target.value }))}
                  placeholder="e.g., AI for Legal Contract Review" />
              </div>
              <div className="form-group">
                <label>Target Audience</label>
                <input value={genForm.target_audience} onChange={e => setGenForm(prev => ({ ...prev, target_audience: e.target.value }))}
                  placeholder="e.g., Junior lawyers at mid-size firms" />
              </div>
              <div className="form-actions">
                <button className="btn btn-primary" onClick={handleGenerateStructure} disabled={generating || !genForm.topic}>
                  {generating ? 'Generating...' : 'Generate with AI'}
                </button>
              </div>
              {generating && <div style={{ marginTop: 12, padding: 12, background: '#F1F5F9', borderRadius: 'var(--radius)', textAlign: 'center', fontSize: 13 }}>Claude is designing your course...</div>}
            </div>
          ) : (
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>{generatedStructure.title}</h3>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>{generatedStructure.description}</p>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
                {generatedStructure.modules?.length} modules • {generatedStructure.delivery_type}
              </div>
              {generatedStructure.modules?.map((m, i) => (
                <div key={i} style={{ padding: '8px 12px', marginBottom: 4, background: '#F8FAFC', borderRadius: 'var(--radius)', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontWeight: 500, fontSize: 13 }}>{i + 1}. {m.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{m.duration_minutes} min — {m.description}</div>
                </div>
              ))}
              <div className="form-actions" style={{ marginTop: 16 }}>
                <button className="btn btn-primary" onClick={handleApplyStructure} disabled={applying}>
                  {applying ? 'Creating...' : 'Create Course from Structure'}
                </button>
                <button className="btn btn-secondary" onClick={() => setGeneratedStructure(null)}>Regenerate</button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
