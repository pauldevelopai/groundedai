// lib/nodes/registry.js
// Reads docs/nodes/registry.yaml — the engineering source of truth for Nodes —
// and returns the flat list of nodes (standalone + integrated). YAML parsing
// lives here in the CJS layer, matching the other registry loaders
// (lib/security/jurisdiction.js, lib/research/trusted-sources.js).
const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');

// Resolve from the working directory (repo root when `next` runs), NOT __dirname:
// in the Next.js server bundle __dirname points at .next/server/*, so a path
// relative to this source file would not exist at runtime.
const REGISTRY_PATH = path.join(process.cwd(), 'docs', 'nodes', 'registry.yaml');

/**
 * Flat list of registered Nodes (standalone + integrated).
 * @returns {Array<{ slug: string, name?: string, repo?: string, status?: string,
 *   current_version?: string, born?: string, storage?: string, description?: string }>}
 */
function listNodes() {
  try {
    const reg = yaml.load(fs.readFileSync(REGISTRY_PATH, 'utf8')) || {};
    return [...(reg.standalone || []), ...(reg.integrated || [])].filter((n) => n && n.slug);
  } catch {
    return [];
  }
}

module.exports = { listNodes };
