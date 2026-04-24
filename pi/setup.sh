#!/usr/bin/env bash
# VetField Cart Hub — one-time Pi setup
# Run as root: sudo bash setup.sh
set -euo pipefail

APP_DIR=/opt/vetfield-hub
SERVICE=vetfield-hub
HOSTNAME_NEW=vetfield-hub

echo "=== VetField Hub Setup ==="

# ── 1. Set hostname ───────────────────────────────────────────────────────────
hostnamectl set-hostname "$HOSTNAME_NEW"
if ! grep -q "$HOSTNAME_NEW" /etc/hosts; then
  echo "127.0.1.1  ${HOSTNAME_NEW}.local  ${HOSTNAME_NEW}" >> /etc/hosts
fi
echo "[1/7] Hostname → ${HOSTNAME_NEW}.local"

# ── 2. Install system packages ────────────────────────────────────────────────
apt-get update -q
apt-get install -y -q nodejs npm gpsd gpsd-clients avahi-daemon
echo "[2/7] System packages installed"

# ── 3. Enable mDNS (Avahi) so Toughbooks resolve vetfield-hub.local ──────────
systemctl enable --now avahi-daemon
echo "[3/7] Avahi mDNS enabled"

# ── 4. Configure gpsd ─────────────────────────────────────────────────────────
cat > /etc/default/gpsd <<'EOF'
START_DAEMON="true"
USBAUTO="true"
DEVICES="/dev/ttyAMA0"
GPSD_OPTIONS="-n"
EOF
systemctl enable --now gpsd
echo "[4/7] gpsd configured"

# ── 5. Deploy app ─────────────────────────────────────────────────────────────
mkdir -p "$APP_DIR"
cp hub-server.js "$APP_DIR/"

cat > "$APP_DIR/package.json" <<'EOF'
{
  "name": "vetfield-hub",
  "version": "1.0.0",
  "main": "hub-server.js",
  "dependencies": {
    "ws": "^8.16.0",
    "serialport": "^12.0.0",
    "@serialport/parser-readline": "^12.0.0",
    "node-gpsd": "^0.3.0"
  }
}
EOF

cd "$APP_DIR" && npm install --omit=dev --silent
echo "[5/7] Node app deployed to $APP_DIR"

# ── 6. Install systemd service ────────────────────────────────────────────────
cp vetfield-hub.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable "$SERVICE"
echo "[6/7] systemd service installed"

# ── 7. First start ────────────────────────────────────────────────────────────
systemctl start "$SERVICE"
echo "[7/7] Service started"

echo ""
echo "=== Setup complete ==="
echo "Hub URL : ws://vetfield-hub.local:8765"
echo "Status  : http://vetfield-hub.local:8766/status"
echo "Logs    : journalctl -u vetfield-hub -f"
