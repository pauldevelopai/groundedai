// BuilderShell — the whole Builder workspace in one client component.
//
// Layout:
//   ┌──────────────────────────────────────────────────────────┐
//   │ Header: workflow name · trigger · share · Save · Run     │
//   ├──────────┬─────────────────────────────────┬─────────────┤
//   │ Workflows│                                 │ Selected    │
//   │   + New  │           Canvas                │ node config │
//   │   list   │                                 │   OR        │
//   │ ──────── │                                 │ Workflow    │
//   │ Agents   │                                 │ settings +  │
//   │   palette│                                 │ Members     │
//   └──────────┴─────────────────────────────────┴─────────────┘
//
// "+ New" POSTs an empty workflow and the URL replaces to /builder/[id]
// — no separate /new screen. Clicking a workflow in the list switches
// active workflow without leaving /builder.

'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
} from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ReactFlow,
  ReactFlowProvider,
  Controls,
  Background,
  Handle,
  Position,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
  type EdgeChange,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import WorkflowRunner from './WorkflowRunner';
import StarterPicker, { type Starter } from './StarterPicker';

export type AgentConfigField =
  | { type: 'number'; default: number; min?: number; max?: number; step?: number; label?: string; description?: string }
  | { type: 'boolean'; default: boolean; label?: string; description?: string }
  | { type: 'select'; default: string; options: { value: string; label: string; description?: string }[]; label?: string; description?: string }
  | { type: 'string'; default: string; label?: string; description?: string; placeholder?: string }
  | { type: 'longtext'; default: string; label?: string; description?: string; placeholder?: string };

export type AgentMeta = {
  slug: string;
  name: string;
  icon?: string;
  description: string;
  triggers: string[];
  inputs: Record<string, { type: string; required?: boolean; label?: string; description?: string }>;
  config?: Record<string, AgentConfigField>;
  outputs: Record<string, { type: string; description?: string }>;
  route: string;
};

type WfDefinition = {
  nodes: { id: string; agent_slug: string; config?: Record<string, string>; position?: { x: number; y: number } }[];
  edges: { from: { node: string; field: string }; to: { node: string; field: string } }[];
  inputs: { name: string; to: { node: string; field: string } }[];
  output: { node: string; field: string };
};

export type Workflow = {
  id: string;
  newsroom_id: string;
  name: string;
  slug: string;
  trigger_phrase: string | null;
  description: string | null;
  problem_statement: string | null;
  problem_category: string | null;
  user_instructions: string | null;
  definition: WfDefinition;
  is_shared: boolean;
  newsroom_name?: string;
};

export type WorkflowSummary = {
  id: string;
  newsroom_id: string;
  newsroom_name: string;
  name: string;
  slug: string;
  is_shared: boolean;
  trigger_phrase: string | null;
  description: string | null;
  problem_category?: string | null;
  updated_at: string;
};

const PROBLEM_CATEGORIES = [
  'Personalisation',
  'Revenue',
  'Production',
  'Delivery',
  'Social media',
  'Audience research',
  'Fact-checking',
  'Translation',
  'Archive',
  'Editorial operations',
  'Other',
];

export type SessionUser = {
  id: string;
  email: string;
  role: 'builder' | 'user' | 'admin';
  newsroom_id: string;
  newsroom_name: string;
};

type AgentNodeData = {
  agent_slug: string;
  agent: AgentMeta;
  config: Record<string, string>;
};

type FlowNode = Node<AgentNodeData, 'agent'>;

type Assignment = { id: string; email: string; role: string; whatsapp_number?: string | null; display_name?: string | null; assigned_at: string };
type NewsroomUser = { id: string; email: string; role: string; whatsapp_number?: string | null; display_name?: string | null };

const EMPTY_DEFINITION: WfDefinition = { nodes: [], edges: [], inputs: [], output: { node: '', field: '' } };

function defToFlow(def: WfDefinition, agents: AgentMeta[]): { nodes: FlowNode[]; edges: Edge[] } {
  const agentBySlug = new Map(agents.map((a) => [a.slug, a]));
  const nodes: FlowNode[] = (def.nodes || []).map((n, i) => ({
    id: n.id,
    type: 'agent',
    position: n.position || { x: 80 + i * 280, y: 80 },
    data: {
      agent_slug: n.agent_slug,
      agent: agentBySlug.get(n.agent_slug) as AgentMeta,
      config: n.config || {},
    },
  }));
  const edges: Edge[] = (def.edges || []).map((e, i) => ({
    id: `e-${i}-${e.from.node}-${e.from.field}-${e.to.node}-${e.to.field}`,
    source: e.from.node,
    sourceHandle: `out-${e.from.field}`,
    target: e.to.node,
    targetHandle: `in-${e.to.field}`,
  }));
  return { nodes, edges };
}

function flowToDef(
  nodes: FlowNode[],
  edges: Edge[],
  wfInputs: WfDefinition['inputs'],
  wfOutput: WfDefinition['output']
): WfDefinition {
  return {
    nodes: nodes.map((n) => ({
      id: n.id,
      agent_slug: n.data.agent_slug,
      config: n.data.config,
      position: n.position,
    })),
    edges: edges.map((e) => ({
      from: { node: e.source, field: (e.sourceHandle || '').replace(/^out-/, '') },
      to: { node: e.target, field: (e.targetHandle || '').replace(/^in-/, '') },
    })),
    inputs: wfInputs,
    output: wfOutput,
  };
}

function summariseConfig(agent: AgentMeta, config: Record<string, string>): string[] {
  const lines: string[] = [];
  if (!agent.config) return lines;
  for (const [key, schema] of Object.entries(agent.config)) {
    const raw = config[key];
    const value = raw === undefined || raw === '' ? schema.default : raw;
    if (value === undefined || value === null || value === '') continue;
    const label = schema.label || key;
    let display: string;
    if (schema.type === 'boolean') {
      if (!value || value === 'false') continue; // hide off-by-default booleans
      display = label;
    } else if (schema.type === 'select') {
      const opt = schema.options.find((o) => o.value === String(value));
      display = `${label}: ${opt?.label || value}`;
    } else {
      display = `${label}: ${value}`;
    }
    lines.push(display);
    if (lines.length >= 3) break; // cap
  }
  return lines;
}

function AgentNode({ data, selected }: NodeProps<FlowNode>) {
  const { agent, config } = data;
  const inputEntries = Object.entries(agent.inputs);
  const outputEntries = Object.entries(agent.outputs);
  const summary = summariseConfig(agent, config);
  return (
    <div
      style={{
        background: 'white',
        border: selected ? '2px solid #0066cc' : '1px solid #bbb',
        borderRadius: 8,
        boxShadow: selected ? '0 0 0 3px rgba(0,102,204,0.15)' : '0 2px 6px rgba(0,0,0,0.06)',
        minWidth: 240,
        fontSize: 13,
      }}
    >
      <div
        style={{
          padding: '10px 12px',
          borderBottom: '1px solid #eee',
          borderRadius: '8px 8px 0 0',
          display: 'flex',
          gap: 10,
          alignItems: 'flex-start',
          background: 'linear-gradient(180deg,#fafbfd,#f4f6fa)',
        }}
      >
        <div style={{ fontSize: 22, lineHeight: '22px', flexShrink: 0 }}>{agent.icon || '⚙️'}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{agent.name}</div>
          <div style={{ color: '#666', fontSize: 11, marginTop: 2, lineHeight: 1.35 }}>
            {agent.description.split('.')[0]}.
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {inputEntries.map(([k, schema]) => (
            <div key={k} style={{ position: 'relative', padding: '0 12px 0 14px' }}>
              <Handle
                type="target"
                position={Position.Left}
                id={`in-${k}`}
                style={{ background: schema.required ? '#cc3333' : '#888', width: 10, height: 10 }}
              />
              <span style={{ fontSize: 11 }}>
                {k}
                {schema.required && <span style={{ color: '#cc3333' }}>*</span>}
              </span>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {outputEntries.map(([k]) => (
            <div key={k} style={{ position: 'relative', padding: '0 14px 0 12px', textAlign: 'right' }}>
              <span style={{ fontSize: 11, color: '#0066cc' }}>{k}</span>
              <Handle
                type="source"
                position={Position.Right}
                id={`out-${k}`}
                style={{ background: '#0066cc', width: 10, height: 10 }}
              />
            </div>
          ))}
        </div>
      </div>
      {summary.length > 0 && (
        <div
          style={{
            padding: '8px 12px',
            borderTop: '1px dashed #eee',
            background: '#fafafa',
            borderRadius: '0 0 8px 8px',
            fontSize: 11,
            color: '#555',
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
          }}
        >
          {summary.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
      )}
    </div>
  );
}

const nodeTypes = { agent: AgentNode };

function nextNodeId(existing: { id: string }[]) {
  let n = existing.length + 1;
  while (existing.some((e) => e.id === `n${n}`)) n++;
  return `n${n}`;
}

export default function BuilderShell(props: {
  initialWorkflows: WorkflowSummary[];
  initialWorkflow: Workflow | null;
  agents: AgentMeta[];
  currentUser: SessionUser;
}) {
  return (
    <ReactFlowProvider>
      <Inner {...props} />
    </ReactFlowProvider>
  );
}

function Inner({
  initialWorkflows,
  initialWorkflow,
  agents,
  currentUser,
}: {
  initialWorkflows: WorkflowSummary[];
  initialWorkflow: Workflow | null;
  agents: AgentMeta[];
  currentUser: SessionUser;
}) {
  const router = useRouter();
  const reactFlow = useReactFlow();
  const flowWrapper = useRef<HTMLDivElement>(null);

  const [workflows, setWorkflows] = useState(initialWorkflows);
  const [activeWorkflow, setActiveWorkflow] = useState<Workflow | null>(initialWorkflow);

  const editable =
    !!activeWorkflow &&
    activeWorkflow.newsroom_id === currentUser.newsroom_id &&
    (currentUser.role === 'builder' || currentUser.role === 'admin');

  const initialFlow = useMemo(
    () => (activeWorkflow ? defToFlow(activeWorkflow.definition, agents) : { nodes: [], edges: [] }),
    [activeWorkflow, agents]
  );
  const [flowNodes, setFlowNodes] = useState<FlowNode[]>(initialFlow.nodes);
  const [flowEdges, setFlowEdges] = useState<Edge[]>(initialFlow.edges);
  const [wfOutput, setWfOutput] = useState<WfDefinition['output']>(
    activeWorkflow?.definition.output || { node: '', field: '' }
  );

  // Workflow inputs are AUTO-DERIVED from the canvas: every input field on
  // every node that is NOT wired by an incoming edge becomes a workflow
  // input the user fills at run time. Multiple nodes with the same input
  // field name share a single workflow input.
  const wfInputs = useMemo<WfDefinition['inputs']>(() => {
    const seen = new Set<string>();
    const out: WfDefinition['inputs'] = [];
    for (const node of flowNodes) {
      for (const fieldName of Object.keys(node.data.agent.inputs)) {
        const wired = flowEdges.some(
          (e) => e.target === node.id && e.targetHandle === `in-${fieldName}`
        );
        if (wired) continue;
        const key = `${fieldName}@${node.id}@${fieldName}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ name: fieldName, to: { node: node.id, field: fieldName } });
      }
    }
    return out;
  }, [flowNodes, flowEdges]);
  const [name, setName] = useState(activeWorkflow?.name || '');
  const [triggerPhrase, setTriggerPhrase] = useState(activeWorkflow?.trigger_phrase || '');
  const [description, setDescription] = useState(activeWorkflow?.description || '');
  const [problemStatement, setProblemStatement] = useState(activeWorkflow?.problem_statement || '');
  const [problemCategory, setProblemCategory] = useState(activeWorkflow?.problem_category || '');
  const [userInstructions, setUserInstructions] = useState(activeWorkflow?.user_instructions || '');
  const [isShared, setIsShared] = useState(activeWorkflow?.is_shared || false);
  const [testPanelOpen, setTestPanelOpen] = useState(false);

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [status, setStatus] = useState<{ kind: 'ok' | 'error' | 'info'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showStarterPicker, setShowStarterPicker] = useState(false);

  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [newsroomUsers, setNewsroomUsers] = useState<NewsroomUser[]>([]);

  // Reload state when activeWorkflow changes (e.g. switching workflows from sidebar)
  useEffect(() => {
    if (!activeWorkflow) {
      setFlowNodes([]);
      setFlowEdges([]);
      setWfOutput({ node: '', field: '' });
      setName('');
      setTriggerPhrase('');
      setDescription('');
      setProblemStatement('');
      setProblemCategory('');
      setUserInstructions('');
      setIsShared(false);
      setAssignments([]);
      setSelectedNodeId(null);
      setTestPanelOpen(false);
      return;
    }
    const flow = defToFlow(activeWorkflow.definition, agents);
    setFlowNodes(flow.nodes);
    setFlowEdges(flow.edges);
    setWfOutput(activeWorkflow.definition.output || { node: '', field: '' });
    setName(activeWorkflow.name);
    setTriggerPhrase(activeWorkflow.trigger_phrase || '');
    setDescription(activeWorkflow.description || '');
    setProblemStatement(activeWorkflow.problem_statement || '');
    setProblemCategory(activeWorkflow.problem_category || '');
    setUserInstructions(activeWorkflow.user_instructions || '');
    setIsShared(activeWorkflow.is_shared);
    setSelectedNodeId(null);
    // load assignments + newsroom users
    fetch(`/api/workflows/${activeWorkflow.id}/assignments`)
      .then((r) => r.json())
      .then((d) => setAssignments(d.assignments || []))
      .catch(() => setAssignments([]));
    fetch('/api/users')
      .then((r) => r.json())
      .then((d) => setNewsroomUsers(d.users || []))
      .catch(() => setNewsroomUsers([]));
  }, [activeWorkflow, agents]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setFlowNodes((nds) => applyNodeChanges(changes, nds) as FlowNode[]);
  }, []);
  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setFlowEdges((eds) => applyEdgeChanges(changes, eds));
  }, []);
  const onConnect = useCallback((conn: Connection) => {
    setFlowEdges((eds) => addEdge(conn, eds));
  }, []);

  const onDragOver = useCallback((event: ReactDragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);
  const onDrop = useCallback(
    (event: ReactDragEvent) => {
      event.preventDefault();
      if (!editable) return;
      const slug = event.dataTransfer.getData('application/anchor-agent');
      if (!slug) return;
      const agent = agents.find((a) => a.slug === slug);
      if (!agent) return;
      const position = reactFlow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
      setFlowNodes((nds) => {
        const id = nextNodeId(nds);
        const newNode: FlowNode = {
          id,
          type: 'agent',
          position,
          data: { agent_slug: agent.slug, agent, config: {} },
        };
        return [...nds, newNode];
      });
    },
    [agents, editable, reactFlow]
  );

  const onNodeClick = useCallback((_e: unknown, node: Node) => setSelectedNodeId(node.id), []);
  const onPaneClick = useCallback(() => setSelectedNodeId(null), []);

  const selectedNode = flowNodes.find((n) => n.id === selectedNodeId) || null;

  const updateSelectedConfig = useCallback(
    (field: string, value: string) => {
      if (!selectedNode) return;
      setFlowNodes((nds) =>
        nds.map((n) =>
          n.id === selectedNode.id
            ? { ...n, data: { ...n.data, config: { ...n.data.config, [field]: value } } }
            : n
        )
      );
    },
    [selectedNode]
  );

  const deleteSelected = useCallback(() => {
    if (!selectedNode) return;
    setFlowNodes((nds) => nds.filter((n) => n.id !== selectedNode.id));
    setFlowEdges((eds) => eds.filter((e) => e.source !== selectedNode.id && e.target !== selectedNode.id));
    if (wfOutput.node === selectedNode.id) setWfOutput({ node: '', field: '' });
    setSelectedNodeId(null);
  }, [selectedNode, wfOutput]);

  function onClickNew() {
    if (creating) return;
    setShowStarterPicker(true);
  }

  async function createWorkflowFromBody(body: Record<string, unknown>) {
    if (creating) return;
    setStatus(null);
    setCreating(true);
    try {
      const res = await fetch('/api/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus({ kind: 'error', text: data.error || 'Failed to create workflow' });
        setCreating(false);
        return;
      }
      const wf: Workflow = data.workflow;
      setWorkflows((ws) => [
        {
          id: wf.id,
          newsroom_id: wf.newsroom_id,
          newsroom_name: currentUser.newsroom_name,
          name: wf.name,
          slug: wf.slug,
          is_shared: wf.is_shared,
          trigger_phrase: wf.trigger_phrase,
          description: wf.description,
          problem_category: wf.problem_category,
          updated_at: new Date().toISOString(),
        },
        ...ws,
      ]);
      setActiveWorkflow(wf);
      setShowStarterPicker(false);
      router.replace(`/builder/${wf.id}`);
    } catch (e) {
      setStatus({ kind: 'error', text: e instanceof Error ? e.message : 'Network error' });
    } finally {
      setCreating(false);
    }
  }

  async function onPickStarter(s: Starter) {
    await createWorkflowFromBody({
      name: s.title,
      problem_statement: s.problem_statement,
      problem_category: s.problem_category,
      user_instructions: s.user_instructions,
      definition: s.definition,
      is_shared: false,
    });
  }

  async function onStartBlank() {
    await createWorkflowFromBody({
      name: 'Untitled workflow',
      definition: EMPTY_DEFINITION,
      is_shared: false,
    });
  }

  async function onSwitch(id: string) {
    if (id === activeWorkflow?.id) return;
    setStatus(null);
    try {
      const res = await fetch(`/api/workflows/${id}`);
      const data = await res.json();
      if (!res.ok) {
        setStatus({ kind: 'error', text: data.error || 'Failed to load workflow' });
        return;
      }
      setActiveWorkflow(data.workflow);
      router.replace(`/builder/${id}`);
    } catch (e) {
      setStatus({ kind: 'error', text: e instanceof Error ? e.message : 'Network error' });
    }
  }

  async function onSave() {
    if (!activeWorkflow) return;
    setStatus(null);
    setSaving(true);
    const definition = flowToDef(flowNodes, flowEdges, wfInputs, wfOutput);
    try {
      const res = await fetch(`/api/workflows/${activeWorkflow.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          trigger_phrase: triggerPhrase || null,
          description: description || null,
          problem_statement: problemStatement || null,
          problem_category: problemCategory || null,
          user_instructions: userInstructions || null,
          definition,
          is_shared: isShared,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus({ kind: 'error', text: data.error || 'Save failed' });
      } else {
        setStatus({ kind: 'ok', text: 'Saved.' });
        setActiveWorkflow(data.workflow);
        setWorkflows((ws) => ws.map((w) => (w.id === data.workflow.id ? { ...w, name: data.workflow.name, is_shared: data.workflow.is_shared, trigger_phrase: data.workflow.trigger_phrase, description: data.workflow.description, updated_at: new Date().toISOString() } : w)));
      }
    } catch (e) {
      setStatus({ kind: 'error', text: e instanceof Error ? e.message : 'Network error' });
    } finally {
      setSaving(false);
    }
  }

  async function onTestAsUser() {
    if (!activeWorkflow || flowNodes.length === 0 || !wfOutput.node) return;
    // Save first so the test runs the latest canvas state.
    setStatus(null);
    setSaving(true);
    const definition = flowToDef(flowNodes, flowEdges, wfInputs, wfOutput);
    try {
      const res = await fetch(`/api/workflows/${activeWorkflow.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          trigger_phrase: triggerPhrase || null,
          description: description || null,
          problem_statement: problemStatement || null,
          problem_category: problemCategory || null,
          user_instructions: userInstructions || null,
          definition,
          is_shared: isShared,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus({ kind: 'error', text: data.error || 'Save before test failed' });
        return;
      }
      setActiveWorkflow(data.workflow);
      setTestPanelOpen(true);
      setStatus({ kind: 'ok', text: 'Saved. Testing as a user…' });
    } catch (e) {
      setStatus({ kind: 'error', text: e instanceof Error ? e.message : 'Network error' });
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!activeWorkflow) return;
    if (!window.confirm(`Delete workflow "${activeWorkflow.name}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/workflows/${activeWorkflow.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setStatus({ kind: 'error', text: data.error || 'Delete failed' });
        return;
      }
      setWorkflows((ws) => ws.filter((w) => w.id !== activeWorkflow.id));
      setActiveWorkflow(null);
      router.replace('/builder');
    } catch (e) {
      setStatus({ kind: 'error', text: e instanceof Error ? e.message : 'Network error' });
    }
  }

  const setOutputField = (nodeId: string, field: string) => setWfOutput({ node: nodeId, field });

  async function addAssignment(userId: string) {
    if (!activeWorkflow) return;
    const res = await fetch(`/api/workflows/${activeWorkflow.id}/assignments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId }),
    });
    if (res.ok) {
      const fresh = await fetch(`/api/workflows/${activeWorkflow.id}/assignments`).then((r) => r.json());
      setAssignments(fresh.assignments || []);
    } else {
      const data = await res.json().catch(() => ({}));
      setStatus({ kind: 'error', text: data.error || 'Assign failed' });
    }
  }
  async function removeAssignment(userId: string) {
    if (!activeWorkflow) return;
    const res = await fetch(`/api/workflows/${activeWorkflow.id}/assignments/${userId}`, { method: 'DELETE' });
    if (res.ok) {
      setAssignments((as) => as.filter((a) => a.id !== userId));
    } else {
      const data = await res.json().catch(() => ({}));
      setStatus({ kind: 'error', text: data.error || 'Unassign failed' });
    }
  }

  const [generating, setGenerating] = useState(false);
  async function generateFromDescription(description: string) {
    if (!activeWorkflow || !editable || generating) return;
    if (flowNodes.length > 0) {
      const ok = window.confirm('This will replace the current canvas with the generated workflow. Continue?');
      if (!ok) return;
    }
    setStatus(null);
    setGenerating(true);
    try {
      const res = await fetch('/api/workflows/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus({ kind: 'error', text: data.error || 'Generation failed' });
        return;
      }
      // Lay nodes left-to-right by topological order — defToFlow uses
      // index fallback when position is missing, which is good enough.
      const flow = defToFlow(data.definition, agents);
      setFlowNodes(flow.nodes);
      setFlowEdges(flow.edges);
      setWfOutput(data.definition.output || { node: '', field: '' });
      if (data.name) setName(data.name);
      if (data.trigger_phrase) setTriggerPhrase(data.trigger_phrase);
      setSelectedNodeId(null);
      setStatus({ kind: 'ok', text: `Generated in ${data.durationMs}ms (cost $${(data.cost?.costUsd ?? 0).toFixed(4)}). Review and Save.` });
    } catch (e) {
      setStatus({ kind: 'error', text: e instanceof Error ? e.message : 'Network error' });
    } finally {
      setGenerating(false);
    }
  }

  const ownWorkflows = workflows.filter((w) => w.newsroom_id === currentUser.newsroom_id);
  const sharedWorkflows = workflows.filter((w) => w.newsroom_id !== currentUser.newsroom_id);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: 'system-ui, sans-serif' }}>
      {/* Header */}
      <header style={{ borderBottom: '1px solid #e5e5e5', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12, background: '#fafafa', minHeight: 52 }}>
        <strong style={{ fontSize: 15 }}>Anchor</strong>
        <span style={{ color: '#999' }}>/</span>
        <span style={{ fontSize: 14 }}>Builder</span>
        <span style={{ flex: 1 }} />
        {activeWorkflow ? (
          <>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Workflow name"
              disabled={!editable}
              style={{ fontSize: 14, fontWeight: 500, padding: '6px 8px', border: '1px solid #ddd', borderRadius: 4, minWidth: 180 }}
            />
            <input
              type="text"
              value={triggerPhrase}
              onChange={(e) => setTriggerPhrase(e.target.value)}
              placeholder="Trigger phrase"
              disabled={!editable}
              style={{ fontSize: 12, padding: '6px 8px', border: '1px solid #ddd', borderRadius: 4, minWidth: 180 }}
            />
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
              <input
                type="checkbox"
                checked={isShared}
                onChange={(e) => setIsShared(e.target.checked)}
                disabled={!editable}
              />
              Share to library
            </label>
            {status && (
              <span style={{ fontSize: 12, color: status.kind === 'error' ? '#b00' : status.kind === 'ok' ? '#0a0' : '#666' }}>
                {status.text}
              </span>
            )}
            <button
              onClick={onSave}
              disabled={!editable || saving}
              style={{ padding: '7px 12px', background: '#111', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, cursor: 'pointer', opacity: !editable || saving ? 0.5 : 1 }}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={onTestAsUser}
              disabled={saving || flowNodes.length === 0 || !wfOutput.node}
              title={flowNodes.length === 0 ? 'Add at least one agent first' : !wfOutput.node ? 'Pick a workflow output first' : 'Save and test as a user'}
              style={{ padding: '7px 12px', background: '#0066cc', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, cursor: 'pointer', opacity: saving || flowNodes.length === 0 || !wfOutput.node ? 0.5 : 1 }}
            >
              ▶ Test as user
            </button>
          </>
        ) : (
          <span style={{ fontSize: 12, color: '#888' }}>{currentUser.email} · {currentUser.newsroom_name}</span>
        )}
        <Link href="/run" style={{ fontSize: 12, color: '#0066cc', marginLeft: 12 }}>Run →</Link>
        <Link href="/research" style={{ fontSize: 12, color: '#0066cc', marginLeft: 8 }}>Research →</Link>
        <Link href="/translation" style={{ fontSize: 12, color: '#0066cc', marginLeft: 8 }}>Translator →</Link>
        {currentUser.role === 'admin' && (
          <Link href="/team" style={{ fontSize: 12, color: '#0066cc', marginLeft: 8 }}>Team →</Link>
        )}
        <Link href="/guide" style={{ fontSize: 12, color: '#0066cc', marginLeft: 8 }}>Help →</Link>
      </header>

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* Left rail: workflows + agents palette */}
        <aside style={{ width: 240, borderRight: '1px solid #e5e5e5', display: 'flex', flexDirection: 'column', background: '#fcfcfc' }}>
          <div style={{ padding: 12, borderBottom: '1px solid #eee' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <h3 style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, color: '#777', margin: 0 }}>
                Workflows
              </h3>
              {(currentUser.role === 'builder' || currentUser.role === 'admin') && (
                <button
                  onClick={onClickNew}
                  disabled={creating}
                  title="New workflow"
                  style={{ width: 24, height: 24, padding: 0, lineHeight: '20px', textAlign: 'center', background: '#111', color: '#fff', border: 'none', borderRadius: 4, cursor: creating ? 'wait' : 'pointer', fontSize: 16 }}
                >
                  +
                </button>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {ownWorkflows.length === 0 ? (
                <p style={{ fontSize: 13, color: '#999', margin: '4px 0' }}>No workflows yet.</p>
              ) : (
                ownWorkflows.map((w) => (
                  <button
                    key={w.id}
                    onClick={() => onSwitch(w.id)}
                    style={{
                      textAlign: 'left',
                      padding: '8px 10px',
                      background: activeWorkflow?.id === w.id ? '#e8f1ff' : 'transparent',
                      color: activeWorkflow?.id === w.id ? '#0044aa' : '#222',
                      border: 'none',
                      borderRadius: 4,
                      fontSize: 14,
                      cursor: 'pointer',
                    }}
                  >
                    {w.name}
                  </button>
                ))
              )}
            </div>
            {sharedWorkflows.length > 0 && (
              <>
                <h3 style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, color: '#777', margin: '12px 0 6px' }}>Shared library</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {sharedWorkflows.map((w) => (
                    <button
                      key={w.id}
                      onClick={() => onSwitch(w.id)}
                      style={{
                        textAlign: 'left',
                        padding: '8px 10px',
                        background: activeWorkflow?.id === w.id ? '#e8f1ff' : 'transparent',
                        color: activeWorkflow?.id === w.id ? '#0044aa' : '#444',
                        border: 'none',
                        borderRadius: 4,
                        fontSize: 14,
                        cursor: 'pointer',
                      }}
                      title={`From ${w.newsroom_name}`}
                    >
                      {w.name}
                      <span style={{ fontSize: 11, color: '#999', marginLeft: 4 }}>· {w.newsroom_name}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {activeWorkflow && (
            <div style={{ padding: 12, overflowY: 'auto', flex: 1 }}>
              <h3 style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, color: '#777', margin: '0 0 8px' }}>Agents</h3>
              {agents.map((a) => (
                <div
                  key={a.slug}
                  draggable={editable}
                  onDragStart={(e) => {
                    if (!editable) return;
                    e.dataTransfer.setData('application/anchor-agent', a.slug);
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                  style={{
                    padding: 10,
                    marginBottom: 8,
                    border: '1px solid #ddd',
                    borderRadius: 4,
                    background: 'white',
                    cursor: editable ? 'grab' : 'not-allowed',
                    opacity: editable ? 1 : 0.5,
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{a.name}</div>
                  <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>{a.description}</div>
                </div>
              ))}
            </div>
          )}
        </aside>

        {/* Canvas */}
        <div ref={flowWrapper} style={{ flex: 1, minWidth: 0 }} onDrop={onDrop} onDragOver={onDragOver}>
          {!activeWorkflow ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#888', flexDirection: 'column', gap: 12 }}>
              <p style={{ fontSize: 14 }}>No workflow open.</p>
              {(currentUser.role === 'builder' || currentUser.role === 'admin') && (
                <button
                  onClick={onClickNew}
                  style={{ padding: '8px 16px', background: '#111', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}
                >
                  + Create your first workflow
                </button>
              )}
            </div>
          ) : (
            <ReactFlow
              nodes={flowNodes}
              edges={flowEdges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeClick={onNodeClick}
              onPaneClick={onPaneClick}
              nodeTypes={nodeTypes}
              fitView
              nodesDraggable={editable}
              nodesConnectable={editable}
              elementsSelectable={editable}
            >
              <Background />
              <Controls />
            </ReactFlow>
          )}
        </div>

        {/* Starter picker — shown when "+ New" is clicked */}
        {showStarterPicker && (
          <StarterPicker
            onPick={onPickStarter}
            onBlank={onStartBlank}
            onCancel={() => !creating && setShowStarterPicker(false)}
            picking={creating}
          />
        )}

        {/* Test-as-user overlay */}
        {testPanelOpen && activeWorkflow && (
          <>
            <div
              onClick={() => setTestPanelOpen(false)}
              style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.25)', zIndex: 50 }}
            />
            <aside
              style={{
                position: 'fixed',
                top: 0,
                right: 0,
                bottom: 0,
                width: 480,
                background: 'white',
                boxShadow: '-4px 0 16px rgba(0,0,0,0.1)',
                zIndex: 51,
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <WorkflowRunner workflow={activeWorkflow} onClose={() => setTestPanelOpen(false)} />
            </aside>
          </>
        )}

        {/* Right panel */}
        {activeWorkflow && (
          <aside style={{ width: 320, borderLeft: '1px solid #e5e5e5', padding: 14, overflowY: 'auto', background: '#fafafa' }}>
            {selectedNode ? (
              <NodePanel
                node={selectedNode}
                flowEdges={flowEdges}
                flowNodes={flowNodes}
                wfOutput={wfOutput}
                editable={editable}
                onConfigChange={updateSelectedConfig}
                onSetOutput={(field) => setOutputField(selectedNode.id, field)}
                onDelete={deleteSelected}
              />
            ) : (
              <WorkflowPanel
                description={description}
                setDescription={setDescription}
                problemStatement={problemStatement}
                setProblemStatement={setProblemStatement}
                problemCategory={problemCategory}
                setProblemCategory={setProblemCategory}
                userInstructions={userInstructions}
                setUserInstructions={setUserInstructions}
                editable={editable}
                wfInputs={wfInputs}
                wfOutput={wfOutput}
                assignments={assignments}
                newsroomUsers={newsroomUsers}
                onAdd={addAssignment}
                onRemove={removeAssignment}
                onDelete={onDelete}
                onGenerate={generateFromDescription}
                generating={generating}
                hasNodes={flowNodes.length > 0}
              />
            )}
          </aside>
        )}
      </div>
    </div>
  );
}

function NodePanel({
  node,
  flowEdges,
  flowNodes,
  wfOutput,
  editable,
  onConfigChange,
  onSetOutput,
  onDelete,
}: {
  node: FlowNode;
  flowEdges: Edge[];
  flowNodes: FlowNode[];
  wfOutput: WfDefinition['output'];
  editable: boolean;
  onConfigChange: (field: string, value: string) => void;
  onSetOutput: (field: string) => void;
  onDelete: () => void;
}) {
  const { agent, config } = node.data;
  // For each input, find the upstream node label (if wired) so the panel can
  // show "Coming from Archivist" instead of just "wired".
  function upstreamLabelFor(fieldName: string): string | null {
    const edge = flowEdges.find(
      (e) => e.target === node.id && e.targetHandle === `in-${fieldName}`
    );
    if (!edge) return null;
    const sourceNode = flowNodes.find((n) => n.id === edge.source);
    const fromField = (edge.sourceHandle || '').replace(/^out-/, '');
    if (!sourceNode) return `another node's "${fromField}"`;
    return `${sourceNode.data.agent.name}'s "${fromField}"`;
  }
  return (
    <div>
      <h3 style={{ fontSize: 16, margin: '0 0 4px' }}>{agent.icon || ''} {agent.name}</h3>
      <div style={{ color: '#888', fontSize: 12, marginBottom: 12 }}>id: {node.id}</div>
      <p style={{ fontSize: 13, color: '#555', marginTop: 0 }}>{agent.description}</p>

      <h4 style={{ fontSize: 12, textTransform: 'uppercase', color: '#777', margin: '16px 0 6px', letterSpacing: 0.5 }}>Inputs</h4>
      <p style={{ fontSize: 11, color: '#888', margin: '0 0 8px' }}>
        Each input is either wired from another agent on the canvas, or filled in by the user when they run the workflow.
      </p>
      {Object.entries(agent.inputs).map(([k, schema]) => {
        const wiredFrom = upstreamLabelFor(k);
        const wired = wiredFrom !== null;
        const label = schema.label || k;
        return (
          <div key={k} style={{ marginBottom: 12, padding: 10, border: '1px solid #eee', borderRadius: 4, background: 'white' }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>
              {label}
              {schema.required && <span style={{ color: '#cc3333', marginLeft: 4 }}>*</span>}
              <span style={{ fontSize: 11, color: '#999', fontWeight: 400, marginLeft: 6 }}>
                {schema.required ? '' : '(optional) · '}{schema.type}
              </span>
            </div>
            {schema.description && (
              <div style={{ fontSize: 12, color: '#666', marginTop: 4, lineHeight: 1.4 }}>{schema.description}</div>
            )}
            <div
              style={{
                marginTop: 8,
                padding: '6px 10px',
                borderRadius: 4,
                fontSize: 12,
                background: wired ? '#e7f6e7' : '#eef4fb',
                color: wired ? '#1a5d1a' : '#0044aa',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              {wired ? <>🔗 Coming from {wiredFrom}</> : <>📋 Filled in by the user when they run this workflow</>}
            </div>
          </div>
        );
      })}

      {agent.config && Object.keys(agent.config).length > 0 && (
        <>
          <h4 style={{ fontSize: 12, textTransform: 'uppercase', color: '#777', margin: '16px 0 6px', letterSpacing: 0.5 }}>Knobs</h4>
          {Object.entries(agent.config).map(([k, schema]) => (
            <ConfigField
              key={k}
              fieldKey={k}
              schema={schema}
              value={config[k]}
              editable={editable}
              onChange={(v) => onConfigChange(k, v)}
            />
          ))}
        </>
      )}

      <h4 style={{ fontSize: 12, textTransform: 'uppercase', color: '#777', margin: '16px 0 6px', letterSpacing: 0.5 }}>Outputs</h4>
      {Object.entries(agent.outputs).map(([k]) => {
        const isOutput = wfOutput.node === node.id && wfOutput.field === k;
        return (
          <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, marginBottom: 6 }}>
            <input
              type="radio"
              name="wf-output"
              checked={isOutput}
              onChange={() => onSetOutput(k)}
              disabled={!editable}
            />
            <code style={{ fontSize: 12 }}>{k}</code>
            {isOutput && <span style={{ fontSize: 11, color: '#0a0', marginLeft: 4 }}>workflow output</span>}
          </label>
        );
      })}

      <div style={{ marginTop: 24 }}>
        <button
          onClick={onDelete}
          disabled={!editable}
          style={{ padding: '8px 12px', background: 'transparent', color: '#b00', border: '1px solid #b00', borderRadius: 4, fontSize: 13, cursor: editable ? 'pointer' : 'not-allowed', opacity: editable ? 1 : 0.5 }}
        >
          Delete node
        </button>
      </div>
    </div>
  );
}

function ConfigField({
  fieldKey,
  schema,
  value,
  editable,
  onChange,
}: {
  fieldKey: string;
  schema: AgentConfigField;
  value: string | undefined;
  editable: boolean;
  onChange: (v: string) => void;
}) {
  const label = schema.label || fieldKey;
  const current = value === undefined || value === '' ? String(schema.default ?? '') : value;
  return (
    <div style={{ marginBottom: 12, padding: 10, border: '1px solid #eee', borderRadius: 4, background: 'white' }}>
      <div style={{ fontSize: 13, fontWeight: 600 }}>{label}</div>
      {schema.description && (
        <div style={{ fontSize: 11, color: '#777', marginTop: 4 }}>{schema.description}</div>
      )}
      {schema.type === 'select' && (
        <select
          value={current}
          onChange={(e) => onChange(e.target.value)}
          disabled={!editable}
          style={{ width: '100%', fontSize: 13, padding: 8, marginTop: 6, border: '1px solid #ddd', borderRadius: 3, background: 'white' }}
        >
          {schema.options.map((o) => (
            <option key={o.value} value={o.value} title={o.description || ''}>
              {o.label}
            </option>
          ))}
        </select>
      )}
      {schema.type === 'number' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
          {typeof schema.min === 'number' && typeof schema.max === 'number' ? (
            <>
              <input
                type="range"
                min={schema.min}
                max={schema.max}
                step={schema.step ?? 1}
                value={current}
                onChange={(e) => onChange(e.target.value)}
                disabled={!editable}
                style={{ flex: 1 }}
              />
              <input
                type="number"
                min={schema.min}
                max={schema.max}
                step={schema.step ?? 1}
                value={current}
                onChange={(e) => onChange(e.target.value)}
                disabled={!editable}
                style={{ width: 70, fontSize: 13, padding: 4, border: '1px solid #ddd', borderRadius: 3 }}
              />
            </>
          ) : (
            <input
              type="number"
              step={schema.step ?? 1}
              value={current}
              onChange={(e) => onChange(e.target.value)}
              disabled={!editable}
              style={{ width: '100%', fontSize: 13, padding: 8, border: '1px solid #ddd', borderRadius: 3 }}
            />
          )}
        </div>
      )}
      {schema.type === 'boolean' && (() => {
        const isOn = current === 'true' || (current === '' && schema.default === true);
        return (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, fontSize: 12, color: '#444' }}>
            <input
              type="checkbox"
              checked={isOn}
              onChange={(e) => onChange(e.target.checked ? 'true' : 'false')}
              disabled={!editable}
            />
            {isOn ? 'On' : 'Off'}
          </label>
        );
      })()}
      {schema.type === 'string' && (
        <input
          type="text"
          value={current}
          onChange={(e) => onChange(e.target.value)}
          disabled={!editable}
          placeholder={schema.placeholder || ''}
          style={{ width: '100%', fontSize: 13, padding: 8, marginTop: 6, border: '1px solid #ddd', borderRadius: 3, boxSizing: 'border-box' }}
        />
      )}
      {schema.type === 'longtext' && (
        <textarea
          value={current}
          onChange={(e) => onChange(e.target.value)}
          disabled={!editable}
          placeholder={schema.placeholder || ''}
          rows={3}
          style={{ width: '100%', fontSize: 13, padding: 8, marginTop: 6, border: '1px solid #ddd', borderRadius: 3, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }}
        />
      )}
    </div>
  );
}

function WorkflowPanel({
  description,
  setDescription,
  problemStatement,
  setProblemStatement,
  problemCategory,
  setProblemCategory,
  userInstructions,
  setUserInstructions,
  editable,
  wfInputs,
  wfOutput,
  assignments,
  newsroomUsers,
  onAdd,
  onRemove,
  onDelete,
  onGenerate,
  generating,
  hasNodes,
}: {
  description: string;
  setDescription: (v: string) => void;
  problemStatement: string;
  setProblemStatement: (v: string) => void;
  problemCategory: string;
  setProblemCategory: (v: string) => void;
  userInstructions: string;
  setUserInstructions: (v: string) => void;
  editable: boolean;
  wfInputs: WfDefinition['inputs'];
  wfOutput: WfDefinition['output'];
  assignments: Assignment[];
  newsroomUsers: NewsroomUser[];
  onAdd: (userId: string) => void;
  onRemove: (userId: string) => void;
  onDelete: () => void;
  onGenerate: (description: string) => void;
  generating: boolean;
  hasNodes: boolean;
}) {
  const assignedIds = new Set(assignments.map((a) => a.id));
  const unassigned = newsroomUsers.filter((u) => !assignedIds.has(u.id));
  const [genPrompt, setGenPrompt] = useState('');
  return (
    <div>
      <h3 style={{ fontSize: 16, margin: '0 0 12px' }}>Workflow</h3>

      <section style={{ marginBottom: 16, padding: 12, background: '#f8f5ff', border: '1px solid #d6c8f5', borderRadius: 6 }}>
        <h4 style={{ fontSize: 12, textTransform: 'uppercase', color: '#5a3a99', margin: '0 0 8px', letterSpacing: 0.5 }}>
          The problem this solves
        </h4>
        <p style={{ fontSize: 11, color: '#6a4ca0', margin: '0 0 8px' }}>
          Frame this workflow as a product. What newsroom problem does it solve, and what category does it fit into? Users will see this before they run it.
        </p>
        <label style={{ display: 'block', marginBottom: 8 }}>
          <span style={{ fontSize: 12, color: '#5a3a99', display: 'block', marginBottom: 3 }}>Problem statement</span>
          <textarea
            value={problemStatement}
            onChange={(e) => setProblemStatement(e.target.value)}
            disabled={!editable}
            rows={2}
            placeholder="e.g. Tips coming in over WhatsApp aren't being fact-checked or routed properly."
            style={{ width: '100%', fontSize: 13, padding: 8, border: '1px solid #d6c8f5', borderRadius: 3, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box', background: 'white' }}
          />
        </label>
        <label style={{ display: 'block', marginBottom: 8 }}>
          <span style={{ fontSize: 12, color: '#5a3a99', display: 'block', marginBottom: 3 }}>Category</span>
          <select
            value={problemCategory}
            onChange={(e) => setProblemCategory(e.target.value)}
            disabled={!editable}
            style={{ width: '100%', fontSize: 13, padding: 8, border: '1px solid #d6c8f5', borderRadius: 3, background: 'white' }}
          >
            <option value="">— pick one —</option>
            {PROBLEM_CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>
        <label style={{ display: 'block' }}>
          <span style={{ fontSize: 12, color: '#5a3a99', display: 'block', marginBottom: 3 }}>Instructions for the user</span>
          <textarea
            value={userInstructions}
            onChange={(e) => setUserInstructions(e.target.value)}
            disabled={!editable}
            rows={3}
            placeholder={'Step-by-step guidance the user sees when they open this workflow.\n\ne.g. "Paste the article you want to check. The verifier flags claims, then the drafter writes three social posts."'}
            style={{ width: '100%', fontSize: 13, padding: 8, border: '1px solid #d6c8f5', borderRadius: 3, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box', background: 'white' }}
          />
        </label>
      </section>

      {editable && (
        <div style={{ marginBottom: 16, padding: 10, background: '#fff8e6', border: '1px solid #f5d77a', borderRadius: 6 }}>
          <h4 style={{ fontSize: 12, textTransform: 'uppercase', color: '#8a6d00', margin: '0 0 6px', letterSpacing: 0.5 }}>
            {hasNodes ? 'Regenerate from description' : 'Describe & build'}
          </h4>
          <p style={{ fontSize: 12, color: '#6b5800', margin: '0 0 8px' }}>
            {hasNodes
              ? 'Replace the current canvas with a workflow generated from your description.'
              : 'Type what this workflow should do and Anchor will compose it for you.'}
          </p>
          <textarea
            value={genPrompt}
            onChange={(e) => setGenPrompt(e.target.value)}
            disabled={generating}
            placeholder='e.g. "When a tip comes in, fact-check it against our archive then draft a follow-up tweet."'
            rows={4}
            style={{ width: '100%', fontSize: 13, padding: 8, border: '1px solid #e0c47a', borderRadius: 4, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box', background: 'white' }}
          />
          <button
            onClick={() => {
              if (genPrompt.trim().length >= 10) {
                onGenerate(genPrompt.trim());
              }
            }}
            disabled={generating || genPrompt.trim().length < 10}
            style={{
              marginTop: 8,
              width: '100%',
              padding: '8px 12px',
              background: '#7a5800',
              color: '#fff',
              border: 'none',
              borderRadius: 4,
              fontSize: 13,
              cursor: generating ? 'wait' : (genPrompt.trim().length < 10 ? 'not-allowed' : 'pointer'),
              opacity: genPrompt.trim().length < 10 || generating ? 0.5 : 1,
            }}
          >
            {generating ? 'Generating…' : (hasNodes ? 'Regenerate' : 'Generate workflow')}
          </button>
        </div>
      )}

      <label style={{ display: 'block', marginBottom: 12 }}>
        <span style={{ fontSize: 13, color: '#666', display: 'block', marginBottom: 4 }}>Description</span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={!editable}
          rows={2}
          style={{ width: '100%', fontSize: 13, padding: 8, border: '1px solid #ddd', borderRadius: 3, resize: 'vertical', boxSizing: 'border-box' }}
        />
      </label>

      <h4 style={{ fontSize: 12, textTransform: 'uppercase', color: '#777', margin: '16px 0 6px', letterSpacing: 0.5 }}>
        Members ({assignments.length})
      </h4>
      <p style={{ fontSize: 12, color: '#666', marginTop: 0 }}>Team members who can run this workflow in User mode.</p>
      {assignments.length === 0 ? (
        <p style={{ fontSize: 12, color: '#888', marginTop: 4 }}>Nobody assigned yet.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: '4px 0' }}>
          {assignments.map((a) => (
            <li key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', fontSize: 13 }}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span>
                  {a.display_name || a.email}
                  <span style={{ color: '#999', fontSize: 11, marginLeft: 6 }}>· {a.role}</span>
                </span>
                {a.whatsapp_number && (
                  <span style={{ color: '#666', fontSize: 11 }}>📱 {a.whatsapp_number}</span>
                )}
              </div>
              {editable && (
                <button
                  onClick={() => onRemove(a.id)}
                  style={{ background: 'transparent', border: 'none', color: '#b00', fontSize: 12, cursor: 'pointer' }}
                >
                  remove
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {editable && unassigned.length > 0 && (
        <select
          onChange={(e) => {
            if (e.target.value) {
              onAdd(e.target.value);
              e.target.value = '';
            }
          }}
          defaultValue=""
          style={{ width: '100%', fontSize: 13, padding: 8, marginTop: 4, border: '1px solid #ddd', borderRadius: 3 }}
        >
          <option value="">+ Add member…</option>
          {unassigned.map((u) => (
            <option key={u.id} value={u.id}>
              {u.display_name || u.email}
              {u.whatsapp_number ? ` — ${u.whatsapp_number}` : ''}
            </option>
          ))}
        </select>
      )}
      {editable && unassigned.length === 0 && assignments.length === 0 && (
        <p style={{ fontSize: 12, marginTop: 4 }}>
          <Link href="/team" style={{ color: '#0066cc' }}>Invite team members →</Link>
        </p>
      )}

      <h4 style={{ fontSize: 12, textTransform: 'uppercase', color: '#777', margin: '16px 0 6px', letterSpacing: 0.5 }}>
        Inputs ({wfInputs.length})
      </h4>
      {wfInputs.length === 0 ? (
        <p style={{ fontSize: 12, color: '#888', margin: 0 }}>Click a node and tick "Expose as workflow input".</p>
      ) : (
        <ul style={{ paddingLeft: 16, margin: 0, fontSize: 13 }}>
          {wfInputs.map((i, idx) => (
            <li key={idx}>
              <code>{i.name}</code> → {i.to.node}.{i.to.field}
            </li>
          ))}
        </ul>
      )}

      <h4 style={{ fontSize: 12, textTransform: 'uppercase', color: '#777', margin: '16px 0 6px', letterSpacing: 0.5 }}>Output</h4>
      {wfOutput.node ? (
        <p style={{ fontSize: 13, margin: 0 }}>
          <code>{wfOutput.node}</code>.<code>{wfOutput.field}</code>
        </p>
      ) : (
        <p style={{ fontSize: 12, color: '#888', margin: 0 }}>Click a node and choose an output radio.</p>
      )}

      {editable && (
        <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid #ddd' }}>
          <button
            onClick={onDelete}
            style={{ padding: '8px 12px', background: 'transparent', color: '#b00', border: '1px solid #b00', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}
          >
            Delete workflow
          </button>
        </div>
      )}
    </div>
  );
}
