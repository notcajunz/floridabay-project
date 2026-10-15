#!/usr/bin/env bash
# Install the FBRP DDoS shield. Run with: sudo bash /home/ubuntu/fbrp/deploy/ddos-shield/install.sh
# Safe to re-run. If you don't confirm within 3 minutes the firewall part is rolled back automatically,
# so a bad rule can't lock you out of SSH.
#   sudo bash install.sh uninstall   -> remove everything this installed
set -euo pipefail
cd "$(dirname "$(readlink -f "$0")")"
[ "$(id -u)" = 0 ] || { echo "Run with sudo."; exit 1; }

if [ "${1:-}" = uninstall ]; then
	systemctl disable --now fbrp-ddos-shield.service 2>/dev/null || true
	nft delete table inet fbrp_shield 2>/dev/null || true
	rm -f /etc/systemd/system/fbrp-ddos-shield.service /etc/sysctl.d/99-fbrp-ddos.conf /etc/fbrp/ddos-shield.nft
	systemctl daemon-reload
	echo "Removed. Kernel settings return to normal on next reboot (or: sudo sysctl --system)."
	exit 0
fi

echo "== Checking ruleset syntax"
nft -c -f ddos-shield.nft

echo "== Installing files"
install -d -m 755 /etc/fbrp
install -m 644 ddos-shield.nft /etc/fbrp/ddos-shield.nft
install -m 644 99-fbrp-ddos.conf /etc/sysctl.d/99-fbrp-ddos.conf
install -m 644 fbrp-ddos-shield.service /etc/systemd/system/fbrp-ddos-shield.service
systemctl daemon-reload

systemctl stop fbrp-ddos-shield-rollback.timer 2>/dev/null || true
echo "== Starting shield (rollback armed: 180s)"
systemd-run --quiet --unit=fbrp-ddos-shield-rollback --on-active=180 \
	/bin/sh -c 'systemctl stop fbrp-ddos-shield.service; nft delete table inet fbrp_shield 2>/dev/null; true'
systemctl restart fbrp-ddos-shield.service

cat <<'MSG'

Shield is ON. Now, within 3 minutes, check from your own PC:
  1. Open a NEW ssh session to the VPS (keep this one open).
  2. Open https://floridabay.net and https://tx.floridabay.net
  3. Connect to the FiveM server.
MSG
read -r -t 170 -p "Type yes if all of that works: " ok || ok=""
if [ "$ok" = yes ]; then
	systemctl stop fbrp-ddos-shield-rollback.timer 2>/dev/null || true
	systemctl enable fbrp-ddos-shield.service >/dev/null
	echo "Confirmed. Shield enabled and will load on every boot."
	echo "Watch it with: sudo nft list table inet fbrp_shield | grep -E 'counter packets [1-9]'"
else
	systemctl stop fbrp-ddos-shield-rollback.timer 2>/dev/null || true
	systemctl stop fbrp-ddos-shield.service || true
	nft delete table inet fbrp_shield 2>/dev/null || true
	echo "Not confirmed: firewall rules rolled back. Kernel tuning stays applied (harmless)."
	exit 1
fi
