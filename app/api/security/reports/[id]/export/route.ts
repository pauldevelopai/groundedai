// /api/security/reports/:id/export?format=json|markdown
//
// Digital Security Audit Slice D. Editor-shareable export of one audit
// report. Tenant-scoped: 404 if the report isn't in the caller's
// newsroom. Markdown is the share-friendly form (paste into a board
// doc / email / governance log); JSON is the machine-readable form.

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Source = { title: string; url?: string | null; evidence_kind?: string | null; cite?: string | null };
type Reason = {
  kind: string;
  severity?: string;
  reason?: string;
  sources?: Source[];
  last_verified?: string | null;
  vendor?: string;
  tool_name?: string;
  residency?: string;
  data_kinds?: string[];
  summary?: string;
};
type InventoryEntry = {
  vendor: string;
  tool_name: string;
  data_residency: string | null;
  declared_use: string | null;
  data_kinds_exposed: string[];
  risk_band: 'low' | 'medium' | 'high' | 'critical';
  reasons: Reason[];
};
type HistoryRow = { workflow_slug: string; sensitivity_label: string; executed_on: string; runs: number; completed: number; failed: number };
type FixItem = { priority: string; title: string; action: string; evidence: string };
type Summary = {
  generated_at: string;
  jurisdiction: string;
  jurisdiction_pack: { data_law_summary: string; data_law_sources: Source[]; audit_depth: string; last_verified: string | null };
  inventory_with_scoring: InventoryEntry[];
  counts_by_band: { low: number; medium: number; high: number; critical: number };
  overall_risk_band: string;
  routing_window_days: number;
  routing_totals: { runs: number; by_sensitivity: Record<string, number>; by_target: Record<string, number> };
  routing_history: HistoryRow[];
  summary_narrative: string;
  fix_list: FixItem[];
  concerns_noted: string[];
};

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const url = new URL(req.url);
  const format = (url.searchParams.get('format') || 'markdown').toLowerCase();
  if (format !== 'json' && format !== 'markdown') {
    return NextResponse.json({ error: 'format must be json or markdown' }, { status: 400 });
  }

  const { rows } = await pool.query(
    `SELECT r.id, r.status, r.overall_risk_band, r.routing_window_days,
            r.summary_json, r.inventory_snapshot_json,
            r.started_at, r.finished_at, r.cost_usd, r.error,
            u.email AS initiated_by_email
       FROM security_audit_reports r
       LEFT JOIN users u ON u.id = r.initiated_by
      WHERE r.id = $1 AND r.newsroom_id = $2`,
    [id, session.newsroomId]
  );
  if (rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const report = rows[0];
  if (report.status !== 'completed') {
    return NextResponse.json({ error: `Report status is ${report.status} — cannot export until completed` }, { status: 400 });
  }

  const summary = report.summary_json as Summary;
  const filenameBase = `grounded-security-audit-${id.slice(0, 8)}-${report.started_at?.slice(0, 10) || 'undated'}`;

  if (format === 'json') {
    const payload = {
      report: {
        id: report.id,
        status: report.status,
        overall_risk_band: report.overall_risk_band,
        routing_window_days: report.routing_window_days,
        started_at: report.started_at,
        finished_at: report.finished_at,
        cost_usd: report.cost_usd,
        initiated_by_email: report.initiated_by_email,
      },
      summary,
      inventory_snapshot: report.inventory_snapshot_json,
    };
    return new NextResponse(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filenameBase}.json"`,
      },
    });
  }

  // Markdown.
  const md = renderMarkdown(summary, report);
  return new NextResponse(md, {
    status: 200,
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filenameBase}.md"`,
    },
  });
}

function renderMarkdown(s: Summary, r: {
  id: string;
  overall_risk_band: string | null;
  routing_window_days: number;
  started_at: string;
  finished_at: string | null;
  cost_usd: string | null;
  initiated_by_email: string | null;
}): string {
  const lines: string[] = [];
  lines.push(`# Digital Security Audit Report`);
  lines.push('');
  lines.push(`**Report ID:** ${r.id}`);
  lines.push(`**Overall risk band:** ${s.overall_risk_band.toUpperCase()}`);
  lines.push(`**Jurisdiction:** ${s.jurisdiction} (${s.jurisdiction_pack.audit_depth} pack${s.jurisdiction_pack.last_verified ? `, verified ${s.jurisdiction_pack.last_verified}` : ''})`);
  lines.push(`**Routing window:** ${s.routing_window_days} days`);
  lines.push(`**Generated:** ${s.generated_at}`);
  if (r.initiated_by_email) lines.push(`**Initiated by:** ${r.initiated_by_email}`);
  if (r.cost_usd) lines.push(`**LLM cost:** $${Number(r.cost_usd).toFixed(4)}`);
  lines.push('');

  if (s.summary_narrative) {
    lines.push(`## Summary`);
    lines.push('');
    lines.push(s.summary_narrative);
    lines.push('');
  }

  // Fixes
  lines.push(`## Prioritised fixes (${s.fix_list.length})`);
  lines.push('');
  if (s.fix_list.length === 0) {
    lines.push(`_No fixes recommended._`);
    lines.push('');
  } else {
    const sorted = [...s.fix_list].sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority));
    for (const f of sorted) {
      lines.push(`### [${f.priority.toUpperCase()}] ${f.title}`);
      lines.push('');
      lines.push(f.action);
      if (f.evidence) {
        lines.push('');
        lines.push(`*Evidence:* ${f.evidence}`);
      }
      lines.push('');
    }
  }

  // Inventory
  lines.push(`## Inventory risks (${s.inventory_with_scoring.length})`);
  lines.push('');
  lines.push(`| Tool | Vendor | Residency | Risk | Declared use |`);
  lines.push(`|---|---|---|---|---|`);
  for (const t of s.inventory_with_scoring) {
    lines.push(`| ${escapeMd(t.tool_name)} | ${escapeMd(t.vendor)} | ${t.data_residency || '—'} | **${t.risk_band.toUpperCase()}** | ${escapeMd(t.declared_use || '—')} |`);
  }
  lines.push('');

  for (const t of s.inventory_with_scoring) {
    if (!t.reasons || t.reasons.length === 0) continue;
    lines.push(`### ${t.vendor} · ${t.tool_name} — why ${t.risk_band}`);
    lines.push('');
    for (const reason of t.reasons) {
      const head = `**${reason.kind}**${reason.severity ? ` (${reason.severity})` : ''}${reason.last_verified ? ` — verified ${reason.last_verified}` : ''}`;
      lines.push(`- ${head}`);
      if (reason.reason) {
        for (const ln of reason.reason.split('\n')) lines.push(`  - ${ln.trim()}`);
      }
      if (reason.residency) lines.push(`  - residency: \`${reason.residency}\``);
      if (reason.data_kinds && reason.data_kinds.length) lines.push(`  - data kinds: ${reason.data_kinds.join(', ')}`);
      if (reason.sources && reason.sources.length) {
        for (const src of reason.sources) {
          const link = src.url ? `[${src.title}](${src.url})` : src.title;
          const tag = src.evidence_kind ? ` _(${src.evidence_kind.replace(/_/g, ' ')})_` : '';
          const cite = src.cite ? ` — ${src.cite}` : '';
          lines.push(`    - ${link}${tag}${cite}`);
        }
      }
    }
    lines.push('');
  }

  // Routing history
  lines.push(`## What's been sent outside (last ${s.routing_window_days} days)`);
  lines.push('');
  lines.push(`- **Total runs:** ${s.routing_totals.runs}`);
  lines.push(`- **By sensitivity:** public ${s.routing_totals.by_sensitivity.public || 0} · internal ${s.routing_totals.by_sensitivity.internal || 0} · sensitive ${s.routing_totals.by_sensitivity.sensitive || 0} · unlabelled ${s.routing_totals.by_sensitivity.unlabelled || 0}`);
  lines.push(`- **By target:** cloud ${s.routing_totals.by_target.cloud || 0} · appliance ${s.routing_totals.by_target.appliance || 0}`);
  lines.push('');
  if (s.routing_history.length === 0) {
    lines.push(`_No workflow runs in this window._`);
    lines.push('');
  } else {
    lines.push(`| Workflow | Sensitivity | Ran on | Runs | Completed | Failed |`);
    lines.push(`|---|---|---|---|---|---|`);
    for (const h of s.routing_history) {
      lines.push(`| \`${escapeMd(h.workflow_slug)}\` | ${h.sensitivity_label} | ${h.executed_on} | ${h.runs} | ${h.completed} | ${h.failed} |`);
    }
    lines.push('');
  }

  // Jurisdiction context
  lines.push(`## Jurisdiction context`);
  lines.push('');
  lines.push(s.jurisdiction_pack.data_law_summary);
  lines.push('');
  if (s.jurisdiction_pack.data_law_sources?.length) {
    lines.push(`### Sources`);
    lines.push('');
    for (const src of s.jurisdiction_pack.data_law_sources) {
      const link = src.url ? `[${src.title}](${src.url})` : src.title;
      const tag = src.evidence_kind ? ` _(${src.evidence_kind.replace(/_/g, ' ')})_` : '';
      const cite = src.cite ? ` — ${src.cite}` : '';
      lines.push(`- ${link}${tag}${cite}`);
    }
    lines.push('');
  }

  if (s.concerns_noted?.length) {
    lines.push(`## Concerns noted`);
    lines.push('');
    for (const c of s.concerns_noted) lines.push(`- ${c}`);
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push(`_Generated by Grounded · Develop AI · [github.com/pauldevelopai/groundedai](https://github.com/pauldevelopai/groundedai)_`);

  return lines.join('\n');
}

function priorityRank(p: string): number {
  return ({ critical: 0, high: 1, medium: 2, low: 3 } as Record<string, number>)[p] ?? 9;
}

function escapeMd(s: string): string {
  // Minimal: escape pipe (for tables) and backtick (for code).
  return s.replace(/\|/g, '\\|').replace(/`/g, '\\`');
}
