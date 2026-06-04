// How AI lawsuits + regulations are connected — two complementary views.
//
// Tab 1 (Groups): visible clusters — lays cases out as labeled group cards.
// Pick a "Group by" dimension (Defendants, Jurisdiction, Type, Shared issue
// token) and you see each bucket and its members at a glance.
//
// Tab 2 (Network): 2D force-directed graph. Clean, light background, node
// size = connection count, labels always readable, fewer default edges.
//
// Both views share the same underlying data pipeline.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ForceGraph2D from 'react-force-graph-2d';
import { publicFetch } from '../../hooks/usePublicApi.js';
import {
  LAWSUIT_STATUS, LAWSUIT_TYPE_COLORS,
  REG_STATUS, REG_TYPE_COLORS,
  StatusBadge, ChipTag, formatDate,
} from './publicHelpers.jsx';

const KIND_COLOR = { lawsuit: '#6366F1', regulation: '#10B981' };

// Low-signal words we exclude so "shared issue" buckets mean something
const STOPWORDS = new Set([
  'ai', 'ai-regulation', 'ai-law', 'ai-litigation', 'regulation', 'law',
  'international', 'copyright', 'privacy', 'other', 'data', 'training',
]);

export default function PublicExplore() {
  const navigate = useNavigate();
  const [raw, setRaw] = useState({ lawsuits: [], regulations: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('groups'); // 'groups' | 'network'

  useEffect(() => {
    setLoading(true);
    Promise.all([
      publicFetch('/public/lawsuits?pageSize=100&page=1'),
      publicFetch('/public/regulations?pageSize=100&page=1'),
    ])
      .then(([l, r]) => setRaw({ lawsuits: l.items || [], regulations: r.items || [] }))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const nodes = useMemo(() => normaliseNodes(raw), [raw]);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0, letterSpacing: '-0.01em' }}>Connections</h1>
        <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
          {nodes.length} items · {raw.lawsuits.length} lawsuits + {raw.regulations.length} regulations
        </span>
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid var(--border-color)' }}>
        <TabBtn active={tab === 'groups'}  onClick={() => setTab('groups')}>Groups</TabBtn>
        <TabBtn active={tab === 'network'} onClick={() => setTab('network')}>Network</TabBtn>
      </div>

      {loading && <div style={{ color: 'var(--text-secondary)' }}>Loading…</div>}
      {error   && <div style={{ color: '#991B1B' }}>{error}</div>}

      {!loading && !error && tab === 'groups'  && <GroupsView nodes={nodes} navigate={navigate} />}
      {!loading && !error && tab === 'network' && <NetworkView nodes={nodes} navigate={navigate} />}
    </div>
  );
}

// ── Data normalisation ──────────────────────────────────────────────────────
function normaliseNodes({ lawsuits, regulations }) {
  const l = (lawsuits || []).map(c => ({
    id: `lawsuit:${c.id}`,
    raw_id: c.id,
    kind: 'lawsuit',
    name: c.case_name,
    jurisdiction: c.jurisdiction || 'Unknown',
    type: c.case_type || 'other',
    status: c.status,
    court_or_regulator: c.court || null,
    defendants: (c.defendants || []),
    plaintiffs: (c.plaintiffs || []),
    issue_tokens: [...(c.key_issues || [])].flatMap(tokenise).filter(t => !STOPWORDS.has(t)),
    tags: (c.tags || []).filter(t => !STOPWORDS.has(t)),
    date: c.filing_date || c.last_update,
    detail_line: [(c.plaintiffs || []).slice(0, 2).join(', '), (c.defendants || []).slice(0, 2).join(', ')].filter(Boolean).join(' v. '),
    href: `/legal/lawsuits/${c.id}`,
  }));
  const r = (regulations || []).map(x => ({
    id: `regulation:${x.id}`,
    raw_id: x.id,
    kind: 'regulation',
    name: x.short_name || x.regulation_name,
    full_name: x.regulation_name,
    jurisdiction: x.jurisdiction || 'Unknown',
    type: x.regulation_type || 'other',
    status: x.status,
    court_or_regulator: x.regulator || null,
    defendants: [],
    plaintiffs: [],
    issue_tokens: [
      ...(x.key_provisions || []),
      ...(x.scope || []),
    ].flatMap(tokenise).filter(t => !STOPWORDS.has(t)),
    tags: (x.tags || []).filter(t => !STOPWORDS.has(t)),
    date: x.effective_date || x.enacted_date,
    detail_line: x.regulator || '',
    href: `/legal/regulations/${x.id}`,
  }));
  return [...l, ...r];
}

function tokenise(s) {
  if (!s) return [];
  return s.toLowerCase().split(/[\s,;\-()/]+/).filter(t => t.length > 3);
}

// ═══════════════════════════════════════════════════════════════════════════
// GROUPS VIEW — clustered cards
// ═══════════════════════════════════════════════════════════════════════════

const GROUP_DIMS = {
  defendant: {
    label: 'Shared defendant',
    extract: n => n.defendants.map(d => d.toLowerCase()),
    minGroupSize: 2,
    formatLabel: s => titleCase(s),
  },
  jurisdiction: {
    label: 'Jurisdiction',
    extract: n => [n.jurisdiction],
    minGroupSize: 1,
    formatLabel: s => s,
  },
  type: {
    label: 'Type',
    extract: n => [n.type],
    minGroupSize: 1,
    formatLabel: s => s.replace(/_/g, ' '),
  },
  court_or_regulator: {
    label: 'Court / regulator',
    extract: n => n.court_or_regulator ? [n.court_or_regulator] : [],
    minGroupSize: 2,
    formatLabel: s => s,
  },
  issue: {
    label: 'Shared legal issue',
    extract: n => [...new Set(n.issue_tokens)],
    minGroupSize: 3,
    formatLabel: s => s,
  },
};

function GroupsView({ nodes, navigate }) {
  const [dim, setDim] = useState('defendant');
  const [kindFilter, setKindFilter] = useState('both');

  const filtered = useMemo(() => {
    if (kindFilter === 'lawsuits')    return nodes.filter(n => n.kind === 'lawsuit');
    if (kindFilter === 'regulations') return nodes.filter(n => n.kind === 'regulation');
    return nodes;
  }, [nodes, kindFilter]);

  const groups = useMemo(() => {
    const spec = GROUP_DIMS[dim];
    const bucket = new Map();
    for (const n of filtered) {
      const values = spec.extract(n) || [];
      for (const v of values) {
        if (!v) continue;
        if (!bucket.has(v)) bucket.set(v, []);
        bucket.get(v).push(n);
      }
    }
    // Orphan / singleton items go in their own bucket
    const arr = [];
    for (const [key, members] of bucket) {
      if (members.length >= spec.minGroupSize) {
        arr.push({ key, label: spec.formatLabel(key), members });
      }
    }
    arr.sort((a, b) => b.members.length - a.members.length);
    return arr;
  }, [filtered, dim]);

  return (
    <div>
      <div className="card" style={{ padding: 14, marginBottom: 16, display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={labelStyle}>Group by</span>
          <select value={dim} onChange={e => setDim(e.target.value)} style={selectStyle}>
            {Object.entries(GROUP_DIMS).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={labelStyle}>Show</span>
          <select value={kindFilter} onChange={e => setKindFilter(e.target.value)} style={selectStyle}>
            <option value="both">Lawsuits + regulations</option>
            <option value="lawsuits">Lawsuits only</option>
            <option value="regulations">Regulations only</option>
          </select>
        </label>
        <div style={{ flex: 1, textAlign: 'right', fontSize: 12, color: 'var(--text-secondary)' }}>
          {groups.length} {groups.length === 1 ? 'group' : 'groups'}
        </div>
      </div>

      {groups.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>
          No groups of size ≥ {GROUP_DIMS[dim].minGroupSize}. Try a different dimension.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
        {groups.map(g => <GroupCard key={g.key} group={g} navigate={navigate} />)}
      </div>
    </div>
  );
}

function GroupCard({ group, navigate }) {
  const size = group.members.length;
  // Hue derived from the group label so the same group keeps its colour if you
  // switch dimensions and come back.
  const hue = Array.from(group.key).reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 0) % 360;
  const accent = `hsl(${hue}, 55%, 50%)`;

  return (
    <div className="card" style={{
      padding: 0, overflow: 'hidden', borderTop: `3px solid ${accent}`,
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ padding: '12px 14px', background: `hsl(${hue}, 55%, 97%)` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: `hsl(${hue}, 65%, 30%)`, lineHeight: 1.25 }}>
            {group.label}
          </div>
          <span style={{ fontSize: 12, fontWeight: 700, color: `hsl(${hue}, 65%, 30%)`, background: `hsl(${hue}, 55%, 90%)`, borderRadius: 12, padding: '2px 10px' }}>
            {size}
          </span>
        </div>
      </div>
      <div style={{ padding: '8px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {group.members.map(n => (
          <div key={n.id}
               onClick={() => navigate(n.href)}
               style={{
                 padding: '8px 10px', borderRadius: 6, cursor: 'pointer',
                 display: 'flex', gap: 8, alignItems: 'center',
                 border: `1px solid transparent`,
               }}
               onMouseEnter={e => { e.currentTarget.style.background = '#F3F4F6'; e.currentTarget.style.borderColor = 'var(--border-color)'; }}
               onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent'; }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
              background: KIND_COLOR[n.kind],
            }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.name}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {n.jurisdiction} · {n.status}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// NETWORK VIEW — clean 2D force graph
// ═══════════════════════════════════════════════════════════════════════════

const EDGE_TYPES = {
  defendant:    { label: 'Shared defendant',    color: '#EF4444', defaultOn: true,  crossKind: false, weight: 2.0 },
  issue:        { label: 'Shared legal issue',  color: '#8B5CF6', defaultOn: true,  crossKind: true,  weight: 1.0 },
  court:        { label: 'Same court/regulator', color: '#EC4899', defaultOn: false, crossKind: false, weight: 1.5 },
  jurisdiction: { label: 'Same jurisdiction',   color: '#94A3B8', defaultOn: false, crossKind: true,  weight: 0.3 },
};

function NetworkView({ nodes, navigate }) {
  const fgRef = useRef(null);
  const containerRef = useRef(null);
  const [dims, setDims] = useState({ w: 900, h: 640 });
  const [hover, setHover] = useState(null);
  const [focus, setFocus] = useState(null);
  const [edgeEnabled, setEdgeEnabled] = useState(() =>
    Object.fromEntries(Object.entries(EDGE_TYPES).map(([k, v]) => [k, v.defaultOn]))
  );
  const [kindFilter, setKindFilter] = useState('both');

  useEffect(() => {
    function update() {
      if (!containerRef.current) return;
      setDims({ w: containerRef.current.clientWidth, h: 640 });
    }
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const filteredNodes = useMemo(() => {
    if (kindFilter === 'lawsuits')    return nodes.filter(n => n.kind === 'lawsuit');
    if (kindFilter === 'regulations') return nodes.filter(n => n.kind === 'regulation');
    return nodes;
  }, [nodes, kindFilter]);

  const edges = useMemo(() => buildEdges(filteredNodes, edgeEnabled), [filteredNodes, edgeEnabled]);

  // Degree per node, used to size hubs bigger.
  const degreeById = useMemo(() => {
    const m = new Map();
    for (const e of edges) {
      m.set(e.source, (m.get(e.source) || 0) + 1);
      m.set(e.target, (m.get(e.target) || 0) + 1);
    }
    return m;
  }, [edges]);

  const graphData = useMemo(() => ({
    nodes: filteredNodes.map(n => ({
      ...n,
      degree: degreeById.get(n.id) || 0,
    })),
    links: edges,
  }), [filteredNodes, edges, degreeById]);

  const neighbourIds = useMemo(() => {
    if (!focus) return null;
    const set = new Set([focus.id]);
    for (const e of edges) {
      const sid = typeof e.source === 'object' ? e.source.id : e.source;
      const tid = typeof e.target === 'object' ? e.target.id : e.target;
      if (sid === focus.id) set.add(tid);
      if (tid === focus.id) set.add(sid);
    }
    return set;
  }, [focus, edges]);

  useEffect(() => {
    const t = setTimeout(() => { try { fgRef.current?.zoomToFit(500, 60); } catch {} }, 400);
    return () => clearTimeout(t);
  }, [graphData]);

  const drawNode = useCallback((node, ctx, globalScale) => {
    const isDim = neighbourIds && !neighbourIds.has(node.id);
    const radius = Math.max(4, 4 + Math.sqrt(node.degree));
    const color = KIND_COLOR[node.kind] || '#64748B';

    ctx.globalAlpha = isDim ? 0.15 : 1.0;

    // Node circle
    ctx.beginPath();
    ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Label — always visible
    const label = shortLabel(node.name);
    const fontSize = 11 / Math.max(0.8, globalScale * 0.9);
    ctx.font = `${fontSize}px -apple-system, "Segoe UI", Roboto, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const textWidth = ctx.measureText(label).width;

    // Label background for readability
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.fillRect(node.x - textWidth / 2 - 3, node.y + radius + 2, textWidth + 6, fontSize + 3);

    ctx.fillStyle = '#111827';
    ctx.fillText(label, node.x, node.y + radius + 3);

    ctx.globalAlpha = 1;
  }, [neighbourIds]);

  const drawLink = useCallback((link, ctx) => {
    const sid = typeof link.source === 'object' ? link.source.id : link.source;
    const tid = typeof link.target === 'object' ? link.target.id : link.target;
    const isDim = neighbourIds && (!neighbourIds.has(sid) || !neighbourIds.has(tid));
    ctx.globalAlpha = isDim ? 0.05 : 0.35;
    ctx.strokeStyle = link.color || '#94A3B8';
    ctx.lineWidth = Math.min(2.5, 0.5 + link.weight * 0.5);
    ctx.beginPath();
    const s = link.source;
    const t = link.target;
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(t.x, t.y);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }, [neighbourIds]);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 300px', gap: 16, alignItems: 'start' }}>
      <div className="card" ref={containerRef} style={{ padding: 0, overflow: 'hidden', background: '#FAFAF9', minHeight: 640 }}>
        <ForceGraph2D
          ref={fgRef}
          graphData={graphData}
          width={dims.w}
          height={dims.h}
          nodeCanvasObject={drawNode}
          nodeCanvasObjectMode={() => 'replace'}
          linkCanvasObject={drawLink}
          linkCanvasObjectMode={() => 'replace'}
          nodePointerAreaPaint={(node, color, ctx) => {
            ctx.fillStyle = color;
            ctx.beginPath();
            const radius = Math.max(8, 6 + Math.sqrt(node.degree || 0));
            ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI);
            ctx.fill();
          }}
          onNodeHover={node => setHover(node || null)}
          onNodeClick={node => { setFocus(focus?.id === node.id ? null : node); }}
          onBackgroundClick={() => setFocus(null)}
          cooldownTicks={120}
          d3AlphaDecay={0.02}
          d3VelocityDecay={0.3}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="card" style={{ padding: 14 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
            <span style={labelStyle}>Show</span>
            <select value={kindFilter} onChange={e => setKindFilter(e.target.value)} style={selectStyle}>
              <option value="both">Lawsuits + regulations</option>
              <option value="lawsuits">Lawsuits only</option>
              <option value="regulations">Regulations only</option>
            </select>
          </label>

          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 4, marginBottom: 8 }}>
            Connect by
          </div>
          {Object.entries(EDGE_TYPES).map(([k, meta]) => (
            <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, padding: '3px 0', cursor: 'pointer' }}>
              <input type="checkbox" checked={edgeEnabled[k]}
                     onChange={e => setEdgeEnabled(prev => ({ ...prev, [k]: e.target.checked }))} />
              <span style={{ width: 10, height: 3, background: meta.color, display: 'inline-block' }} />
              <span>{meta.label}</span>
            </label>
          ))}

          <div style={{ marginTop: 12, fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
            Node size = number of connections. Click a node to focus on its neighbours. Click empty space to reset.
          </div>
        </div>

        <NodePanel node={hover || focus} onOpen={n => navigate(n.href)} />
      </div>
    </div>
  );
}

function buildEdges(nodes, enabled) {
  const map = new Map();
  const key = (a, b) => a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;

  function push(a, b, type) {
    if (a.id === b.id) return;
    if (!EDGE_TYPES[type].crossKind && a.kind !== b.kind) return;
    const k = key(a, b);
    let rec = map.get(k);
    if (!rec) { rec = { source: a.id, target: b.id, weight: 0, types: new Set() }; map.set(k, rec); }
    rec.weight += EDGE_TYPES[type].weight;
    rec.types.add(type);
  }

  function bucket(pick, type) {
    const by = new Map();
    for (const n of nodes) {
      const vals = pick(n) || [];
      for (const v of vals) {
        if (!v) continue;
        const key = typeof v === 'string' ? v.toLowerCase().trim() : v;
        if (!by.has(key)) by.set(key, []);
        by.get(key).push(n);
      }
    }
    for (const group of by.values()) {
      if (group.length < 2) continue;
      for (let i = 0; i < group.length; i++)
        for (let j = i + 1; j < group.length; j++)
          push(group[i], group[j], type);
    }
  }

  if (enabled.defendant)    bucket(n => n.defendants, 'defendant');
  if (enabled.issue)        bucket(n => [...new Set(n.issue_tokens)], 'issue');
  if (enabled.court)        bucket(n => [n.court_or_regulator], 'court');
  if (enabled.jurisdiction) bucket(n => [n.jurisdiction], 'jurisdiction');

  const arr = [];
  for (const e of map.values()) {
    // Primary colour from highest-priority type present
    const priority = ['defendant', 'court', 'issue', 'jurisdiction'];
    const primary = priority.find(t => e.types.has(t));
    e.color = EDGE_TYPES[primary]?.color || '#94A3B8';
    e.types = [...e.types];
    arr.push(e);
  }
  return arr;
}

// ── Shared small bits ──────────────────────────────────────────────────────
function NodePanel({ node, onOpen }) {
  if (!node) {
    return (
      <div className="card" style={{ padding: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
          Click any node
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          Click a node to focus on its direct connections. Hubs (bigger circles) are the most connected cases. Hover to preview without focusing.
        </div>
      </div>
    );
  }

  const isLawsuit = node.kind === 'lawsuit';
  const typeColor = (isLawsuit ? LAWSUIT_TYPE_COLORS : REG_TYPE_COLORS)[node.type] || '#94A3B8';
  const statusMap = isLawsuit ? LAWSUIT_STATUS : REG_STATUS;

  return (
    <div className="card" style={{ padding: 14, borderLeft: `3px solid ${typeColor}` }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
        <ChipTag>{isLawsuit ? 'Lawsuit' : 'Regulation'}</ChipTag>
        <ChipTag>{node.jurisdiction}</ChipTag>
        <StatusBadge map={statusMap} status={node.status} />
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4, lineHeight: 1.3 }}>{node.name}</div>
      {node.detail_line && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>{node.detail_line}</div>}
      <div style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: 3 }}>
        {node.court_or_regulator && <span>{isLawsuit ? 'Court' : 'Regulator'}: {node.court_or_regulator}</span>}
        {node.date && <span>{isLawsuit ? 'Filed' : 'Effective'}: {formatDate(node.date)}</span>}
      </div>
      <button onClick={() => onOpen(node)} className="btn btn-primary btn-small" style={{ fontSize: 12, marginTop: 10 }}>
        Open full page →
      </button>
    </div>
  );
}

function shortLabel(name) {
  if (!name) return '';
  if (name.length <= 30) return name;
  const m = name.match(/^(.+?)( v\. | — | - )/);
  if (m) return m[1].slice(0, 30) + '…';
  return name.slice(0, 30) + '…';
}

function titleCase(s) {
  return s.split(/\s+/).map(w => w.length > 2 ? w[0].toUpperCase() + w.slice(1) : w).join(' ');
}

function TabBtn({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      padding: '8px 16px', fontSize: 13, fontWeight: active ? 600 : 500,
      color: active ? 'var(--accent)' : 'var(--text-secondary)',
      background: 'transparent', border: 'none', cursor: 'pointer',
      borderBottom: `2px solid ${active ? 'var(--accent)' : 'transparent'}`,
      marginBottom: -1,
    }}>{children}</button>
  );
}

const labelStyle = {
  fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)',
  textTransform: 'uppercase', letterSpacing: '0.05em',
};
const selectStyle = {
  padding: '6px 10px', fontSize: 13,
  border: '1px solid var(--border-color)', borderRadius: 'var(--radius)',
  background: 'var(--card-bg)', color: 'var(--text-primary)', minWidth: 200,
};
