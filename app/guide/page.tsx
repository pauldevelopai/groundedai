// /guide — instruction page. Server-rendered, links from every top menu.
//
// Auto-updates as new agents land: reads docs/AGENTS.md for canonical
// descriptions of the 10 agents and lib/agents/registry for live
// input/knob/output schemas of the agents that are actually built. New
// agents picked up automatically with no changes to this file.

import fs from 'node:fs';
import path from 'node:path';
import Link from 'next/link';
import { getCurrentSession } from '@/app/lib/session';
import { list as listAgents } from '@/lib/agents/registry';
import type { AgentMeta, AgentConfigField } from '@/app/builder/BuilderShell';
import ExternalToolLinks from '@/app/components/ExternalToolLinks';
import { EXTERNAL_TOOLS } from '@/lib/external-tools';

type AgentSection = { number: number; name: string; slug: string; canonicalText: string };

function parseAgentsMd(content: string): AgentSection[] {
  // Drop the file's intro and split on `## ` headings.
  const sections = content.split(/^## /m).slice(1);
  const out: AgentSection[] = [];
  for (const sec of sections) {
    const firstNewline = sec.indexOf('\n');
    const heading = sec.slice(0, firstNewline === -1 ? sec.length : firstNewline).trim();
    const body = firstNewline === -1 ? '' : sec.slice(firstNewline).trim();
    const m = heading.match(/^(\d+)\.\s+(.+)$/);
    if (!m) continue;
    const name = m[2].trim();
    out.push({
      number: parseInt(m[1], 10),
      name,
      slug: name.toLowerCase().replace(/\s+/g, '-'),
      canonicalText: body,
    });
  }
  return out.sort((a, b) => a.number - b.number);
}

export default async function GuidePage() {
  const session = await getCurrentSession();

  let agentsMd = '';
  try {
    agentsMd = fs.readFileSync(path.join(process.cwd(), 'docs', 'AGENTS.md'), 'utf8');
  } catch {
    // ignore — page still renders without canonical text
  }
  const sections = parseAgentsMd(agentsMd);
  const built: AgentMeta[] = listAgents();
  const builtBySlug = new Map(built.map((a) => [a.slug, a]));

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', minHeight: '100vh', background: '#f7f8fa' }}>
      <header
        style={{
          background: 'white',
          borderBottom: '1px solid #e5e5e5',
          padding: '14px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <Link href="/" style={{ fontSize: 16, fontWeight: 600, color: 'inherit', textDecoration: 'none' }}>
          Grounded
        </Link>
        <span style={{ color: '#999' }}>/</span>
        <span style={{ fontSize: 14 }}>How to use Grounded</span>
        <span style={{ flex: 1 }} />
        {session ? (
          <>
            <Link href="/run" style={{ fontSize: 13, color: '#0066cc' }}>Run →</Link>
            {(session.role === 'builder' || session.role === 'admin') && (
              <Link href="/builder" style={{ fontSize: 13, color: '#0066cc', marginLeft: 12 }}>Builder →</Link>
            )}
            {session.role === 'admin' && (
              <Link href="/team" style={{ fontSize: 13, color: '#0066cc', marginLeft: 12 }}>Team →</Link>
            )}
          </>
        ) : (
          <Link href="/login" style={{ fontSize: 13, color: '#0066cc' }}>Sign in →</Link>
        )}
        <span style={{ marginLeft: 14, paddingLeft: 12, borderLeft: '1px solid #ddd' }}>
          <ExternalToolLinks size="md" marginLeft={0} />
        </span>
      </header>

      <div style={{ maxWidth: 880, margin: '0 auto', padding: '32px 24px 80px', lineHeight: 1.55 }}>
        <h1 style={{ fontSize: 32, margin: '0 0 8px' }}>How to use Grounded</h1>
        <p style={{ fontSize: 16, color: '#444', marginTop: 0 }}>
          Grounded is shared AI infrastructure for African newsrooms. The newsroom's AI champion <strong>builds workflows</strong> from a set of prebuilt agents. The rest of the team <strong>runs them</strong> from a simple workflow list. This page explains both sides, and details every agent you can drop into a workflow.
        </p>

        <Toc sections={sections} />

        <Section id="overview" title="The two modes">
          <p>
            Grounded has two surfaces. The <Link href="/builder">Builder</Link> is a desktop drag-and-drop canvas where the AI champion composes <em>workflows</em> — graphs of agents that solve a specific newsroom problem. <Link href="/run">User mode</Link> is a simple list of those workflows organised by problem category — journalists pick one, follow on-screen instructions, fill in a form, and get the output. Users never see agents, prompts, or graphs.
          </p>
          <p>
            Workflows are framed as <strong>products solving newsroom problems</strong>. Each one carries a problem statement, a category (Personalisation, Revenue, Production, Delivery, Social media, Audience research, Fact-checking, Translation, Archive, Editorial operations), and step-by-step instructions for the user.
          </p>
        </Section>

        <Section id="building" title="Building a workflow">
          <ol style={{ paddingLeft: 22 }}>
            <li><strong>Click the <code>+</code> in the left sidebar.</strong> A fresh workflow opens immediately on the same screen — no separate setup screen.</li>
            <li>
              <strong>Frame the problem.</strong> In the right panel, fill in the purple <em>The problem this solves</em> section: what newsroom problem this workflow tackles, which category it fits in, and the step-by-step instructions the user will see when they run it.
            </li>
            <li>
              <strong>Compose the graph.</strong> Two ways:
              <ul>
                <li><strong>Drag agents from the palette</strong> on the left onto the canvas. Each agent is a node with input handles on its left and output handles on its right.</li>
                <li>
                  Or use the yellow <strong>Describe &amp; build</strong> panel: type what the workflow should do (<em>"When a tip comes in, fact-check it against our archive then draft a follow-up tweet"</em>) and Grounded composes the graph for you. You can still edit it manually after.
                </li>
              </ul>
            </li>
            <li>
              <strong>Wire inputs.</strong> Each input is in one of two states:
              <ul>
                <li><strong>🔗 Wired from another agent</strong> — drag a connection from one agent's output handle to another's input handle. Useful when one agent's output feeds another (e.g. Archivist's <code>archiveContext</code> → Verifier's <code>archiveContext</code>).</li>
                <li><strong>📋 Filled in by the user at run time</strong> — the default for any un-wired input. The user sees a form field for it when they run the workflow.</li>
              </ul>
            </li>
            <li>
              <strong>Twist the knobs.</strong> Click any agent on the canvas. The right panel shows its <em>Knobs</em> section — sliders, dropdowns, toggles per agent that calibrate how it behaves. These are set once at design time, not per run.
            </li>
            <li>
              <strong>Pick the workflow's output.</strong> Click an agent, then in the right panel's <em>Outputs</em> section pick the radio next to the field you want the user to see as the final result.
            </li>
            <li>
              <strong>Save. Test as user. Adjust.</strong> The header has a <code>▶ Test as user</code> button that auto-saves and opens a side panel showing the workflow exactly as a user will experience it. Run it, see the output, return to the canvas, tweak.
            </li>
            <li>
              <strong>Assign team members.</strong> In the right panel's <em>Members</em> section, add the people who should be able to run this in <Link href="/run">User mode</Link>. Only assigned users see the workflow on their <code>/run</code> page.
            </li>
          </ol>
        </Section>

        <Section id="running" title="Running a workflow as a user">
          <ol style={{ paddingLeft: 22 }}>
            <li>Go to <Link href="/run">/run</Link>. You'll see workflows your team has built and assigned to you, grouped by problem category.</li>
            <li>Pick one. The page shows what the workflow solves and step-by-step instructions for using it.</li>
            <li>Fill in the form fields. Required ones are marked; optional ones are labelled <em>(optional)</em>.</li>
            <li>Click <strong>Run</strong>. Wait a few seconds. The output appears below the form.</li>
            <li>If something looks wrong, talk to your AI champion — they tweak the workflow in the Builder.</li>
          </ol>
        </Section>

        <Section id="team" title="Managing your team (admins only)">
          <ol style={{ paddingLeft: 22 }}>
            <li>Go to <Link href="/team">/team</Link>.</li>
            <li>Click <strong>+ Invite member</strong>. Provide a display name, email, optional WhatsApp number, and pick a role:
              <ul>
                <li><strong>User</strong> — runs workflows assigned to them.</li>
                <li><strong>Builder</strong> — composes workflows, runs anything assigned to them.</li>
                <li><strong>Admin</strong> — full newsroom access plus inviting / removing team members.</li>
              </ul>
            </li>
            <li>The page shows a <strong>temporary password</strong> once on creation. Share it with the new person out-of-band — by the time WhatsApp delivery lands, this'll go automatically.</li>
            <li>The new person signs in at <Link href="/login">/login</Link>.</li>
            <li>Open the Builder, pick a workflow, and add them in the Members section so they can run it.</li>
          </ol>
        </Section>

        <Section id="ecosystem" title="The Develop AI ecosystem">
          <p>
            Grounded isn't the whole picture. It sits inside Develop AI's wider toolset, and every page links to its sister apps in the top-right of the menu. They\'re separate products with their own logins for now (single sign-on is on the roadmap).
          </p>
          {EXTERNAL_TOOLS.map((tool) => (
            <div key={tool.slug} style={{ background: 'white', border: '1px solid #e5e5e5', borderRadius: 8, padding: 14, marginTop: 12 }}>
              <h3 style={{ fontSize: 16, margin: '0 0 6px' }}>
                {tool.icon} {tool.name}{' '}
                <a href={tool.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: '#0066cc', fontWeight: 400 }}>
                  open ↗
                </a>
              </h3>
              <p style={{ margin: 0, fontSize: 14, color: '#444', lineHeight: 1.5 }}>{tool.description}</p>
            </div>
          ))}
        </Section>

        <Section id="agents" title="The 10 agents">
          <p>
            Each does one thing well. The power is in the composition — newsrooms combine them into workflows that fit how they actually work.
          </p>
          {sections.map((s) => (
            <AgentDetailCard key={s.slug} section={s} built={builtBySlug.get(s.slug)} />
          ))}
        </Section>
      </div>
    </main>
  );
}

function Toc({ sections }: { sections: AgentSection[] }) {
  return (
    <nav style={{ background: 'white', border: '1px solid #e5e5e5', borderRadius: 8, padding: 16, margin: '24px 0 32px', fontSize: 14 }}>
      <strong style={{ fontSize: 13, textTransform: 'uppercase', color: '#666', letterSpacing: 0.5, display: 'block', marginBottom: 8 }}>
        Contents
      </strong>
      <ol style={{ margin: 0, paddingLeft: 20, color: '#0066cc' }}>
        <li><a href="#overview">The two modes</a></li>
        <li><a href="#building">Building a workflow</a></li>
        <li><a href="#running">Running a workflow as a user</a></li>
        <li><a href="#team">Managing your team</a></li>
        <li><a href="#ecosystem">The Develop AI ecosystem</a></li>
        <li><a href="#agents">The 10 agents</a>
          <ul style={{ paddingLeft: 18, marginTop: 4 }}>
            {sections.map((s) => (
              <li key={s.slug}><a href={`#agent-${s.slug}`}>{s.name}</a></li>
            ))}
          </ul>
        </li>
      </ol>
    </nav>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} style={{ marginTop: 36, scrollMarginTop: 80 }}>
      <h2 style={{ fontSize: 22, margin: '0 0 12px', borderBottom: '1px solid #e5e5e5', paddingBottom: 8 }}>{title}</h2>
      {children}
    </section>
  );
}

function AgentDetailCard({ section, built }: { section: AgentSection; built: AgentMeta | undefined }) {
  return (
    <article
      id={`agent-${section.slug}`}
      style={{
        background: 'white',
        border: '1px solid #e5e5e5',
        borderRadius: 8,
        padding: 18,
        marginTop: 16,
        scrollMarginTop: 80,
      }}
    >
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <span style={{ fontSize: 28 }}>{built?.icon || '⏳'}</span>
        <h3 style={{ fontSize: 20, margin: 0 }}>
          {section.number}. {section.name}
        </h3>
        {!built && (
          <span style={{ fontSize: 11, padding: '2px 8px', background: '#fff2d6', color: '#8a5400', borderRadius: 10 }}>
            Coming soon
          </span>
        )}
      </header>

      <p style={{ fontSize: 14, color: '#333', margin: '0 0 16px', lineHeight: 1.6 }}>
        {section.canonicalText}
      </p>

      {built && (
        <>
          {Object.keys(built.inputs).length > 0 && (
            <SubBlock title="Inputs (data flowing into the agent)">
              {Object.entries(built.inputs).map(([k, schema]) => (
                <div key={k} style={{ marginBottom: 8 }}>
                  <strong style={{ fontSize: 13 }}>{schema.label || k}</strong>
                  {schema.required && <span style={{ color: '#cc3333', marginLeft: 4 }}>*</span>}
                  <span style={{ fontSize: 11, color: '#999', marginLeft: 6 }}>
                    {schema.required ? '' : '(optional) · '}{schema.type}
                  </span>
                  {schema.description && (
                    <p style={{ fontSize: 13, color: '#555', margin: '2px 0 0', lineHeight: 1.4 }}>{schema.description}</p>
                  )}
                </div>
              ))}
            </SubBlock>
          )}

          {built.config && Object.keys(built.config).length > 0 && (
            <SubBlock title="Knobs (per-node calibration)">
              {Object.entries(built.config).map(([k, schema]) => (
                <KnobRow key={k} fieldKey={k} schema={schema} />
              ))}
            </SubBlock>
          )}

          {Object.keys(built.outputs).length > 0 && (
            <SubBlock title="Outputs">
              {Object.entries(built.outputs).map(([k, schema]) => (
                <div key={k} style={{ marginBottom: 6 }}>
                  <strong style={{ fontSize: 13 }}>{k}</strong>
                  <span style={{ fontSize: 11, color: '#999', marginLeft: 6 }}>{schema.type}</span>
                  {schema.description && (
                    <p style={{ fontSize: 13, color: '#555', margin: '2px 0 0', lineHeight: 1.4 }}>{schema.description}</p>
                  )}
                </div>
              ))}
            </SubBlock>
          )}
        </>
      )}
    </article>
  );
}

function SubBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 14, padding: '12px 14px', background: '#fafafa', borderRadius: 6 }}>
      <h4 style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: '#666', margin: '0 0 8px' }}>{title}</h4>
      {children}
    </div>
  );
}

function KnobRow({ fieldKey, schema }: { fieldKey: string; schema: AgentConfigField }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <strong style={{ fontSize: 13 }}>{schema.label || fieldKey}</strong>
      <span style={{ fontSize: 11, color: '#999', marginLeft: 6 }}>{schema.type}</span>
      {schema.description && (
        <p style={{ fontSize: 13, color: '#555', margin: '2px 0 4px', lineHeight: 1.4 }}>{schema.description}</p>
      )}
      <div style={{ fontSize: 12, color: '#777' }}>
        {schema.type === 'select' ? (
          <>Default: <code>{schema.default}</code> · {schema.options.length} options ({schema.options.map((o) => o.label).join(', ')})</>
        ) : schema.type === 'number' ? (
          <>Default: <code>{String(schema.default)}</code>{typeof schema.min === 'number' && typeof schema.max === 'number' && <> · Range: {schema.min}–{schema.max}</>}</>
        ) : schema.type === 'boolean' ? (
          <>Default: <code>{schema.default ? 'on' : 'off'}</code></>
        ) : (
          <>Default: <code>{String(schema.default) || '(empty)'}</code></>
        )}
      </div>
    </div>
  );
}
