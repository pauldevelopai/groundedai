import { useState } from 'react';
import { apiFetch } from '../hooks/useApi.js';

export default function AiFeedback({ interactionId }) {
  const [submitted, setSubmitted] = useState(false);
  const [rating, setRating] = useState(null);

  if (!interactionId || submitted) {
    return submitted ? (
      <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Feedback recorded</span>
    ) : null;
  }

  async function submit(wasUsed, userRating) {
    try {
      await apiFetch(`/knowledge/interactions/${interactionId}/feedback`, {
        method: 'PUT',
        body: JSON.stringify({ was_used: wasUsed, user_rating: userRating }),
      });
      setSubmitted(true);
    } catch {}
  }

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
      <span style={{ color: 'var(--text-secondary)' }}>Helpful?</span>
      <button
        onClick={() => submit(true, 5)}
        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, padding: '2px 4px', borderRadius: 4, color: '#10B981' }}
        title="Yes, this was useful"
      >+</button>
      <button
        onClick={() => submit(false, 1)}
        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, padding: '2px 4px', borderRadius: 4, color: '#EF4444' }}
        title="Not helpful"
      >-</button>
    </div>
  );
}
