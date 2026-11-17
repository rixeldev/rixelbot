#!/usr/bin/env bash
# Installs or updates RixelBot as a hardened systemd service.
# Run from the repository checkout with: sudo ./deploy/install.sh
set -euo pipefail

SERVICE_USER="rixelbot"
INSTALL_DIR="/opt/rixelbot"
STATE_DIR="/var/lib/rixelbot"
ENV_FILE="/etc/rixelbot.env"
SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ ${EUID} -ne 0 ]]; then
  echo "Run this script with sudo." >&2
  exit 1
fi

if ! id -u "$SERVICE_USER" >/dev/null 2>&1; then
  useradd --system \
    --home-dir "$STATE_DIR" \
    --shell "$(command -v nologin || echo /usr/bin/nologin)" \
    "$SERVICE_USER"
fi

install -d -o root -g root -m 0755 "$INSTALL_DIR"
install -d -o "$SERVICE_USER" -g "$SERVICE_USER" -m 0750 "$STATE_DIR"

# Copy the source tree, leaving local secrets and state behind.
rsync -a --delete \
  --exclude ".git" \
  --exclude "node_modules" \
  --exclude ".env" \
  --exclude "data/audit" \
  "$SOURCE_DIR/" "$INSTALL_DIR/"

chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR"
sudo -u "$SERVICE_USER" npm ci --omit=dev --prefix "$INSTALL_DIR"
chown -R root:root "$INSTALL_DIR"
chmod -R go-w "$INSTALL_DIR"

if [[ ! -f "$ENV_FILE" ]]; then
  if [[ -f "$SOURCE_DIR/.env" ]]; then
    install -o root -g "$SERVICE_USER" -m 0640 "$SOURCE_DIR/.env" "$ENV_FILE"
  else
    install -o root -g "$SERVICE_USER" -m 0640 \
      "$SOURCE_DIR/deploy/rixelbot.env.example" "$ENV_FILE"
  fi
fi

install -m 0644 "$SOURCE_DIR/deploy/rixelbot.service" \
  /etc/systemd/system/rixelbot.service
install -m 0644 "$SOURCE_DIR/deploy/rixelbot-monitor.service" \
  /etc/systemd/system/rixelbot-monitor.service
install -m 0644 "$SOURCE_DIR/deploy/rixelbot-monitor.timer" \
  /etc/systemd/system/rixelbot-monitor.timer

systemctl daemon-reload
systemctl enable rixelbot.service
systemctl restart rixelbot.service
systemctl enable --now rixelbot-monitor.timer

echo "RixelBot installed."
echo "  status:  systemctl status rixelbot"
echo "  logs:    journalctl -u rixelbot -f"
echo "  env:     $ENV_FILE"
