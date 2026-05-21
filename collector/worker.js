/**
 * GROUNDED telemetry collector — Cloudflare Worker relay.
 * ─────────────────────────────────────────────────────────────────────────────
 * GROUNDED Nodes POST metadata here (install heartbeat, activity/error events,
 * and user feedback). This Worker writes it into the Airtable "Develop AI" base.
 * The Airtable token lives ONLY in this Worker — never in the distributed Nodes.
 *
 * All callers are Node *servers* (Node.js processes on newsroom laptops), not
 * browsers — so no CORS is needed. The inbound token is shipped in the public
 * Node repo, so it's an abuse deterrent, not real auth: we also cap body size,
 * clamp string lengths, and only ever write the known fields. Add a Cloudflare
 * rate-limiting rule on this Worker's route for extra protection.
 *
 * Set with wrangler before first deploy:
 *   wrangler secret put AIRTABLE_TOKEN   # Airtable PAT, scope data.records:write, access to the base
 *   wrangler secret put INBOUND_TOKEN    # any random string; the Nodes send this
 * AIRTABLE_BASE is a plain var in wrangler.toml.
 */

// Table IDs in the "Develop AI" base (app4FVlF4AAy8Q8s2). Stable across renames.
const TABLES = {
  install: "tbl14KQxvb6HUUzcs", // Node Installs
  event: "tblJhlmbK5yYmsRs6", // Node Events
  feedback: "tbljb04Mn1lWl5JCw", // Node Feedback
};
const MAX_BODY = 16 * 1024;

const s = (v, n) => (v == null ? "" : String(v)).slice(0, n);
const num = (v) => (Number.isFinite(+v) ? +v : undefined);
const orUndef = (v) => (v ? v : undefined);

export default {
  async fetch(request, env) {
    if (request.method !== "POST") return json(405, { error: "POST only" });
    if (Number(request.headers.get("content-length") || 0) > MAX_BODY) {
      return json(413, { error: "payload too large" });
    }

    let body;
    try { body = await request.json(); } catch { return json(400, { error: "invalid JSON" }); }

    // Low-value shared-token check (see header note).
    if (!env.INBOUND_TOKEN || body.token !== env.INBOUND_TOKEN) {
      return json(401, { error: "unauthorized" });
    }

    const tableId = TABLES[body.type];
    if (!tableId) return json(400, { error: "unknown type" });
    const d = body.data || {};

    try {
      if (body.type === "install") {
        // Upsert one row per install, keyed on host_id.
        await airtable(env, tableId, "PATCH", {
          performUpsert: { fieldsToMergeOn: ["host_id"] },
          typecast: true,
          records: [{ fields: {
            host_id: s(d.host_id, 100),
            slug: s(d.slug, 100),
            newsroom: s(d.newsroom, 100),
            node_version: s(d.node_version, 50),
            runtime_version: s(d.runtime_version, 50),
            platform: s(d.platform, 120),
            first_boot: orUndef(s(d.first_boot, 40)),
            last_seen: orUndef(s(d.last_seen, 40)),
            boot_count: num(d.boot_count),
          } }],
        });
      } else if (body.type === "event") {
        await airtable(env, tableId, "POST", {
          typecast: true,
          records: [{ fields: {
            host_id: s(d.host_id, 100),
            slug: s(d.slug, 100),
            ts: orUndef(s(d.ts, 40)),
            kind: s(d.kind, 20),
            op: s(d.op, 100),
            details: s(d.details, 5000),
          } }],
        });
      } else if (body.type === "feedback") {
        await airtable(env, tableId, "POST", {
          typecast: true,
          records: [{ fields: {
            host_id: s(d.host_id, 100),
            slug: s(d.slug, 100),
            newsroom: s(d.newsroom, 100),
            ts: orUndef(s(d.ts, 40)),
            type: s(d.type, 20),
            message: s(d.message, 4000),
            page: s(d.page, 200),
            node_version: s(d.node_version, 50),
          } }],
        });
      }
      return json(200, { ok: true });
    } catch (e) {
      return json(502, { ok: false, error: String(e && e.message || e).slice(0, 200) });
    }
  },
};

async function airtable(env, tableId, method, payload) {
  const r = await fetch(`https://api.airtable.com/v0/${env.AIRTABLE_BASE}/${tableId}`, {
    method,
    headers: {
      Authorization: `Bearer ${env.AIRTABLE_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error(`airtable ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

function json(status, obj) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
