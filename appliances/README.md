# Grounded newsroom appliance

The small Node service that runs **inside each newsroom's perimeter**.
The central Grounded app dispatches sensitive jobs here over signed
HTTPS; sensitive payloads never leave the newsroom's own hardware.

This is V2 Step 6's MVP. The protocol and signing layer are production-
shaped; the execution backend is currently a stub that acknowledges
dispatches. Swapping the stub for real Ollama-backed execution against
the shared `lib/agents/registry.js` is the Step 6.x follow-on once a
pilot newsroom installs hardware.

---

## What you need

- A small always-on machine in the newsroom: Mac mini M2, Intel NUC, or
  a private VM. Minimum 8 GB RAM if you intend to run `gemma3:12b`
  locally; 16 GB+ is more comfortable.
- Node 22+.
- A way to expose the appliance to the central app over HTTPS:
  Tailscale, Cloudflare Tunnel, or a reverse proxy with a real TLS cert.
- The appliance ID + signing secret printed at registration time on the
  central app's `/team` page. The secret is shown **once** and stored
  encrypted in the central database — keep your copy safe.

---

## Install (manual; install.sh follows)

```bash
git clone https://github.com/your-org/grounded.git
cd grounded/appliances/agent-runner

# Copy and fill in the env file.
cp ../.env.example ../.env
$EDITOR ../.env

# Run.
node server.js
```

The process listens on `APPLIANCE_PORT` (default `8443`). It pings the
central app every `PING_INTERVAL_MS` so the central `/team` "Appliance
online" indicator stays current.

For production, wrap it with systemd / launchd / a Docker container,
and put a TLS-terminating reverse proxy in front.

---

## Configuration

| Var                  | Required | Notes                                                |
| -------------------- | -------- | ---------------------------------------------------- |
| `APPLIANCE_SECRET`   | yes      | The signing secret from `/team` at registration time. |
| `APPLIANCE_ID`       | yes\*    | The newsroom_appliances.id (printed at registration). |
| `CENTRAL_URL`        | yes\*    | https://your-grounded-deployment.example              |
| `APPLIANCE_PORT`     | no       | default `8443`                                        |
| `APPLIANCE_HOST`     | no       | default `0.0.0.0`                                     |
| `PING_INTERVAL_MS`   | no       | default `300000` (5 min)                              |
| `APPLIANCE_VERSION`  | no       | label included in pings; defaults to package version |

\* `APPLIANCE_ID` + `CENTRAL_URL` are only required to enable the
heartbeat. Without them the appliance still accepts dispatches; the
central app just shows "offline" until the next inbound request bumps
last_seen_at.

---

## Endpoints (signed)

All POSTs require these three headers signed via HMAC-SHA256 over the
canonical string `${METHOD}\n${PATH}\n${TIMESTAMP}\n${NONCE}\n${SHA256_BODY_HEX}`:

- `X-Grounded-Timestamp` — ISO-8601
- `X-Grounded-Nonce` — 16 hex chars (random)
- `X-Grounded-Signature` — hex digest

Timestamp drift > 5 min is rejected. Constant-time signature comparison.

| Path              | Purpose                                                                   |
| ----------------- | ------------------------------------------------------------------------- |
| `POST /test`      | Smoke test from the central `/team` Test-dispatch button.                 |
| `POST /workflows/run` | Workflow dispatch (definition + inputs). STUB in MVP.                |
| `POST /agents/run`    | Single-agent dispatch (slug + input).         STUB in MVP.            |
| `GET /healthz`        | Local liveness check. Not signed.                                    |

The MVP STUB responses echo enough metadata for the central app to record
a successful dispatch and prove the round-trip works. Replace with real
Ollama execution in Step 6.x.

---

## Security model

- The signing secret is shared between the central app and the appliance.
  Central stores AES-256-GCM-encrypted; appliance keeps it in an env
  var. No third party ever sees plaintext.
- Every signed call carries a timestamp; replay window is 5 minutes.
- The central app refuses to dispatch to a paused / failed / unregistered
  appliance.
- Sensitive payloads (the dispatch body) are exposed only to the
  newsroom's own appliance hardware. They are NOT logged by the central
  app beyond the audit row in `appliance_dispatches` (which records
  metadata only — endpoint, status, duration — never the body).

---

## What's missing (Step 6.x backlog)

- Real Ollama-backed agent execution (currently STUB).
- A bundled `install.sh` (manual install is documented above).
- An Ollama-pull step that ensures the right model is present.
- TLS cert provisioning guidance for newsrooms without a reverse proxy.
- A self-update path so the appliance can pull new central-app contract
  versions without manual git pulls.
- Multi-newsroom appliance pool (V2 is one-per-newsroom).
