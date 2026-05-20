#!/usr/bin/env node
/**
 * groundedai / harvest / harvest.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Cohort harvest: walks every newsroom's fork of every Node and assembles
 * the data the GROUNDED cohort dashboard renders.
 *
 * What it does:
 *   1. Reads docs/nodes/registry.yaml — the list of Node repos to harvest
 *   2. For each Node repo, lists its forks via `gh api`
 *   3. For each fork, fetches three telemetry files committed by the
 *      runtime (meta + activity + errors)
 *   4. Writes aggregated JSON to dashboard/data/ for the static dashboard
 *
 * Prereqs:
 *   • gh CLI installed and authenticated (`gh auth status` returns ok)
 *   • Node 20+
 *
 * Usage:
 *   node harvest/harvest.mjs           # harvest all Nodes in registry
 *   node harvest/harvest.mjs --only capitalfm-verifier   # filter
 *   node harvest/harvest.mjs --verbose
 *
 * No external npm deps — uses gh CLI via child_process and the built-in
 * YAML parser (none) via a tiny line-based parser tuned to the registry
 * file's actual shape. If the registry grows more complex, switch to
 * a real YAML library.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const REGISTRY = join(REPO_ROOT, "docs", "nodes", "registry.yaml");
const OUT_DIR = join(REPO_ROOT, "dashboard", "data");

const args = parseArgs(process.argv.slice(2));

async function main() {
  // 0. gh CLI sanity
  try {
    await exec("gh", ["auth", "status"]);
  } catch (e) {
    bail(
      "gh CLI not authenticated. Run `gh auth login` first. " +
      "If gh isn't installed: brew install gh"
    );
  }

  // 1. Registry → list of (slug, repo) pairs
  const nodes = await loadNodesFromRegistry();
  const targets = args.only ? nodes.filter((n) => n.slug === args.only) : nodes;
  if (!targets.length) bail(`No Nodes matched. Available: ${nodes.map((n) => n.slug).join(", ")}`);

  log(`Harvesting ${targets.length} Node(s): ${targets.map((n) => n.slug).join(", ")}`);

  // 2. Walk forks + pull telemetry files
  const allInstalls = [];
  const allActivity = [];
  const allErrors = [];

  for (const node of targets) {
    log(`\n— ${node.slug} (${node.repo})`);

    const forks = await listForks(node.repo);
    log(`  ${forks.length} fork(s) found`);

    // Also harvest the canonical repo itself (Paul's own dev install often
    // sits on the canonical repo, not a fork — and v0.x of any Node may
    // not yet have any forks).
    const sources = [{ owner: node.owner, repo_name: node.name, label: node.repo + " (canonical)" }, ...forks];

    for (const src of sources) {
      const meta = await fetchTelemetryFile(src, node.slug, "meta");
      const activity = await fetchTelemetryFile(src, node.slug, "activity");
      const errors = await fetchTelemetryFile(src, node.slug, "errors");

      if (!meta && !activity && !errors) {
        if (args.verbose) log(`  ${src.label}: no telemetry files`);
        continue;
      }

      const newsroomLabel = src.owner;
      log(`  ${newsroomLabel}: meta=${meta ? "y" : "n"} activity=${activity?.length || 0} errors=${errors?.length || 0}`);

      if (meta) {
        allInstalls.push({
          ...meta,
          node_slug: node.slug,
          node_display_name: node.displayName,
          fork_owner: src.owner,
          fork_repo: src.repo_name,
          fork_label: src.label,
        });
      }

      for (const entry of activity || []) {
        allActivity.push({
          ...entry,
          node_slug: node.slug,
          node_display_name: node.displayName,
          fork_owner: src.owner,
        });
      }

      for (const entry of errors || []) {
        allErrors.push({
          ...entry,
          node_slug: node.slug,
          node_display_name: node.displayName,
          fork_owner: src.owner,
        });
      }
    }
  }

  // 3. Sort + write
  allActivity.sort((a, b) => (a.ts || "").localeCompare(b.ts || ""));
  allErrors.sort((a, b) => (a.ts || "").localeCompare(b.ts || ""));

  await ensureDir(OUT_DIR);
  await writeJson(join(OUT_DIR, "installs.json"), allInstalls);
  await writeJson(join(OUT_DIR, "activity.json"), allActivity);
  await writeJson(join(OUT_DIR, "errors.json"), allErrors);
  const lastHarvest = {
    timestamp: new Date().toISOString(),
    nodes_harvested: targets.map((n) => n.slug),
    install_count: allInstalls.length,
    activity_count: allActivity.length,
    error_count: allErrors.length,
  };
  await writeJson(join(OUT_DIR, "last_harvest.json"), lastHarvest);

  // Also write the same payload as a JS file that defines a global.
  // The dashboard can open from file:// (which blocks fetch) and still
  // see the data via this script tag.
  const bundled = {
    installs: allInstalls,
    activity: allActivity,
    errors: allErrors,
    lastHarvest,
  };
  await writeFile(
    join(OUT_DIR, "data.js"),
    `// Auto-generated by harvest.mjs — do not edit by hand.\n` +
      `// Re-run \`node harvest/harvest.mjs\` to refresh.\n` +
      `window.GROUNDED_DASHBOARD_DATA = ${JSON.stringify(bundled, null, 2)};\n`,
    "utf8",
  );

  log(`\n✓ Wrote ${allInstalls.length} install(s), ${allActivity.length} activity entries, ${allErrors.length} error(s) to ${OUT_DIR}`);
  log(`✓ Open dashboard/index.html in your browser to view.`);
}

// ─── Registry parsing (minimal, tuned to current shape) ─────────────

async function loadNodesFromRegistry() {
  const yaml = await readFile(REGISTRY, "utf8");
  const lines = yaml.split("\n");

  const nodes = [];
  let inNodesSection = false;
  let current = null;

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    if (/^standalone:|^integrated:/.test(line)) { inNodesSection = true; continue; }
    if (/^[a-z_]+:/.test(line) && !/^\s/.test(line)) { inNodesSection = /^(standalone|integrated):/.test(line); continue; }
    if (!inNodesSection) continue;

    const slugMatch = line.match(/^\s*-\s*slug:\s*(\S+)/);
    if (slugMatch) {
      if (current && current.repo) nodes.push(finaliseNode(current));
      current = { slug: slugMatch[1] };
      continue;
    }
    const repoMatch = line.match(/^\s+repo:\s*(\S+)/);
    if (repoMatch && current) current.repo = repoMatch[1];
    const nameMatch = line.match(/^\s+name:\s*(.+)/);
    if (nameMatch && current && !current.displayName) current.displayName = nameMatch[1].trim();
  }
  if (current && current.repo) nodes.push(finaliseNode(current));
  return nodes;
}

function finaliseNode(n) {
  const [owner, name] = n.repo.split("/");
  return {
    slug: n.slug,
    repo: n.repo,
    owner,
    name,
    displayName: n.displayName || n.slug,
  };
}

// ─── GitHub API via gh CLI ──────────────────────────────────────────

async function listForks(repo) {
  try {
    const { stdout } = await exec("gh", ["api", `repos/${repo}/forks`, "--paginate"]);
    const arr = JSON.parse(stdout);
    return arr.map((f) => ({
      owner: f.owner?.login,
      repo_name: f.name,
      label: f.full_name,
    }));
  } catch (e) {
    log(`  ⚠ could not list forks of ${repo}: ${e.message || e}`);
    return [];
  }
}

async function fetchTelemetryFile(src, slug, kind) {
  const path = `data/processed/node_${slug.replace(/-/g, "_")}_${kind}.json`;
  const apiPath = `repos/${src.owner}/${src.repo_name}/contents/${path}`;
  try {
    const { stdout } = await exec("gh", ["api", apiPath]);
    const resp = JSON.parse(stdout);
    if (!resp.content) return null;
    const decoded = Buffer.from(resp.content, "base64").toString("utf8");
    return JSON.parse(decoded);
  } catch (e) {
    // Most failures are "file not found" (404), which is normal —
    // a newsroom may not have run the Node yet, or it's an old
    // version that doesn't write the file.
    return null;
  }
}

// ─── helpers ─────────────────────────────────────────────────────────

function parseArgs(argv) {
  const out = { verbose: false, only: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--verbose" || argv[i] === "-v") out.verbose = true;
    else if (argv[i] === "--only") out.only = argv[++i];
  }
  return out;
}

async function ensureDir(d) {
  if (!existsSync(d)) await mkdir(d, { recursive: true });
}

async function writeJson(path, data) {
  await writeFile(path, JSON.stringify(data, null, 2), "utf8");
}

function log(...args) { console.log(...args); }
function bail(msg) { console.error(msg); process.exit(1); }

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
