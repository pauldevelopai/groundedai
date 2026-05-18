#!/usr/bin/env bash
# Grounded newsroom appliance installer.
#
# Installs prerequisites (Node 22+, Ollama + gemma3:12b), writes the
# appliance .env, and registers a persistent service unit so the agent
# runner survives reboots.
#
# Supported: macOS (launchd) and Debian/Ubuntu-style Linux (systemd).
# Idempotent — running twice is safe.
#
# Usage:
#   cd appliances && bash install.sh

set -euo pipefail

APPLIANCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUNNER="$APPLIANCE_DIR/agent-runner/server.js"
ENV_FILE="$APPLIANCE_DIR/.env"
ENV_EXAMPLE="$APPLIANCE_DIR/.env.example"
OLLAMA_MODEL="${OLLAMA_MODEL:-gemma3:12b}"
SERVICE_NAME="grounded-appliance"

c_ok()    { printf "\033[32m✓\033[0m %s\n" "$1"; }
c_info()  { printf "\033[36m→\033[0m %s\n" "$1"; }
c_warn()  { printf "\033[33m!\033[0m %s\n" "$1"; }
c_fail()  { printf "\033[31m✗\033[0m %s\n" "$1" >&2; exit 1; }

[[ -f "$RUNNER" ]] || c_fail "Cannot find $RUNNER — run this script from inside the grounded repo's appliances/ dir."

OS="$(uname -s)"
case "$OS" in
  Darwin) PLATFORM=macos ;;
  Linux)  PLATFORM=linux ;;
  *)      c_fail "Unsupported OS: $OS. Mac mini or Linux only." ;;
esac
c_ok "Platform: $PLATFORM"

# ─── Node 22+ ─────────────────────────────────────────────────────────────
if command -v node >/dev/null 2>&1; then
  NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
  if [[ "$NODE_MAJOR" -lt 22 ]]; then
    c_fail "Node $NODE_MAJOR detected; need 22+. Install Node 22 (https://nodejs.org or 'brew install node@22' / 'curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -') then re-run."
  fi
  c_ok "Node $(node --version)"
else
  c_fail "Node not installed. Install Node 22+ (https://nodejs.org), then re-run."
fi

# ─── Ollama ──────────────────────────────────────────────────────────────
if ! command -v ollama >/dev/null 2>&1; then
  c_info "Installing Ollama..."
  if [[ "$PLATFORM" == "macos" ]]; then
    if command -v brew >/dev/null 2>&1; then
      brew install ollama
    else
      c_fail "Homebrew not found. Install Ollama from https://ollama.com/download then re-run."
    fi
  else
    curl -fsSL https://ollama.com/install.sh | sh
  fi
fi
c_ok "Ollama $(ollama --version 2>/dev/null | head -1)"

# Start the ollama service so we can pull the model.
if [[ "$PLATFORM" == "macos" ]]; then
  if ! pgrep -x ollama >/dev/null 2>&1; then
    c_info "Starting ollama in the background..."
    nohup ollama serve >/tmp/ollama.log 2>&1 &
    sleep 2
  fi
else
  sudo systemctl enable --now ollama 2>/dev/null || c_warn "Could not enable ollama systemd unit — pulling anyway."
fi

# ─── Model pull ──────────────────────────────────────────────────────────
if ollama list 2>/dev/null | awk '{print $1}' | grep -qx "$OLLAMA_MODEL"; then
  c_ok "Model $OLLAMA_MODEL already present"
else
  c_info "Pulling $OLLAMA_MODEL (this may take a while — ~9 GB)..."
  ollama pull "$OLLAMA_MODEL"
  c_ok "Model $OLLAMA_MODEL pulled"
fi

# ─── .env ────────────────────────────────────────────────────────────────
if [[ ! -f "$ENV_FILE" ]]; then
  cp "$ENV_EXAMPLE" "$ENV_FILE"
  c_info "Wrote $ENV_FILE — edit it now to set APPLIANCE_SECRET / APPLIANCE_ID / CENTRAL_URL (from the central app's /team page)."
  c_warn "Re-run this script once .env is filled in to install the service."
  exit 0
fi

if grep -qE '^APPLIANCE_SECRET=$' "$ENV_FILE"; then
  c_fail ".env is present but APPLIANCE_SECRET is empty. Fill it in from /team page, then re-run."
fi
c_ok ".env present"

# ─── Service unit ────────────────────────────────────────────────────────
mkdir -p "$APPLIANCE_DIR/logs"
NODE_BIN="$(command -v node)"

if [[ "$PLATFORM" == "macos" ]]; then
  # launchd can't read .env directly — wrap with a shell that sources it.
  WRAPPER="$APPLIANCE_DIR/agent-runner/.launch.sh"
  cat > "$WRAPPER" <<WRAP
#!/usr/bin/env bash
set -a
source "$ENV_FILE"
set +a
exec "$NODE_BIN" "$RUNNER"
WRAP
  chmod +x "$WRAPPER"

  PLIST="$HOME/Library/LaunchAgents/co.developai.${SERVICE_NAME}.plist"
  mkdir -p "$HOME/Library/LaunchAgents"
  cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>co.developai.${SERVICE_NAME}</string>
  <key>ProgramArguments</key><array>
    <string>$WRAPPER</string>
  </array>
  <key>WorkingDirectory</key><string>$APPLIANCE_DIR</string>
  <key>StandardOutPath</key><string>$APPLIANCE_DIR/logs/appliance.out.log</string>
  <key>StandardErrorPath</key><string>$APPLIANCE_DIR/logs/appliance.err.log</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
</dict></plist>
PLIST
  launchctl unload "$PLIST" 2>/dev/null || true
  launchctl load "$PLIST"
  c_ok "Installed launchd unit: $PLIST"
  c_info "Logs: $APPLIANCE_DIR/logs/appliance.{out,err}.log"
  c_info "Stop:  launchctl unload $PLIST"
  c_info "Start: launchctl load $PLIST"
else
  UNIT="/etc/systemd/system/${SERVICE_NAME}.service"
  sudo tee "$UNIT" >/dev/null <<UNIT
[Unit]
Description=Grounded newsroom appliance (agent runner)
After=network-online.target ollama.service
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$APPLIANCE_DIR
EnvironmentFile=$ENV_FILE
ExecStart=$NODE_BIN $RUNNER
Restart=always
RestartSec=5
User=$(id -un)
StandardOutput=append:$APPLIANCE_DIR/logs/appliance.out.log
StandardError=append:$APPLIANCE_DIR/logs/appliance.err.log

[Install]
WantedBy=multi-user.target
UNIT
  sudo systemctl daemon-reload
  sudo systemctl enable --now "$SERVICE_NAME.service"
  c_ok "Installed systemd unit: $UNIT"
  c_info "Status: sudo systemctl status $SERVICE_NAME"
  c_info "Logs:   journalctl -u $SERVICE_NAME -f"
fi

c_ok "Appliance installed and running."
c_info "Verify locally: curl -s http://localhost:8443/healthz"
c_info "Then on the central app, open /team → Appliance and click Test dispatch."
