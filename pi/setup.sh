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
echo "[1/8] Hostname → ${HOSTNAME_NEW}.local"

# ── 2. Install system packages ────────────────────────────────────────────────
apt-get update -q
apt-get install -y -q nodejs npm gpsd gpsd-clients avahi-daemon
echo "[2/8] System packages installed"

# ── 3. Enable mDNS (Avahi) so Toughbooks resolve vetfield-hub.local ──────────
systemctl enable --now avahi-daemon
echo "[3/8] Avahi mDNS enabled"

# ── 4. Configure gpsd ─────────────────────────────────────────────────────────
cat > /etc/default/gpsd <<'EOF'
START_DAEMON="true"
USBAUTO="true"
DEVICES="/dev/ttyAMA0"
GPSD_OPTIONS="-n"
EOF
systemctl enable --now gpsd
echo "[4/8] gpsd configured"

# ── 5. UWB hardware setup ────────────────────────────────────────────────────
#
# UWB ARCHITECTURE OPTIONS:
#
# Option A — Qorvo DWM1001/DWM3000 anchor network (recommended for 2D positioning)
#   - 3+ DWM1001-DEV boards as anchors around the hole (tee, fairway L/R, green)
#   - 1 DWM1001-DEV as gateway connected to Pi via USB/UART
#   - UWB tag on each golf ball (or use OnCore GENiUS ball with embedded UWB)
#   - Anchors compute TDOA position and gateway sends "POS,<tag>,<x>,<y>,<z>,<q>" over serial
#
# Option B — Single ranging tag on cart (distance only, estimated position)
#   - 1 DWM3000 module on Pi (USB/UART)
#   - UWB tag on ball
#   - Only gives distance, not 2D position
#   - Set UWB_MODE=tag in the service file
#
# Option C — OnCore GENiUS ball system
#   - OnCore's SmartCourse anchors around the hole
#   - GENiUS ball has embedded UWB transmitter
#   - Gateway sends "UWB,<ball_id>,<x>,<y>,<z>,<speed>,<quality>" over serial
#
# HARDWARE CONNECTION:
#   - Connect UWB gateway module to Pi USB port (appears as /dev/ttyUSB0 or /dev/ttyACM0)
#   - If using UART: connect DWM1001 UART TX→Pi RX (GPIO 15), DWM1001 RX→Pi TX (GPIO 14)
#     Then disable Pi serial console: sudo raspi-config → Interface → Serial → No shell, Yes hardware
#     The device will be /dev/ttyAMA0 or /dev/serial0
#   - For multi-anchor setups, connect a second gateway to a different USB port
#     and set UWB_PORT_2 in the service file

# Enable Pi UART for direct DWM1001 connection (optional)
if ! grep -q "enable_uart=1" /boot/config.txt 2>/dev/null; then
  echo "enable_uart=1" >> /boot/config.txt
  echo "[5/8] UART enabled for direct UWB module connection (reboot required)"
else
  echo "[5/8] UART already enabled"
fi

# Set udev rules for consistent UWB serial port naming
cat > /etc/udev/rules.d/99-uwb-serial.rules <<'UDEV'
# Qorvo DWM1001-DEV (USB-Serial)
SUBSYSTEM=="tty", ATTRS{idVendor}=="10c4", ATTRS{idProduct}=="ea60", SYMLINK+="uwb-gateway0"
# Second gateway
SUBSYSTEM=="tty", ATTRS{idVendor}=="10c4", ATTRS{idProduct}=="ea60", ATTRS{devpath}=="?.2", SYMLINK+="uwb-gateway1"
# Direct UART (DWM1001 via Pi GPIO)
KERNEL=="ttyAMA0", SYMLINK+="uwb-uart"
UDEV
udevadm control --reload-rules 2>/dev/null || true
echo "[5/8] UWB udev rules installed (devices: /dev/uwb-gateway0, /dev/uwb-uart)"

# ── 6. Deploy app ─────────────────────────────────────────────────────────────
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
echo "[6/8] Node app deployed to $APP_DIR"

# ── 7. Install systemd service ───────────────────────────────────────────────
cp vetfield-hub.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable "$SERVICE"
echo "[7/8] systemd service installed"

# ── 8. First start ────────────────────────────────────────────────────────────
systemctl start "$SERVICE"
echo "[8/8] Service started"

echo ""
echo "=== Setup complete ==="
echo ""
echo "Hub URL : ws://vetfield-hub.local:8765"
echo "Status  : http://vetfield-hub.local:8766/status"
echo "Logs    : journalctl -u vetfield-hub -f"
echo ""
echo "=== UWB Configuration ==="
echo ""
echo "Edit /etc/systemd/system/vetfield-hub.service to configure:"
echo ""
echo "  UWB_PORT=/dev/uwb-gateway0   # USB gateway (default)"
echo "  UWB_PORT=/dev/uwb-uart        # Direct UART to DWM1001"
echo "  UWB_MODE=anchor               # anchor (2D position) or tag (distance only)"
echo "  BALL_IDS=ball1,ball2           # UWB tag IDs to track"
echo "  ANCHOR_POS_A1=10,5            # Anchor A1 position in metres"
echo "  ANCHOR_POS_A2=80,10           # Anchor A2 position in metres"
echo "  ANCHOR_POS_A3=140,70          # Anchor A3 position in metres"
echo "  SIMULATE=true                 # Test without hardware"
echo ""
echo "After editing: sudo systemctl daemon-reload && sudo systemctl restart vetfield-hub"
