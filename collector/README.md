# GROUNDED telemetry collector

A tiny Cloudflare Worker that receives metadata POSTs from GROUNDED Nodes and
writes them into the Airtable **Develop AI** base. It exists so the Airtable
token never ships inside the public Node repos — Nodes only ever know the
Worker's public URL and a low-value shared token.

```
Node (laptop)  ──POST──▶  this Worker  ──Airtable API──▶  Develop AI base
                                                          ├─ Node Installs   (tbl14KQxvb6HUUzcs)
                                                          ├─ Node Events     (tblJhlmbK5yYmsRs6)
                                                          └─ Node Feedback   (tbljb04Mn1lWl5JCw)
```

## What a Node sends

`POST` JSON, one message per install heartbeat / event / feedback:

```json
{ "token": "<INBOUND_TOKEN>", "type": "install|event|feedback", "data": { ... } }
```

- `install` → upserts a row in **Node Installs** keyed on `host_id`.
- `event` → appends a row to **Node Events** (`kind` = run | edit | error).
- `feedback` → appends a row to **Node Feedback**.

Only the known fields are written; everything is length-clamped and the body is
capped at 16 KB. No audio, transcripts, or keys ever pass through here.

## Deploy (one time)

1. Install Wrangler and sign in:
   ```
   npm i -g wrangler
   wrangler login
   ```
2. Create an **Airtable Personal Access Token** at
   https://airtable.com/create/tokens with scope `data.records:write` and access
   to the **Develop AI** base. Copy it.
3. From this folder, set the two secrets:
   ```
   cd collector
   wrangler secret put AIRTABLE_TOKEN     # paste the Airtable PAT
   wrangler secret put INBOUND_TOKEN      # paste any random string (e.g. `openssl rand -hex 16`)
   ```
4. Deploy:
   ```
   wrangler deploy
   ```
   Wrangler prints the URL, e.g. `https://grounded-telemetry.<your-subdomain>.workers.dev`.

5. Give that URL + the `INBOUND_TOKEN` to the Nodes (see the Node's config —
   `GROUNDED_TELEMETRY_URL` and `GROUNDED_TELEMETRY_TOKEN`). Until they're set, a
   Node simply doesn't send telemetry — nothing breaks.

## Test it

```
curl -s -X POST https://grounded-telemetry.<sub>.workers.dev \
  -H 'content-type: application/json' \
  -d '{"token":"<INBOUND_TOKEN>","type":"install","data":{"host_id":"test-1","slug":"podcasting","newsroom":"Test","node_version":"0.1.0","boot_count":1,"first_boot":"2026-05-21T10:00:00Z","last_seen":"2026-05-21T10:00:00Z"}}'
# → {"ok":true}  and a row appears in Node Installs
```

## Hardening

The inbound token is shipped in a public repo, so treat it as a deterrent, not
auth. Add a **Cloudflare rate-limiting rule** on the Worker route, and (optional)
move to per-newsroom tokens later if it's ever abused.
