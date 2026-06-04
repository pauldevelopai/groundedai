import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSectors } from '../../context/SectorContext.jsx';
import { apiFetch, buildUrl } from '../../hooks/useApi.js';
import PageHeader from '../../components/PageHeader.jsx';
import AiBadge from '../../components/AiBadge.jsx';
import SectorBadge from '../../components/SectorBadge.jsx';
import DocumentUpload from '../../components/DocumentUpload.jsx';

export default function TrainingMaterials() {
  const navigate = useNavigate();
  const { selectedSectorId } = useSectors();
  const [courses, setCourses] = useState([]);
  const [uploads, setUploads] = useState([]);
  const [knowledgeStats, setKnowledgeStats] = useState(null);
  const [training, setTraining] = useState(false);
  const [trainResult, setTrainResult] = useState('');

  function load() {
    apiFetch(buildUrl('/courses', selectedSectorId)).then(setCourses).catch(() => setCourses([]));
    apiFetch('/uploads?entity_type=training_material').then(setUploads).catch(() => setUploads([]));
    apiFetch('/knowledge/stats').then(setKnowledgeStats).catch(() => {});
  }

  useEffect(load, [selectedSectorId]);

  async function trainOnAllMaterials() {
    setTraining(true);
    setTrainResult('');
    try {
      const result = await apiFetch('/knowledge/train-from-materials', {
        method: 'POST',
        timeout: 300000,
      });
      setTrainResult(`Trained on ${result.processed} items. ${result.newEntries} new knowledge entries created.`);
      load();
    } catch (err) {
      setTrainResult('Training failed: ' + err.message);
    } finally {
      setTraining(false);
    }
  }

  return (
    <div>
      <PageHeader title="Training Materials">
        <AiBadge />
      </PageHeader>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>
        Upload past course materials, slides, documents, and recordings. Holly's AI learns from these to generate better courses and recommendations.
      </p>

      {/* Knowledge stats */}
      {knowledgeStats && (
        <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
          <div className="card" style={{ padding: 16, flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{knowledgeStats.total || 0}</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Knowledge Entries</div>
          </div>
          <div className="card" style={{ padding: 16, flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{knowledgeStats.fromCurriculum || 0}</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>From Curriculum</div>
          </div>
          <div className="card" style={{ padding: 16, flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{courses.length}</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Courses</div>
          </div>
          <div className="card" style={{ padding: 16, flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{uploads.length}</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Uploaded Files</div>
          </div>
        </div>
      )}

      {/* Train AI button */}
      <div className="card" style={{ padding: 20, marginBottom: 24, borderLeft: '4px solid var(--accent)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>Train AI on Course Materials</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              Processes all uploaded documents, course modules, and trainer feedback into the knowledge base so Holly's AI can reference them when building new courses.
            </div>
          </div>
          <button className="btn btn-primary" onClick={trainOnAllMaterials} disabled={training}>
            {training ? 'Training...' : 'Train Now'}
          </button>
        </div>
        {trainResult && (
          <div style={{ marginTop: 12, padding: 10, background: '#F1F5F9', borderRadius: 6, fontSize: 13 }}>
            {trainResult}
          </div>
        )}
      </div>

      {/* Upload section */}
      <div className="card" style={{ padding: 20, marginBottom: 24 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>Upload Materials</h3>
        <DocumentUpload entityType="training_material" onUploaded={load} />
      </div>

      {/* Existing courses as material sources */}
      <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>Existing Courses</h3>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
        These courses and their modules are automatically included when you train the AI.
      </p>
      {courses.length === 0 ? (
        <div className="empty-state"><h3>No courses yet.</h3></div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {courses.map(c => (
            <div key={c.id} className="card" onClick={() => navigate(`/curriculum/${c.id}`)}
              style={{ padding: 16, cursor: 'pointer', transition: 'box-shadow 0.15s', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              onMouseEnter={e => e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)'}
              onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontWeight: 600, fontSize: 15 }}>{c.title}</span>
                  <SectorBadge name={c.sector_name} colour={c.sector_colour} />
                  <span className={`stage-badge status-${c.status}`}>{c.status}</span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  {c.module_count || 0} modules · {c.delivery_type?.replace('_', '-')} · {c.version}
                  {c.effectiveness_score ? ` · Effectiveness: ${c.effectiveness_score}/5` : ''}
                </div>
              </div>
              <div style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 500 }}>View →</div>
            </div>
          ))}
        </div>
      )}

      {/* Uploaded files list */}
      {uploads.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>Uploaded Files ({uploads.length})</h3>
          <div style={{ display: 'grid', gap: 8 }}>
            {uploads.map(u => {
              const ext = u.original_name?.split('.').pop()?.toLowerCase() || '';
              const icon = { pdf: '📄', docx: '📝', doc: '📝', pptx: '📊', ppt: '📊', xlsx: '📈', xls: '📈', csv: '📈', txt: '📃', mp4: '🎬', mp3: '🎵' }[ext] || '📎';
              return (
                <div key={u.id} className="card" style={{ padding: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 24 }}>{icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500, fontSize: 14 }}>{u.original_name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      {ext.toUpperCase()} · Uploaded {new Date(u.created_at).toLocaleDateString()}
                      {u.extracted_text ? ' · AI processed' : ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {u.extracted_text && (
                      <button className="btn btn-secondary btn-small" onClick={() => {
                        const w = window.open('', '_blank');
                        w.document.write(`<html><head><title>${u.original_name}</title><style>body{font-family:system-ui;padding:40px;max-width:800px;margin:0 auto;line-height:1.6;}</style></head><body><h1>${u.original_name}</h1><pre style="white-space:pre-wrap;">${u.extracted_text}</pre></body></html>`);
                      }}>View Content</button>
                    )}
                    <a href={`/api/uploads/${u.id}/download`} className="btn btn-primary btn-small" style={{ textDecoration: 'none' }}>Download</a>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
