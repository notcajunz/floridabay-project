#!/usr/bin/env bash
# Migrate Florida Bay RP from this all-in-one source VPS to:
#   1. a control VPS (website, API, Discord bots, Git, Caddy), and
#   2. a game VPS (FXServer, txAdmin, MariaDB, FiveM resources).
#
# Run this script only on the original/source VPS as user ubuntu.

set -Eeuo pipefail
IFS=$'\n\t'

readonly SOURCE_ROOT="/home/ubuntu/fbrp"
readonly SSH_DIR="/home/ubuntu/.ssh"
readonly CONTROL_KEY="${SSH_DIR}/fbrp-migrate-control"
readonly GAME_KEY="${SSH_DIR}/fbrp-migrate-game"
readonly SOURCE_BRIDGE_UNIT="/home/ubuntu/.config/systemd/user/fbrp-cutover-web-bridge.service"
readonly BACKUP_ROOT="${SOURCE_ROOT}/backups/three-vps-migration"
readonly CONTROL_DB_PORT="13307"
readonly CONTROL_GAME_PORT="30121"
readonly CONTROL_TXADMIN_PORT="40121"
readonly GAME_REVERSE_SSH_PORT="2222"

readonly -a CONTROL_USER_UNITS=(
  businesses-bot.service
  departments-armedforces-bot.service
  departments-bot.service
  dohs-bot.service
  devops-bot.service
  gangs-bot.service
  iaa-bot.service
  personals-bot.service
  role-manager-bot.service
  staff-bot.service
)

COMMAND="${1:-help}"
CONTROL_TARGET="${2:-}"
GAME_TARGET="${3:-}"

log() {
  printf '\n\033[1;36m==> %s\033[0m\n' "$*"
}

warn() {
  printf '\033[1;33mWARNING: %s\033[0m\n' "$*" >&2
}

die() {
  printf '\033[1;31mERROR: %s\033[0m\n' "$*" >&2
  exit 1
}

usage() {
  cat <<'EOF'
Florida Bay RP three-VPS migration

Run on the ORIGINAL/source VPS:

  ./scripts/three-vps-migration.sh prepare ubuntu@CONTROL_IP ubuntu@GAME_IP
  ./scripts/three-vps-migration.sh cutover ubuntu@CONTROL_IP ubuntu@GAME_IP
  ./scripts/three-vps-migration.sh verify  ubuntu@CONTROL_IP ubuntu@GAME_IP
  ./scripts/three-vps-migration.sh rollback ubuntu@CONTROL_IP ubuntu@GAME_IP
  ./scripts/three-vps-migration.sh retire-source ubuntu@CONTROL_IP ubuntu@GAME_IP

Commands:
  prepare        Provision both clean VPSs, pre-copy data, create the encrypted
                 control/game link, install services, and create agent workspaces.
                 Production remains on this source VPS.
  cutover        Stop source writers, perform final copies and database transfer,
                 then start production on the two new VPSs.
  verify         Run read-only service, tunnel, database, API, and game checks.
  rollback       Stop new production and restart the unchanged source deployment.
                 Safe only before new production data is created.
  retire-source  Stop the temporary source web bridge and old FBRP MariaDB after
                 the new deployment has been stable and DNS has fully moved.

Scope:
  This moves only Florida Bay RP. It does not modify or migrate AICaller,
  ExeclyAI, Corevia infrastructure, Ascent, or other projects on the source VPS.
EOF
}

require_source() {
  [[ "$(id -un)" == ubuntu ]] || die "Run this script as ubuntu, not root."
  [[ -d "${SOURCE_ROOT}/.git" ]] || die "${SOURCE_ROOT} is not the expected Git repository."
  [[ -f "${SOURCE_ROOT}/services/fbrp-bot/.env" ]] || die "The central bot environment is missing."
  [[ -f "${SOURCE_ROOT}/server-data/secrets.cfg" ]] || die "The FiveM secret configuration is missing."
  [[ -x "${SOURCE_ROOT}/artifacts/run.sh" ]] || die "FXServer artifacts are missing."
  command -v ssh >/dev/null || die "ssh is not installed."
  command -v rsync >/dev/null || die "rsync is not installed."
}

require_clean_source() {
  [[ "$(git -C "$SOURCE_ROOT" branch --show-current)" == main ]] \
    || die "The source repository must be on the main branch."
  [[ -z "$(git -C "$SOURCE_ROOT" status --porcelain)" ]] \
    || die "Commit or intentionally remove all source worktree changes before prepare/cutover."
}

require_targets() {
  [[ -n "$CONTROL_TARGET" && -n "$GAME_TARGET" ]] \
    || die "Provide both targets: ubuntu@CONTROL_IP ubuntu@GAME_IP"
  [[ "$CONTROL_TARGET" == ubuntu@* && "$GAME_TARGET" == ubuntu@* ]] \
    || die "Both SSH targets must use the ubuntu account."
  [[ "$CONTROL_TARGET" != *:* && "$GAME_TARGET" != *:* ]] \
    || die "Custom SSH ports are not supported; use SSH port 22 during migration."
  [[ "$CONTROL_TARGET" != "$GAME_TARGET" ]] || die "Control and game targets must be different VPSs."
}

ssh_with_key() {
  local target="$1" key="$2"
  shift 2
  ssh -i "$key" \
    -o BatchMode=yes \
    -o ConnectTimeout=15 \
    -o ServerAliveInterval=15 \
    -o ServerAliveCountMax=3 \
    -o StrictHostKeyChecking=accept-new \
    "$target" "$@"
}

remote_script() {
  local target="$1" key="$2"
  shift 2
  ssh -i "$key" \
    -o BatchMode=yes \
    -o ConnectTimeout=15 \
    -o ServerAliveInterval=15 \
    -o ServerAliveCountMax=3 \
    -o StrictHostKeyChecking=accept-new \
    "$target" bash -s -- "$@"
}

control_ssh() {
  ssh_with_key "$CONTROL_TARGET" "$CONTROL_KEY" "$@"
}

game_ssh() {
  ssh_with_key "$GAME_TARGET" "$GAME_KEY" "$@"
}

control_script() {
  remote_script "$CONTROL_TARGET" "$CONTROL_KEY" "$@"
}

game_script() {
  remote_script "$GAME_TARGET" "$GAME_KEY" "$@"
}

rsync_shell() {
  local key="$1"
  printf 'ssh -i %q -o BatchMode=yes -o ConnectTimeout=15 -o ServerAliveInterval=15 -o ServerAliveCountMax=3 -o StrictHostKeyChecking=accept-new' "$key"
}

install_source_prerequisites() {
  log "Installing source-side migration prerequisites"
  sudo apt-get update
  sudo apt-get install -y autossh openssh-client rsync
  install -d -m 0700 "$SSH_DIR"
  install -d -m 0755 /home/ubuntu/.config/systemd/user
}

verify_clean_target() {
  local target="$1" role="$2" local_machine_id remote_machine_id
  local_machine_id="$(</etc/machine-id)"
  log "Validating the clean ${role} VPS: ${target}"
  remote_machine_id="$(ssh \
    -o BatchMode=yes \
    -o ConnectTimeout=15 \
    -o StrictHostKeyChecking=accept-new \
    "$target" '
      set -e
      test "$(id -un)" = ubuntu
      sudo -n true
      . /etc/os-release
      test "$ID" = ubuntu
      test "$VERSION_ID" = 22.04
      test "$(dpkg --print-architecture)" = amd64
      cat /etc/machine-id
    ')" || die "${role} validation failed. It must be Ubuntu 22.04 AMD64 with ubuntu and passwordless sudo."
  [[ "$remote_machine_id" != "$local_machine_id" ]] || die "The ${role} target is this source VPS."

  ssh \
    -o BatchMode=yes \
    -o ConnectTimeout=15 \
    -o StrictHostKeyChecking=accept-new \
    "$target" bash -s -- "$role" <<'REMOTE'
set -Eeuo pipefail
role="$1"
marker="/home/ubuntu/fbrp/.three-vps-${role}-target"
if [[ -d /home/ubuntu/fbrp ]] \
  && [[ -n "$(find /home/ubuntu/fbrp -mindepth 1 -maxdepth 1 -print -quit)" ]] \
  && [[ ! -f "$marker" ]]; then
  echo "ERROR: /home/ubuntu/fbrp is nonempty and was not created by this migration." >&2
  exit 1
fi
mkdir -p /home/ubuntu/fbrp
touch "$marker"
REMOTE
}

install_migration_key() {
  local target="$1" key="$2" comment="$3"
  if [[ ! -f "$key" ]]; then
    ssh-keygen -q -t ed25519 -N '' -C "$comment" -f "$key"
  fi
  chmod 600 "$key"
  chmod 644 "${key}.pub"

  local public_key
  public_key="$(<"${key}.pub")"
  printf '%s\n' "$public_key" | ssh \
    -o BatchMode=yes \
    -o ConnectTimeout=15 \
    -o StrictHostKeyChecking=accept-new \
    "$target" '
      set -e
      umask 077
      mkdir -p /home/ubuntu/.ssh
      touch /home/ubuntu/.ssh/authorized_keys
      IFS= read -r key
      grep -qxF "$key" /home/ubuntu/.ssh/authorized_keys \
        || printf "%s\n" "$key" >> /home/ubuntu/.ssh/authorized_keys
    '
  ssh_with_key "$target" "$key" 'printf "dedicated-key-ok\n"'
}

provision_common() {
  local target="$1" key="$2" role="$3"
  log "Provisioning the ${role} VPS"
  remote_script "$target" "$key" "$role" <<'REMOTE'
set -Eeuo pipefail
role="$1"

sudo apt-get update
sudo apt-get install -y \
  ca-certificates \
  curl \
  git \
  gnupg \
  jq \
  libatomic1 \
  openssl \
  python3 \
  python3-pip \
  python3-venv \
  ripgrep \
  rsync \
  software-properties-common \
  tmux \
  ufw \
  unzip \
  xz-utils

curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
sudo add-apt-repository -y ppa:deadsnakes/ppa
sudo apt-get update
sudo apt-get install -y python3.12 python3.12-dev python3.12-venv

node_major="$(node -p 'Number(process.versions.node.split(".")[0])')"
if (( node_major < 22 )); then
  echo "ERROR: Ubuntu supplied Node $(node --version); Node 22 or newer is required." >&2
  exit 1
fi

npm config set prefix /home/ubuntu/.local
mkdir -p /home/ubuntu/.local/bin
export PATH="/home/ubuntu/.local/bin:$PATH"
grep -qxF 'export PATH="/home/ubuntu/.local/bin:$PATH"' /home/ubuntu/.profile 2>/dev/null \
  || printf '\nexport PATH="/home/ubuntu/.local/bin:$PATH"\n' >> /home/ubuntu/.profile
npm install -g @openai/codex@latest @anthropic-ai/claude-code

sudo loginctl enable-linger ubuntu
sudo install -d -o ubuntu -g ubuntu -m 0750 /home/ubuntu/fbrp /home/ubuntu/work
install -d -m 0700 /home/ubuntu/.ssh
install -d -m 0755 /home/ubuntu/.config/systemd/user /home/ubuntu/.config

sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
if ! command -v caddy >/dev/null 2>&1; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | sudo gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    | sudo tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  sudo chmod o+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  sudo chmod o+r /etc/apt/sources.list.d/caddy-stable.list
  sudo apt-get update
  sudo apt-get install -y caddy
fi
sudo systemctl disable --now caddy 2>/dev/null || true
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 443/udp
if [[ "$role" == control ]]; then
  sudo apt-get install -y autossh sshfs
else
  if ! command -v docker >/dev/null 2>&1; then
    sudo install -m 0755 -d /etc/apt/keyrings
    sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
    sudo chmod a+r /etc/apt/keyrings/docker.asc
    . /etc/os-release
    arch="$(dpkg --print-architecture)"
    sudo tee /etc/apt/sources.list.d/docker.sources >/dev/null <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: ${UBUNTU_CODENAME:-$VERSION_CODENAME}
Components: stable
Architectures: ${arch}
Signed-By: /etc/apt/keyrings/docker.asc
EOF
    sudo apt-get update
    sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  fi
  sudo systemctl enable --now docker
  sudo usermod -aG docker ubuntu
  sudo ufw allow 30120/tcp
  sudo ufw allow 30120/udp
fi
sudo ufw --force enable

printf 'role=%s host=%s ubuntu=%s arch=%s node=%s\n' \
  "$role" "$(hostname)" "$(. /etc/os-release && echo "$VERSION_ID")" \
  "$(dpkg --print-architecture)" "$(node --version)"
codex --version
claude --version
REMOTE
}

copy_control_files() {
  log "Copying the control-plane project snapshot"
  local shell_cmd
  shell_cmd="$(rsync_shell "$CONTROL_KEY")"
  rsync -aH --info=progress2 --delete \
    --exclude '/.three-vps-control-target' \
    --exclude '/.sync/' \
    --exclude '/artifacts/' \
    --exclude '/backups/' \
    --exclude '/.env' \
    --exclude '/snapshots/' \
    --exclude '/txData/' \
    --exclude '/server-data/server.cfg*' \
    --exclude '/server-data/secrets.cfg*' \
    --exclude '/server-data/cache/' \
    --exclude '*.log' \
    --exclude '*.pid' \
    --exclude '**/node_modules/' \
    --exclude '**/.venv/' \
    --exclude '**/.pytest_cache/' \
    -e "$shell_cmd" \
    "${SOURCE_ROOT}/" \
    "${CONTROL_TARGET}:${SOURCE_ROOT}/"
}

copy_game_files() {
  log "Copying the game-plane project snapshot"
  local shell_cmd
  shell_cmd="$(rsync_shell "$GAME_KEY")"
  rsync -aH --info=progress2 --delete \
    --exclude '/.three-vps-game-target' \
    --exclude '/.sync/' \
    --exclude '/backups/' \
    --exclude '/snapshots/' \
    --exclude '/server-data/cache/' \
    --exclude '/txData/default/logs/' \
    --exclude '*.log' \
    --exclude '*.pid' \
    --exclude '**/node_modules/' \
    --exclude '**/.venv/' \
    --exclude '**/.pytest_cache/' \
    -e "$shell_cmd" \
    "${SOURCE_ROOT}/" \
    "${GAME_TARGET}:${SOURCE_ROOT}/"
}

configure_control_game_link() {
  log "Creating the persistent encrypted control-to-game link"
  local game_host="${GAME_TARGET#*@}" control_to_game_pub game_to_control_pub

  control_script <<'REMOTE'
set -Eeuo pipefail
install -d -m 0700 /home/ubuntu/.ssh
if [[ ! -f /home/ubuntu/.ssh/fbrp-game ]]; then
  ssh-keygen -q -t ed25519 -N '' -C fbrp-control-to-game -f /home/ubuntu/.ssh/fbrp-game
fi
chmod 600 /home/ubuntu/.ssh/fbrp-game
chmod 644 /home/ubuntu/.ssh/fbrp-game.pub
REMOTE
  control_to_game_pub="$(control_ssh 'cat /home/ubuntu/.ssh/fbrp-game.pub')"
  # Variables in this program expand on the remote host.
  # shellcheck disable=SC2016
  printf '%s\n' "$control_to_game_pub" | game_ssh '
    set -e
    umask 077
    mkdir -p /home/ubuntu/.ssh
    touch /home/ubuntu/.ssh/authorized_keys
    IFS= read -r key
    grep -qxF "$key" /home/ubuntu/.ssh/authorized_keys || printf "%s\n" "$key" >> /home/ubuntu/.ssh/authorized_keys
  '

  control_script "$game_host" "$CONTROL_DB_PORT" "$CONTROL_GAME_PORT" "$CONTROL_TXADMIN_PORT" "$GAME_REVERSE_SSH_PORT" <<'REMOTE'
set -Eeuo pipefail
game_host="$1"
db_port="$2"
game_port="$3"
tx_port="$4"
reverse_port="$5"
ssh-keyscan -H "$game_host" >> /home/ubuntu/.ssh/known_hosts 2>/dev/null
sort -u /home/ubuntu/.ssh/known_hosts -o /home/ubuntu/.ssh/known_hosts
cat >/home/ubuntu/.config/systemd/user/fbrp-game-tunnel.service <<EOF
[Unit]
Description=FBRP encrypted tunnel from control VPS to game VPS
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
Environment=AUTOSSH_GATETIME=0
ExecStart=/usr/bin/autossh -M 0 -N -T -i /home/ubuntu/.ssh/fbrp-game -o BatchMode=yes -o ExitOnForwardFailure=yes -o ServerAliveInterval=15 -o ServerAliveCountMax=3 -o StrictHostKeyChecking=yes -L 127.0.0.1:${db_port}:127.0.0.1:3307 -L 127.0.0.1:${game_port}:127.0.0.1:30120 -L 127.0.0.1:${tx_port}:127.0.0.1:40120 -R 127.0.0.1:${reverse_port}:127.0.0.1:22 ubuntu@${game_host}
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
EOF
systemctl --user daemon-reload
systemctl --user enable --now fbrp-game-tunnel.service
sleep 2
systemctl --user is-active --quiet fbrp-game-tunnel.service
REMOTE

  game_script <<'REMOTE'
set -Eeuo pipefail
install -d -m 0700 /home/ubuntu/.ssh
if [[ ! -f /home/ubuntu/.ssh/fbrp-control ]]; then
  ssh-keygen -q -t ed25519 -N '' -C fbrp-game-to-control -f /home/ubuntu/.ssh/fbrp-control
fi
chmod 600 /home/ubuntu/.ssh/fbrp-control
chmod 644 /home/ubuntu/.ssh/fbrp-control.pub
REMOTE
  game_to_control_pub="$(game_ssh 'cat /home/ubuntu/.ssh/fbrp-control.pub')"
  # Variables in this program expand on the remote host.
  # shellcheck disable=SC2016
  printf '%s\n' "$game_to_control_pub" | control_ssh '
    set -e
    umask 077
    mkdir -p /home/ubuntu/.ssh
    touch /home/ubuntu/.ssh/authorized_keys
    IFS= read -r key
    grep -qxF "$key" /home/ubuntu/.ssh/authorized_keys || printf "%s\n" "$key" >> /home/ubuntu/.ssh/authorized_keys
  '

  game_script "$GAME_REVERSE_SSH_PORT" <<'REMOTE'
set -Eeuo pipefail
port="$1"
touch /home/ubuntu/.ssh/config
chmod 600 /home/ubuntu/.ssh/config
if ! grep -q '^Host fbrp-control-tunnel$' /home/ubuntu/.ssh/config; then
  cat >>/home/ubuntu/.ssh/config <<EOF

Host fbrp-control-tunnel
    HostName 127.0.0.1
    Port ${port}
    User ubuntu
    IdentityFile /home/ubuntu/.ssh/fbrp-control
    IdentitiesOnly yes
    StrictHostKeyChecking accept-new
EOF
fi
ssh -o BatchMode=yes fbrp-control-tunnel 'printf reverse-link-ok' >/dev/null
REMOTE
}

configure_control_runtime() {
  log "Configuring control-VPS dependencies, environments, services, and Caddy"
  control_script "$GAME_TARGET" "$CONTROL_DB_PORT" "$CONTROL_GAME_PORT" "$CONTROL_TXADMIN_PORT" <<'REMOTE'
set -Eeuo pipefail
game_target="$1"
db_port="$2"
game_port="$3"
tx_port="$4"
root=/home/ubuntu/fbrp

set_env() {
  local file="$1" key="$2" value="$3" temporary
  [[ -f "$file" ]] || { echo "Missing $file" >&2; exit 1; }
  temporary="$(mktemp "${file}.tmp.XXXXXX")"
  awk -v wanted="$key" -v replacement="$value" '
    BEGIN { found = 0 }
    index($0, wanted "=") == 1 { print wanted "=" replacement; found = 1; next }
    { print }
    END { if (!found) print wanted "=" replacement }
  ' "$file" >"$temporary"
  chmod --reference="$file" "$temporary"
  mv "$temporary" "$file"
}

set_env "$root/services/fbrp-bot/.env" MARIADB_HOST 127.0.0.1
set_env "$root/services/fbrp-bot/.env" MARIADB_PORT "$db_port"
set_env "$root/services/fbrp-bot/.env" FBRP_FIVEM_ORIGIN "http://127.0.0.1:${game_port}/fbrp_core"
set_env "$root/services/fbrp-bot/.env" FBRP_PANEL_HOST 127.0.0.1
set_env "$root/services/fbrp-bot/.env" FBRP_PANEL_PORT 8080
set_env "$root/services/fbrp-bot/.env" FBRP_GAME_SSH "$game_target"
set_env "$root/services/fbrp-bot/.env" FBRP_GAME_SSH_KEY /home/ubuntu/.ssh/fbrp-game
set_env "$root/services/fbrp-bot/.env" FBRP_VEHICLES_DIR "$root/server-data/resources/[vehicles]"
set_env "$root/services/fbrp-bot/.env" FBRP_EUP_DIR "$root/server-data/resources/[eup]"
set_env "$root/services/fbrp-bot/.env" FBRP_VMENU_ADDONS "$root/server-data/resources/[standalone]/vMenu/config/addons.json"
for manager in businessmanager gangsmanager deptmanager; do
  set_env "$root/services/$manager/.env" FBRP_API_URL http://127.0.0.1:8080
done
chmod 600 \
  "$root/services/fbrp-bot/.env" \
  "$root/services/businessmanager/.env" \
  "$root/services/gangsmanager/.env" \
  "$root/services/deptmanager/.env" \
  "$root/services/dohsbot/.env"

cd "$root"
npm --prefix services/fbrp-bot ci
for manager in businessmanager gangsmanager deptmanager dohsbot; do
  python3.12 -m venv "$root/services/$manager/.venv"
  "${root}/services/${manager}/.venv/bin/pip" install --disable-pip-version-check -e "${root}/services/${manager}[dev]"
done

sudo tee /etc/systemd/system/fbrp-bot.service >/dev/null <<EOF
[Unit]
Description=Florida Bay Roleplay centralized bot, API, and website
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=ubuntu
Group=ubuntu
WorkingDirectory=${root}/services/fbrp-bot
EnvironmentFile=${root}/services/fbrp-bot/.env
ExecStartPre=/usr/bin/bash -c 'mountpoint -q "${root}/server-data/resources/[vehicles]" && mountpoint -q "${root}/server-data/resources/[eup]" && mountpoint -q "${root}/server-data/resources/[standalone]/vMenu/config"'
ExecStartPre=/usr/bin/bash -c 'for i in {1..90}; do (exec 3<>/dev/tcp/127.0.0.1/${db_port}) 2>/dev/null && exit 0; sleep 2; done; exit 1'
ExecStartPre=/usr/bin/node ${root}/services/fbrp-bot/src/migrate.js
ExecStart=/usr/bin/node ${root}/services/fbrp-bot/src/index.js
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=${root}
UMask=0077

[Install]
WantedBy=multi-user.target
EOF

write_user_unit() {
  local name="$1" description="$2" workdir="$3" command="$4" environment_lines="${5:-}"
  cat >"/home/ubuntu/.config/systemd/user/${name}.service" <<EOF
[Unit]
Description=${description}
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=${workdir}
${environment_lines}
ExecStart=${command}
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
EOF
}

write_user_unit businesses-bot 'FBRP Business Manager Discord bot' "$root/services/businessmanager" "$root/services/businessmanager/.venv/bin/python -m businessbot"
write_user_unit departments-armedforces-bot 'FBRP Department Manager Discord bot (Armed Forces)' "$root/services/deptmanager" "$root/services/deptmanager/.venv/bin/python -m deptbot" "Environment=CONFIG_PATH=config.armedforces.toml
Environment=DATABASE_PATH=department_manager_armedforces.db"
write_user_unit departments-bot 'FBRP Department Manager Discord bot' "$root/services/deptmanager" "$root/services/deptmanager/.venv/bin/python -m deptbot"
write_user_unit dohs-bot 'FBRP DOHS Assistant Discord bot' "$root/services/dohsbot" "$root/services/dohsbot/.venv/bin/python -m dohsbot" "EnvironmentFile=-$root/services/deptmanager/.env
EnvironmentFile=$root/services/dohsbot/.env"
write_user_unit gangs-bot 'FBRP Gang Manager Discord bot' "$root/services/gangsmanager" "$root/services/gangsmanager/.venv/bin/python -m gangbot"
write_user_unit devops-bot 'FBRP DevOps Discord bot' "$root/services/fbrp-bot" "/usr/bin/node --env-file=.env src/devops/index.js"
write_user_unit iaa-bot 'FBRP IAA Systems Discord bot' "$root/services/fbrp-bot" "/usr/bin/node --env-file=.env src/iaa/index.js"
write_user_unit personals-bot 'FBRP Vehicle Manager Discord bot' "$root/services/fbrp-bot" "/usr/bin/node --env-file=.env src/personals-bot.js"
write_user_unit role-manager-bot 'FBRP Role Manager Discord bot' "$root/services/fbrp-bot" "/usr/bin/node --env-file=.env src/role-manager-bot.js"
write_user_unit staff-bot 'FBRP Staff Assistant Discord bot' "$root/services/fbrp-bot" "/usr/bin/node --env-file=.env src/staff/index.js"

sudo tee /etc/caddy/Caddyfile >/dev/null <<EOF
{
  email admin@floridabay.net
  servers {
    protocols h1 h2 h3
  }
}

floridabay.net {
  encode zstd gzip
  request_body {
    max_size 2MB
  }
  header {
    Strict-Transport-Security "max-age=31536000; includeSubDomains"
    X-Content-Type-Options nosniff
    Referrer-Policy strict-origin-when-cross-origin
    X-Frame-Options DENY
    Permissions-Policy "camera=(), microphone=(), geolocation=()"
    -Server
  }
  reverse_proxy 127.0.0.1:8080
}

www.floridabay.net {
  redir https://floridabay.net{uri} permanent
}

store.floridabay.net {
  encode zstd gzip
  request_body {
    max_size 1MB
  }
  header {
    Strict-Transport-Security "max-age=31536000; includeSubDomains"
    X-Content-Type-Options nosniff
    Referrer-Policy strict-origin-when-cross-origin
    X-Frame-Options DENY
    Permissions-Policy "camera=(), microphone=(), geolocation=()"
    -Server
  }
  reverse_proxy 127.0.0.1:8080
}

tx.floridabay.net {
  header {
    Strict-Transport-Security "max-age=31536000"
    X-Content-Type-Options nosniff
    Referrer-Policy strict-origin-when-cross-origin
    X-Frame-Options SAMEORIGIN
    -Server
  }
  reverse_proxy 127.0.0.1:${tx_port}
}
EOF
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl daemon-reload
sudo systemctl disable --now fbrp-bot.service caddy.service 2>/dev/null || true
systemctl --user daemon-reload
systemctl --user disable --now \
  businesses-bot.service departments-armedforces-bot.service departments-bot.service dohs-bot.service devops-bot.service \
  gangs-bot.service iaa-bot.service personals-bot.service \
  role-manager-bot.service staff-bot.service 2>/dev/null || true

cat >/home/ubuntu/.config/fbrp-split.env <<EOF
FBRP_ROLE=control
FBRP_GAME_SSH=${game_target}
FBRP_DB_FORWARD_PORT=${db_port}
FBRP_GAME_FORWARD_PORT=${game_port}
FBRP_TXADMIN_FORWARD_PORT=${tx_port}
EOF
chmod 600 /home/ubuntu/.config/fbrp-split.env
REMOTE
}

configure_game_runtime() {
  log "Configuring game-VPS MariaDB, FXServer, and join redirect services"
  game_script <<'REMOTE'
set -Eeuo pipefail
root=/home/ubuntu/fbrp
test -f "$root/.env"
test -f "$root/server-data/server.cfg"
test -f "$root/server-data/secrets.cfg"
test -x "$root/start.sh"
test -x "$root/artifacts/run.sh"
chmod 600 "$root/.env" "$root/server-data/secrets.cfg"

install -d -m 0755 /home/ubuntu/.config/systemd/user
cat >/home/ubuntu/.config/systemd/user/fbrp-server.service <<'EOF'
[Unit]
Description=Florida Bay RP (txAdmin + FXServer)
After=default.target

[Service]
Type=simple
WorkingDirectory=/home/ubuntu/fbrp
ExecStartPre=/usr/bin/bash -c 'for i in $(seq 1 90); do (exec 3<>/dev/tcp/127.0.0.1/3307) 2>/dev/null && exit 0; sleep 2; done; exit 1'
ExecStart=/home/ubuntu/fbrp/start.sh
StandardOutput=append:/home/ubuntu/fbrp/txData/fbrp-console.log
StandardError=append:/home/ubuntu/fbrp/txData/fbrp-console.log
Restart=on-failure
RestartSec=10
TimeoutStopSec=30

[Install]
WantedBy=default.target
EOF
systemctl --user daemon-reload
systemctl --user disable --now fbrp-server.service 2>/dev/null || true

sudo tee /etc/caddy/Caddyfile >/dev/null <<'EOF'
{
  email admin@floridabay.net
  servers {
    protocols h1 h2 h3
  }
}

join.floridabay.net {
  header {
    Strict-Transport-Security "max-age=31536000"
    X-Content-Type-Options nosniff
    Referrer-Policy strict-origin-when-cross-origin
    -Server
  }
  redir https://floridabay.net permanent
}
EOF
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl disable --now caddy.service 2>/dev/null || true

cat >/home/ubuntu/.config/fbrp-split.env <<'EOF'
FBRP_ROLE=game
FBRP_CONTROL_SSH=fbrp-control-tunnel
EOF
chmod 600 /home/ubuntu/.config/fbrp-split.env
REMOTE
}

configure_git_workspaces() {
  log "Creating central Git remote and isolated Codex/Claude workspaces"
  control_script <<'REMOTE'
set -Eeuo pipefail
root=/home/ubuntu/fbrp
mkdir -p /home/ubuntu/git /home/ubuntu/work
if [[ ! -d /home/ubuntu/git/fbrp.git ]]; then
  git clone --bare "$root" /home/ubuntu/git/fbrp.git
fi
git --git-dir=/home/ubuntu/git/fbrp.git config receive.denyNonFastforwards true
if git -C "$root" remote get-url agent-origin >/dev/null 2>&1; then
  git -C "$root" remote set-url agent-origin /home/ubuntu/git/fbrp.git
else
  git -C "$root" remote add agent-origin /home/ubuntu/git/fbrp.git
fi
git -C "$root" push agent-origin main
for name in fbrp-codex fbrp-claude fbrp-release; do
  [[ -d "/home/ubuntu/work/$name/.git" ]] || git clone /home/ubuntu/git/fbrp.git "/home/ubuntu/work/$name"
done
git -C /home/ubuntu/work/fbrp-codex switch control-codex 2>/dev/null \
  || git -C /home/ubuntu/work/fbrp-codex switch -c control-codex
git -C /home/ubuntu/work/fbrp-claude switch control-claude 2>/dev/null \
  || git -C /home/ubuntu/work/fbrp-claude switch -c control-claude
git -C /home/ubuntu/work/fbrp-codex config pull.rebase true
git -C /home/ubuntu/work/fbrp-claude config pull.rebase true
git -C /home/ubuntu/work/fbrp-release config pull.ff only
REMOTE

  game_script <<'REMOTE'
set -Eeuo pipefail
root=/home/ubuntu/fbrp
mkdir -p /home/ubuntu/work
for name in fbrp-codex fbrp-claude; do
  [[ -d "/home/ubuntu/work/$name/.git" ]] \
    || git clone fbrp-control-tunnel:/home/ubuntu/git/fbrp.git "/home/ubuntu/work/$name"
done
git -C /home/ubuntu/work/fbrp-codex switch game-codex 2>/dev/null \
  || git -C /home/ubuntu/work/fbrp-codex switch -c game-codex
git -C /home/ubuntu/work/fbrp-claude switch game-claude 2>/dev/null \
  || git -C /home/ubuntu/work/fbrp-claude switch -c game-claude
git -C /home/ubuntu/work/fbrp-codex config pull.rebase true
git -C /home/ubuntu/work/fbrp-claude config pull.rebase true
if git -C "$root" remote get-url agent-origin >/dev/null 2>&1; then
  git -C "$root" remote set-url agent-origin fbrp-control-tunnel:/home/ubuntu/git/fbrp.git
else
  git -C "$root" remote add agent-origin fbrp-control-tunnel:/home/ubuntu/git/fbrp.git
fi
REMOTE
}

prepare() {
  require_source
  require_clean_source
  require_targets
  install_source_prerequisites
  verify_clean_target "$CONTROL_TARGET" control
  verify_clean_target "$GAME_TARGET" game

  local control_machine game_machine
  control_machine="$(ssh -o BatchMode=yes "$CONTROL_TARGET" cat /etc/machine-id)"
  game_machine="$(ssh -o BatchMode=yes "$GAME_TARGET" cat /etc/machine-id)"
  [[ "$control_machine" != "$game_machine" ]] || die "Control and game targets resolve to the same VPS."

  log "Installing dedicated source-to-target migration keys"
  install_migration_key "$CONTROL_TARGET" "$CONTROL_KEY" fbrp-source-to-control
  install_migration_key "$GAME_TARGET" "$GAME_KEY" fbrp-source-to-game
  provision_common "$CONTROL_TARGET" "$CONTROL_KEY" control
  provision_common "$GAME_TARGET" "$GAME_KEY" game
  copy_control_files
  copy_game_files
  configure_control_game_link
  configure_control_runtime
  configure_game_runtime
  configure_git_workspaces

  log "Preparation complete; production is still running on the source VPS"
  cat <<EOF
Before cutover:
  1. Provider firewall for ${CONTROL_TARGET#*@}: TCP 22, 80, 443 and UDP 443.
  2. Provider firewall for ${GAME_TARGET#*@}: TCP 22, 80, 443, 30120 and UDP 443, 30120.
  3. Lower DNS TTLs to 300 for floridabay.net, www, tx, and join.
  4. Sign in once to Codex and Claude on each new VPS.
  5. Schedule a maintenance window, then run:

     ${SOURCE_ROOT}/scripts/three-vps-migration.sh cutover ${CONTROL_TARGET} ${GAME_TARGET}

Existing Cfx, Corevia, Discord, database, and API credentials are preserved.
EOF
}

stop_source_production() {
  log "Stopping and disabling all source-VPS FBRP writers"
  sudo systemctl disable --now fbrp-bot.service
  systemctl --user disable --now "${CONTROL_USER_UNITS[@]}" 2>/dev/null || true
  systemctl --user disable --now fbrp-bot-live.service 2>/dev/null || true
  systemctl --user disable --now fbrp-server.service
  sleep 3
  if pgrep -f '/home/ubuntu/fbrp/artifacts/.*/FXServer' >/dev/null; then
    pgrep -af '/home/ubuntu/fbrp/artifacts/.*/FXServer' >&2 || true
    die "The old FXServer is still running."
  fi
}

dump_database_to_game() {
  log "Dumping the stopped source MariaDB and transferring it to the game VPS"
  local dump_path="/home/ubuntu/fbrp-cutover.sql.gz"
  docker exec fbrp-mariadb sh -lc \
    'exec mariadb-dump --user=root --password="$MARIADB_ROOT_PASSWORD" --single-transaction --routines --triggers --events "$MARIADB_DATABASE"' \
    | gzip -1 >"$dump_path"
  [[ -s "$dump_path" ]] || die "The MariaDB dump is empty."
  gzip -t "$dump_path"
  scp -q -i "$GAME_KEY" -o BatchMode=yes -o StrictHostKeyChecking=accept-new \
    "$dump_path" "${GAME_TARGET}:/home/ubuntu/fbrp-cutover.sql.gz"
}

restore_and_start_game() {
  log "Restoring MariaDB and starting FXServer on the game VPS"
  game_script <<'REMOTE'
set -Eeuo pipefail
cd /home/ubuntu/fbrp
test -s /home/ubuntu/fbrp-cutover.sql.gz
gzip -t /home/ubuntu/fbrp-cutover.sql.gz

if git remote get-url agent-origin >/dev/null 2>&1; then
  git remote set-url agent-origin fbrp-control-tunnel:/home/ubuntu/git/fbrp.git
else
  git remote add agent-origin fbrp-control-tunnel:/home/ubuntu/git/fbrp.git
fi

sudo docker compose up -d mariadb
for attempt in $(seq 1 90); do
  status="$(sudo docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}starting{{end}}' fbrp-mariadb 2>/dev/null || true)"
  [[ "$status" == healthy ]] && break
  sleep 2
done
[[ "$(sudo docker inspect --format '{{.State.Health.Status}}' fbrp-mariadb)" == healthy ]]

sudo docker exec fbrp-mariadb sh -lc '
  exec mariadb --user=root --password="$MARIADB_ROOT_PASSWORD" -e \
    "DROP DATABASE IF EXISTS \`$MARIADB_DATABASE\`; CREATE DATABASE \`$MARIADB_DATABASE\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; GRANT ALL ON \`$MARIADB_DATABASE\`.* TO \`$MARIADB_USER\`@\`%\`; FLUSH PRIVILEGES;"
'
gzip -dc /home/ubuntu/fbrp-cutover.sql.gz \
  | sudo docker exec -i fbrp-mariadb sh -lc \
      'exec mariadb --user=root --password="$MARIADB_ROOT_PASSWORD" "$MARIADB_DATABASE"'

systemctl --user daemon-reload
systemctl --user enable --now fbrp-server.service
sudo systemctl enable --now caddy.service
for attempt in $(seq 1 90); do
  if curl -fsS http://127.0.0.1:30120/fbrp_core/health >/tmp/fbrp-health.json 2>/dev/null; then
    cat /tmp/fbrp-health.json
    exit 0
  fi
  sleep 2
done
systemctl --user status fbrp-server.service --no-pager >&2 || true
tail -n 120 /home/ubuntu/fbrp/txData/fbrp-console.log >&2 || true
exit 1
REMOTE
}

install_control_vehicle_mount() {
  log "Mounting authoritative game-VPS upload directories on the control VPS"
  local game_host="${GAME_TARGET#*@}"
  control_script "$game_host" <<'REMOTE'
set -Eeuo pipefail
game_host="$1"

write_mount_unit() {
  local name="$1" remote_path="$2" local_path="$3"
  systemctl --user stop "${name}.service" 2>/dev/null || true
  if mountpoint -q "$local_path"; then
    fusermount3 -u "$local_path"
  fi
  cat >"/home/ubuntu/.config/systemd/user/${name}.service" <<EOF
[Unit]
Description=FBRP authoritative game data: ${remote_path}
After=fbrp-game-tunnel.service
Requires=fbrp-game-tunnel.service

[Service]
Type=simple
ExecStart=/usr/bin/sshfs -f -o reconnect,ServerAliveInterval=15,ServerAliveCountMax=3,IdentityFile=/home/ubuntu/.ssh/fbrp-game,IdentitiesOnly=yes,StrictHostKeyChecking=yes ubuntu@${game_host}:${remote_path} ${local_path}
ExecStop=-/usr/bin/fusermount3 -u ${local_path}
Restart=always
RestartSec=10

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
    if [[ -e "$backup_path" ]]; then
      echo "ERROR: Cannot preserve nonempty mountpoint because backup already exists: $backup_path" >&2
      exit 1
    fi
    mv "$local_path" "$backup_path"
  fi
  mkdir -p "$local_path"
}

vehicles='/home/ubuntu/fbrp/server-data/resources/[vehicles]'
eup='/home/ubuntu/fbrp/server-data/resources/[eup]'
vmenu='/home/ubuntu/fbrp/server-data/resources/[standalone]/vMenu/config'
prepare_mountpoint fbrp-vehicles-sshfs "$vehicles"
prepare_mountpoint fbrp-eup-sshfs "$eup"
prepare_mountpoint fbrp-vmenu-config-sshfs "$vmenu"
write_mount_unit fbrp-vehicles-sshfs "$vehicles" "$vehicles"
write_mount_unit fbrp-eup-sshfs "$eup" "$eup"
write_mount_unit fbrp-vmenu-config-sshfs "$vmenu" "$vmenu"
systemctl --user daemon-reload
systemctl --user enable --now \
  fbrp-vehicles-sshfs.service \
  fbrp-eup-sshfs.service \
  fbrp-vmenu-config-sshfs.service
sleep 3
mountpoint -q "$vehicles"
mountpoint -q "$eup"
mountpoint -q "$vmenu"
REMOTE
}

start_control_production() {
  log "Starting website, API, and bots on the control VPS"
  control_script "$CONTROL_DB_PORT" "$CONTROL_GAME_PORT" <<'REMOTE'
set -Eeuo pipefail
db_port="$1"
game_port="$2"
timeout 15 bash -c "exec 3<>/dev/tcp/127.0.0.1/${db_port}"
curl -fsS "http://127.0.0.1:${game_port}/fbrp_core/health" >/dev/null
sudo systemctl enable --now fbrp-bot.service
for attempt in $(seq 1 60); do
  curl -fsS http://127.0.0.1:8080/ >/dev/null 2>&1 && break
  sleep 2
done
curl -fsS http://127.0.0.1:8080/ >/dev/null
systemctl --user enable --now \
  businesses-bot.service departments-armedforces-bot.service departments-bot.service dohs-bot.service devops-bot.service \
  gangs-bot.service iaa-bot.service personals-bot.service \
  role-manager-bot.service staff-bot.service
sudo systemctl enable --now caddy.service
REMOTE
}

start_source_web_bridge() {
  log "Starting the temporary source-to-control web bridge for DNS propagation"
  local control_host="${CONTROL_TARGET#*@}"
  cat >"$SOURCE_BRIDGE_UNIT" <<EOF
[Unit]
Description=Temporary FBRP web and txAdmin bridge to new control VPS
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
Environment=AUTOSSH_GATETIME=0
ExecStart=/usr/bin/autossh -M 0 -N -T -i ${CONTROL_KEY} -o BatchMode=yes -o ExitOnForwardFailure=yes -o ServerAliveInterval=15 -o ServerAliveCountMax=3 -o StrictHostKeyChecking=yes -L 172.18.0.1:8080:127.0.0.1:8080 -L 172.18.0.1:40120:127.0.0.1:${CONTROL_TXADMIN_PORT} ubuntu@${control_host}
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
EOF
  systemctl --user daemon-reload
  systemctl --user enable --now fbrp-cutover-web-bridge.service
}

verify() {
  require_source
  require_targets
  [[ -f "$CONTROL_KEY" && -f "$GAME_KEY" ]] || die "Run prepare first."

  log "Control VPS health"
  control_script "$CONTROL_DB_PORT" "$CONTROL_GAME_PORT" <<'REMOTE'
set -Eeuo pipefail
db_port="$1"
game_port="$2"
required_system=(fbrp-bot.service caddy.service)
required_user=(fbrp-game-tunnel.service fbrp-vehicles-sshfs.service fbrp-eup-sshfs.service fbrp-vmenu-config-sshfs.service businesses-bot.service departments-armedforces-bot.service departments-bot.service dohs-bot.service devops-bot.service gangs-bot.service iaa-bot.service personals-bot.service role-manager-bot.service staff-bot.service)
for unit in "${required_system[@]}"; do
  state="$(sudo systemctl is-active "$unit" 2>/dev/null || true)"
  printf '%-42s %s\n' "$unit" "$state"
  [[ "$state" == active ]]
done
for unit in "${required_user[@]}"; do
  state="$(systemctl --user is-active "$unit" 2>/dev/null || true)"
  printf '%-42s %s\n' "$unit" "$state"
  [[ "$state" == active ]]
done
mountpoint -q '/home/ubuntu/fbrp/server-data/resources/[vehicles]'
timeout 5 bash -c "exec 3<>/dev/tcp/127.0.0.1/${db_port}"
curl -fsS http://127.0.0.1:8080/ >/dev/null
curl -fsS "http://127.0.0.1:${game_port}/fbrp_core/health"
printf '\n'
REMOTE

  log "Game VPS health"
  game_script <<'REMOTE'
set -Eeuo pipefail
web_state="$(sudo systemctl is-active caddy.service 2>/dev/null || true)"
printf '%-42s %s\n' caddy.service "$web_state"
[[ "$web_state" == active ]]
state="$(systemctl --user is-active fbrp-server.service 2>/dev/null || true)"
printf '%-42s %s\n' fbrp-server.service "$state"
[[ "$state" == active ]]
db_state="$(sudo docker inspect --format '{{.State.Health.Status}}' fbrp-mariadb 2>/dev/null || true)"
printf '%-42s %s\n' fbrp-mariadb "$db_state"
[[ "$db_state" == healthy ]]
curl -fsS http://127.0.0.1:30120/fbrp_core/health
printf '\n'
REMOTE

  log "Source VPS handoff state"
  printf '%-42s %s\n' fbrp-bot.service "$(systemctl is-active fbrp-bot.service 2>/dev/null || true)"
  printf '%-42s %s\n' fbrp-server.service "$(systemctl --user is-active fbrp-server.service 2>/dev/null || true)"
  printf '%-42s %s\n' fbrp-cutover-web-bridge.service "$(systemctl --user is-active fbrp-cutover-web-bridge.service 2>/dev/null || true)"

  log "DNS observations"
  for host in floridabay.net www.floridabay.net tx.floridabay.net join.floridabay.net; do
    printf '%-28s %s\n' "$host" "$(getent ahostsv4 "$host" 2>/dev/null | awk 'NR==1 {print $1}')"
  done
}

cutover() {
  require_source
  require_clean_source
  require_targets
  [[ -f "$CONTROL_KEY" && -f "$GAME_KEY" ]] || die "Run prepare first."
  control_ssh 'systemctl --user is-active --quiet fbrp-game-tunnel.service' \
    || die "The control/game tunnel is not active; rerun prepare."

  cat <<EOF

CUTOVER is the maintenance window that stops production on this source VPS,
takes the final copies and database dump, and starts production on:
  Control: ${CONTROL_TARGET}
  Game:    ${GAME_TARGET}

The current Cfx and Corevia credentials are preserved. The old FXServer is
stopped before the new one starts. Expected downtime is several minutes.
EOF
  read -rp 'Type CUTOVER to continue: ' confirmation
  [[ "$confirmation" == CUTOVER ]] || die "Cutover cancelled."

  local stamp backup_dir
  stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  backup_dir="${BACKUP_ROOT}/${stamp}"
  install -d -m 0700 "$backup_dir"
  cp "${SOURCE_ROOT}/services/fbrp-bot/.env" "$backup_dir/fbrp-bot.env"
  cp "${SOURCE_ROOT}/server-data/server.cfg" "$backup_dir/server.cfg"
  cp "${SOURCE_ROOT}/server-data/secrets.cfg" "$backup_dir/secrets.cfg"
  printf '%s\n' "$backup_dir" >"${BACKUP_ROOT}/latest"

  stop_source_production
  copy_control_files
  copy_game_files
  configure_control_runtime
  configure_game_runtime
  configure_control_game_link
  configure_git_workspaces
  dump_database_to_game
  restore_and_start_game
  install_control_vehicle_mount
  start_control_production
  start_source_web_bridge
  verify

  log "Cutover complete"
  cat <<EOF
Update DNS now:
  floridabay.net      A  ${CONTROL_TARGET#*@}
  www.floridabay.net  A  ${CONTROL_TARGET#*@}  (or CNAME to floridabay.net)
  tx.floridabay.net   A  ${CONTROL_TARGET#*@}
  join.floridabay.net A  ${GAME_TARGET#*@}

The temporary bridge keeps floridabay.net and tx.floridabay.net working through
the source VPS while DNS caches expire. It cannot bridge FiveM UDP, so announce
the new join IP if join.floridabay.net has not propagated yet.

After DNS has been correct and production stable for at least several days, run:
  ${SOURCE_ROOT}/scripts/three-vps-migration.sh retire-source ${CONTROL_TARGET} ${GAME_TARGET}
EOF
}

rollback() {
  require_source
  require_targets
  warn "Rollback discards database activity created only on the new game VPS."
  read -rp 'Type ROLLBACK to continue: ' confirmation
  [[ "$confirmation" == ROLLBACK ]] || die "Rollback cancelled."

  log "Stopping new control-plane production"
  control_script <<'REMOTE'
set -Eeuo pipefail
sudo systemctl disable --now caddy.service fbrp-bot.service 2>/dev/null || true
systemctl --user disable --now \
  businesses-bot.service departments-armedforces-bot.service departments-bot.service dohs-bot.service devops-bot.service \
  gangs-bot.service iaa-bot.service personals-bot.service \
  role-manager-bot.service staff-bot.service fbrp-vehicles-sshfs.service \
  fbrp-eup-sshfs.service fbrp-vmenu-config-sshfs.service \
  2>/dev/null || true
if mountpoint -q '/home/ubuntu/fbrp/server-data/resources/[vehicles]'; then
  fusermount3 -u '/home/ubuntu/fbrp/server-data/resources/[vehicles]' || true
fi
if mountpoint -q '/home/ubuntu/fbrp/server-data/resources/[eup]'; then
  fusermount3 -u '/home/ubuntu/fbrp/server-data/resources/[eup]' || true
fi
if mountpoint -q '/home/ubuntu/fbrp/server-data/resources/[standalone]/vMenu/config'; then
  fusermount3 -u '/home/ubuntu/fbrp/server-data/resources/[standalone]/vMenu/config' || true
fi
REMOTE

  log "Stopping the new FXServer"
  game_ssh 'systemctl --user disable --now fbrp-server.service 2>/dev/null || true; sudo systemctl disable --now caddy.service 2>/dev/null || true; cd /home/ubuntu/fbrp && sudo docker compose stop mariadb 2>/dev/null || true'

  systemctl --user disable --now fbrp-cutover-web-bridge.service 2>/dev/null || true
  docker start fbrp-mariadb >/dev/null 2>&1 || true
  systemctl --user enable --now fbrp-server.service
  sudo systemctl enable --now fbrp-bot.service
  systemctl --user enable --now "${CONTROL_USER_UNITS[@]}"

  log "Rollback complete"
  cat <<'EOF'
Production is running on the original source VPS again.
Change floridabay.net, www, tx, and join DNS records back to the source VPS.
The new VPSs were stopped but their copied data was not deleted.
EOF
}

retire_source() {
  require_source
  require_targets
  warn "This stops the temporary web bridge and the old FBRP MariaDB container."
  read -rp 'Type RETIRE to continue: ' confirmation
  [[ "$confirmation" == RETIRE ]] || die "Source retirement cancelled."
  verify
  systemctl --user disable --now fbrp-cutover-web-bridge.service 2>/dev/null || true
  docker stop fbrp-mariadb >/dev/null
  log "Old FBRP runtime stopped; no source files or Docker volumes were deleted."
}

case "$COMMAND" in
  prepare)
    prepare
    ;;
  cutover)
    cutover
    ;;
  verify)
    verify
    ;;
  rollback)
    rollback
    ;;
  retire-source)
    retire_source
    ;;
  help|-h|--help)
    usage
    ;;
  *)
    usage >&2
    die "Unknown command: $COMMAND"
    ;;
esac
