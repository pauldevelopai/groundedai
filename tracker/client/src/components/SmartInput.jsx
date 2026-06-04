import { useState, useRef } from 'react';
import { apiFetch } from '../hooks/useApi.js';
import AiBadge from './AiBadge.jsx';

const FIELD_LABELS = {
  title: 'Title', name: 'Name', description: 'Description', notes: 'Notes',
  website: 'Website', email: 'Email', phone: 'Phone', city: 'City',
  country: 'Country', linkedin_url: 'LinkedIn', job_title: 'Job Title',
  delivery_type: 'Delivery Type', status: 'Status', version: 'Version',
  focus_areas: 'Focus Areas', programme_name: 'Programme Name',
  relationship_stage: 'Relationship Stage', pipeline_stage: 'Pipeline Stage',
  type: 'Type', size: 'Size', bio: 'Bio', ai_readiness_score: 'AI Readiness',
  ai_implementation_notes: 'AI Implementation Notes', amount_min: 'Min Amount',
  amount_max: 'Max Amount', deadline: 'Deadline', mission: 'Mission',
};

function humanLabel(key) {
  return FIELD_LABELS[key] || key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function truncate(val, len = 120) {
  if (val === null || val === undefined) return '—';
  const s = String(val);
  return s.length > len ? s.slice(0, len) + '…' : s;
}

/**
 * SmartInput — universal AI-powered input for any detail page.
 * Drop a document or type a line. AI extracts relevant info and updates the entity.
 */
export default function SmartInput({ entityType, entityId, sectorId, onUpdated, compact = false }) {
  const [text, setText] = useState('');
  const [processing, setProcessing] = useState(false);
  const [resultData, setResultData] = useState(null); // rich result object
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef();

  async function handleTextSubmit(e) {
    e?.preventDefault();
    if (!text.trim() || processing) return;
    setProcessing(true);
    setResultData(null);
    setError('');
    const submittedText = text;
    try {
      const res = await apiFetch('/uploads/smart-input', {
        method: 'POST',
        body: JSON.stringify({ text: submittedText, entityType, entityId, sectorId }),
        timeout: 60000,
      });
      setResultData({ ...res, inputText: submittedText, source: 'text' });
      setText('');
      onUpdated?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setProcessing(false);
    }
  }

  async function handleFile(file) {
    if (!file || processing) return;
    setProcessing(true);
    setResultData(null);
    setError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('entity_type', entityType);
      formData.append('entity_id', entityId);
      if (sectorId) formData.append('sector_id', sectorId);

      const res = await fetch('/api/uploads/smart-input-file', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Upload failed');
      setResultData({ ...data, fileName: file.name, source: 'file' });
      onUpdated?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setProcessing(false);
    }
  }

  const pad = compact ? 10 : 14;

  return (
    <div style={{
      background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius)',
      padding: pad, marginTop: compact ? 8 : 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <AiBadge />
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
          {processing ? 'Processing...' : 'Add information'}
        </span>
      </div>

      {/* Text input */}
      <form onSubmit={handleTextSubmit} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Type a note, update, or piece of info about this item..."
          disabled={processing}
          style={{
            flex: 1, fontSize: 13, padding: '8px 12px',
            border: '1px solid var(--border-color)', borderRadius: 'var(--radius)',
          }}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) handleTextSubmit(e); }}
        />
        <button type="submit" className="btn btn-primary btn-small" disabled={processing || !text.trim()}>
          {processing ? '...' : 'Add'}
        </button>
      </form>

      {/* File drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); }}
        onClick={() => fileRef.current?.click()}
        style={{
          border: `1px dashed ${dragOver ? 'var(--ai-purple)' : 'var(--border-color)'}`,
          borderRadius: 'var(--radius)', padding: compact ? '6px 10px' : '8px 12px',
          textAlign: 'center', cursor: 'pointer', fontSize: 12, color: 'var(--text-secondary)',
          background: dragOver ? '#F5F3FF' : 'transparent',
        }}
      >
        {processing ? 'Extracting with AI...' : 'Drop a document here or click to upload (PDF, DOCX, TXT)'}
        <input ref={fileRef} type="file" hidden accept=".pdf,.docx,.doc,.txt,.csv,.xlsx" onChange={e => e.target.files[0] && handleFile(e.target.files[0])} />
      </div>

      {/* Error */}
      {error && (
        <div style={{ marginTop: 8, padding: '8px 12px', background: '#FEF2F2', borderRadius: 6, fontSize: 13, color: 'var(--danger)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>⚠ {error}</span>
          <button onClick={() => setError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: 'var(--danger)' }}>×</button>
        </div>
      )}

      {/* Rich result panel */}
      {resultData && (
        <div style={{ marginTop: 10, padding: '12px 14px', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 16 }}>✓</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#15803D' }}>
                {resultData.source === 'file'
                  ? `"${resultData.fileName}" absorbed`
                  : `Information saved`}
              </span>
            </div>
            <button onClick={() => setResultData(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#6B7280', lineHeight: 1 }}>×</button>
          </div>

          {/* Show what was updated */}
          {resultData.fieldsUpdated?.length > 0 ? (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#166534', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Updated on this page:
              </div>
              {resultData.fieldsUpdated.map(field => (
                <div key={field} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 4, fontSize: 13 }}>
                  <span style={{ fontWeight: 600, color: '#374151', minWidth: 110, flexShrink: 0 }}>{humanLabel(field)}</span>
                  <span style={{ color: '#6B7280', fontSize: 12, lineHeight: 1.4 }}>
                    {truncate(resultData.updates?.[field] ?? resultData.extracted?.[field])}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 13, color: '#374151', marginBottom: 8 }}>
              {resultData.source === 'text' && resultData.inputText ? (
                <span>No specific fields identified — your note was saved to the knowledge base.</span>
              ) : (
                <span>Document uploaded and saved to the knowledge base.</span>
              )}
            </div>
          )}

          {/* Knowledge base confirmation */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingTop: 6, borderTop: '1px solid #BBF7D0' }}>
            <span style={{ fontSize: 11, color: '#6366F1' }}>🧠</span>
            <span style={{ fontSize: 12, color: '#6366F1' }}>
              Also saved to <strong>Knowledge Base</strong> — Holly will use this in future AI responses
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
