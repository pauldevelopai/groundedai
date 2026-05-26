import { useState, useEffect, useRef } from 'react';
import { apiFetch } from '../../hooks/useApi.js';

export default function AIResearchPanel({ courseId, onBack }) {
  const [conversations, setConversations] = useState([]);
  const [activeConv, setActiveConv] = useState(null);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const messagesEndRef = useRef(null);

  function loadConversations() {
    apiFetch(`/courses/${courseId}/conversations`).then(setConversations).catch(() => setConversations([]));
  }

  useEffect(loadConversations, [courseId]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [activeConv?.messages]);

  async function createConversation() {
    const conv = await apiFetch(`/courses/${courseId}/conversations`, {
      method: 'POST', body: JSON.stringify({ title: 'New Research' })
    });
    setConversations(prev => [conv, ...prev]);
    setActiveConv(conv);
  }

  async function loadConversation(id) {
    const conv = await apiFetch(`/courses/${courseId}/conversations/${id}`);
    setActiveConv(conv);
  }

  async function sendMessage(e) {
    e.preventDefault();
    if (!message.trim() || !activeConv) return;
    setError('');
    setSending(true);
    try {
      const updated = await apiFetch(`/courses/${courseId}/conversations/${activeConv.id}/message`, {
        method: 'POST', body: JSON.stringify({ content: message })
      });
      setActiveConv(updated);
      setMessage('');
      loadConversations(); // refresh list for updated_at
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  async function deleteConversation(id) {
    await apiFetch(`/courses/${courseId}/conversations/${id}`, { method: 'DELETE' });
    if (activeConv?.id === id) setActiveConv(null);
    loadConversations();
  }

  // Simple markdown rendering for AI responses
  function renderContent(text) {
    return text.split('\n').map((line, i) => {
      if (line.startsWith('## ')) return <h4 key={i} style={{ fontSize: 14, fontWeight: 600, marginTop: 12, marginBottom: 4 }}>{line.slice(3)}</h4>;
      if (line.startsWith('- ') || line.startsWith('* ')) return <div key={i} style={{ paddingLeft: 12, marginBottom: 2, fontSize: 13 }}><span style={{ color: 'var(--accent)' }}>•</span> {line.slice(2)}</div>;
      if (line.startsWith('**') && line.endsWith('**')) return <div key={i} style={{ fontWeight: 600, fontSize: 13, marginTop: 8 }}>{line.slice(2, -2)}</div>;
      if (line.trim() === '') return <div key={i} style={{ height: 6 }} />;
      return <div key={i} style={{ fontSize: 13, lineHeight: 1.5 }}>{line}</div>;
    });
  }

  return (
    <div style={{ display: 'flex', gap: 16, minHeight: 500 }}>
      {/* Conversation list */}
      <div style={{ width: 220, flexShrink: 0 }}>
        <button className="btn btn-primary btn-small" style={{ width: '100%', marginBottom: 12 }} onClick={createConversation}>
          + New Research
        </button>
        {conversations.map(c => (
          <div
            key={c.id}
            onClick={() => loadConversation(c.id)}
            style={{
              padding: '8px 10px', marginBottom: 4, borderRadius: 'var(--radius)', cursor: 'pointer', fontSize: 13,
              background: activeConv?.id === c.id ? 'var(--accent)' : 'var(--card-bg)',
              color: activeConv?.id === c.id ? 'white' : 'var(--text-primary)',
              border: '1px solid var(--border-color)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title}</span>
            <button onClick={e => { e.stopPropagation(); deleteConversation(c.id); }} style={{
              background: 'none', border: 'none', color: activeConv?.id === c.id ? 'rgba(255,255,255,0.7)' : 'var(--text-secondary)',
              cursor: 'pointer', fontSize: 12, padding: '0 4px',
            }}>x</button>
          </div>
        ))}
      </div>

      {/* Chat area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
        {!activeConv ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
            Select a conversation or start a new one
          </div>
        ) : (
          <>
            {/* Messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
              {activeConv.messages.length === 0 && (
                <div style={{ textAlign: 'center', color: 'var(--text-secondary)', paddingTop: 40 }}>
                  <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 8 }}>AI Research Assistant</div>
                  <div style={{ fontSize: 13 }}>Ask about topics, content structure, best practices, or improvements for your course.</div>
                </div>
              )}
              {activeConv.messages.map((msg, i) => (
                <div key={i} style={{
                  marginBottom: 12,
                  padding: '10px 14px',
                  borderRadius: 8,
                  maxWidth: '85%',
                  marginLeft: msg.role === 'user' ? 'auto' : 0,
                  background: msg.role === 'user' ? 'var(--accent)' : '#F1F5F9',
                  color: msg.role === 'user' ? 'white' : 'var(--text-primary)',
                }}>
                  {msg.role === 'user' ? (
                    <div style={{ fontSize: 13 }}>{msg.content}</div>
                  ) : (
                    <div>{renderContent(msg.content)}</div>
                  )}
                </div>
              ))}
              {sending && (
                <div style={{ padding: '10px 14px', background: '#F1F5F9', borderRadius: 8, maxWidth: '85%', marginBottom: 12 }}>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Thinking...</div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            {error && <div style={{ padding: '6px 16px', background: '#FEF2F2', color: 'var(--danger)', fontSize: 13 }}>{error}</div>}
            <form onSubmit={sendMessage} style={{ display: 'flex', gap: 8, padding: 12, borderTop: '1px solid var(--border-color)' }}>
              <input
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder="Ask about topics, suggest content, review outlines..."
                disabled={sending}
                style={{ flex: 1, padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: 'var(--radius)', fontSize: 13 }}
              />
              <button type="submit" className="btn btn-primary btn-small" disabled={sending || !message.trim()}>
                Send
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
