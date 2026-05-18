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

## Install (one script)

```bash
git clone https://github.com/your-org/grounded.git
cd grounded/appliances
bash install.sh
```

The installer:
1. Verifies Node 22+ is on PATH (aborts with install instructions if not).
2. Installs Ollama (via Homebrew on macOS, via the official installer on Linux) and pulls `gemma3:12b` (~9 GB).
3. Copies `.env.example` → `.env` if it doesn't exist; aborts so you can fill in `APPLIANCE_SECRET` / `APPLIANCE_ID` / `CENTRAL_URL` from the central app's `/team` page.
4. On the second run (once `.env` is filled in), registers a persistent service unit:
   - **macOS:** launchd plist at `~/Library/LaunchAgents/co.developai.grounded-appliance.plist`.
   - **Linux:** systemd unit at `/etc/systemd/system/grounded-appliance.service`.
5. Starts the appliance. Logs land in `appliances/logs/`.

The script is idempotent — run it again to re-verify and reload the unit. Set `OLLAMA_MODEL=gemma3:27b` in the environment first if you want a heavier model.

### Manual run (development)

```bash
cd grounded/appliances/agent-runner
set -a; source ../.env; set +a
node server.js
```

The process listens on `APPLIANCE_PORT` (default `8443`). It pings the central app every `PING_INTERVAL_MS` so the central `/team` "Appliance online" indicator stays current.

For production behind a public hostname, put a TLS-terminating reverse proxy (or Cloudflare Tunnel / Tailscale) in front. The appliance itself speaks plain HTTP on the listen port.

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
- TLS cert provisioning guidance for newsrooms without a reverse proxy
  (the installer assumes you'll front it with Tailscale / Cloudflare
  Tunnel / nginx).
- A self-update path so the appliance can pull new central-app contract
  versions without manual git pulls.
- Multi-newsroom appliance pool (V2 is one-per-newsroom).
