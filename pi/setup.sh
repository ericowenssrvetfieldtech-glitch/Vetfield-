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
# PRODUCTION ARCHITECTURE: Cart-mounted antennas
#
#   3-4 DWM3000 antennas mounted on the cart roof at known offsets ranging to
#   the UWB tag inside each golf ball. The Pi:
#     • trilaterates ball position in CART FRAME (metres from cart centre)
#     • reads cart GPS from /dev/ttyAMA0 via gpsd
#     • reads cart heading from a magnetometer (I2C) OR GPS course-over-ground
#     • combines the three to give absolute course position
#     • runs shot detection (ball must move >= 0.8m, then settle 1.8s)
#
# RECOMMENDED CART HARDWARE:
#   • 3x Qorvo DWM3000EVB or DWM1001-DEV (one per antenna)
#   • 1x USB hub on the Pi → USB-Serial out of each DWM
#   • 1x u-blox NEO-M8N or similar GPS module on UART (gpsd)
#   • 1x QMC5883L or HMC5883L magnetometer on I2C (optional, for heading at rest)
#   • Power: 5V/3A via cart 12V → buck converter
#
# ANTENNA MOUNTING:
#   Mount antennas on the cart roof in a non-collinear pattern. A "T" layout
#   (front-left, front-right, rear-centre) gives good 2D coverage for ranges
#   of 5-30m which covers any shot from the cart. The geometry constants in
#   /etc/systemd/system/vetfield-hub.service must match the physical mounts.
#
# BALL HARDWARE:
#   • OnCore GENiUS ball (has embedded UWB tag)
#   • Or: standard ball with a Qorvo DWM3001CDK tag (~6mm) glued in the ball core
#   • Each ball reports a unique tag ID (ball1, ball2, ball3, ball4)

# Enable Pi UART for direct DWM1001 connection
if ! grep -q "enable_uart=1" /boot/config.txt 2>/dev/null; then
  echo "enable_uart=1" >> /boot/config.txt
  echo "[5/8] UART enabled (reboot required)"
fi

# Enable I2C for the magnetometer / IMU
if ! grep -q "dtparam=i2c_arm=on" /boot/config.txt 2>/dev/null; then
  echo "dtparam=i2c_arm=on" >> /boot/config.txt
  echo "[5/8] I2C enabled for magnetometer (reboot required)"
fi
modprobe i2c-dev 2>/dev/null || true

# Set udev rules for consistent UWB serial port naming
cat > /etc/udev/rules.d/99-uwb-serial.rules <<'UDEV'
# Qorvo DWM1001/DWM3000 cart antenna gateway (USB-Serial)
SUBSYSTEM=="tty", ATTRS{idVendor}=="10c4", ATTRS{idProduct}=="ea60", SYMLINK+="uwb-gateway0"
SUBSYSTEM=="tty", ATTRS{idVendor}=="10c4", ATTRS{idProduct}=="ea60", ATTRS{devpath}=="?.2", SYMLINK+="uwb-gateway1"
# Direct UART (DWM via Pi GPIO)
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
    "node-gpsd": "^0.3.0",
    "i2c-bus": "^5.2.3"
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
