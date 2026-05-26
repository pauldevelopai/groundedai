// Public case submission form — readers can tell us about a case or
// regulation we haven't tracked. It lands in the moderation queue for admin
// review; approved submissions get promoted into the main dataset.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { publicFetch } from '../../hooks/usePublicApi.js';

export default function PublicSubmit() {
  const [form, setForm] = useState({
    submission_kind: 'lawsuit',
    case_name: '',
    jurisdiction: '',
    parties: '',
    source_url: '',
    summary: '',
    submitter_email: '',
  });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  function update(k) {
    return e => setForm(prev => ({ ...prev, [k]: e.target.value }));
  }

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await publicFetch('/public/submissions', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      setResult(res);
      setForm({
        submission_kind: 'lawsuit',
        case_name: '',
        jurisdiction: '',
        parties: '',
        source_url: '',
        summary: '',
        submitter_email: '',
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, margin: '0 0 8px 0', letterSpacing: '-0.01em' }}>
        Submit a case or regulation
      </h1>
      <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6, margin: '0 0 24px 0' }}>
        Know of an AI lawsuit or regulation we haven't tracked yet? Drop us a link. Submissions go to a human
        reviewer — if your case checks out it gets added to the tracker, with your source preserved.
      </p>

      {result && (
        <div className="card" style={{ padding: 14, marginBottom: 16, borderLeft: '3px solid #065F46', background: '#D1FAE5', color: '#065F46' }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>✓ Thanks — submitted</div>
          <div style={{ fontSize: 13 }}>{result.message}</div>
          <div style={{ fontSize: 12, marginTop: 6, opacity: 0.8 }}>Reference: {result.id}</div>
        </div>
      )}

      {error && (
        <div className="card" style={{ padding: 12, marginBottom: 16, borderLeft: '3px solid #991B1B', background: '#FEE2E2', color: '#991B1B', fontSize: 13 }}>
          {error}
        </div>
      )}

      <form onSubmit={submit} className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label="What are you submitting?">
          <select value={form.submission_kind} onChange={update('submission_kind')} style={input}>
            <option value="lawsuit">A new AI lawsuit</option>
            <option value="regulation">A new AI regulation / statute / guidance</option>
            <option value="event">An update to a case or regulation we already track</option>
          </select>
        </Field>

        <Field label={form.submission_kind === 'regulation' ? 'Regulation name' : 'Case name'} required>
          <input type="text" value={form.case_name} onChange={update('case_name')} maxLength={500}
                 required
                 placeholder={form.submission_kind === 'regulation' ? 'e.g. UK Online Safety Act 2023' : 'e.g. Doe v. Meta'}
                 style={input} />
        </Field>

        <Field label="Jurisdiction">
          <input type="text" value={form.jurisdiction} onChange={update('jurisdiction')} maxLength={200}
                 placeholder="e.g. US Federal · UK · EU · India"
                 style={input} />
        </Field>

        {form.submission_kind === 'lawsuit' && (
          <Field label="Parties">
            <input type="text" value={form.parties} onChange={update('parties')} maxLength={1000}
                   placeholder="Plaintiffs v. defendants"
                   style={input} />
          </Field>
        )}

        <Field label="Source URL" required hint="A link to a reliable primary source — court filing, regulator press release, or reputable legal press.">
          <input type="url" value={form.source_url} onChange={update('source_url')} maxLength={2000}
                 required
                 placeholder="https://…"
                 style={input} />
        </Field>

        <Field label="Brief summary" hint="1–3 sentences. What happened, when, why it matters.">
          <textarea value={form.summary} onChange={update('summary')} maxLength={3000} rows={4}
                    style={{ ...input, resize: 'vertical', minHeight: 80 }} />
        </Field>

        <Field label="Your email (optional)" hint="So we can reply if we have questions. Never published.">
          <input type="email" value={form.submitter_email} onChange={update('submitter_email')} maxLength={300}
                 style={input} />
        </Field>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
          <Link to="/legal" style={{ fontSize: 13, color: 'var(--text-secondary)', textDecoration: 'none' }}>
            ← Back to tracker
          </Link>
          <button type="submit" disabled={loading} className="btn btn-primary" style={{ fontSize: 14 }}>
            {loading ? 'Submitting…' : 'Submit for review'}
          </button>
        </div>
      </form>

      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 16, lineHeight: 1.5 }}>
        By submitting you confirm the source URL is public and attributable. We won't publish your email.
        Rate-limited to 5 submissions per IP per hour.
      </div>
    </div>
  );
}

function Field({ label, children, required, hint }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
        {label} {required && <span style={{ color: '#991B1B' }}>*</span>}
      </span>
      {children}
      {hint && <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{hint}</span>}
    </label>
  );
}

const input = {
  padding: '8px 12px', fontSize: 14,
  border: '1px solid var(--border-color)', borderRadius: 'var(--radius)',
  background: 'var(--card-bg)', color: 'var(--text-primary)',
  fontFamily: 'inherit',
};
