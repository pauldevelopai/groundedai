import { useState, useEffect } from 'react';
import { useSectors } from '../../context/SectorContext.jsx';
import { apiFetch, buildUrl } from '../../hooks/useApi.js';
import AiBadge from '../../components/AiBadge.jsx';

const ratingColors = ['#EF4444', '#F59E0B', '#F59E0B', '#10B981', '#10B981'];

function renderMarkdown(text) {
  return text.split('\n').map((line, i) => {
    if (line.startsWith('## ')) return <h3 key={i} style={{ fontSize: 15, fontWeight: 600, marginTop: 16, marginBottom: 6 }}>{line.slice(3)}</h3>;
    if (line.startsWith('- ') || line.startsWith('* ')) return <div key={i} style={{ paddingLeft: 14, marginBottom: 3, fontSize: 14 }}><span style={{ color: 'var(--ai-purple)', marginRight: 6 }}>•</span>{line.slice(2)}</div>;
    if (line.trim() === '') return <div key={i} style={{ height: 6 }} />;
    return <p key={i} style={{ fontSize: 14, lineHeight: 1.5, marginBottom: 3 }}>{line}</p>;
  });
}

export default function CurriculumIntelligence() {
  const { selectedSectorId } = useSectors();
  const [data, setData] = useState(null);
  const [analysis, setAnalysis] = useState('');
  const [research, setResearch] = useState('');
  const [analysing, setAnalysing] = useState(false);
  const [researching, setResearching] = useState(false);

  useEffect(() => {
    apiFetch(buildUrl('/courses/intelligence', selectedSectorId)).then(setData).catch(() => setData(null));
    setAnalysis('');
    setResearch('');
  }, [selectedSectorId]);

  async function runAnalysis() {
    setAnalysing(true);
    try {
      const r = await apiFetch(buildUrl('/courses/intelligence/analyse', selectedSectorId), { method: 'POST' });
      setAnalysis(r.analysis);
    } catch (err) {
      setAnalysis('Error: ' + err.message);
    } finally {
      setAnalysing(false);
    }
  }

  async function runResearch() {
    setResearching(true);
    try {
      const r = await apiFetch(buildUrl('/courses/intelligence/research', selectedSectorId), { method: 'POST' });
      setResearch(r.research);
    } catch (err) {
      setResearch('Error: ' + err.message);
    } finally {
      setResearching(false);
    }
  }

  if (!data) return <div style={{ padding: 24, color: 'var(--text-secondary)' }}>Loading intelligence data...</div>;

  return (
    <div>
      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <button className="btn btn-primary" onClick={runAnalysis} disabled={analysing} style={{ background: 'var(--ai-purple)', borderColor: 'var(--ai-purple)' }}>
          {analysing ? 'Analysing...' : 'Analyse Feedback Trends'} <AiBadge style={{ marginLeft: 4 }} />
        </button>
        <button className="btn btn-primary" onClick={runResearch} disabled={researching} style={{ background: 'var(--ai-purple)', borderColor: 'var(--ai-purple)' }}>
          {researching ? 'Researching...' : 'Research Sector Trends'} <AiBadge style={{ marginLeft: 4 }} />
        </button>
      </div>

      {/* AI Analysis */}
      {analysis && (
        <div className="card" style={{ marginBottom: 20, borderLeft: '4px solid var(--ai-purple)', padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600 }}>Feedback Trend Analysis</h3>
            <AiBadge variant="powered" />
          </div>
          {renderMarkdown(analysis)}
        </div>
      )}

      {/* AI Research */}
      {research && (
        <div className="card" style={{ marginBottom: 20, borderLeft: '4px solid var(--ai-purple)', padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600 }}>Industry Research</h3>
            <AiBadge variant="powered" />
          </div>
          {renderMarkdown(research)}
        </div>
      )}

      {/* Course effectiveness overview */}
      <div style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>
          Course Effectiveness (avg: {data.overallAvgEffectiveness || '—'}/5)
        </h3>
        <table className="data-table">
          <thead>
            <tr><th>Course</th><th>Modules</th><th>Avg Rating</th><th>Status</th></tr>
          </thead>
          <tbody>
            {data.courses.map(c => (
              <tr key={c.id}>
                <td style={{ fontWeight: 500 }}>{c.title}</td>
                <td>{c.module_count}</td>
                <td>
                  {c.avg_module_effectiveness ? (
                    <span style={{ fontWeight: 600, color: ratingColors[Math.round(c.avg_module_effectiveness) - 1] }}>
                      {c.avg_module_effectiveness}/5
                    </span>
                  ) : '—'}
                </td>
                <td><span className={`stage-badge status-${c.status}`}>{c.status}</span></td>
              </tr>
            ))}
            {data.courses.length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>No courses yet</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Low-rated modules */}
      {data.lowestRatedModules.length > 0 && (
        <div>
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 8, color: 'var(--danger)' }}>
            Modules Needing Attention
          </h3>
          <table className="data-table">
            <thead>
              <tr><th>Module</th><th>Course</th><th>Rating</th><th>Trainer Notes</th></tr>
            </thead>
            <tbody>
              {data.lowestRatedModules.map((m, i) => (
                <tr key={i} style={{ background: m.effectiveness_rating <= 2 ? '#FEF2F2' : undefined }}>
                  <td style={{ fontWeight: 500 }}>{m.module_title}</td>
                  <td>{m.course_title}</td>
                  <td><span style={{ fontWeight: 600, color: ratingColors[m.effectiveness_rating - 1] }}>{m.effectiveness_rating}/5</span></td>
                  <td style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{m.feedback_notes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
