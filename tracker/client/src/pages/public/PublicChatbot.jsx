// Floating chatbot for the public AI Legal site.
// Collapsed: small circular button bottom-right. Expanded: chat panel.
// Chat is scoped server-side to AI law topics only.
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { publicFetch } from '../../hooks/usePublicApi.js';

const STORAGE_KEY = 'ailegal_chat_history_v1';
const SUGGESTIONS = [
  'What cases has OpenAI been sued in?',
  'When does the EU AI Act take effect?',
  'Which countries have decided AI copyright cases?',
  'What is the Colorado AI Act?',
];

export default function PublicChatbot() {
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const scrollRef = useRef(null);

  // Restore history from sessionStorage so a refresh doesn't wipe the chat
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) setHistory(JSON.parse(raw));
    } catch {}
  }, []);
  useEffect(() => {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(history)); } catch {}
  }, [history]);

  // Auto-scroll to the bottom when messages change
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [history, loading]);

  async function send(text) {
    const msg = (text || '').trim();
    if (!msg || loading) return;

    const userTurn = { role: 'user', content: msg };
    const nextHistory = [...history, userTurn];
    setHistory(nextHistory);
    setInput('');
    setLoading(true);
    setError(null);

    try {
      const res = await publicFetch('/public/chat', {
        method: 'POST',
        body: JSON.stringify({
          message: msg,
          history: history.map(h => ({ role: h.role, content: h.content })),
        }),
      });
      setHistory([...nextHistory, {
        role: 'assistant',
        content: res.reply,
        citations: res.citations || [],
        context_used: res.context_used,
      }]);
    } catch (err) {
      setError(err.message);
      // Revert the user turn so the user can retry
      setHistory(history);
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setHistory([]);
    setError(null);
    try { sessionStorage.removeItem(STORAGE_KEY); } catch {}
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        aria-label="Open Grounded: AI Legal assistant"
        style={{
          position: 'fixed', right: 20, bottom: 20, zIndex: 100,
          width: 56, height: 56, borderRadius: '50%',
          background: 'var(--accent)', color: 'white',
          border: 'none', cursor: 'pointer',
          boxShadow: '0 4px 14px rgba(0,0,0,0.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 24,
        }}
      >💬</button>
    );
  }

  return (
    <div style={{
      position: 'fixed', right: 20, bottom: 20, zIndex: 100,
      width: 380, maxWidth: 'calc(100vw - 40px)',
      height: 560, maxHeight: 'calc(100vh - 40px)',
      background: 'var(--card-bg)', color: 'var(--text-primary)',
      border: '1px solid var(--border-color)',
      borderRadius: 12,
      boxShadow: '0 12px 40px rgba(0,0,0,0.18)',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '12px 14px', background: '#0B1220', color: 'white',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
          <span style={{ fontSize: 14, fontWeight: 700 }}>Grounded: AI Legal assistant</span>
          <span style={{ fontSize: 10, color: '#94A3B8' }}>Powered by Claude · scoped to AI law</span>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {history.length > 0 && (
            <button onClick={reset} title="Reset chat" style={iconBtn}>↻</button>
          )}
          <button onClick={() => setOpen(false)} title="Close" style={iconBtn}>✕</button>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: 12, background: '#FAFAF9' }}>
        {history.length === 0 && (
          <Intro onPick={send} />
        )}
        {history.map((msg, i) => <Bubble key={i} msg={msg} />)}
        {loading && <LoadingBubble />}
        {error && (
          <div style={{ padding: '10px 12px', margin: '8px 0', background: '#FEE2E2', color: '#991B1B', fontSize: 12, borderRadius: 8 }}>
            {error}
          </div>
        )}
      </div>

      {/* Input */}
      <form
        onSubmit={e => { e.preventDefault(); send(input); }}
        style={{ padding: 10, borderTop: '1px solid var(--border-color)', display: 'flex', gap: 6 }}
      >
        <input
          type="text"
          placeholder="Ask about an AI case or regulation…"
          value={input}
          onChange={e => setInput(e.target.value)}
          disabled={loading}
          maxLength={500}
          style={{
            flex: 1, padding: '8px 12px', fontSize: 13,
            border: '1px solid var(--border-color)', borderRadius: 6,
            background: 'white', color: 'var(--text-primary)',
          }}
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          style={{
            padding: '0 14px', fontSize: 13, fontWeight: 600, cursor: loading ? 'default' : 'pointer',
            border: 'none', borderRadius: 6, background: 'var(--accent)', color: 'white',
            opacity: loading || !input.trim() ? 0.5 : 1,
          }}
        >{loading ? '…' : 'Ask'}</button>
      </form>
    </div>
  );
}

// ── Bubbles ─────────────────────────────────────────────────────────────────
function Bubble({ msg }) {
  const isUser = msg.role === 'user';
  return (
    <div style={{
      display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start',
      margin: '6px 0',
    }}>
      <div style={{
        maxWidth: '85%',
        padding: '9px 12px', borderRadius: 12,
        background: isUser ? 'var(--accent)' : 'white',
        color: isUser ? 'white' : 'var(--text-primary)',
        border: isUser ? 'none' : '1px solid var(--border-color)',
        fontSize: 13, lineHeight: 1.5,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}>
        {isUser ? msg.content : renderAssistantText(msg.content)}
        {msg.citations?.length > 0 && (
          <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #E5E7EB', display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {msg.citations.map(c => (
              <Link
                key={`${c.kind}:${c.id}`}
                to={c.kind === 'lawsuit' ? `/legal/lawsuits/${c.id}` : `/legal/regulations/${c.id}`}
                style={{
                  fontSize: 10, padding: '2px 8px', borderRadius: 10,
                  background: c.kind === 'lawsuit' ? '#EEF2FF' : '#D1FAE5',
                  color: c.kind === 'lawsuit' ? '#4F46E5' : '#065F46',
                  textDecoration: 'none', fontWeight: 600,
                }}
              >
                {c.kind === 'lawsuit' ? '⚖ ' : '📜 '}{c.name}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Strip bracketed citation markers like [lawsuit:uuid] from rendered text —
// they're redundant once the citations chip row is shown below the bubble.
function renderAssistantText(text) {
  return (text || '').replace(/\[(lawsuit|regulation):[0-9a-f-]{8,}\]/gi, '').replace(/\s+([.,;:])/g, '$1').trim();
}

function LoadingBubble() {
  return (
    <div style={{ display: 'flex', margin: '6px 0' }}>
      <div style={{
        padding: '9px 12px', borderRadius: 12,
        background: 'white', border: '1px solid var(--border-color)',
        fontSize: 13, color: 'var(--text-secondary)',
      }}>
        Thinking…
      </div>
    </div>
  );
}

function Intro({ onPick }) {
  return (
    <div style={{ padding: 8 }}>
      <div style={{ fontSize: 13, color: 'var(--text-primary)', marginBottom: 12, lineHeight: 1.5 }}>
        I can answer questions about the AI lawsuits and regulations tracked on this site. I'm not a lawyer — I summarise public records.
      </div>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Try</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {SUGGESTIONS.map(s => (
          <button key={s} onClick={() => onPick(s)} style={{
            textAlign: 'left', padding: '8px 10px', fontSize: 12,
            border: '1px solid var(--border-color)', borderRadius: 8,
            background: 'white', color: 'var(--text-primary)', cursor: 'pointer',
          }}>
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

const iconBtn = {
  background: 'transparent', border: 'none', color: '#94A3B8', cursor: 'pointer',
  fontSize: 14, padding: '4px 8px', borderRadius: 4,
};
