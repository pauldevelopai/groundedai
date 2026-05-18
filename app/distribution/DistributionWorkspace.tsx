// DistributionWorkspace — single-screen distributor surface.

'use client';

import { useState, FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import ExternalToolLinks from '@/app/components/ExternalToolLinks';
import GlobalNav from '@/app/components/GlobalNav';

type Submission = {
  id: string; source: string; sender_name: string | null; sender_contact: string | null;
  subject: string | null; body: string;
  status: 'new' | 'in_triage' | 'routed' | 'archived' | 'spam' | 'duplicate';
  classification: string | null;
  agent_triage: Record<string, unknown>;
  routed_to_contributor_id: string | null;
  routed_to_calendar_id: string | null;
  routed_to_verifier_run_id: string | null;
  routed_to_research_dossier_id: string | null;
  notes: string | null;
  created_at: string;
};
type Credential = {
  id: string; label: string; channel_kind: string; status: string;
  display_metadata: Record<string, unknown>;
  last_used_at: string | null; expires_at: string | null;
};
type Channel = {
  id: string; name: string; channel_kind: string;
  external_handle: string | null; external_url: string | null;
  defaults: Record<string, unknown>; status: string;
  credential_id: string | null; credential_label: string | null; credential_status: string | null;
  notes: string | null;
};
type Send = {
  id: string; channel_id: string; channel_name: string; channel_kind: string;
  source_kind: string; source_id: string | null;
  status: 'queued' | 'dispatching' | 'dispatched' | 'dispatched_simulated' | 'failed' | 'retracted';
  external_id: string | null; permalink: string | null;
  scheduled_for: string | null; dispatched_at: string | null; error: string | null;
  created_at: string;
};
type Correction = {
  id: string; source_kind: string; source_id: string | null;
  reason: string; correction_text: string;
  severity: 'typo' | 'minor' | 'material' | 'critical';
  channel_propagation: Record<string, string>;
  status: 'open' | 'drafted' | 'partially_dispatched' | 'dispatched' | 'closed';
  created_at: string;
};
type BriefRow = {
  id: string; title: string;
  kind: 'inbound_triage' | 'outbound_plan' | 'correction_draft';
  status: string; inbound_id: string | null; send_id: string | null; correction_id: string | null;
  source_kind: string | null; source_id: string | null;
  duration_ms: number | null; cost_usd: string | number | null; error: string | null;
  created_at: string;
};
type Production = { id: string; title: string; format: string; status: string };

const KIND_LABELS: Record<BriefRow['kind'], string> = {
  inbound_triage: 'Inbound triage',
  outbound_plan: 'Outbound plan',
  correction_draft: 'Correction draft',
};

const CHANNEL_KINDS = [
  'twitter', 'fb', 'instagram', 'linkedin', 'threads',
  'wordpress', 'ghost', 'custom_cms',
  'whatsapp_business', 'whatsapp_channel',
  'email_smtp', 'newsletter',
];

export default function DistributionWorkspace({
  initialSubmissions, initialCredentials, initialChannels, initialSends, initialCorrections, initialBriefs,
  productions, canEdit, isAdmin, role,
}: {
  initialSubmissions: Submission[];
  initialCredentials: Credential[];
  initialChannels: Channel[];
  initialSends: Send[];
  initialCorrections: Correction[];
  initialBriefs: BriefRow[];
  productions: Production[];
  canEdit: boolean;
  isAdmin: boolean;
  role: 'user' | 'builder' | 'admin';
}) {
  const router = useRouter();
  const [subs, setSubs] = useState(initialSubmissions);
  const [creds, setCreds] = useState(initialCredentials);
  const [channels, setChannels] = useState(initialChannels);
  const [sends, setSends] = useState(initialSends);
  const [corrections, setCorrections] = useState(initialCorrections);
  const [briefs, setBriefs] = useState(initialBriefs);

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', minHeight: '100vh', background: '#f7f8fa' }}>
      <GlobalNav currentApp="📡 Digital News Gatherer" />

      <div style={{ maxWidth: 1180, margin: '0 auto', padding: '24px 20px' }}>
        <h1 style={{ margin: 0, fontSize: 24 }}>Digital News Gatherer</h1>
        <p style={{ color: '#666', fontSize: 14, marginTop: 4 }}>
          Two-way: triage incoming tips and submissions on the way IN; publish approved pieces across configured channels on the way OUT. Per-newsroom credentials are encrypted at rest with AES-256-GCM. Pilot uses simulated dispatch — nothing leaves the machine until real per-channel adapters are wired in.
        </p>

        <BriefsSection
          briefs={briefs} canEdit={canEdit} onChange={setBriefs}
          submissions={subs} productions={productions} corrections={corrections}
          onRefresh={() => router.refresh()}
        />
        <InboundSection submissions={subs} canEdit={canEdit} onChange={setSubs} />
        <ChannelsSection
          channels={channels} credentials={creds}
          isAdmin={isAdmin} canEdit={canEdit}
          onChannelsChange={setChannels} onCredentialsChange={setCreds}
        />
        <OutboundSection
          sends={sends} channels={channels} productions={productions}
          canEdit={canEdit} onChange={setSends}
        />
        <CorrectionsSection
          corrections={corrections} sends={sends} productions={productions}
          canEdit={canEdit} onChange={setCorrections}
        />
      </div>
    </main>
  );
}

// ─── Briefs ────────────────────────────────────────────────────────────────

function BriefsSection({
  briefs, canEdit, onChange, submissions, productions, corrections, onRefresh,
}: {
  briefs: BriefRow[]; canEdit: boolean; onChange: (rows: BriefRow[]) => void;
  submissions: Submission[]; productions: Production[]; corrections: Correction[];
  onRefresh: () => void;
}) {
  const [creating, setCreating] = useState(false);
  return (
    <section style={{ marginTop: 20 }}>
      <SectionHeader title="📋 News Gatherer briefs" subtitle="Agent-generated triage / publishing-plan / correction-draft outputs.">
        {canEdit && <button onClick={() => setCreating(c => !c)} style={primaryBtn}>{creating ? 'Cancel' : '+ New brief'}</button>}
      </SectionHeader>
      {creating && canEdit && (
        <NewBriefForm
          submissions={submissions} productions={productions} corrections={corrections}
          onCancel={() => setCreating(false)}
          onCreated={(row) => { onChange([row, ...briefs]); setCreating(false); onRefresh(); }}
        />
      )}
      {briefs.length === 0 ? <Empty text="No briefs yet." /> : (
        <div style={{ display: 'grid', gap: 8 }}>
          {briefs.map(b => (
            <Link key={b.id} href={`/distribution/briefs/${b.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
              <div style={{ ...cardStyle, cursor: 'pointer' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <div>
                    <strong style={{ fontSize: 14 }}>{b.title}</strong>
                    <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>
                      {KIND_LABELS[b.kind]} · {new Date(b.created_at).toLocaleString()}
                    </div>
                  </div>
                  <span style={statusBadge(b.status)}>{b.status}</span>
                </div>
                {b.error && <p style={{ color: '#b00', fontSize: 12, margin: '6px 0 0' }}>{b.error}</p>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

function NewBriefForm({
  submissions, productions, corrections, onCancel, onCreated,
}: {
  submissions: Submission[]; productions: Production[]; corrections: Correction[];
  onCancel: () => void; onCreated: (row: BriefRow) => void;
}) {
  const [kind, setKind] = useState<BriefRow['kind']>('inbound_triage');
  const [briefInput, setBriefInput] = useState('');
  const [inboundId, setInboundId] = useState('');
  const [productionId, setProductionId] = useState('');
  const [correctionId, setCorrectionId] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const body: Record<string, unknown> = { kind, brief_input: briefInput || undefined };
      if (kind === 'inbound_triage' && inboundId) body.inbound_id = inboundId;
      if (kind === 'outbound_plan' && productionId) {
        body.source_kind = 'production'; body.source_id = productionId;
      }
      if (kind === 'correction_draft' && correctionId) body.correction_id = correctionId;
      const res = await fetch('/api/distribution/briefs', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Generation failed');
      const list = await fetch('/api/distribution/briefs').then(r => r.json());
      const newest = (list.briefs || []).find((b: BriefRow) => b.id === data.briefId) || list.briefs?.[0];
      if (newest) onCreated(newest);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} style={{ ...cardStyle, marginBottom: 8 }}>
      <Field label="Kind">
        <select value={kind} onChange={e => setKind(e.target.value as BriefRow['kind'])} style={inputStyle}>
          <option value="inbound_triage">Inbound triage — classify + route submissions</option>
          <option value="outbound_plan">Outbound plan — per-channel publishing copy</option>
          <option value="correction_draft">Correction draft — per-channel correction</option>
        </select>
      </Field>
      {kind === 'inbound_triage' && (
        <Field label="Submission (optional — leave blank to triage all 'new')">
          <select value={inboundId} onChange={e => setInboundId(e.target.value)} style={inputStyle}>
            <option value="">— all new submissions —</option>
            {submissions.filter(s => s.status === 'new' || s.status === 'in_triage').map(s => (
              <option key={s.id} value={s.id}>{s.subject || s.body.slice(0, 60)}</option>
            ))}
          </select>
        </Field>
      )}
      {kind === 'outbound_plan' && (
        <Field label="Source production (required)">
          <select value={productionId} onChange={e => setProductionId(e.target.value)} required style={inputStyle}>
            <option value="">— select a production —</option>
            {productions.map(p => <option key={p.id} value={p.id}>{p.title} ({p.format})</option>)}
          </select>
        </Field>
      )}
      {kind === 'correction_draft' && (
        <Field label="Correction (required)">
          <select value={correctionId} onChange={e => setCorrectionId(e.target.value)} required style={inputStyle}>
            <option value="">— select a correction —</option>
            {corrections.filter(c => c.status !== 'closed').map(c => <option key={c.id} value={c.id}>{c.reason.slice(0, 80)}</option>)}
          </select>
        </Field>
      )}
      <Field label="Editor's framing (optional)">
        <textarea rows={3} value={briefInput} onChange={e => setBriefInput(e.target.value)} style={{ ...inputStyle, fontFamily: 'inherit' }} />
      </Field>
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button type="submit" disabled={busy} style={primaryBtn}>{busy ? 'Generating…' : 'Generate brief'}</button>
        <button type="button" onClick={onCancel} style={ghostBtn}>Cancel</button>
        {err && <span style={{ color: '#b00', fontSize: 13 }}>{err}</span>}
      </div>
    </form>
  );
}

// ─── Inbound ───────────────────────────────────────────────────────────────

function InboundSection({
  submissions, canEdit, onChange,
}: {
  submissions: Submission[]; canEdit: boolean; onChange: (rows: Submission[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  return (
    <section style={{ marginTop: 28 }}>
      <SectionHeader title="📥 Inbound" subtitle="Tips, submissions, contributor signups awaiting triage. Editor-confirmed routing creates contributor / calendar rows.">
        {canEdit && <button onClick={() => setAdding(a => !a)} style={ghostBtn}>{adding ? 'Cancel' : '+ Log submission'}</button>}
      </SectionHeader>
      {adding && canEdit && (
        <AddInboundForm onCancel={() => setAdding(false)} onCreated={(s) => { onChange([s, ...submissions]); setAdding(false); }} />
      )}
      {submissions.length === 0 ? <Empty text="No submissions logged yet. Web-form / WhatsApp / email gateways post to /api/distribution/inbound." /> : (
        <div style={{ display: 'grid', gap: 8 }}>
          {submissions.map(s => (
            <SubmissionCard key={s.id} submission={s} canEdit={canEdit} onChange={(updated) => onChange(submissions.map(x => x.id === updated.id ? updated : x))} />
          ))}
        </div>
      )}
    </section>
  );
}

function SubmissionCard({ submission: s, canEdit, onChange }: { submission: Submission; canEdit: boolean; onChange: (s: Submission) => void }) {
  const [busy, setBusy] = useState(false);
  async function route(action: string) {
    setBusy(true);
    const res = await fetch(`/api/distribution/inbound/${s.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ route_action: action }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) { alert(data.error || 'Routing failed'); return; }
    onChange(data.submission);
  }
  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <strong>{s.subject || '(no subject)'}</strong>
            <span style={statusBadge(s.status)}>{s.status}</span>
            <Tag>{s.source}</Tag>
            {s.classification && <Tag muted>{s.classification}</Tag>}
          </div>
          <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>
            from {s.sender_name || s.sender_contact || 'anonymous'}
            {' · '}{new Date(s.created_at).toLocaleString()}
          </div>
          {s.body && <p style={{ fontSize: 13, color: '#444', margin: '6px 0 0', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{s.body.slice(0, 600)}{s.body.length > 600 ? '…' : ''}</p>}
        </div>
        {canEdit && s.status === 'new' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <button disabled={busy} onClick={() => route('refer_to_verifier')} style={miniBtn} title="Fact-check this submission via the Verifier agent">→ Verifier</button>
            <button disabled={busy} onClick={() => route('refer_to_researcher')} style={miniBtn} title="Open a research dossier with this submission as the source document">→ Researcher</button>
            <button disabled={busy} onClick={() => route('create_contributor')} style={miniBtn} title="Operations: vet the sender as a community contributor">→ Contributor</button>
            <button disabled={busy} onClick={() => route('create_calendar_idea')} style={miniBtn} title="Operations: log this as an idea on the editorial calendar">→ Story idea</button>
            <button disabled={busy} onClick={() => route('archive')} style={miniBtn}>Archive</button>
            <button disabled={busy} onClick={() => route('spam')} style={{ ...miniBtn, color: '#a02020' }}>Spam</button>
          </div>
        )}
      </div>
    </div>
  );
}

function AddInboundForm({ onCancel, onCreated }: { onCancel: () => void; onCreated: (s: Submission) => void }) {
  const [source, setSource] = useState('manual');
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const res = await fetch('/api/distribution/inbound', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source, sender_name: name || undefined, sender_contact: contact || undefined, subject: subject || undefined, body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      onCreated(data.submission);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <form onSubmit={submit} style={{ ...cardStyle, marginBottom: 8 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        <Field label="Source">
          <select value={source} onChange={e => setSource(e.target.value)} style={inputStyle}>
            <option value="manual">Manual entry</option>
            <option value="web_form">Web form</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="email">Email</option>
            <option value="sms">SMS</option>
            <option value="twitter">Twitter</option>
            <option value="fb">Facebook</option>
            <option value="other">Other</option>
          </select>
        </Field>
        <Field label="Sender name"><input value={name} onChange={e => setName(e.target.value)} style={inputStyle} /></Field>
        <Field label="Contact (number / email / handle)"><input value={contact} onChange={e => setContact(e.target.value)} style={inputStyle} /></Field>
      </div>
      <Field label="Subject"><input value={subject} onChange={e => setSubject(e.target.value)} style={inputStyle} /></Field>
      <Field label="Body"><textarea required rows={4} value={body} onChange={e => setBody(e.target.value)} style={{ ...inputStyle, fontFamily: 'inherit' }} /></Field>
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button type="submit" disabled={busy} style={primaryBtn}>{busy ? 'Saving…' : 'Log submission'}</button>
        <button type="button" onClick={onCancel} style={ghostBtn}>Cancel</button>
        {err && <span style={{ color: '#b00', fontSize: 12 }}>{err}</span>}
      </div>
    </form>
  );
}

// ─── Channels + credentials ────────────────────────────────────────────────

function ChannelsSection({
  channels, credentials, isAdmin, canEdit, onChannelsChange, onCredentialsChange,
}: {
  channels: Channel[]; credentials: Credential[];
  isAdmin: boolean; canEdit: boolean;
  onChannelsChange: (rows: Channel[]) => void;
  onCredentialsChange: (rows: Credential[]) => void;
}) {
  const [addingChannel, setAddingChannel] = useState(false);
  const [addingCred, setAddingCred] = useState(false);
  return (
    <section style={{ marginTop: 28 }}>
      <SectionHeader title="🔌 Channels & credentials" subtitle="Per-newsroom outbound destinations. Credentials are AES-256-GCM encrypted at rest — only the newsroom that owns them can decrypt.">
        <div style={{ display: 'flex', gap: 8 }}>
          {isAdmin && <button onClick={() => setAddingCred(c => !c)} style={ghostBtn}>{addingCred ? 'Cancel' : '+ Add credential'}</button>}
          {canEdit && <button onClick={() => setAddingChannel(c => !c)} style={primaryBtn}>{addingChannel ? 'Cancel' : '+ Add channel'}</button>}
        </div>
      </SectionHeader>

      {addingCred && isAdmin && (
        <AddCredentialForm onCancel={() => setAddingCred(false)} onCreated={(c) => { onCredentialsChange([c, ...credentials]); setAddingCred(false); }} />
      )}
      {addingChannel && canEdit && (
        <AddChannelForm credentials={credentials} onCancel={() => setAddingChannel(false)} onCreated={(c) => { onChannelsChange([c, ...channels]); setAddingChannel(false); }} />
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={cardStyle}>
          <h3 style={{ fontSize: 13, margin: 0 }}>Channels ({channels.length})</h3>
          {channels.length === 0 ? <p style={{ fontSize: 13, color: '#888', margin: '6px 0 0' }}>No channels configured.</p> : (
            <ul style={{ listStyle: 'none', padding: 0, margin: '6px 0 0' }}>
              {channels.map(c => (
                <li key={c.id} style={{ padding: '8px 0', borderTop: '1px solid #f0f0f0', fontSize: 13 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <strong>{c.name}</strong>
                    <span style={statusBadge(c.status)}>{c.status}</span>
                  </div>
                  <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>
                    <Tag muted>{c.channel_kind}</Tag>
                    {c.external_handle && <span style={{ marginLeft: 6 }}>{c.external_handle}</span>}
                    {c.external_url && <a href={c.external_url} target="_blank" rel="noreferrer" style={{ marginLeft: 6, color: '#0066cc' }}>↗</a>}
                    {c.credential_label
                      ? <span style={{ marginLeft: 8 }}>creds: {c.credential_label}</span>
                      : <span style={{ marginLeft: 8, color: '#a02020' }}>⚠ no credential linked</span>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div style={cardStyle}>
          <h3 style={{ fontSize: 13, margin: 0 }}>Credentials ({credentials.length}) {!isAdmin && <span style={{ fontWeight: 400, color: '#888', fontSize: 11 }}>(admin only)</span>}</h3>
          {credentials.length === 0 ? <p style={{ fontSize: 13, color: '#888', margin: '6px 0 0' }}>No credentials stored.</p> : (
            <ul style={{ listStyle: 'none', padding: 0, margin: '6px 0 0' }}>
              {credentials.map(c => (
                <li key={c.id} style={{ padding: '8px 0', borderTop: '1px solid #f0f0f0', fontSize: 13 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <strong>{c.label}</strong>
                    <span style={statusBadge(c.status)}>{c.status}</span>
                  </div>
                  <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>
                    <Tag muted>{c.channel_kind}</Tag>
                    {c.last_used_at && <span style={{ marginLeft: 6 }}>last used {new Date(c.last_used_at).toLocaleDateString()}</span>}
                    {c.expires_at && <span style={{ marginLeft: 6 }}>expires {new Date(c.expires_at).toLocaleDateString()}</span>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

function AddChannelForm({ credentials, onCancel, onCreated }: { credentials: Credential[]; onCancel: () => void; onCreated: (c: Channel) => void }) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState('twitter');
  const [credId, setCredId] = useState('');
  const [handle, setHandle] = useState('');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const res = await fetch('/api/distribution/channels', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, channel_kind: kind, credential_id: credId || undefined, external_handle: handle || undefined, external_url: url || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      onCreated({ ...data.channel, credential_label: credentials.find(c => c.id === credId)?.label || null, credential_status: credentials.find(c => c.id === credId)?.status || null });
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  const matching = credentials.filter(c => c.channel_kind === kind);
  return (
    <form onSubmit={submit} style={{ ...cardStyle, marginBottom: 8 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8 }}>
        <Field label="Name"><input required value={name} onChange={e => setName(e.target.value)} style={inputStyle} placeholder="Newsroom WP blog / @newsroom" /></Field>
        <Field label="Kind">
          <select value={kind} onChange={e => { setKind(e.target.value); setCredId(''); }} style={inputStyle}>
            {CHANNEL_KINDS.map(k => <option key={k} value={k}>{k}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Credential">
        <select value={credId} onChange={e => setCredId(e.target.value)} style={inputStyle}>
          <option value="">— none —</option>
          {matching.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
      </Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <Field label="Public handle"><input value={handle} onChange={e => setHandle(e.target.value)} style={inputStyle} /></Field>
        <Field label="External URL"><input type="url" value={url} onChange={e => setUrl(e.target.value)} style={inputStyle} /></Field>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button type="submit" disabled={busy || !name.trim()} style={primaryBtn}>{busy ? 'Saving…' : 'Add channel'}</button>
        <button type="button" onClick={onCancel} style={ghostBtn}>Cancel</button>
        {err && <span style={{ color: '#b00', fontSize: 12 }}>{err}</span>}
      </div>
    </form>
  );
}

function AddCredentialForm({ onCancel, onCreated }: { onCancel: () => void; onCreated: (c: Credential) => void }) {
  const [label, setLabel] = useState('');
  const [kind, setKind] = useState('twitter');
  const [secretsJson, setSecretsJson] = useState('{\n  "api_key": "",\n  "api_secret": ""\n}');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const secrets = JSON.parse(secretsJson);
      const res = await fetch('/api/distribution/credentials', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label, channel_kind: kind, secrets }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      onCreated(data.credential);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <form onSubmit={submit} style={{ ...cardStyle, marginBottom: 8 }}>
      <p style={{ fontSize: 12, color: '#8a5400', margin: '0 0 8px' }}>
        ⚠ Secrets are encrypted at rest with AES-256-GCM and never returned over the API. Don&apos;t include any plaintext you wouldn&apos;t put in production-grade storage.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8 }}>
        <Field label="Label"><input required value={label} onChange={e => setLabel(e.target.value)} style={inputStyle} placeholder="newsroom-twitter-prod" /></Field>
        <Field label="Channel kind">
          <select value={kind} onChange={e => setKind(e.target.value)} style={inputStyle}>
            {CHANNEL_KINDS.map(k => <option key={k} value={k}>{k}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Secrets (JSON object — shape per channel)">
        <textarea rows={6} value={secretsJson} onChange={e => setSecretsJson(e.target.value)} style={{ ...inputStyle, fontFamily: 'ui-monospace, monospace', fontSize: 12 }} />
      </Field>
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button type="submit" disabled={busy || !label.trim()} style={primaryBtn}>{busy ? 'Encrypting + saving…' : 'Save credential'}</button>
        <button type="button" onClick={onCancel} style={ghostBtn}>Cancel</button>
        {err && <span style={{ color: '#b00', fontSize: 12 }}>{err}</span>}
      </div>
    </form>
  );
}

// ─── Outbound sends ────────────────────────────────────────────────────────

function OutboundSection({
  sends, channels, productions, canEdit, onChange,
}: {
  sends: Send[]; channels: Channel[]; productions: Production[];
  canEdit: boolean; onChange: (rows: Send[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  return (
    <section style={{ marginTop: 28 }}>
      <SectionHeader title="📤 Outbound sends" subtitle="Records of what's been published to which channel. Pilot dispatches are simulated — the permalink won't actually serve the content.">
        {canEdit && channels.length > 0 && <button onClick={() => setAdding(a => !a)} style={ghostBtn}>{adding ? 'Cancel' : '+ Send a piece'}</button>}
      </SectionHeader>
      {adding && canEdit && (
        <AddSendForm
          channels={channels} productions={productions}
          onCancel={() => setAdding(false)}
          onCreated={(s) => { onChange([s, ...sends]); setAdding(false); }}
        />
      )}
      {sends.length === 0 ? <Empty text="Nothing sent yet." /> : (
        <div style={{ display: 'grid', gap: 6 }}>
          {sends.map(s => (
            <div key={s.id} style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
                <div>
                  <strong style={{ fontSize: 13 }}>{s.channel_name}</strong>
                  <span style={{ fontSize: 11, color: '#666', marginLeft: 8 }}>
                    <Tag muted>{s.channel_kind}</Tag>
                    {' '}source:{s.source_kind}
                    {s.dispatched_at && <> · sent {new Date(s.dispatched_at).toLocaleString()}</>}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {s.permalink && <a href={s.permalink} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: '#0066cc' }}>permalink ↗</a>}
                  <span style={statusBadge(s.status)}>{s.status}</span>
                </div>
              </div>
              {s.error && <p style={{ color: '#b00', fontSize: 12, margin: '4px 0 0' }}>{s.error}</p>}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function AddSendForm({ channels, productions, onCancel, onCreated }: { channels: Channel[]; productions: Production[]; onCancel: () => void; onCreated: (s: Send) => void }) {
  const [channelId, setChannelId] = useState(channels.find(c => c.status === 'active')?.id || '');
  const [productionId, setProductionId] = useState('');
  const [text, setText] = useState('');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const channel = channels.find(c => c.id === channelId);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const payload: Record<string, unknown> = { text };
      if (title) payload.title = title;
      const res = await fetch('/api/distribution/sends', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel_id: channelId,
          source_kind: productionId ? 'production' : 'manual',
          source_id: productionId || undefined,
          payload,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      onCreated({ ...data.send, channel_name: channel?.name || '?', channel_kind: channel?.channel_kind || '?' });
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <form onSubmit={submit} style={{ ...cardStyle, marginBottom: 8 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <Field label="Channel">
          <select required value={channelId} onChange={e => setChannelId(e.target.value)} style={inputStyle}>
            <option value="">— select —</option>
            {channels.filter(c => c.status === 'active').map(c => <option key={c.id} value={c.id}>{c.name} ({c.channel_kind})</option>)}
          </select>
        </Field>
        <Field label="Source production (optional)">
          <select value={productionId} onChange={e => setProductionId(e.target.value)} style={inputStyle}>
            <option value="">— manual —</option>
            {productions.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
        </Field>
      </div>
      {channel && (channel.channel_kind === 'wordpress' || channel.channel_kind === 'ghost' || channel.channel_kind === 'newsletter') && (
        <Field label="Title"><input value={title} onChange={e => setTitle(e.target.value)} style={inputStyle} /></Field>
      )}
      <Field label="Body / text"><textarea required rows={4} value={text} onChange={e => setText(e.target.value)} style={{ ...inputStyle, fontFamily: 'inherit' }} /></Field>
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button type="submit" disabled={busy || !channelId || !text.trim()} style={primaryBtn}>{busy ? 'Sending…' : 'Send'}</button>
        <button type="button" onClick={onCancel} style={ghostBtn}>Cancel</button>
        {err && <span style={{ color: '#b00', fontSize: 12 }}>{err}</span>}
      </div>
    </form>
  );
}

// ─── Corrections ───────────────────────────────────────────────────────────

function CorrectionsSection({
  corrections, sends, productions, canEdit, onChange,
}: {
  corrections: Correction[]; sends: Send[]; productions: Production[];
  canEdit: boolean; onChange: (rows: Correction[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  return (
    <section style={{ marginTop: 28 }}>
      <SectionHeader title="✍ Corrections" subtitle="Open a correction against a published piece — Grounded finds every send it went through and seeds per-channel propagation rows.">
        {canEdit && <button onClick={() => setAdding(a => !a)} style={ghostBtn}>{adding ? 'Cancel' : '+ Open correction'}</button>}
      </SectionHeader>
      {adding && canEdit && (
        <OpenCorrectionForm productions={productions} onCancel={() => setAdding(false)} onCreated={(c) => { onChange([c, ...corrections]); setAdding(false); }} />
      )}
      {corrections.length === 0 ? <Empty text="No corrections raised." /> : (
        <div style={{ display: 'grid', gap: 8 }}>
          {corrections.map(c => (
            <div key={c.id} style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <strong style={{ fontSize: 14 }}>{c.reason}</strong>
                  <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                    <Tag muted>{c.severity}</Tag>
                    <span style={{ marginLeft: 6 }}>source: {c.source_kind}</span>
                  </div>
                  <p style={{ fontSize: 13, color: '#444', margin: '6px 0 0', lineHeight: 1.5 }}>{c.correction_text}</p>
                  {Object.keys(c.channel_propagation || {}).length > 0 && (
                    <div style={{ fontSize: 12, color: '#666', marginTop: 6 }}>
                      Propagation:&nbsp;
                      {Object.entries(c.channel_propagation).map(([sid, st], i) => {
                        const send = sends.find(s => s.id === sid);
                        return <span key={sid}>{i > 0 ? ', ' : ''}{send?.channel_name || sid.slice(0, 8)}: <strong>{st}</strong></span>;
                      })}
                    </div>
                  )}
                </div>
                <span style={statusBadge(c.status)}>{c.status}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function OpenCorrectionForm({ productions, onCancel, onCreated }: { productions: Production[]; onCancel: () => void; onCreated: (c: Correction) => void }) {
  const [productionId, setProductionId] = useState('');
  const [reason, setReason] = useState('');
  const [text, setText] = useState('');
  const [severity, setSeverity] = useState('minor');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const res = await fetch('/api/distribution/corrections', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_kind: productionId ? 'production' : 'manual',
          source_id: productionId || undefined,
          reason, correction_text: text, severity,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      onCreated(data.correction);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <form onSubmit={submit} style={{ ...cardStyle, marginBottom: 8 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8 }}>
        <Field label="Source production (optional)">
          <select value={productionId} onChange={e => setProductionId(e.target.value)} style={inputStyle}>
            <option value="">— not tied to a production —</option>
            {productions.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
        </Field>
        <Field label="Severity">
          <select value={severity} onChange={e => setSeverity(e.target.value)} style={inputStyle}>
            <option value="typo">typo</option>
            <option value="minor">minor</option>
            <option value="material">material</option>
            <option value="critical">critical</option>
          </select>
        </Field>
      </div>
      <Field label="What was wrong (reason)"><input required value={reason} onChange={e => setReason(e.target.value)} style={inputStyle} /></Field>
      <Field label="Correction text (the canonical fix)"><textarea required rows={3} value={text} onChange={e => setText(e.target.value)} style={{ ...inputStyle, fontFamily: 'inherit' }} /></Field>
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button type="submit" disabled={busy} style={primaryBtn}>{busy ? 'Opening…' : 'Open correction'}</button>
        <button type="button" onClick={onCancel} style={ghostBtn}>Cancel</button>
        {err && <span style={{ color: '#b00', fontSize: 12 }}>{err}</span>}
      </div>
    </form>
  );
}

// ─── Shared ────────────────────────────────────────────────────────────────

function SectionHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
      <div>
        <h2 style={{ fontSize: 16, margin: 0 }}>{title}</h2>
        {subtitle && <p style={{ fontSize: 13, color: '#666', margin: '2px 0 0' }}>{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block', marginTop: 4 }}>
      <div style={{ fontSize: 12, color: '#555', marginBottom: 3 }}>{label}</div>
      {children}
    </label>
  );
}
function Empty({ text }: { text: string }) {
  return <div style={{ padding: 18, background: 'white', border: '1px dashed #d0d0d0', borderRadius: 8, color: '#777', fontSize: 13, textAlign: 'center' }}>{text}</div>;
}
function Tag({ children, muted = false }: { children: React.ReactNode; muted?: boolean }) {
  return <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 10, background: muted ? '#eef0f3' : '#e6f0ff', color: muted ? '#555' : '#0044aa' }}>{children}</span>;
}

const cardStyle: React.CSSProperties = {
  background: 'white', border: '1px solid #e5e5e5', borderRadius: 8,
  padding: 12, boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
};
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '6px 8px', fontSize: 13,
  border: '1px solid #d0d0d0', borderRadius: 4, fontFamily: 'inherit',
};
const primaryBtn: React.CSSProperties = {
  background: '#0066cc', color: 'white', border: 'none',
  padding: '6px 14px', borderRadius: 4, fontSize: 13, cursor: 'pointer',
};
const ghostBtn: React.CSSProperties = {
  background: 'white', color: '#0066cc', border: '1px solid #0066cc',
  padding: '6px 14px', borderRadius: 4, fontSize: 13, cursor: 'pointer',
};
const miniBtn: React.CSSProperties = {
  background: 'white', color: '#444', border: '1px solid #d0d0d0',
  padding: '3px 8px', borderRadius: 4, fontSize: 11, cursor: 'pointer',
};

function statusBadge(status: string): React.CSSProperties {
  const map: Record<string, { bg: string; fg: string }> = {
    new: { bg: '#fff8e6', fg: '#8a5400' },
    in_triage: { bg: '#e8e3ff', fg: '#5a3a99' },
    routed: { bg: '#e7f6e7', fg: '#1a5d1a' },
    archived: { bg: '#eee', fg: '#777' },
    spam: { bg: '#ffe6e6', fg: '#a02020' },
    duplicate: { bg: '#eee', fg: '#777' },
    queued: { bg: '#fff8e6', fg: '#8a5400' },
    dispatching: { bg: '#fff8e6', fg: '#8a5400' },
    dispatched: { bg: '#e7f6e7', fg: '#1a5d1a' },
    dispatched_simulated: { bg: '#dbf3f3', fg: '#0a6363' },
    failed: { bg: '#ffe6e6', fg: '#a02020' },
    retracted: { bg: '#eee', fg: '#777' },
    active: { bg: '#e7f6e7', fg: '#1a5d1a' },
    paused: { bg: '#fff8e6', fg: '#8a5400' },
    revoked: { bg: '#ffe6e6', fg: '#a02020' },
    expired: { bg: '#ffe6e6', fg: '#a02020' },
    open: { bg: '#fff8e6', fg: '#8a5400' },
    drafted: { bg: '#e8e3ff', fg: '#5a3a99' },
    partially_dispatched: { bg: '#dbf3f3', fg: '#0a6363' },
    closed: { bg: '#e7f6e7', fg: '#1a5d1a' },
    generated: { bg: '#e0f0ff', fg: '#0044aa' },
    edited: { bg: '#e8e3ff', fg: '#5a3a99' },
    applied: { bg: '#e7f6e7', fg: '#1a5d1a' },
  };
  const c = map[status] || { bg: '#eee', fg: '#555' };
  return { fontSize: 11, padding: '2px 8px', borderRadius: 10, background: c.bg, color: c.fg, fontWeight: 500 };
}
