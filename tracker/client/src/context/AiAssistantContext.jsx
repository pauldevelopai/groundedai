import { createContext, useContext, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useSectors } from './SectorContext.jsx';
import { apiFetch } from '../hooks/useApi.js';

const AiAssistantContext = createContext(null);

export function AiAssistantProvider({ children }) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [sending, setSending] = useState(false);
  const location = useLocation();
  const { sectors, selectedSectorId } = useSectors();

  function togglePanel() { setIsOpen(prev => !prev); }

  async function sendMessage(content) {
    if (!content.trim() || sending) return;
    setSending(true);

    const sectorName = selectedSectorId
      ? sectors.find(s => s.id === selectedSectorId)?.name || 'Unknown'
      : 'All sectors';

    const userMsg = { role: 'user', content, timestamp: new Date().toISOString() };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);

    try {
      const { reply } = await apiFetch('/ai-assistant/chat', {
        method: 'POST',
        body: JSON.stringify({
          message: content,
          conversationHistory: updatedMessages.filter(m => m.role === 'user' || m.role === 'assistant'),
          pageContext: { page: location.pathname, sectorName },
        }),
      });
      setMessages(prev => [...prev, { role: 'assistant', content: reply, timestamp: new Date().toISOString() }]);
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Sorry, I encountered an error: ${err.message}`, timestamp: new Date().toISOString() }]);
    } finally {
      setSending(false);
    }
  }

  return (
    <AiAssistantContext.Provider value={{ isOpen, togglePanel, messages, sendMessage, sending }}>
      {children}
    </AiAssistantContext.Provider>
  );
}

export function useAiAssistant() {
  const ctx = useContext(AiAssistantContext);
  if (!ctx) throw new Error('useAiAssistant must be used within AiAssistantProvider');
  return ctx;
}
