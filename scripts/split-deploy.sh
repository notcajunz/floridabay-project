#!/usr/bin/env bash
# Deploy an already-reviewed Git revision from the control VPS to the split
# Florida Bay RP production hosts. Run only on the control VPS as ubuntu.

set -Eeuo pipefail
IFS=$'\n\t'

readonly ROOT=/home/ubuntu/fbrp
readonly CONFIG=/home/ubuntu/.config/fbrp-split.env
readonly GAME_KEY=/home/ubuntu/.ssh/fbrp-game
readonly REMOTE=agent-origin
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

ACTION="${1:-help}"
REF="${2:-main}"

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33mWARNING: %s\033[0m\n' "$*" >&2; }
die() { printf '\033[1;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

usage() {
  cat <<'EOF'
Florida Bay RP split deployment tool

Run on the CONTROL VPS:

  /home/ubuntu/fbrp/scripts/split-deploy.sh status
  /home/ubuntu/fbrp/scripts/split-deploy.sh verify
  /home/ubuntu/fbrp/scripts/split-deploy.sh control [ref]
  /home/ubuntu/fbrp/scripts/split-deploy.sh game [ref]
  /home/ubuntu/fbrp/scripts/split-deploy.sh all [ref]

Use "control" for website/API/bot-only changes, "game" for FiveM-only changes,
and "all" whenever one feature touches both sides or includes DB migrations.
The default ref is main. This script accepts only fast-forward deployments.
EOF
}

require_control() {
  [[ "$(id -un)" == ubuntu ]] || die "Run as ubuntu, not root."
  [[ -f "$CONFIG" ]] || die "Missing $CONFIG; complete the migration first."
  # shellcheck disable=SC1090
  source "$CONFIG"
  [[ "${FBRP_ROLE:-}" == control ]] || die "This command must run on the control VPS."
  [[ -n "${FBRP_GAME_SSH:-}" ]] || die "FBRP_GAME_SSH is missing from $CONFIG."
  [[ -f "$GAME_KEY" ]] || die "Missing control-to-game SSH key."
  [[ -d "$ROOT/.git" ]] || die "$ROOT is not a Git worktree."
}

game_ssh() {
  ssh -i "$GAME_KEY" \
    -o BatchMode=yes \
    -o ConnectTimeout=15 \
    -o ServerAliveInterval=15 \
    -o ServerAliveCountMax=3 \
    -o StrictHostKeyChecking=yes \
    "$FBRP_GAME_SSH" "$@"
}

game_script() {
  ssh -i "$GAME_KEY" \
    -o BatchMode=yes \
    -o ConnectTimeout=15 \
    -o ServerAliveInterval=15 \
    -o ServerAliveCountMax=3 \
    -o StrictHostKeyChecking=yes \
    "$FBRP_GAME_SSH" bash -s -- "$@"
}

require_clean_live_trees() {
  [[ -z "$(git -C "$ROOT" status --porcelain --untracked-files=no)" ]] \
    || die "The control live tree has tracked changes. Inspect it before deploying."
  # The command substitution must run on the game VPS.
  # shellcheck disable=SC2016
  game_ssh 'test -z "$(git -C /home/ubuntu/fbrp status --porcelain --untracked-files=no)"' \
    || die "The game live tree has tracked changes. Inspect it before deploying."
}

fetch_and_resolve() {
  log "Fetching ${REMOTE}/${REF} on both production hosts"
  git -C "$ROOT" fetch --prune "$REMOTE"
  TARGET_COMMIT="$(git -C "$ROOT" rev-parse --verify "${REMOTE}/${REF}^{commit}" 2>/dev/null \
    || git -C "$ROOT" rev-parse --verify "${REF}^{commit}" 2>/dev/null)" \
    || die "Cannot resolve ref: $REF"

  git -C "$ROOT" merge-base --is-ancestor HEAD "$TARGET_COMMIT" \
    || die "Control cannot fast-forward to $REF. Merge/rebase in the release workspace first."

  local remote_commit
  remote_commit="$(game_ssh "git -C '$ROOT' fetch --prune agent-origin >/dev/null && git -C '$ROOT' rev-parse '$TARGET_COMMIT^{commit}'")"
  [[ "$remote_commit" == "$TARGET_COMMIT" ]] || die "Game VPS did not fetch the same commit."
  game_ssh "git -C '$ROOT' merge-base --is-ancestor HEAD '$TARGET_COMMIT'" \
    || die "Game cannot fast-forward to $REF. Reconcile its live branch first."
  printf 'Target commit: %s\n' "$TARGET_COMMIT"
}

classify_changes() {
  local base paths
  base="$(git -C "$ROOT" merge-base HEAD "$TARGET_COMMIT")"
  paths="$(git -C "$ROOT" diff --name-only "$base" "$TARGET_COMMIT")"
  [[ -n "$paths" ]] || { printf 'No new tracked changes on the control VPS.\n'; return; }

  if [[ "$ACTION" == control ]] && grep -Eq '^(server-data/|docker-compose\.yml$|start\.sh$)' <<<"$paths"; then
    printf '%s\n' "$paths" >&2
    die "This revision changes game files. Deploy it with 'all', not 'control'."
  fi
  if [[ "$ACTION" == game ]] && grep -Eq '^services/' <<<"$paths"; then
    printf '%s\n' "$paths" >&2
    die "This revision changes control files. Deploy it with 'all', not 'game'."
  fi
}

preflight_tests() {
  log "Running tests against the exact target revision"
  local test_dir
  test_dir="$(mktemp -d /tmp/fbrp-deploy-test.XXXXXX)"
  trap 'rm -rf -- "$test_dir"' RETURN
  git clone -q --no-checkout /home/ubuntu/git/fbrp.git "$test_dir"
  git -C "$test_dir" checkout -q "$TARGET_COMMIT"
  npm --prefix "$test_dir/services/fbrp-bot" ci --ignore-scripts
  npm --prefix "$test_dir/services/fbrp-bot" run check
  npm --prefix "$test_dir/services/fbrp-bot" test
  for manager in businessmanager gangsmanager deptmanager dohsbot; do
    python3.12 -m venv "$test_dir/services/$manager/.venv"
    "$test_dir/services/$manager/.venv/bin/pip" install -q --disable-pip-version-check \
      -e "${test_dir}/services/${manager}[dev]"
    "$test_dir/services/$manager/.venv/bin/python" -m pytest -q "$test_dir/services/$manager/tests"
  done
  rm -rf -- "$test_dir"
  trap - RETURN
}

backup_game_database() {
  log "Creating a pre-deploy database backup on the game VPS"
  game_script <<'REMOTE'
set -Eeuo pipefail
backup_dir=/home/ubuntu/fbrp/backups/deploy
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$backup_dir"
sudo docker exec fbrp-mariadb sh -lc \
  'exec mariadb-dump --user=root --password="$MARIADB_ROOT_PASSWORD" --single-transaction --routines --triggers --events "$MARIADB_DATABASE"' \
  | gzip -1 >"$backup_dir/database-$stamp.sql.gz"
gzip -t "$backup_dir/database-$stamp.sql.gz"
ln -sfn "database-$stamp.sql.gz" "$backup_dir/latest.sql.gz"
find "$backup_dir" -maxdepth 1 -type f -name 'database-*.sql.gz' -mtime +14 -delete
printf 'Database backup: %s\n' "$backup_dir/database-$stamp.sql.gz"
REMOTE
}

stop_control() {
  systemctl --user stop "${CONTROL_USER_UNITS[@]}" 2>/dev/null || true
  sudo systemctl stop fbrp-bot.service
}

install_control_revision() {
  git -C "$ROOT" merge --ff-only "$TARGET_COMMIT"
  npm --prefix "$ROOT/services/fbrp-bot" ci
  for manager in businessmanager gangsmanager deptmanager dohsbot; do
    python3.12 -m venv "$ROOT/services/$manager/.venv"
    "$ROOT/services/$manager/.venv/bin/pip" install --disable-pip-version-check \
      -e "${ROOT}/services/${manager}[dev]"
  done
}

start_control() {
  sudo systemctl start fbrp-bot.service
  for _ in {1..60}; do
    curl -fsS http://127.0.0.1:8080/ >/dev/null 2>&1 && break
    sleep 2
  done
  curl -fsS http://127.0.0.1:8080/ >/dev/null
  systemctl --user start "${CONTROL_USER_UNITS[@]}"
}

install_game_revision() {
  game_script "$TARGET_COMMIT" <<'REMOTE'
set -Eeuo pipefail
commit="$1"
root=/home/ubuntu/fbrp
systemctl --user stop fbrp-server.service
git -C "$root" merge --ff-only "$commit"
cd "$root"
sudo docker compose up -d mariadb
for attempt in $(seq 1 60); do
  [[ "$(sudo docker inspect --format '{{.State.Health.Status}}' fbrp-mariadb 2>/dev/null || true)" == healthy ]] && break
  sleep 2
done
[[ "$(sudo docker inspect --format '{{.State.Health.Status}}' fbrp-mariadb)" == healthy ]]
systemctl --user start fbrp-server.service
REMOTE
}

verify_deployment() {
  log "Verifying control services and private links"
  local unit state
  for unit in fbrp-bot.service caddy.service; do
    state="$(sudo systemctl is-active "$unit" 2>/dev/null || true)"
    printf '%-42s %s\n' "$unit" "$state"
    [[ "$state" == active ]]
  done
  for unit in fbrp-game-tunnel.service fbrp-vehicles-sshfs.service \
    fbrp-eup-sshfs.service fbrp-vmenu-config-sshfs.service \
    "${CONTROL_USER_UNITS[@]}"; do
    state="$(systemctl --user is-active "$unit" 2>/dev/null || true)"
    printf '%-42s %s\n' "$unit" "$state"
    [[ "$state" == active ]]
  done
  curl -fsS http://127.0.0.1:8080/ >/dev/null
  curl -fsS "http://127.0.0.1:${FBRP_GAME_FORWARD_PORT}/fbrp_core/health"
  printf '\n'

  log "Verifying game services"
  game_script <<'REMOTE'
set -Eeuo pipefail
for unit in caddy.service; do
  state="$(sudo systemctl is-active "$unit" 2>/dev/null || true)"
  printf '%-42s %s\n' "$unit" "$state"
  [[ "$state" == active ]]
done
state="$(systemctl --user is-active fbrp-server.service 2>/dev/null || true)"
printf '%-42s %s\n' fbrp-server.service "$state"
[[ "$state" == active ]]
state="$(sudo docker inspect --format '{{.State.Health.Status}}' fbrp-mariadb 2>/dev/null || true)"
printf '%-42s %s\n' fbrp-mariadb "$state"
[[ "$state" == healthy ]]
curl -fsS http://127.0.0.1:30120/fbrp_core/health
printf '\n'
REMOTE
}

show_status() {
  printf 'Control live commit: %s\n' "$(git -C "$ROOT" rev-parse --short=12 HEAD)"
  printf 'Game live commit:    %s\n' "$(game_ssh "git -C '$ROOT' rev-parse --short=12 HEAD")"
  printf 'Control branch:      %s\n' "$(git -C "$ROOT" branch --show-current)"
  printf 'Game branch:         %s\n' "$(game_ssh "git -C '$ROOT' branch --show-current")"
  verify_deployment
}

deploy_control() {
  stop_control
  if ! install_control_revision; then
    warn "Control install failed; services remain stopped for inspection."
    return 1
  fi
  start_control
}

deploy_game() {
  backup_game_database
  install_game_revision
}

deploy_all() {
  backup_game_database
  log "Stopping both application planes"
  stop_control
  game_ssh 'systemctl --user stop fbrp-server.service'
  if ! install_control_revision; then
    warn "Control install failed; both application planes remain stopped."
    return 1
  fi
  if ! install_game_revision; then
    warn "Game install failed; control applications remain stopped."
    return 1
  fi
  start_control
}

case "$ACTION" in
  status)
    require_control
    show_status
    ;;
  verify)
    require_control
    verify_deployment
    ;;
  control|game|all)
    require_control
    require_clean_live_trees
    fetch_and_resolve
    classify_changes
    preflight_tests
    log "Deploying $TARGET_COMMIT to $ACTION"
    "deploy_${ACTION}"
    verify_deployment
    log "Deployment complete"
    ;;
  help|-h|--help)
    usage
    ;;
  *)
    usage >&2
    die "Unknown command: $ACTION"
    ;;
esac
