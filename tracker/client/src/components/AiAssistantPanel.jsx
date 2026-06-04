import { useState, useRef, useEffect } from 'react';
import { useAiAssistant } from '../context/AiAssistantContext.jsx';
import AiBadge from './AiBadge.jsx';

function renderContent(text) {
  return text.split('\n').map((line, i) => {
    if (line.startsWith('## ')) return <div key={i} style={{ fontSize: 13, fontWeight: 600, marginTop: 10, marginBottom: 4 }}>{line.slice(3)}</div>;
    if (line.startsWith('**') && line.endsWith('**')) return <div key={i} style={{ fontWeight: 600, fontSize: 13, marginTop: 6 }}>{line.slice(2, -2)}</div>;
    if (line.startsWith('- ') || line.startsWith('* ')) return <div key={i} style={{ paddingLeft: 10, marginBottom: 2, fontSize: 13 }}><span style={{ color: 'var(--ai-purple)' }}>•</span> {line.slice(2)}</div>;
    if (/^\d+\.\s/.test(line)) return <div key={i} style={{ paddingLeft: 10, marginBottom: 2, fontSize: 13 }}>{line}</div>;
    if (line.trim() === '') return <div key={i} style={{ height: 4 }} />;
    return <div key={i} style={{ fontSize: 13, lineHeight: 1.5 }}>{line}</div>;
  });
}

export default function AiAssistantPanel() {
  const { isOpen, togglePanel, messages, sendMessage, sending } = useAiAssistant();
  const [input, setInput] = useState('');
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function handleSubmit(e) {
    e.preventDefault();
    if (!input.trim()) return;
    sendMessage(input);
    setInput('');
  }

  return (
    <>
      {/* Floating toggle button */}
      {!isOpen && (
        <button className="ai-toggle-btn" onClick={togglePanel} title="Ask Holly">
          AI
        </button>
      )}

      {/* Panel */}
      <div className={`ai-panel ${isOpen ? 'open' : ''}`}>
        <div className="ai-panel-header">
          <h3>
            <span style={{ color: 'var(--ai-purple)' }}>Holly</span>
            <AiBadge variant="powered" />
          </h3>
          <button className="ai-panel-close" onClick={togglePanel}>×</button>
        </div>

        <div className="ai-panel-messages">
          {messages.length === 0 && (
            <div style={{ textAlign: 'center', paddingTop: 40 }}>
              <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--ai-purple)', marginBottom: 8 }}>Ask Holly</div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                I can help with your business across CRM, programmes, curriculum, marketing, fundraising, and more. Try asking:
              </div>
              <div style={{ marginTop: 16, textAlign: 'left', display: 'inline-block' }}>
                {[
                  'What AI tools are available?',
                  'How do I generate an AI policy?',
                  'What should I focus on today?',
                  'Help me plan a new AI training course',
                ].map((q, i) => (
                  <button key={i} onClick={() => { sendMessage(q); }} style={{
                    display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', marginBottom: 6,
                    background: 'var(--ai-purple-bg)', border: '1px solid #DDD6FE', borderRadius: 'var(--radius)',
                    fontSize: 13, color: 'var(--ai-purple)', cursor: 'pointer',
                  }}>
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} style={{
              marginBottom: 12, padding: '10px 14px', borderRadius: 8, maxWidth: '90%',
              marginLeft: msg.role === 'user' ? 'auto' : 0,
              background: msg.role === 'user' ? 'var(--ai-purple)' : '#F1F5F9',
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
            <div style={{ padding: '10px 14px', background: '#F1F5F9', borderRadius: 8, maxWidth: '90%', marginBottom: 12 }}>
              <div style={{ fontSize: 13, color: 'var(--ai-purple)' }}>Thinking...</div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <form onSubmit={handleSubmit} className="ai-panel-input">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Ask Holly anything..."
            disabled={sending}
          />
          <button type="submit" disabled={sending || !input.trim()}>Send</button>
        </form>
      </div>
    </>
  );
}
