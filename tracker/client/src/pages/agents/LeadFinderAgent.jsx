import { useState, useEffect } from 'react';
import { useSectors } from '../../context/SectorContext.jsx';
import { apiFetch, buildUrl } from '../../hooks/useApi.js';
import PageHeader from '../../components/PageHeader.jsx';
import AiBadge from '../../components/AiBadge.jsx';
import Modal from '../../components/Modal.jsx';
import AgentChatPanel from '../../components/AgentChatPanel.jsx';

export default function LeadFinderAgent() {
  const { sectors, selectedSectorId } = useSectors();
  const [contacts, setContacts] = useState([]);
  const [showDraftModal, setShowDraftModal] = useState(null); // 'email' | 'linkedin' | null
  const [selectedContactId, setSelectedContactId] = useState('');
  const [drafting, setDrafting] = useState(false);
  const [draft, setDraft] = useState(null);
  const [showTargetsModal, setShowTargetsModal] = useState(false);
  const [idealClient, setIdealClient] = useState('');
  const [targetSuggestions, setTargetSuggestions] = useState('');
  const [suggesting, setSuggesting] = useState(false);

  useEffect(() => {
    apiFetch(buildUrl('/contacts', selectedSectorId)).then(c => setContacts(c.slice(0, 100))).catch(() => setContacts([]));
  }, [selectedSectorId]);

  async function handleDraft(type) {
    if (!selectedContactId) return alert('Select a contact first');
    setDrafting(true);
    setDraft(null);
    try {
      const endpoint = type === 'email' ? '/agent-actions/leads/draft-email' : '/agent-actions/leads/draft-linkedin';
      const result = await apiFetch(endpoint, {
        method: 'POST',
        body: JSON.stringify({ contact_id: selectedContactId }),
      });
      setDraft(result);
    } catch (err) {
      alert('Draft failed: ' + err.message);
    } finally {
      setDrafting(false);
    }
  }

  async function handleSuggestTargets() {
    setSuggesting(true);
    try {
      const result = await apiFetch('/agent-actions/leads/suggest-targets', {
        method: 'POST',
        body: JSON.stringify({ sector_id: selectedSectorId, ideal_client: idealClient }),
      });
      setTargetSuggestions(result.suggestions);
    } catch (err) {
      alert('Failed: ' + err.message);
    } finally {
      setSuggesting(false);
    }
  }

  function renderMarkdown(text) {
    return text.split('\n').map((line, i) => {
      if (line.startsWith('## ')) return <h3 key={i} style={{ fontSize: 15, fontWeight: 600, marginTop: 16, marginBottom: 6 }}>{line.slice(3)}</h3>;
      if (line.startsWith('- ') || line.startsWith('* ')) return <div key={i} style={{ paddingLeft: 14, marginBottom: 3, fontSize: 14 }}><span style={{ color: 'var(--accent)', marginRight: 6 }}>•</span>{line.slice(2)}</div>;
      if (line.trim() === '') return <div key={i} style={{ height: 6 }} />;
      return <p key={i} style={{ fontSize: 14, marginBottom: 3, lineHeight: 1.5 }}>{line}</p>;
    });
  }

  return (
    <div>
      <PageHeader title="Lead Finder & Outreach">
        <AiBadge />
      </PageHeader>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16, marginTop: -8 }}>
        AI agent that helps identify target clients, craft outreach strategies, and draft personalised pitches.
      </p>

      {/* Actions bar */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <button className="btn btn-primary btn-small" onClick={() => setShowTargetsModal(true)}>Suggest Targets</button>
        <select value={selectedContactId} onChange={e => setSelectedContactId(e.target.value)}
          style={{ padding: '6px 10px', border: '1px solid var(--border-color)', borderRadius: 'var(--radius)', fontSize: 13, maxWidth: 250 }}>
          <option value="">Select contact for drafts...</option>
          {contacts.map(c => <option key={c.id} value={c.id}>{c.first_name} {c.last_name}{c.organisation_name ? ` (${c.organisation_name})` : ''}</option>)}
        </select>
        <button className="btn btn-secondary btn-small" onClick={() => handleDraft('email')} disabled={!selectedContactId || drafting}>
          {drafting ? 'Drafting...' : 'Draft Email'}
        </button>
        <button className="btn btn-secondary btn-small" onClick={() => handleDraft('linkedin')} disabled={!selectedContactId || drafting}>
          Draft LinkedIn
        </button>
      </div>

      {/* Draft result */}
      {draft && (
        <div className="card" style={{ marginBottom: 16, padding: 16, borderLeft: '4px solid var(--accent)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>{draft.subject ? 'Email Draft' : 'LinkedIn Message'}</span>
            <button className="btn btn-secondary btn-small" onClick={() => setDraft(null)}>Dismiss</button>
          </div>
          {draft.subject && <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>Subject: {draft.subject}</div>}
          <div style={{ fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap', background: '#F8FAFC', padding: 12, borderRadius: 'var(--radius)' }}>
            {draft.body || draft.message}
          </div>
          {draft.contact_name && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6 }}>For: {draft.contact_name}</div>}
        </div>
      )}

      <AgentChatPanel
        agentType="lead_finder"
        placeholder="Describe your ideal client, ask about outreach strategies, request pitch ideas..."
        emptyText="Lead Finder — identify targets and craft outreach"
        contextData={{ sector_id: selectedSectorId || null }}
      />

      {/* Suggest Targets Modal */}
      {showTargetsModal && (
        <Modal title="Suggest Lead Targets" onClose={() => { setShowTargetsModal(false); setTargetSuggestions(''); }}>
          {!targetSuggestions ? (
            <div>
              <div className="form-group">
                <label>Describe your ideal client (optional — leave blank for general sector suggestions)</label>
                <textarea value={idealClient} onChange={e => setIdealClient(e.target.value)} rows={3}
                  placeholder="e.g., Mid-size law firms in London with 50-200 lawyers, no AI policy, interested in efficiency..." />
              </div>
              <div className="form-actions">
                <button className="btn btn-primary" onClick={handleSuggestTargets} disabled={suggesting}>
                  {suggesting ? 'Researching...' : 'Get Suggestions'}
                </button>
              </div>
            </div>
          ) : (
            <div style={{ maxHeight: 500, overflowY: 'auto' }}>
              {renderMarkdown(targetSuggestions)}
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
