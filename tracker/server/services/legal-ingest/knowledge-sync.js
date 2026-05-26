// Auto-sync promoted AI Legal entities into Holly's shared knowledge base.
//
// Called by the triage agent when it promotes a raw item into an event on a
// lawsuit or regulation. We either:
//   - Refresh the content of the entity's existing knowledge_entries row
//     (when knowledge_entry_id is already set), or
//   - Create a fresh knowledge entry with the entity's summary.
//
// Importantly: we do NOT generate a fresh Claude analysis here. That's a
// separate, expensive, manual action (admin "Generate Analysis" button). This
// helper is the lightweight sync that keeps Holly's AI assistant / RAG aware
// of every promoted entity without running up the Claude bill on every event.

import pool from '../../db/pool.js';
import { formatCaseAsKnowledge, formatRegulationAsKnowledge } from '../claude.js';
import { createKnowledgeEntry } from '../knowledge.js';

export async function syncLawsuitToKnowledge(lawsuitId) {
  const { rows } = await pool.query('SELECT * FROM ai_lawsuits WHERE id = $1', [lawsuitId]);
  if (rows.length === 0) return { skipped: true, reason: 'lawsuit not found' };
  const c = rows[0];

  const content = formatCaseAsKnowledge(c);
  const title = `${c.case_name} — AI Lawsuit`;
  const tags = [
    'ai-law', 'ai-litigation', c.case_type,
    ...(c.defendants || []).map(d => d.toLowerCase().replace(/\s+/g, '-').slice(0, 30)),
    ...(c.key_issues || []).map(k => k.toLowerCase().replace(/\s+/g, '-').slice(0, 30)),
  ].filter(Boolean).slice(0, 15);

  if (c.knowledge_entry_id) {
    await pool.query(
      `UPDATE knowledge_entries
          SET content = $1, title = $2, updated_at = NOW()
        WHERE id = $3`,
      [content, title, c.knowledge_entry_id]
    );
    return { kind: 'lawsuit', id: c.id, knowledge_entry_id: c.knowledge_entry_id, action: 'updated' };
  }

  const knowledgeId = await createKnowledgeEntry({
    category: 'regulatory_change',
    subcategory: 'ai_legal_framework',
    title,
    content,
    sourceType: 'ai_lawsuit_tracker',
    sourceId: c.id,
    sourceDescription: `AI lawsuit tracker — ${c.case_type || 'case'}, ${c.jurisdiction || 'unknown jurisdiction'}`,
    confidence: 0.80,
    tags,
  });
  await pool.query(
    'UPDATE ai_lawsuits SET knowledge_entry_id = $1, updated_at = NOW() WHERE id = $2',
    [knowledgeId, c.id]
  );
  return { kind: 'lawsuit', id: c.id, knowledge_entry_id: knowledgeId, action: 'created' };
}

export async function syncRegulationToKnowledge(regulationId) {
  const { rows } = await pool.query('SELECT * FROM ai_regulations WHERE id = $1', [regulationId]);
  if (rows.length === 0) return { skipped: true, reason: 'regulation not found' };
  const r = rows[0];

  const content = formatRegulationAsKnowledge(r);
  const title = r.short_name
    ? `${r.short_name} (${r.jurisdiction}) — AI Regulation`
    : `${r.regulation_name} — AI Regulation`;
  const tags = [
    'ai-law', 'ai-regulation',
    r.jurisdiction?.toLowerCase().replace(/\s+/g, '-'),
    r.regulation_type,
    ...(r.scope || []).map(s => s.toLowerCase().replace(/\s+/g, '-').slice(0, 30)),
    ...(r.affected_sectors || []).map(s => s.toLowerCase().replace(/\s+/g, '-').slice(0, 30)),
  ].filter(Boolean).slice(0, 15);

  if (r.knowledge_entry_id) {
    await pool.query(
      `UPDATE knowledge_entries
          SET content = $1, title = $2, updated_at = NOW()
        WHERE id = $3`,
      [content, title, r.knowledge_entry_id]
    );
    return { kind: 'regulation', id: r.id, knowledge_entry_id: r.knowledge_entry_id, action: 'updated' };
  }

  const knowledgeId = await createKnowledgeEntry({
    category: 'regulatory_change',
    subcategory: 'ai_legal_framework',
    title,
    content,
    sourceType: 'ai_regulation_tracker',
    sourceId: r.id,
    sourceDescription: `AI regulation tracker — ${r.regulation_type || 'regulation'}, ${r.jurisdiction}`,
    confidence: 0.85,
    tags,
  });
  await pool.query(
    'UPDATE ai_regulations SET knowledge_entry_id = $1, updated_at = NOW() WHERE id = $2',
    [knowledgeId, r.id]
  );
  return { kind: 'regulation', id: r.id, knowledge_entry_id: knowledgeId, action: 'created' };
}
