#!/usr/bin/env bash
# Remaining VPS hardening steps that need the owner's go-ahead. Run with: sudo bash vps-hardening-remaining.sh
# Keep this SSH session open until you've confirmed a NEW ssh login still works.
set -euo pipefail

# 1. SSH: only ubuntu (and the cjay SFTP jail) may log in; fewer guesses per connection; no X11/agent forwarding.
#    TCP forwarding stays on because VS Code Remote needs it.
cat > /etc/ssh/sshd_config.d/01-vps-hardening.conf <<'C'
AllowUsers ubuntu cjay
MaxAuthTries 3
LoginGraceTime 20
MaxStartups 10:30:60
X11Forwarding no
AllowAgentForwarding no
PermitUserEnvironment no
PermitTunnel no
GatewayPorts no
HostbasedAuthentication no
ClientAliveInterval 300
ClientAliveCountMax 3
LogLevel VERBOSE
C
sshd -t
# ssh is socket-activated: reload the daemon if it is running; otherwise the next login starts it with the new config.
systemctl reload ssh.service 2>/dev/null || true
echo "SSH hardened. Test a new login now before closing this session."

# 2. No core dumps (they can contain tokens and DB passwords); /dev/shm without exec.
echo '* hard core 0' > /etc/security/limits.d/90-no-core.conf
grep -q '^tmpfs /dev/shm' /etc/fstab || echo 'tmpfs /dev/shm tmpfs defaults,nodev,nosuid,noexec 0 0' >> /etc/fstab
mount -o remount,nodev,nosuid,noexec /dev/shm

# 3. Unused service and loose secret files.
systemctl disable --now ModemManager.service || true
chmod 600 /home/ubuntu/gangsmanager/.env /home/ubuntu/cg-ticket-bot/.env

echo "Done. Still recommended in a maintenance window: apt upgrade docker-ce containerd.io (restarts every container), then reboot for the new kernel."
