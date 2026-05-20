# GROUNDED Cohort Dashboard

How Paul sees what every newsroom is doing with every Node, from a single
laptop. No backend, no hosting, no fancy infrastructure — just `gh`, three
JSON files, and a static HTML page.

## The flow

```
            ┌─ Newsroom laptop ────────────────────────────┐
            │  Node (e.g. node-capitalfm-verifier)         │
            │   ├─ uses @developai/grounded-node-runtime   │
            │   │                                           │
            │   └─ writes telemetry to data/processed/:    │
            │       node_<slug>_meta.json     (install)    │
            │       node_<slug>_activity.json (actions)    │
            │       node_<slug>_errors.json   (issues)     │
            │                                               │
            │  Newsroom forks the Node repo; the three     │
            │  JSON files are committed to their fork as   │
            │  part of normal usage.                       │
            └────────────────┬──────────────────────────────┘
                             │
                             │  gh api walks every fork
                             ▼
            ┌─ Paul's laptop ──────────────────────────────┐
            │  groundedai/harvest/harvest.mjs              │
            │   ├─ reads docs/nodes/registry.yaml          │
            │   ├─ for each Node:                          │
            │   │   - lists forks via gh api               │
            │   │   - pulls the three telemetry files      │
            │   └─ writes aggregated:                      │
            │       dashboard/data/installs.json           │
            │       dashboard/data/activity.json           │
            │       dashboard/data/errors.json             │
            │       dashboard/data/last_harvest.json       │
            │                                               │
            │  groundedai/dashboard/index.html             │
            │   ├─ loads the four JSON files               │
            │   └─ renders three panels:                   │
            │       Installs   — who has what, on what     │
            │                    version, last seen when   │
            │       Activity   — feed of every action      │
            │                    across all newsrooms      │
            │       Issues     — structured errors with    │
            │                    sanitised context         │
            └────────────────────────────────────────────────┘
```

## Operating it

Prereqs (one-time):

```
brew install gh
gh auth login
```

Refresh the dashboard:

```
cd groundedai
node harvest/harvest.mjs        # all Nodes in the registry
# or:
node harvest/harvest.mjs --only capitalfm-verifier --verbose
```

Open `dashboard/index.html` in your browser. (No server needed; works
straight from the filesystem.)

## What the telemetry contains — and what it doesn't

The runtime writes three files per Node install. All three commit to the
newsroom's fork. **None of them contain user content** — no claim text,
no post text, no images, no API keys.

| File | Contents | Used for |
|---|---|---|
| `meta.json` | sticky host_id (UUID, generated once per install), slug, node_version, runtime_version, newsroom name, platform, first_boot, last_boot, boot_count | Install matrix + "are they actually using it" signal |
| `activity.json` | append-only feed of `{ ts, op, kind, ...small_metadata }` per action | Activity panel + per-Node usage patterns |
| `errors.json` | structured errors: `{ op, message, name, stack_first_line, context }` where context is aggressively sanitised | Issues panel + early warning |

The error logger drops any context key matching
`text|content|body|claim|post|image|key|token|password|secret|email`
and caps string values at 200 characters. If a Node passes a journalist's
claim text into an error context it will be silently dropped, not logged.

## What this is for

> "I need to be able to see if they are being downloaded, used, if
> problems are arising, I need data oversight."

That's the brief. The Install matrix answers "are they running it"; the
Activity panel answers "are they actually using it"; the Issues panel
answers "is anything broken".

## What this isn't (yet)

- Not hosted. The dashboard is a static page you open locally. If you
  later want it shared with collaborators or stakeholders, the JSON
  output is ready to push to a static host (Vercel/Netlify/GitHub Pages).
- Not real-time. The harvest is run on demand. If you want hourly
  refresh, wire it to a launchd/cron job locally.
- Not cohort-specific. The harvest pulls every fork of every Node listed
  in the registry. If a Node has grown beyond the ZimZam cohort the
  data simply gets richer.

## When something looks wrong

The dashboard surfaces three classes of "wrong":

- **Stale install** — a newsroom hasn't booted in 7+ days. Last-seen
  cell goes amber (`stale`), then red (`cold`) after 30 days.
- **Version drift** — a newsroom is multiple versions behind. The
  Version and Runtime columns show what they're on; cross-check
  against the current_version in registry.yaml.
- **Active errors** — last-24-hours error count on the Issues panel.
  Each row names the Node, the newsroom, the operation, and the
  sanitised context.
