// BuilderCanvas — drag-and-drop workflow editor.
// Left palette: agents from the registry.
// Center: React Flow canvas with custom AgentNode (handles per input/output field).
// Right panel: per-node config + workflow input/output settings.
// Top bar: name/slug/trigger/share + Save/Run.

'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
} from 'react';
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

type AgentMeta = {
  slug: string;
  name: string;
  description: string;
  triggers: string[];
  inputs: Record<string, { type: string; required?: boolean; description?: string }>;
  outputs: Record<string, { type: string; description?: string }>;
  route: string;
};

type WfDefinition = {
  nodes: { id: string; agent_slug: string; config?: Record<string, string>; position?: { x: number; y: number } }[];
  edges: { from: { node: string; field: string }; to: { node: string; field: string } }[];
  inputs: { name: string; to: { node: string; field: string } }[];
  output: { node: string; field: string };
};

type Workflow = {
  id: string;
  newsroom_id: string;
  name: string;
  slug: string;
  trigger_phrase: string | null;
  description: string | null;
  definition: WfDefinition;
  is_shared: boolean;
};

type AgentNodeData = {
  agent_slug: string;
  agent: AgentMeta;
  config: Record<string, string>;
};

type FlowNode = Node<AgentNodeData, 'agent'>;

function defToFlow(def: WfDefinition, agents: AgentMeta[]): { nodes: FlowNode[]; edges: Edge[] } {
  const agentBySlug = new Map(agents.map((a) => [a.slug, a]));
  const nodes: FlowNode[] = def.nodes.map((n, i) => ({
    id: n.id,
    type: 'agent',
    position: n.position || { x: 80 + i * 280, y: 80 },
    data: {
      agent_slug: n.agent_slug,
      agent: agentBySlug.get(n.agent_slug) as AgentMeta,
      config: n.config || {},
    },
  }));
  const edges: Edge[] = def.edges.map((e, i) => ({
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

function AgentNode({ data, selected }: NodeProps<FlowNode>) {
  const { agent } = data;
  const inputEntries = Object.entries(agent.inputs);
  const outputEntries = Object.entries(agent.outputs);
  return (
    <div
      style={{
        background: 'white',
        border: selected ? '2px solid #0066cc' : '1px solid #bbb',
        borderRadius: 6,
        boxShadow: selected ? '0 0 0 3px rgba(0,102,204,0.15)' : '0 1px 3px rgba(0,0,0,0.08)',
        minWidth: 220,
        fontSize: 13,
      }}
    >
      <div style={{ background: '#f7f7f7', padding: '8px 12px', borderBottom: '1px solid #eee', borderRadius: '6px 6px 0 0' }}>
        <div style={{ fontWeight: 600 }}>{agent.name}</div>
        <div style={{ color: '#888', fontSize: 11 }}>{agent.slug}</div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
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
    </div>
  );
}

const nodeTypes = { agent: AgentNode };

function nextId(existing: { id: string }[], prefix: string) {
  let n = existing.length + 1;
  while (existing.some((e) => e.id === `${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}

export default function BuilderCanvas({
  workflow,
  agents,
  editable,
}: {
  workflow: Workflow;
  agents: AgentMeta[];
  editable: boolean;
}) {
  return (
    <ReactFlowProvider>
      <CanvasInner workflow={workflow} agents={agents} editable={editable} />
    </ReactFlowProvider>
  );
}

function CanvasInner({
  workflow,
  agents,
  editable,
}: {
  workflow: Workflow;
  agents: AgentMeta[];
  editable: boolean;
}) {
  const initial = useMemo(() => defToFlow(workflow.definition, agents), [workflow, agents]);
  const [flowNodes, setFlowNodes] = useState<FlowNode[]>(initial.nodes);
  const [flowEdges, setFlowEdges] = useState<Edge[]>(initial.edges);
  const [wfInputs, setWfInputs] = useState<WfDefinition['inputs']>(workflow.definition.inputs || []);
  const [wfOutput, setWfOutput] = useState<WfDefinition['output']>(
    workflow.definition.output || { node: '', field: '' }
  );

  const [name, setName] = useState(workflow.name);
  const [triggerPhrase, setTriggerPhrase] = useState(workflow.trigger_phrase || '');
  const [description, setDescription] = useState(workflow.description || '');
  const [isShared, setIsShared] = useState(workflow.is_shared);

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [status, setStatus] = useState<{ kind: 'ok' | 'error' | 'info'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<unknown | null>(null);

  const reactFlow = useReactFlow();
  const flowWrapper = useRef<HTMLDivElement>(null);

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
        const id = nextId(nds, 'n');
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
  const incomingEdgeFields = useMemo(() => {
    if (!selectedNode) return new Set<string>();
    const fields = new Set<string>();
    for (const e of flowEdges) {
      if (e.target === selectedNode.id && e.targetHandle) {
        fields.add(e.targetHandle.replace(/^in-/, ''));
      }
    }
    return fields;
  }, [selectedNode, flowEdges]);

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
    setWfInputs((ins) => ins.filter((i) => i.to.node !== selectedNode.id));
    if (wfOutput.node === selectedNode.id) setWfOutput({ node: '', field: '' });
    setSelectedNodeId(null);
  }, [selectedNode, wfOutput]);

  async function onSave() {
    setStatus(null);
    setSaving(true);
    const definition = flowToDef(flowNodes, flowEdges, wfInputs, wfOutput);
    try {
      const res = await fetch(`/api/workflows/${workflow.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          trigger_phrase: triggerPhrase || null,
          description: description || null,
          definition,
          is_shared: isShared,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus({ kind: 'error', text: data.error || 'Save failed' });
      } else {
        setStatus({ kind: 'ok', text: 'Saved.' });
      }
    } catch (e) {
      setStatus({ kind: 'error', text: e instanceof Error ? e.message : 'Network error' });
    } finally {
      setSaving(false);
    }
  }

  async function onRun() {
    setStatus(null);
    setRunResult(null);
    setRunning(true);
    const inputs: Record<string, string> = {};
    for (const inp of wfInputs) {
      const v = window.prompt(`Workflow input — ${inp.name}:`);
      if (v === null) {
        setRunning(false);
        setStatus({ kind: 'info', text: 'Run cancelled.' });
        return;
      }
      inputs[inp.name] = v;
    }
    try {
      const res = await fetch(`/api/workflows/${workflow.id}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inputs }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus({ kind: 'error', text: data.error || 'Run failed' });
      } else {
        setRunResult(data);
        setStatus({ kind: 'ok', text: `Run completed in ${data.durationMs}ms (cost $${data.totalCost.costUsd.toFixed(4)}).` });
      }
    } catch (e) {
      setStatus({ kind: 'error', text: e instanceof Error ? e.message : 'Network error' });
    } finally {
      setRunning(false);
    }
  }

  const exposeAsInput = (nodeId: string, field: string) => {
    const exists = wfInputs.find((i) => i.to.node === nodeId && i.to.field === field);
    if (exists) {
      setWfInputs((ins) => ins.filter((i) => !(i.to.node === nodeId && i.to.field === field)));
    } else {
      setWfInputs((ins) => [...ins, { name: field, to: { node: nodeId, field } }]);
    }
  };
  const setOutputField = (nodeId: string, field: string) => {
    setWfOutput({ node: nodeId, field });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: 'system-ui, sans-serif' }}>
      {/* Top bar */}
      <header style={{ borderBottom: '1px solid #ddd', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12, background: '#fafafa' }}>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Workflow name"
          disabled={!editable}
          style={{ fontSize: 16, fontWeight: 600, padding: '6px 8px', border: '1px solid #ddd', borderRadius: 4, minWidth: 220 }}
        />
        <input
          type="text"
          value={triggerPhrase}
          onChange={(e) => setTriggerPhrase(e.target.value)}
          placeholder="Trigger phrase (e.g. verify election)"
          disabled={!editable}
          style={{ fontSize: 13, padding: '6px 8px', border: '1px solid #ddd', borderRadius: 4, minWidth: 240 }}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
          <input
            type="checkbox"
            checked={isShared}
            onChange={(e) => setIsShared(e.target.checked)}
            disabled={!editable}
          />
          Share to library
        </label>
        <span style={{ flex: 1 }} />
        {status && (
          <span style={{ fontSize: 13, color: status.kind === 'error' ? '#b00' : status.kind === 'ok' ? '#0a0' : '#666' }}>
            {status.text}
          </span>
        )}
        <button
          onClick={onSave}
          disabled={!editable || saving}
          style={{ padding: '8px 14px', background: '#111', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, cursor: 'pointer', opacity: !editable || saving ? 0.5 : 1 }}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          onClick={onRun}
          disabled={running || flowNodes.length === 0 || !wfOutput.node}
          style={{ padding: '8px 14px', background: '#0066cc', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, cursor: 'pointer', opacity: running || flowNodes.length === 0 || !wfOutput.node ? 0.5 : 1 }}
        >
          {running ? 'Running…' : 'Run'}
        </button>
      </header>

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* Palette */}
        <aside style={{ width: 220, borderRight: '1px solid #ddd', padding: 12, overflowY: 'auto', background: '#fdfdfd' }}>
          <h3 style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, color: '#666', margin: '0 0 8px' }}>Agents</h3>
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
                borderRadius: 6,
                background: 'white',
                cursor: editable ? 'grab' : 'not-allowed',
                opacity: editable ? 1 : 0.5,
              }}
            >
              <div style={{ fontWeight: 600, fontSize: 13 }}>{a.name}</div>
              <div style={{ fontSize: 11, color: '#666', marginTop: 4 }}>{a.description}</div>
            </div>
          ))}
        </aside>

        {/* Canvas */}
        <div ref={flowWrapper} style={{ flex: 1, minWidth: 0 }} onDrop={onDrop} onDragOver={onDragOver}>
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
        </div>

        {/* Right panel */}
        <aside style={{ width: 320, borderLeft: '1px solid #ddd', padding: 14, overflowY: 'auto', background: '#fafafa' }}>
          {selectedNode ? (
            <NodePanel
              node={selectedNode}
              incomingEdgeFields={incomingEdgeFields}
              wfInputs={wfInputs}
              wfOutput={wfOutput}
              editable={editable}
              onConfigChange={updateSelectedConfig}
              onExposeInput={(field) => exposeAsInput(selectedNode.id, field)}
              onSetOutput={(field) => setOutputField(selectedNode.id, field)}
              onDelete={deleteSelected}
            />
          ) : (
            <WorkflowPanel
              wfInputs={wfInputs}
              wfOutput={wfOutput}
              description={description}
              setDescription={setDescription}
              editable={editable}
              runResult={runResult}
            />
          )}
        </aside>
      </div>
    </div>
  );
}

function NodePanel({
  node,
  incomingEdgeFields,
  wfInputs,
  wfOutput,
  editable,
  onConfigChange,
  onExposeInput,
  onSetOutput,
  onDelete,
}: {
  node: FlowNode;
  incomingEdgeFields: Set<string>;
  wfInputs: WfDefinition['inputs'];
  wfOutput: WfDefinition['output'];
  editable: boolean;
  onConfigChange: (field: string, value: string) => void;
  onExposeInput: (field: string) => void;
  onSetOutput: (field: string) => void;
  onDelete: () => void;
}) {
  const { agent, config } = node.data;
  return (
    <div>
      <h3 style={{ fontSize: 14, margin: '0 0 4px' }}>{agent.name}</h3>
      <div style={{ color: '#888', fontSize: 11, marginBottom: 12 }}>id: {node.id}</div>
      <p style={{ fontSize: 12, color: '#555', marginTop: 0 }}>{agent.description}</p>

      <h4 style={{ fontSize: 12, textTransform: 'uppercase', color: '#666', margin: '16px 0 6px', letterSpacing: 0.5 }}>Inputs</h4>
      {Object.entries(agent.inputs).map(([k, schema]) => {
        const wired = incomingEdgeFields.has(k);
        const exposed = wfInputs.some((i) => i.to.node === node.id && i.to.field === k);
        return (
          <div key={k} style={{ marginBottom: 12, padding: 8, border: '1px solid #eee', borderRadius: 4, background: 'white' }}>
            <div style={{ fontSize: 12, fontWeight: 600 }}>
              {k}
              {schema.required && <span style={{ color: '#cc3333' }}>*</span>}
              <span style={{ fontSize: 10, color: '#999', fontWeight: 400, marginLeft: 6 }}>{schema.type}</span>
            </div>
            {schema.description && <div style={{ fontSize: 11, color: '#777', marginTop: 2 }}>{schema.description}</div>}
            {wired ? (
              <div style={{ fontSize: 11, color: '#0a0', marginTop: 6 }}>← wired from upstream node</div>
            ) : (
              <>
                <textarea
                  value={config[k] || ''}
                  onChange={(e) => onConfigChange(k, e.target.value)}
                  disabled={!editable || exposed}
                  placeholder={exposed ? 'Provided at run time' : 'Static value (or expose as workflow input below)'}
                  rows={schema.type === 'longtext' ? 3 : 1}
                  style={{ width: '100%', fontSize: 12, padding: 6, marginTop: 6, border: '1px solid #ddd', borderRadius: 3, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }}
                />
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#555', marginTop: 4 }}>
                  <input
                    type="checkbox"
                    checked={exposed}
                    onChange={() => onExposeInput(k)}
                    disabled={!editable}
                  />
                  Expose as workflow input "{k}"
                </label>
              </>
            )}
          </div>
        );
      })}

      <h4 style={{ fontSize: 12, textTransform: 'uppercase', color: '#666', margin: '16px 0 6px', letterSpacing: 0.5 }}>Outputs</h4>
      {Object.entries(agent.outputs).map(([k]) => {
        const isOutput = wfOutput.node === node.id && wfOutput.field === k;
        return (
          <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, marginBottom: 6 }}>
            <input
              type="radio"
              name="wf-output"
              checked={isOutput}
              onChange={() => onSetOutput(k)}
              disabled={!editable}
            />
            <code style={{ fontSize: 11 }}>{k}</code>
            {isOutput && <span style={{ fontSize: 10, color: '#0a0', marginLeft: 4 }}>workflow output</span>}
          </label>
        );
      })}

      <div style={{ marginTop: 24 }}>
        <button
          onClick={onDelete}
          disabled={!editable}
          style={{ padding: '6px 10px', background: 'transparent', color: '#b00', border: '1px solid #b00', borderRadius: 4, fontSize: 12, cursor: editable ? 'pointer' : 'not-allowed', opacity: editable ? 1 : 0.5 }}
        >
          Delete node
        </button>
      </div>
    </div>
  );
}

function WorkflowPanel({
  wfInputs,
  wfOutput,
  description,
  setDescription,
  editable,
  runResult,
}: {
  wfInputs: WfDefinition['inputs'];
  wfOutput: WfDefinition['output'];
  description: string;
  setDescription: (v: string) => void;
  editable: boolean;
  runResult: unknown | null;
}) {
  return (
    <div>
      <h3 style={{ fontSize: 14, margin: '0 0 12px' }}>Workflow</h3>

      <label style={{ display: 'block', marginBottom: 12 }}>
        <span style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 4 }}>Description</span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={!editable}
          rows={2}
          style={{ width: '100%', fontSize: 12, padding: 6, border: '1px solid #ddd', borderRadius: 3, resize: 'vertical', boxSizing: 'border-box' }}
        />
      </label>

      <h4 style={{ fontSize: 12, textTransform: 'uppercase', color: '#666', margin: '16px 0 6px', letterSpacing: 0.5 }}>
        Inputs ({wfInputs.length})
      </h4>
      {wfInputs.length === 0 ? (
        <p style={{ fontSize: 11, color: '#888', margin: 0 }}>Click a node and tick "Expose as workflow input" on its input fields.</p>
      ) : (
        <ul style={{ paddingLeft: 16, margin: 0, fontSize: 12 }}>
          {wfInputs.map((i, idx) => (
            <li key={idx}>
              <code>{i.name}</code> → {i.to.node}.{i.to.field}
            </li>
          ))}
        </ul>
      )}

      <h4 style={{ fontSize: 12, textTransform: 'uppercase', color: '#666', margin: '16px 0 6px', letterSpacing: 0.5 }}>Output</h4>
      {wfOutput.node ? (
        <p style={{ fontSize: 12, margin: 0 }}>
          <code>{wfOutput.node}</code>.<code>{wfOutput.field}</code>
        </p>
      ) : (
        <p style={{ fontSize: 11, color: '#888', margin: 0 }}>Click a node and choose an output field via the radio button.</p>
      )}

      {runResult !== null && (
        <>
          <h4 style={{ fontSize: 12, textTransform: 'uppercase', color: '#666', margin: '16px 0 6px', letterSpacing: 0.5 }}>Last run</h4>
          <pre style={{ fontSize: 11, background: '#111', color: '#0f0', padding: 10, borderRadius: 4, maxHeight: 300, overflow: 'auto' }}>
            {JSON.stringify(runResult, null, 2)}
          </pre>
        </>
      )}
    </div>
  );
}
