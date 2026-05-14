// CrawlPanel — UI for kicking off a Researcher deep-crawl into a dossier
// and watching it run. Posts to /api/research/dossiers/:id/crawl, then polls
// /api/research/crawl/:crawlId/status until completed/failed.
//
// Lives inside DossierDetail. The pg-boss worker must be running ('npm run
// worker') for the job to make progress — we warn if status never moves
// off 'pending'.

'use client';

import { useEffect, useRef, useState } from 'react';

type CrawlJob = {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  homepage_url: string;
  total_urls: number;
  processed_urls: number;
  failed_urls: number;
  rules: any;
  error: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
};

export default function CrawlPanel({
  dossierId, canEdit, onCrawlFinished,
}: {
  dossierId: string;
  canEdit: boolean;
  onCrawlFinished?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [homepageUrl, setHomepageUrl] = useState('');
  const [maxLinks, setMaxLinks] = useState<string>('10');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Active job we're polling. Survives across renders via the dossierId key.
  const [activeJob, setActiveJob] = useState<CrawlJob | null>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const stalePendingChecks = useRef(0);
  const [stallWarning, setStallWarning] = useState(false);

  function clearPoll() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }

  useEffect(() => () => clearPoll(), []);

  async function startCrawl(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const url = homepageUrl.trim();
    if (!url) { setError('Homepage URL required'); return; }
    try { new URL(url); } catch { setError('Not a valid URL'); return; }
    const max = parseInt(maxLinks, 10);
    if (!Number.isInteger(max) || max < 1 || max > 100) { setError('Max links must be 1-100'); return; }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/research/dossiers/${dossierId}/crawl`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ homepageUrl: url, maxLinks: max }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      stalePendingChecks.current = 0;
      setStallWarning(false);
      // Begin polling
      poll(j.crawlJobId);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  function poll(jobId: string) {
    clearPoll();
    const tick = async () => {
      try {
        const res = await fetch(`/api/research/crawl/${jobId}/status`);
        const j = await res.json();
        if (!res.ok) {
          setError(j.error || `Status ${res.status}`);
          clearPoll();
          return;
        }
        setActiveJob(j);
        if (j.status === 'completed' || j.status === 'failed' || j.status === 'cancelled') {
          clearPoll();
          if (j.status === 'completed' && onCrawlFinished) onCrawlFinished();
        } else if (j.status === 'pending') {
          // Worker might be down. After ~12s of no progress, warn.
          stalePendingChecks.current += 1;
          if (stalePendingChecks.current > 4) setStallWarning(true);
        } else {
          stalePendingChecks.current = 0;
          setStallWarning(false);
        }
      } catch (e: any) {
        setError(e.message);
      }
    };
    tick();
    pollRef.current = setInterval(tick, 3000);
  }

  function reset() {
    clearPoll();
    setActiveJob(null);
    setError(null);
    setStallWarning(false);
    stalePendingChecks.current = 0;
    setHomepageUrl('');
  }

  // ─── Render ─────────────────────────────────────────────────────────────

  if (!canEdit) return null;

  if (!open && !activeJob) {
    return (
      <div style={{ marginTop: 10 }}>
        <button type="button" onClick={() => setOpen(true)}
          style={{ padding: '6px 12px', background: 'none', color: '#0066cc', border: '1px dashed #0066cc', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>
          + Crawl a website into this dossier…
        </button>
      </div>
    );
  }

  if (activeJob) {
    const pct = activeJob.total_urls > 0
      ? Math.round(((activeJob.processed_urls + activeJob.failed_urls) / activeJob.total_urls) * 100)
      : 0;
    return (
      <div style={panelStyle}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <strong style={{ fontSize: 13, color: '#446' }}>🕸️ Crawling {activeJob.homepage_url}</strong>
          <span style={statusChip(activeJob.status)}>{activeJob.status}</span>
        </div>
        <div style={{ fontSize: 12, color: '#555', marginTop: 6 }}>
          {activeJob.status === 'pending' && 'Waiting for worker to pick this up…'}
          {activeJob.status === 'running' && (
            <>Discovered {activeJob.total_urls} URLs · {activeJob.processed_urls} parsed
              {activeJob.failed_urls > 0 && ` · ${activeJob.failed_urls} failed`}</>
          )}
          {activeJob.status === 'completed' && (
            <>Done — {activeJob.processed_urls} document(s) added{activeJob.failed_urls > 0 && `, ${activeJob.failed_urls} failed`}.</>
          )}
          {activeJob.status === 'failed' && (
            <span style={{ color: '#900' }}>Failed: {activeJob.error || 'unknown error'}</span>
          )}
        </div>
        {activeJob.total_urls > 0 && (activeJob.status === 'running' || activeJob.status === 'completed') && (
          <div style={{ marginTop: 8, height: 6, background: '#eef', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: '#0066cc', transition: 'width 0.3s ease' }} />
          </div>
        )}
        {stallWarning && (
          <p style={{ marginTop: 10, fontSize: 12, color: '#7a5800' }}>
            Still pending after a few polls. Is the worker running? Start it in a second
            terminal with <code style={{ background: '#fff8e6', padding: '0 4px' }}>npm run worker</code>.
          </p>
        )}
        <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
          {(activeJob.status === 'completed' || activeJob.status === 'failed' || activeJob.status === 'cancelled') && (
            <button type="button" onClick={reset}
              style={{ padding: '6px 12px', background: '#0066cc', color: 'white', border: 'none', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}>
              Start another crawl
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={panelStyle}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
        <strong style={{ fontSize: 13, color: '#446' }}>🕸️ Crawl a website into this dossier</strong>
        <button type="button" onClick={() => setOpen(false)}
          style={{ background: 'none', border: 'none', color: '#888', fontSize: 14, cursor: 'pointer' }}>×</button>
      </div>
      <p style={{ fontSize: 12, color: '#555', margin: '0 0 10px' }}>
        Researcher walks the homepage, discovers article links, scrapes each
        into a document. Same-host only by default; honours robots.txt;
        crawl rules in your newsroom profile customise behaviour.
      </p>
      <form onSubmit={startCrawl}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label style={{ fontSize: 12 }}>
            Homepage / archive URL
            <input type="url" required value={homepageUrl}
              onChange={(e) => setHomepageUrl(e.target.value)}
              placeholder="https://groundup.org.za/"
              style={{ display: 'block', width: '100%', padding: 6, fontSize: 13, border: '1px solid #ccc', borderRadius: 4, marginTop: 2 }}
            />
          </label>
          <label style={{ fontSize: 12 }}>
            Max links to crawl
            <input type="number" min={1} max={100} value={maxLinks}
              onChange={(e) => setMaxLinks(e.target.value)}
              style={{ display: 'block', width: 100, padding: 6, fontSize: 13, border: '1px solid #ccc', borderRadius: 4, marginTop: 2 }}
            />
          </label>
        </div>
        {error && <p style={{ color: '#900', fontSize: 12, margin: '8px 0 0' }}>{error}</p>}
        <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
          <button type="submit" disabled={submitting}
            style={{ padding: '6px 12px', background: '#0066cc', color: 'white', border: 'none', borderRadius: 4, fontSize: 13, cursor: submitting ? 'wait' : 'pointer', opacity: submitting ? 0.5 : 1 }}>
            {submitting ? 'Starting…' : 'Start crawl'}
          </button>
          <button type="button" onClick={() => setOpen(false)}
            style={{ padding: '6px 12px', background: 'none', border: '1px solid #ccc', borderRadius: 4, fontSize: 13, cursor: 'pointer' }}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  marginTop: 12,
  padding: 12,
  background: '#f4f7ff',
  border: '1px solid #cdd9f0',
  borderRadius: 6,
};

function statusChip(s: string): React.CSSProperties {
  const map: Record<string, [string, string]> = {
    pending:   ['#fef9c3', '#854d0e'],
    running:   ['#dbeafe', '#1e40af'],
    completed: ['#dcfce7', '#166534'],
    failed:    ['#fee2e2', '#991b1b'],
    cancelled: ['#e5e7eb', '#374151'],
  };
  const [bg, fg] = map[s] || ['#eee', '#666'];
  return { fontSize: 11, padding: '1px 8px', background: bg, color: fg, borderRadius: 4 };
}
