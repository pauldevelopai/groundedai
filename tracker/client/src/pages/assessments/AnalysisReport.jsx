export default function AnalysisReport({ analysis, recommendedTier, analysedAt }) {
  if (!analysis) return null;

  // Simple markdown-like rendering: headers, bullet points, bold
  function renderMarkdown(text) {
    const lines = text.split('\n');
    const elements = [];
    let i = 0;

    for (const line of lines) {
      i++;
      if (line.startsWith('## ')) {
        elements.push(<h3 key={i} style={{ fontSize: 16, fontWeight: 600, marginTop: 20, marginBottom: 8, color: 'var(--text-primary)' }}>{line.slice(3)}</h3>);
      } else if (line.startsWith('- ') || line.startsWith('* ')) {
        elements.push(
          <div key={i} style={{ paddingLeft: 16, marginBottom: 4, fontSize: 14 }}>
            <span style={{ color: 'var(--accent)', marginRight: 8 }}>•</span>
            {renderInline(line.slice(2))}
          </div>
        );
      } else if (line.trim() === '') {
        elements.push(<div key={i} style={{ height: 8 }} />);
      } else {
        elements.push(<p key={i} style={{ fontSize: 14, marginBottom: 4, lineHeight: 1.6 }}>{renderInline(line)}</p>);
      }
    }
    return elements;
  }

  function renderInline(text) {
    // Bold: **text**
    const parts = text.split(/\*\*(.*?)\*\*/g);
    return parts.map((part, i) =>
      i % 2 === 1 ? <strong key={i}>{part}</strong> : part
    );
  }

  return (
    <div className="analysis-report">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        {recommendedTier && (
          <span className="stage-badge stage-active" style={{ fontSize: 13, padding: '4px 14px' }}>
            Recommended: {recommendedTier.charAt(0).toUpperCase() + recommendedTier.slice(1)}
          </span>
        )}
        {analysedAt && (
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            Analysed {new Date(analysedAt).toLocaleDateString()} at {new Date(analysedAt).toLocaleTimeString()}
          </span>
        )}
      </div>
      <div style={{ background: 'white', border: '1px solid var(--border-color)', borderRadius: 'var(--radius)', padding: 24 }}>
        {renderMarkdown(analysis)}
      </div>
    </div>
  );
}
