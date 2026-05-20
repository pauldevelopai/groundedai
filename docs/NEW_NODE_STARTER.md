# GROUNDED — new Node starter pack

This is the architecture briefing for anyone (or any LLM) creating a
new Node on GROUNDED. Reading this first means the Node will:

- Wear the GROUNDED family chrome (terracotta top bar + footer)
- Carry the in-app Feedback button that newsrooms use to message Paul
- Emit telemetry the cohort dashboard reads (boot beacon, activity, errors, feedback)
- Have a welcome-screen API-key flow so newsrooms never touch `.env`
- Match the README convention used by Capital FM and MakanDay
- Have working `Start.command` / `Update.command` for newsroom devs
- Be visible to the harvest within minutes of first push

## The mental model

A **Node** is a newsroom-owned app that runs on a laptop, talks to AI
through the newsroom's own API key, and saves its work to JSON files
on disk. The newsroom forks the Node's GitHub repo and runs it from
their fork — they own their copy forever.

A Node uses the **runtime** (`@developai/grounded-node-runtime`, v0.6.0+)
for everything that should be identical across Nodes: server boot, the
host interface (storage, AI calls), chrome, telemetry, feedback, git
sync. The Node only ships application code: prompts, route handlers, UI.

A Node lives in a separate GitHub repo at
`github.com/pauldevelopai/node-<slug>`, sibling to other Nodes. The
canonical local checkout is at:

```
/Users/paulmcnally/Developai Dropbox/Paul McNally/DROPBOX/ONMAC/PYTHON 2026/Nodes/node-<slug>/
```

The two existing Nodes for reference:
- `node-capitalfm-verifier` — claim verification + Facebook origin
  tracking (two-mode UI, light editorial palette)
- `node-makanday-analytics` — audience-resonance analytics from a
  Word matrix (single-mode UI, dark editorial palette)

When in doubt about a convention, look at how those two do it.

## Non-negotiable conventions

1. **Runtime dependency uses the GitHub URL, never `file:../`**:
   ```json
   "@developai/grounded-node-runtime": "github:pauldevelopai/grounded-node-runtime#main"
   ```
   The `file:` path assumes a local sibling layout that doesn't hold
   on newsroom machines. Both existing Nodes initially used `file:`
   and we had to migrate them.

2. **`nodeVersion` and `newsroom` are threaded through boot**: read
   version from package.json, default newsroom from
   `process.env.NEWSROOM`. Both go to `createLiteHost` AND
   `createServer`. Without these, the boot beacon records "unknown"
   and the cohort dashboard can't tell installs apart.

3. **The Node implements its own welcome-screen setup** — the runtime
   doesn't ship a setup UI. The Node exports `getSetupStatus` +
   `postSetup` from `lib/handlers.js`; the runtime auto-mounts them
   at `/api/setup`. The handler writes to `.env` directly and updates
   `process.env` in-process. Code is identical between the two
   existing Nodes — copy it verbatim.

4. **Telemetry contract**. The runtime writes four files into
   `data/processed/` that get committed to the fork and read by the
   harvest. The Node MUST NOT:
   - Log AI-generated content into `host.log.run({})` context
   - Log user-typed claim text, post text, story text, story titles,
     source names, image/audio data, API keys
   - Bypass the runtime to write its own telemetry files
   Only metadata: op name, type, duration, count fields, IDs.

5. **Two HTML lines opt the Node into the chrome.** Without these, no
   top bar, no footer, no Feedback button. They go in
   `public/index.html` `<head>`:
   ```html
   <link rel="stylesheet" href="/grounded-chrome.css" />
   <script src="/grounded-chrome.js" defer></script>
   ```

6. **The Node's primary brand colour stays primary.** The chrome is
   intentionally a thin family signature, not the dominant visual
   identity. Don't theme the Node's interior in terracotta to match —
   choose whatever palette suits the Node's purpose (Capital FM is
   editorial blue, MakanDay is dark editorial with amber accents).

7. **`.gitignore` must include `.claude/`.** Otherwise Claude Code's
   session state ends up in commits and gets pushed to GitHub.
   First-commit hygiene.

## Build sequence

Follow this order. Each step is small.

### 1. Repository setup

In the canonical local Nodes directory, create the folder and
initialise git:

```
cd "/Users/paulmcnally/Developai Dropbox/Paul McNally/DROPBOX/ONMAC/PYTHON 2026/Nodes"
mkdir node-<slug>
cd node-<slug>
git init
```

On GitHub, create a public repo at `pauldevelopai/node-<slug>` with
no auto-generated content (no README, no LICENSE, no .gitignore — we
add those locally). Then:

```
git remote add origin https://github.com/pauldevelopai/node-<slug>.git
```

### 2. Project scaffold

Create exactly this directory structure:

```
node-<slug>/
├── .env.example          (committed)
├── .gitignore
├── .gitattributes
├── LICENSE               (Apache-2.0, copy from another Node)
├── README.md             (newsroom-facing handover doc)
├── Start.command         (Mac)
├── Start.bat             (Windows)
├── Update.command        (Mac)
├── Update.bat            (Windows)
├── index.js              (boot, ~30 lines)
├── package.json
├── public/
│   ├── index.html
│   ├── app.js
│   └── (css inline in index.html or separate file)
├── lib/
│   └── handlers.js       (routes auto-mount from this)
└── data/
    ├── raw/              (Node-specific input data, optional)
    └── processed/        (telemetry — created on first boot)
```

### 3. The boot file (index.js)

```js
import "dotenv/config";
import { createLiteHost, createServer } from "@developai/grounded-node-runtime";
import * as handlers from "./lib/handlers.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, "package.json"), "utf8"));

const SLUG = "<slug>";
const DISPLAY_NAME = "<Display Name For This Node>";

const host = createLiteHost({
  appSlug: SLUG,
  nodeVersion: pkg.version,
  newsroom: process.env.NEWSROOM || "<Default Newsroom Name>",
});

createServer({
  slug: SLUG,
  host,
  handlers,
  displayName: DISPLAY_NAME,
  nodeVersion: pkg.version,
});
```

That's all the boot file does. Application logic lives in
`lib/handlers.js`. If you need custom Express routes that the
auto-mount doesn't cover, capture the app instance:
`const app = createServer({...})` and call `app.post(...)` afterward.

### 4. The package.json

```json
{
  "name": "node-<slug>",
  "version": "0.1.0",
  "private": true,
  "description": "<one-sentence Node description>",
  "type": "module",
  "main": "index.js",
  "engines": { "node": ">=20" },
  "scripts": {
    "start": "node index.js",
    "dev": "node --watch index.js"
  },
  "dependencies": {
    "@developai/grounded-node-runtime": "github:pauldevelopai/grounded-node-runtime#main",
    "dotenv": "^16.4.5"
  },
  "license": "Apache-2.0"
}
```

`dotenv` is the only direct dependency apart from the runtime
itself. Anything else (Anthropic SDK, OpenAI SDK, multer for
uploads, mammoth for Word docs) comes transitively through the
runtime. **Only add direct dependencies for things the runtime
doesn't already provide.** ElevenLabs SDK, axios, etc. — those go
in dependencies.

### 5. The handlers file (lib/handlers.js)

Two non-negotiable handlers: the welcome-screen flow. Copy this
verbatim from `node-makanday-analytics/lib/handlers.js`. The
`readEnvFile` / `writeEnvFile` helpers and the `getSetupStatus` /
`postSetup` handlers are identical across all Nodes. Don't
re-invent them.

```js
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const ENV_PATH = ".env";

function readEnvFile() {
  if (!existsSync(ENV_PATH)) return {};
  const env = {};
  for (const line of readFileSync(ENV_PATH, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return env;
}

function writeEnvFile(updates) {
  const current = readEnvFile();
  const merged = { ...current, ...updates };
  const order = ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "AI_PROVIDER", "ELEVENLABS_API_KEY", "MODEL", "NEWSROOM", "PORT"];
  const lines = [
    "# Saved by the in-app setup screen. Update through the app, not by editing this.",
    "# Keep this file private — it contains your API key. (Already in .gitignore.)",
    "",
  ];
  for (const k of order) {
    if (merged[k] !== undefined && merged[k] !== "") lines.push(`${k}=${merged[k]}`);
  }
  for (const k of Object.keys(merged)) {
    if (!order.includes(k) && merged[k]) lines.push(`${k}=${merged[k]}`);
  }
  writeFileSync(ENV_PATH, lines.join("\n") + "\n");
  for (const [k, v] of Object.entries(updates)) {
    if (v) process.env[k] = v;
    else delete process.env[k];
  }
}

export async function getSetupStatus(host) {
  // Default impl handles Anthropic + OpenAI. Override for Nodes
  // that need different keys (e.g. ElevenLabs-only podcast Node).
  const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;
  const hasOpenAI = !!process.env.OPENAI_API_KEY;
  const explicit = (process.env.AI_PROVIDER || "").toLowerCase();
  let activeProvider = null;
  if (explicit === "anthropic" || explicit === "openai") activeProvider = explicit;
  else if (hasAnthropic) activeProvider = "anthropic";
  else if (hasOpenAI) activeProvider = "openai";
  return { configured: !!activeProvider, activeProvider, hasAnthropicKey: hasAnthropic, hasOpenAIKey: hasOpenAI };
}

export async function postSetup(host, body) {
  const { provider, apiKey } = body || {};
  if (provider === null && apiKey === null) {
    writeEnvFile({ ANTHROPIC_API_KEY: "", OPENAI_API_KEY: "", AI_PROVIDER: "" });
    return { ok: true, reset: true };
  }
  if (!["anthropic", "openai"].includes(provider)) {
    return { ok: false, message: "Pick Anthropic or OpenAI." };
  }
  if (!apiKey || typeof apiKey !== "string" || apiKey.trim().length < 10) {
    return { ok: false, message: "Paste your API key into the key box." };
  }
  const key = apiKey.trim();
  const updates = { AI_PROVIDER: provider };
  if (provider === "anthropic") updates.ANTHROPIC_API_KEY = key;
  else updates.OPENAI_API_KEY = key;
  writeEnvFile(updates);
  await host.log.run({ op: "setup", provider, success: true });
  return { ok: true, provider };
}

// ─── Application handlers below. Export functions matching the
// standard route names and the runtime auto-mounts them:
// listSources(host)           → GET  /api/sources
// getReport(host, query)      → GET  /api/report
// getQuality(host, query)     → GET  /api/quality
// getActivity(host)           → GET  /api/activity
// postBrief(host, body)       → POST /api/brief
// postIngest(host, {buffer,sourceLabel})  → POST /api/ingest (multipart)
// Only export the ones that fit your Node.
```

If your Node needs different keys (e.g. ElevenLabs as the only
required key, no AI provider), override `getSetupStatus`/`postSetup`
to validate the keys you need. Keep `writeEnvFile` and `readEnvFile`
verbatim — they're the same in every Node.

### 6. The frontend (public/index.html)

Skeleton with welcome-screen toggle and chrome opt-in:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title><Display Name></title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />

  <!-- GROUNDED chrome — terracotta top bar + footer + Feedback button -->
  <link rel="stylesheet" href="/grounded-chrome.css" />

  <style>
    :root {
      --bg: #faf9f6;
      --card: #ffffff;
      --line: #e5e3da;
      --ink: #1c1c1a;
      --muted: #6b6b66;
      --accent: <pick a brand colour DIFFERENT from terracotta>;
    }
    body { margin: 0; padding: 0; background: var(--bg); color: var(--ink); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    .welcome { max-width: 480px; margin: 4rem auto; background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 2rem; }
    .welcome h2 { margin-top: 0; }
    /* … your own app styles … */
  </style>
</head>
<body>

  <!-- Welcome screen (shown while not configured) -->
  <div id="welcome-screen" class="welcome" style="display:none">
    <h2>Welcome to <Display Name></h2>
    <p>Set up your API key(s) to get started.</p>
    <!-- … inputs … -->
    <button class="primary" id="welcome-save">Save and continue</button>
    <p id="welcome-error" style="color:#a8543a;margin-top:0.75rem;display:none"></p>
  </div>

  <!-- Main app (shown after key is configured) -->
  <div id="app" style="display:none">
    <header>
      <div>
        <h1><Display Name></h1>
        <div class="subtitle">… your subtitle …</div>
      </div>
      <a href="#" id="change-key-link" style="font-size:0.78rem;color:var(--muted);text-decoration:none">change API key</a>
    </header>

    <!-- Your application UI here -->

  </div>

  <script src="app.js"></script>

  <!-- GROUNDED chrome bootstrap — loaded last -->
  <script src="/grounded-chrome.js" defer></script>
</body>
</html>
```

### 7. The frontend boot logic (public/app.js)

Same boot pattern across every Node — copy verbatim from
`node-makanday-analytics/public/app.js` lines 1–80 or so. The
boot reads `/api/setup` to decide whether to show the welcome
screen or the main app, wires the "change API key" link to reset,
and otherwise stays out of the way of your application logic.

### 8. Configuration files

**.env.example** (committed; newsrooms copy to `.env`):

```
# AI provider — set automatically by the welcome screen.
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
AI_PROVIDER=

# Other keys your Node uses
# ELEVENLABS_API_KEY=

# Optional — newsroom display name shown in the GROUNDED top bar
# and on the cohort dashboard.
NEWSROOM=

# Optional — change if you want the app on a different port.
# PORT=3000
```

**.gitignore**:

```
node_modules/
.env
.DS_Store
*.log
.claude/
```

`.env` is private (contains the API key). Everything in
`data/processed/` IS committed — that's how the cohort dashboard
sees the install. `.claude/` is Claude Code's session state and
must NEVER end up on GitHub.

**.gitattributes** (newsroom data wins on merge — never get
clobbered by upstream):

```
data/processed/* merge=ours
data/raw/* merge=ours
```

### 9. The newsroom-facing scripts

**Start.command** (Mac) — executable, double-clickable by the
newsroom dev:

```bash
#!/usr/bin/env bash
cd "$(dirname "$0")"
if [ ! -d node_modules ]; then
  echo "Installing dependencies (first run only) — this takes about a minute..."
  npm install
fi
npm start
```

After saving: `chmod +x Start.command`.

**Start.bat** (Windows):

```batch
@echo off
cd /d "%~dp0"
if not exist node_modules (
  echo Installing dependencies (first run only) - this takes about a minute...
  call npm install
)
npm start
pause
```

**Update.command** (Mac):

```bash
#!/usr/bin/env bash
cd "$(dirname "$0")"
echo "Fetching the latest version..."
git pull origin main
echo "Updating dependencies..."
npm install
echo ""
echo "  ✓ Update complete. Run Start.command to launch the app."
```

After saving: `chmod +x Update.command`.

**Update.bat** (Windows):

```batch
@echo off
cd /d "%~dp0"
echo Fetching the latest version...
call git pull origin main
echo Updating dependencies...
call npm install
echo.
echo   Update complete. Run Start.bat to launch the app.
pause
```

### 10. The README (newsroom-facing)

Copy the structure verbatim from
`node-capitalfm-verifier/README.md` or
`node-makanday-analytics/README.md`. Both follow the same shape:

1. Title + intro (one paragraph)
2. **Part of GROUNDED** — family framing + upfront telemetry note
3. A quick map of what we're about to do (N steps)
4. Part 1: Install Node.js
5. Part 2: Install VS Code
6. Part 3: Sign up with the relevant API provider(s)
7. Part 4: Get the app onto your computer (fork → collaborator → download → VS Code)
8. Part 5: Run the app for the first time
9. Part 6: Open the app, add your key(s), do the first thing
10. (Optional further parts for additional features)
11. Using the app after the first day (Start.command / Start.bat)
12. **What you share with Develop AI** — honest spec of what does
    and doesn't leave the laptop
13. The plan from here
14. Getting updates from Develop AI (Update.command)
15. When something goes wrong (common failure modes)
16. Glossary
17. Getting help

The "What you share with Develop AI" section is the most
important one. Be honest. Lists must include:

**Stays on the laptop (never uploaded):**
- The API key(s) — in `.env`, git-ignored
- All Node-specific input data (claims, posts, audio samples,
  transcripts, story content, etc.)
- All Node-specific output data (AI reports, generated podcasts,
  analysis briefs)

**Committed to the fork (visible to Paul):**
- `node_<slug>_meta.json` — install ID, version, OS, boot count
- `node_<slug>_activity.json` — operation names, types, durations
  (NEVER content)
- `node_<slug>_errors.json` — sanitised structured error records
- `node_<slug>_feedback.json` — newsroom-typed feedback messages

The feedback file is the ONE place where user-typed content
intentionally leaves the laptop. Flag it explicitly in the README:
"What you write into the in-app Feedback widget gets committed to
your fork. The modal warns about this before sending."

### 11. First commit + push

```
git add .
git status
git commit -m "v0.1.0: initial Node — <Display Name>"
git push -u origin main
```

If you see `.claude/` in `git status`, STOP. Make sure `.gitignore`
includes `.claude/` and re-stage.

### 12. Register the Node with the harvest

The cohort dashboard's harvest needs to know about your Node to
walk its forks. Add an entry to `grounded/docs/nodes/registry.yaml`:

```yaml
nodes:
  - slug: <slug>
    repo: pauldevelopai/node-<slug>
    display_name: <Display Name>
    version_at_first_pilot: 0.1.0
    purpose_one_liner: <one sentence>
```

Commit and push that change to the `grounded` monorepo. The next
`node harvest/harvest.mjs --verbose` walks your Node's forks and
the dashboard renders rows for any newsroom that's running it.

### 13. First-run verification

```
cd "/Users/paulmcnally/Developai Dropbox/Paul McNally/DROPBOX/ONMAC/PYTHON 2026/Nodes/node-<slug>"
npm install
npm start
```

In another terminal:

```
curl -s http://localhost:3000/api/grounded/meta
curl -s http://localhost:3000/api/setup
curl -s http://localhost:3000/grounded-chrome.js | grep -c "gc-feedback-btn"
```

Expected:
- `/api/grounded/meta` returns JSON with your slug, displayName,
  nodeVersion, runtimeVersion ≥ "0.6.0"
- `/api/setup` returns JSON with `configured` field (welcome
  handlers mounted)
- grep count ≥ 1 (chrome JS includes feedback widget)

Then open `http://localhost:3000` in a browser. You should see:
- The welcome screen (because `.env` is unset)
- After saving a key: the dashboard with terracotta GROUNDED bar at
  top, dark footer, and Feedback button bottom-right

If any of those don't appear, debug from the top of the build sequence.

## Rules of engagement for Claude Code

When Claude Code is given this starter pack in VS Code, it should
follow these rules without exception:

1. **Only work inside the new Node's directory** —
   `Nodes/node-<slug>/`. Never `cd` out of it.

2. **Never touch other Nodes.** `node-capitalfm-verifier` and
   `node-makanday-analytics` are production. Do not read, edit,
   or run commands in those directories.

3. **Never touch the runtime.** `../../grounded-node-runtime/` is
   off-limits. If the runtime needs a change, surface it as a
   discussion item — don't edit it.

4. **Never touch the monorepo.** `../../grounded/` is off-limits.
   `docs/nodes/registry.yaml` is the only file there that the new
   Node will eventually add to, and even that should be a final
   PR step, not mid-build.

5. **Always add `.claude/` to `.gitignore` BEFORE the first commit.**
   Otherwise Claude Code's session state ends up on GitHub.

6. **Never run `git push --force` or `git rebase` on shared history.**
   If history needs rewriting, ask first.

7. **Read this entire starter pack first, then read the Node's
   specific brief, then ask the user any clarifying questions before
   writing code.**

8. **When in doubt, refer to the canonical implementations** in
   `node-capitalfm-verifier` and `node-makanday-analytics` — but
   READ ONLY. Do not modify them.

## Common traps

- **`file:../grounded-node-runtime`** — never use this in
  `package.json`. Always the GitHub URL. We migrated both existing
  Nodes off this and they kept breaking until we did.

- **Forgetting `nodeVersion` in `createLiteHost`.** The boot beacon
  records "unknown" and the cohort dashboard can't track upgrades.

- **Committing `data/processed/` to `.gitignore`.** Don't. The
  telemetry files MUST be committed — that's how the harvest sees
  the install.

- **Two Node processes running on the same port.** If `npm start`
  ever says "EADDRINUSE", run `lsof -i :3000` (or whatever port)
  and `kill -9 <PID>` before retrying.

- **Stale `node_modules`.** `npm install` is cached aggressively. If
  the runtime version isn't updating: `rm -rf node_modules package-lock.json
  && npm install` forces a clean re-resolve.

- **Dropbox sync racing with `npm install`.** Dropbox occasionally
  restores deleted node_modules files. If installs feel haunted,
  exclude `**/node_modules/` from Dropbox sync.
