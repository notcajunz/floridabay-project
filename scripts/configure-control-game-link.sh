#!/usr/bin/env bash
# Attach the control VPS to an already-provisioned FBRP game VPS.
# Run interactively on the control VPS as ubuntu.

set -Eeuo pipefail
IFS=$'\n\t'

readonly ROOT=/home/ubuntu/fbrp
readonly CONFIG=/home/ubuntu/.config/fbrp-split.env
readonly KEY=/home/ubuntu/.ssh/fbrp-game
readonly DB_PORT=13307
readonly GAME_PORT=30121
readonly TXADMIN_PORT=40121
readonly REVERSE_SSH_PORT=2222
readonly GAME_TARGET="${1:-}"

die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
log() { printf '\n==> %s\n' "$*"; }

[[ "$(id -un)" == ubuntu ]] || die 'Run this script as ubuntu, not root.'
[[ -f "$CONFIG" ]] || die "Missing $CONFIG; finish control VPS setup first."
# shellcheck disable=SC1090
source "$CONFIG"
[[ "${FBRP_ROLE:-}" == control ]] || die 'This is not the control VPS.'
[[ "$GAME_TARGET" == ubuntu@* ]] || die 'Usage: configure-control-game-link.sh ubuntu@GAME_IP'
[[ "$GAME_TARGET" != *:* ]] || die 'Use the normal SSH port (22) while attaching the game VPS.'
command -v autossh >/dev/null || die 'autossh is not installed.'
command -v sshfs >/dev/null || die 'sshfs is not installed.'

install -d -m 0700 /home/ubuntu/.ssh
if [[ ! -f "$KEY" ]]; then
  log 'Creating the dedicated control-to-game SSH key'
  ssh-keygen -q -t ed25519 -N '' -C fbrp-control-to-game -f "$KEY"
fi
chmod 600 "$KEY"
chmod 644 "${KEY}.pub"

if ! ssh -i "$KEY" -o BatchMode=yes -o ConnectTimeout=8 -o StrictHostKeyChecking=accept-new \
  "$GAME_TARGET" true 2>/dev/null; then
  log 'Installing the control key on the game VPS (enter its ubuntu password once)'
  ssh-copy-id -i "${KEY}.pub" "$GAME_TARGET"
fi
ssh -i "$KEY" -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new \
  "$GAME_TARGET" 'test "$(id -un)" = ubuntu' \
  || die 'Key login to the game VPS failed.'

game_host="${GAME_TARGET#*@}"
ssh-keygen -R "$game_host" >/dev/null 2>&1 || true
ssh-keyscan -H "$game_host" >>/home/ubuntu/.ssh/known_hosts 2>/dev/null
sort -u /home/ubuntu/.ssh/known_hosts -o /home/ubuntu/.ssh/known_hosts

log 'Installing the persistent encrypted tunnel'
cat >/home/ubuntu/.config/systemd/user/fbrp-game-tunnel.service <<EOF
[Unit]
Description=FBRP encrypted control-to-game tunnel
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
Environment=AUTOSSH_GATETIME=0
ExecStart=/usr/bin/autossh -M 0 -N -T -i $KEY -o BatchMode=yes -o ExitOnForwardFailure=yes -o ServerAliveInterval=15 -o ServerAliveCountMax=3 -o StrictHostKeyChecking=yes -L 127.0.0.1:$DB_PORT:127.0.0.1:3307 -L 127.0.0.1:$GAME_PORT:127.0.0.1:30120 -L 127.0.0.1:$TXADMIN_PORT:127.0.0.1:40120 -R 127.0.0.1:$REVERSE_SSH_PORT:127.0.0.1:22 $GAME_TARGET
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
EOF

write_mount_unit() {
  local name="$1" remote_path="$2" local_path="$3"
  cat >"/home/ubuntu/.config/systemd/user/${name}.service" <<EOF
[Unit]
Description=FBRP game data mount: $remote_path
After=fbrp-game-tunnel.service
Requires=fbrp-game-tunnel.service

[Service]
Type=simple
ExecStartPre=/usr/bin/mkdir -p $local_path
ExecStart=/usr/bin/sshfs -f -o reconnect,ServerAliveInterval=15,ServerAliveCountMax=3,IdentityFile=$KEY,IdentitiesOnly=yes,StrictHostKeyChecking=yes $GAME_TARGET:$remote_path $local_path
ExecStop=/bin/fusermount3 -u $local_path
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
EOF
}

prepare_mountpoint() {
  local name="$1" local_path="$2" backup_path="${2}.pre-game-mount"
  systemctl --user stop "${name}.service" 2>/dev/null || true
  if mountpoint -q "$local_path"; then
    fusermount3 -u "$local_path"
  fi
  if [[ -d "$local_path" ]] && find "$local_path" -mindepth 1 -print -quit | grep -q .; then
    [[ ! -e "$backup_path" ]] \
      || die "Cannot preserve nonempty mountpoint because backup already exists: $backup_path"
    mv "$local_path" "$backup_path"
  fi
  mkdir -p "$local_path"
}

vehicles="$ROOT/server-data/resources/[vehicles]"
eup="$ROOT/server-data/resources/[eup]"
vmenu="$ROOT/server-data/resources/[standalone]/vMenu/config"
for remote_path in "$vehicles" "$eup" "$vmenu"; do
  ssh -i "$KEY" -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=yes \
    "$GAME_TARGET" 'test -d "$1"' _ "$remote_path" \
    || die "Missing authoritative game directory: $remote_path"
done
prepare_mountpoint fbrp-vehicles-sshfs "$vehicles"
prepare_mountpoint fbrp-eup-sshfs "$eup"
prepare_mountpoint fbrp-vmenu-config-sshfs "$vmenu"
write_mount_unit fbrp-vehicles-sshfs "$vehicles" "$vehicles"
write_mount_unit fbrp-eup-sshfs "$eup" "$eup"
write_mount_unit fbrp-vmenu-config-sshfs "$vmenu" "$vmenu"

log 'Recording the game endpoint without placing it in Git'
temporary="$(mktemp "${CONFIG}.tmp.XXXXXX")"
awk -v target="$GAME_TARGET" '
  BEGIN { found = 0 }
  /^FBRP_GAME_SSH=/ { print "FBRP_GAME_SSH=" target; found = 1; next }
  { print }
  END { if (!found) print "FBRP_GAME_SSH=" target }
' "$CONFIG" >"$temporary"
chmod 600 "$temporary"
mv "$temporary" "$CONFIG"

set_env() {
  local file="$1" key="$2" value="$3" tmp
  tmp="$(mktemp "${file}.tmp.XXXXXX")"
  awk -v wanted="$key" -v replacement="$value" '
    BEGIN { found = 0 }
    index($0, wanted "=") == 1 { print wanted "=" replacement; found = 1; next }
    { print }
    END { if (!found) print wanted "=" replacement }
  ' "$file" >"$tmp"
  chmod --reference="$file" "$tmp"
  mv "$tmp" "$file"
}
set_env "$ROOT/services/fbrp-bot/.env" FBRP_GAME_SSH "$GAME_TARGET"
set_env "$ROOT/services/fbrp-bot/.env" FBRP_GAME_SSH_KEY "$KEY"

systemctl --user daemon-reload
systemctl --user enable --now fbrp-game-tunnel.service
for _ in {1..20}; do
  systemctl --user is-active --quiet fbrp-game-tunnel.service && break
  sleep 1
done
systemctl --user is-active --quiet fbrp-game-tunnel.service \
  || die 'The encrypted tunnel did not start.'

systemctl --user enable --now \
  fbrp-vehicles-sshfs.service \
  fbrp-eup-sshfs.service \
  fbrp-vmenu-config-sshfs.service

for path in "$vehicles" "$eup" "$vmenu"; do
  mountpoint -q "$path" || die "SSHFS mount failed: $path"
done

log 'Control/game link complete'
printf 'MariaDB:   127.0.0.1:%s\n' "$DB_PORT"
printf 'FiveM API: 127.0.0.1:%s\n' "$GAME_PORT"
printf 'txAdmin:   127.0.0.1:%s\n' "$TXADMIN_PORT"
printf 'Mounted: vehicles/liveries, EUP, and vMenu addon configuration\n'
