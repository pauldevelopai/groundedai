// Agent registry — single source of truth for "what agents Anchor has".
//
// The Builder UI reads list() to populate its palette of draggable nodes.
// The chat router reads list() to score user messages against agent triggers.
// The workflow runner reads get(slug) to dispatch a node to the right module.
//
// Each entry has:
//   slug         — stable id, lowercase, used in URLs and DB rows
//   name         — display name
//   description  — one sentence shown in the Builder palette
//   triggers     — keywords the chat router matches (case-insensitive substring)
//   inputs       — { fieldName: { type, required, description } } — graph-edge input contract
//   outputs      — { fieldName: { type, description } } — graph-edge output contract
//   route        — Next.js API path that runs this agent (POST)
//   run          — server-side function (input, ctx) -> { result, cost, durationMs }
//
// The agent modules themselves live in lib/agents/*.js and call register()
// at import time. This file imports them at the bottom so the registry is
// populated as soon as anyone requires it.
//
// Type vocabulary (keep small):
//   'string'           — short text (claim, language, taskType)
//   'longtext'         — paragraphs of text (article body, draft output)
//   'string[]'         — list of short strings
//   'json'             — opaque structured object (e.g. verifier result)

const _registry = new Map();

/**
 * Register an agent. Called by each agent module at import time.
 * Throws if the slug is already registered (catches accidental double-imports).
 *
 * @param {object} entry
 * @param {string} entry.slug
 * @param {string} entry.name
 * @param {string} entry.description
 * @param {string[]} entry.triggers
 * @param {Record<string, {type: string, required?: boolean, description?: string}>} entry.inputs
 * @param {Record<string, {type: string, description?: string}>} entry.outputs
 * @param {string} entry.route
 * @param {(input: any, ctx: {newsroomId: string, userId: string, endpoint: string}) => Promise<{result: any, cost: any, durationMs: number}>} entry.run
 */
function register(entry) {
  const required = ['slug', 'name', 'description', 'triggers', 'inputs', 'outputs', 'route', 'run'];
  for (const k of required) {
    if (entry[k] === undefined) throw new Error(`registry.register: missing field "${k}"`);
  }
  if (_registry.has(entry.slug)) {
    throw new Error(`registry.register: slug "${entry.slug}" already registered`);
  }
  _registry.set(entry.slug, entry);
}

/** List all registered agents (UI-safe — strips the run function). */
function list() {
  return [..._registry.values()].map(({ run, ...meta }) => meta);
}

/** Get the full entry (including run) by slug. Returns undefined if not registered. */
function get(slug) {
  return _registry.get(slug);
}

module.exports = { register, list, get };

// Trigger registration of the built-in agents. Order doesn't matter.
require('./verifier');
require('./archivist');
require('./drafter');
