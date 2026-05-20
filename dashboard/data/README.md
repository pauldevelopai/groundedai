# dashboard/data

Output of `harvest/harvest.mjs`. Static JSON the dashboard loads.

Files written here (after harvest runs):

- `installs.json` — flat array of meta records, one per (Node, fork) pair
- `activity.json` — flat array of activity entries across all newsrooms
- `errors.json` — flat array of structured errors across all newsrooms
- `last_harvest.json` — timestamp + counts of the last harvest

Run from the repo root:

```
node harvest/harvest.mjs              # all Nodes
node harvest/harvest.mjs --only capitalfm-verifier
node harvest/harvest.mjs --verbose
```

Then open `dashboard/index.html` in your browser.

Prereqs: `gh` CLI authenticated (`gh auth status` returns ok).
