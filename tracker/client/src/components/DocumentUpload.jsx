import { useState, useEffect, useRef } from 'react';

export default function DocumentUpload({ entityType, entityId, sectorId, onUploaded }) {
  const [uploads, setUploads] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef();

  function loadUploads() {
    if (!entityType || !entityId) return;
    fetch(`/api/uploads?entity_type=${entityType}&entity_id=${entityId}`, { credentials: 'include' })
      .then(r => r.json()).then(setUploads).catch(() => {});
  }

  useEffect(loadUploads, [entityType, entityId]);

  async function handleUpload(file) {
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      if (entityType) formData.append('entity_type', entityType);
      if (entityId) formData.append('entity_id', entityId);
      if (sectorId) formData.append('sector_id', sectorId);

      const res = await fetch('/api/uploads', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });
      if (!res.ok) throw new Error((await res.json()).message);
      loadUploads();
      onUploaded?.();
    } catch (err) {
      alert('Upload failed: ' + err.message);
    } finally {
      setUploading(false);
    }
  }

  async function applyData(uploadId) {
    const res = await fetch(`/api/uploads/${uploadId}/apply`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });
    if (res.ok) {
      alert('Extracted data applied!');
      onUploaded?.();
      loadUploads();
    }
  }

  // Poll for processing status
  useEffect(() => {
    const pending = uploads.filter(u => u.ai_analysis_status === 'pending' || u.ai_analysis_status === 'analysing');
    if (pending.length === 0) return;
    const timer = setInterval(loadUploads, 3000);
    return () => clearInterval(timer);
  }, [uploads]);

  const statusColor = { pending: '#94A3B8', extracting: '#F59E0B', extracted: '#F59E0B', analysing: '#6366F1', complete: '#10B981', failed: '#EF4444' };

  return (
    <div>
      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); handleUpload(e.dataTransfer.files[0]); }}
        onClick={() => fileRef.current?.click()}
        style={{
          border: `2px dashed ${dragOver ? 'var(--accent)' : 'var(--border-color)'}`,
          borderRadius: 'var(--radius)', padding: '20px', textAlign: 'center',
          cursor: 'pointer', background: dragOver ? '#EEF2FF' : 'var(--card-bg)',
          marginBottom: 12, transition: 'all 0.15s',
        }}
      >
        <input ref={fileRef} type="file" accept=".pdf,.docx,.xlsx,.csv,.txt" onChange={e => handleUpload(e.target.files[0])} style={{ display: 'none' }} />
        {uploading ? (
          <div style={{ fontSize: 13, color: 'var(--accent)' }}>Uploading...</div>
        ) : (
          <div>
            <div style={{ fontSize: 13, fontWeight: 500 }}>Drop a document here or click to upload</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>PDF, DOCX, XLSX, CSV, TXT (max 10MB)</div>
          </div>
        )}
      </div>

      {/* Uploaded files */}
      {uploads.map(u => (
        <div key={u.id} style={{ padding: '10px 12px', border: '1px solid var(--border-color)', borderRadius: 'var(--radius)', marginBottom: 6, fontSize: 13 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{ fontWeight: 500 }}>{u.original_name}</span>
              <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginLeft: 8 }}>
                {(u.file_size / 1024).toFixed(0)} KB
              </span>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ fontSize: 11, fontWeight: 500, color: statusColor[u.ai_analysis_status] || '#94A3B8' }}>
                {u.ai_analysis_status === 'complete' ? 'Analysed' : u.ai_analysis_status === 'analysing' ? 'Analysing...' : u.ai_analysis_status === 'failed' ? 'Failed' : 'Processing...'}
              </span>
              {u.ai_analysis_status === 'complete' && u.ai_extracted_data && entityId && (
                <button className="btn btn-primary btn-small" onClick={() => applyData(u.id)} style={{ fontSize: 11, padding: '2px 8px' }}>
                  Apply
                </button>
              )}
            </div>
          </div>
          {u.ai_summary && u.ai_analysis_status === 'complete' && (
            <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, borderTop: '1px solid var(--border-color)', paddingTop: 6 }}>
              {u.ai_summary.slice(0, 200)}{u.ai_summary.length > 200 ? '...' : ''}
            </div>
          )}
          {u.extraction_error && (
            <div style={{ marginTop: 4, fontSize: 12, color: 'var(--danger)' }}>{u.extraction_error}</div>
          )}
        </div>
      ))}
    </div>
  );
}
