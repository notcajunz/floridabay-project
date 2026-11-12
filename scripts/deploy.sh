#!/usr/bin/env bash
# Deploy an already-reviewed Git revision to the Florida Bay RP production host.
# One machine runs everything: the website and API, every Discord bot, Caddy, MariaDB, FXServer and txAdmin.
# Run as ubuntu on that machine.

set -Eeuo pipefail
IFS=$'\n\t'

readonly ROOT=/home/ubuntu/fbrp
readonly REMOTE=agent-origin
readonly CENTRAL=/home/ubuntu/git/fbrp.git
readonly MARKER=/home/ubuntu/.local/state/fbrp-pending-restart
readonly -a BOT_UNITS=(
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
NO_RESTART="${FBRP_DEPLOY_NO_RESTART:-0}"
NO_START="${FBRP_DEPLOY_NO_START:-0}"

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33mWARNING: %s\033[0m\n' "$*" >&2; }
die() { printf '\033[1;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

usage() {
  cat <<'EOF'
Florida Bay RP deployment tool (single production host)

  /home/ubuntu/fbrp/scripts/deploy.sh status
  /home/ubuntu/fbrp/scripts/deploy.sh verify
  /home/ubuntu/fbrp/scripts/deploy.sh deploy [ref] [--no-restart | --no-start]

deploy fast-forwards the live checkout to the ref (default main), tests that exact revision, backs up the
database, then updates only what the release touches: website/API/bots (services/) and the game
(server-data/, docker-compose.yml, start.sh). The game server is restarted when game files changed.

--no-restart (or FBRP_DEPLOY_NO_RESTART=1) puts every change live except the FiveM restart: game files are
fast-forwarded and the bots restart as usual, but fbrp-server.service is left running. The new game files
take effect when FXServer next restarts (txAdmin, a scheduled restart or a manual one). AI agents always
deploy this way. status and verify say when a restart is still pending.

--no-start (or FBRP_DEPLOY_NO_START=1) installs and verifies the revision while leaving every application
service stopped. It implies --no-restart and is intended for maintenance windows.

This script accepts only fast-forward deployments.
EOF
}

require_host() {
  [[ "$(id -un)" == ubuntu ]] || die "Run as ubuntu, not root."
  [[ -d "$ROOT/.git" ]] || die "$ROOT is not a Git worktree."
  [[ -d "$CENTRAL" ]] || die "Missing the central Git remote at $CENTRAL."
  command -v docker >/dev/null || die "docker is required for the database container."
}

# The GitHub sync rewrites the encrypted snapshots/ files in the working tree, so those count as live data too.
# Players tune their personal vehicles at any time, and the personals bot writes those edits straight into the
# tracked [vehicles] directory. The website writes EUP addon peds to legacy vMenu's addons.json.
# The retained vMenu Enhanced config is an inactive rollback snapshot and can still contain its saved
# announcements, blips, clothing presets and teleports.
# Such edits never block a release on their own. Any other tracked change does, and so does a release that
# itself changes a file with a live edit (the merge would overwrite it).
readonly TOLERATED_LIVE_EDITS='^(server-data/resources/\[vehicles\]/|server-data/resources/\[standalone\]/vMenu/config/|server-data/resources/\[standalone\]/vMenu\.Enhanced/config/|snapshots/)'

# stdin: changed paths. Prints the ones that block a release.
blocking_dirty_paths() { grep -v -e '^$' | grep -v -E -e "$TOLERATED_LIVE_EDITS" || true; }

# args: file of live-edited paths, file of paths the release changes. Prints paths in both.
overlapping_paths() { comm -12 <(sort -u "$1") <(sort -u "$2"); }

require_clean_live_trees() {
  CONTROL_LIVE_EDITS="$(git -C "$ROOT" diff --name-only HEAD)"
  local blocking
  blocking="$(blocking_dirty_paths <<<"$CONTROL_LIVE_EDITS")"
  [[ -z "$blocking" ]] || { printf '%s\n' "$blocking" >&2; die "The live tree has tracked changes. Inspect it before deploying."; }
  if [[ -n "$CONTROL_LIVE_EDITS" ]]; then
    warn "Live player edits under [vehicles] are present; they are left untouched unless this release changes the same files."
  fi
}

# Run after the target commit is known: refuse only when the release would overwrite a live edit.
# Checked on each host against its own HEAD, and untracked [vehicles] files count too (a fast-forward
# aborts when it would overwrite them), so the refusal happens before any service is stopped.
readonly OVERLAP_SCRIPT='set -Eeuo pipefail; cd "$1"
comm -12 \
  <({ git diff --name-only HEAD; git ls-files --others --exclude-standard -- ":(literal)server-data/resources/[vehicles]"; } | sort -u) \
  <(git diff --name-only HEAD "$2" | sort -u)'
require_no_live_edit_overlap() {
  local clash
  clash="$(bash -c "$OVERLAP_SCRIPT" _ "$ROOT" "$TARGET_COMMIT")" || die "Could not compare live edits."
  [[ -z "$clash" ]] || { printf '%s\n' "$clash" >&2; die "This release changes files that have live edits. Preserve those edits first."; }
}

fetch_and_resolve() {
  log "Fetching ${REMOTE}/${REF}"
  git -C "$ROOT" fetch --prune "$REMOTE"
  TARGET_COMMIT="$(git -C "$ROOT" rev-parse --verify "${REMOTE}/${REF}^{commit}" 2>/dev/null \
    || git -C "$ROOT" rev-parse --verify "${REF}^{commit}" 2>/dev/null)" \
    || die "Cannot resolve ref: $REF"

  git -C "$ROOT" merge-base --is-ancestor HEAD "$TARGET_COMMIT" \
    || die "The live checkout cannot fast-forward to $REF. Merge/rebase in the release workspace first."
  printf 'Target commit: %s\n' "$TARGET_COMMIT"
  require_no_live_edit_overlap
}

# Sets CHANGED_SERVICES and CHANGED_GAME from what the release touches.
classify_changes() {
  local base paths
  base="$(git -C "$ROOT" merge-base HEAD "$TARGET_COMMIT")"
  paths="$(git -C "$ROOT" diff --name-only "$base" "$TARGET_COMMIT")"
  CHANGED_SERVICES=0
  CHANGED_GAME=0
  [[ -n "$paths" ]] || { printf 'No new tracked changes.\n'; return; }
  grep -Eq '^(services/|deploy/|scripts/)' <<<"$paths" && CHANGED_SERVICES=1
  grep -Eq '^(server-data/|docker-compose\.yml$|start\.sh$)' <<<"$paths" && CHANGED_GAME=1
  printf 'Release touches: services=%s game=%s\n' "$CHANGED_SERVICES" "$CHANGED_GAME"
}

preflight_tests() {
  log "Running tests against the exact target revision"
  local test_dir
  test_dir="$(mktemp -d /tmp/fbrp-deploy-test.XXXXXX)"
  trap 'rm -rf -- "$test_dir"' RETURN
  git clone -q --no-checkout /home/ubuntu/git/fbrp.git "$test_dir"
  # The tests never read the multi-GB personal-vehicle and EUP pack trees (their
  # tests build fixtures in temp dirs), so leave them out of the test checkout.
  git -C "$test_dir" sparse-checkout set --no-cone '/*' \
    '!/server-data/resources/[[]eup[]]/' \
    '!/server-data/resources/[[]eup[]].pre-game-mount/' \
    '!/server-data/resources/[[]vehicles[]]/' \
    '!/server-data/resources/[[]vehicles[]].pre-game-mount/'
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

backup_database() {
  log "Creating a pre-deploy database backup"
  local backup_dir=/home/ubuntu/fbrp/backups/deploy stamp
  stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  mkdir -p "$backup_dir"
  sudo docker exec fbrp-mariadb sh -lc \
    'exec mariadb-dump --user=root --password="$MARIADB_ROOT_PASSWORD" --single-transaction --routines --triggers --events "$MARIADB_DATABASE"' \
    | gzip -1 >"$backup_dir/database-$stamp.sql.gz"
  gzip -t "$backup_dir/database-$stamp.sql.gz"
  ln -sfn "database-$stamp.sql.gz" "$backup_dir/latest.sql.gz"
  find "$backup_dir" -maxdepth 1 -type f -name 'database-*.sql.gz' -mtime +14 -delete
  printf 'Database backup: %s\n' "$backup_dir/database-$stamp.sql.gz"
}

stop_bots() {
  systemctl --user stop "${BOT_UNITS[@]}" 2>/dev/null || true
  sudo systemctl stop fbrp-bot.service
}

install_services() {
  npm --prefix "$ROOT/services/fbrp-bot" ci
  for manager in businessmanager gangsmanager deptmanager dohsbot; do
    python3.12 -m venv "$ROOT/services/$manager/.venv"
    "$ROOT/services/$manager/.venv/bin/pip" install --disable-pip-version-check \
      -e "${ROOT}/services/${manager}[dev]"
  done
}

# Makes sure every tracked site snippet exists in the live Caddyfile and that Caddy restarts itself on failure.
install_caddy() {
  local live=/etc/caddy/Caddyfile
  local service_override="$ROOT/deploy/systemd/caddy.service.d/10-fbrp-recovery.conf"
  local live_service_dir=/etc/systemd/system/caddy.service.d
  [[ -f "$live" ]] || die "Missing live Caddy configuration: $live"
  [[ -f "$service_override" ]] || die "Missing tracked Caddy service recovery policy: $service_override"

  sudo install -d -o root -g root -m 0755 "$live_service_dir"
  sudo install -o root -g root -m 0644 "$service_override" "$live_service_dir/10-fbrp-recovery.conf"
  sudo systemctl daemon-reload

  local snippet host candidate changed=0
  candidate="$(mktemp /tmp/fbrp-caddy.XXXXXX)"
  trap 'rm -f -- "$candidate"' RETURN
  sudo cat "$live" >"$candidate"
  for snippet in "$ROOT"/deploy/caddy/*.caddy; do
    [[ -f "$snippet" ]] || continue
    host="$(basename "$snippet" .caddy)"
    if grep -q "^${host//./\\.} {" "$candidate"; then continue; fi
    { cat "$snippet"; printf '\n'; } >>"$candidate"
    changed=1
  done
  sudo caddy validate --config "$candidate" --adapter caddyfile
  if (( changed )); then
    sudo install -o root -g root -m 0644 "$candidate" "$live"
    sudo caddy reload --config "$live" --adapter caddyfile
  else
    sudo caddy validate --config "$live"
  fi
}

start_game_database() {
  sudo docker compose -f "$ROOT/docker-compose.yml" --project-directory "$ROOT" up -d mariadb
  for _ in $(seq 1 60); do
    [[ "$(sudo docker inspect --format '{{.State.Health.Status}}' fbrp-mariadb 2>/dev/null || true)" == healthy ]] && return 0
    sleep 2
  done
  die "MariaDB did not become healthy."
}

start_bots() {
  sudo systemctl start fbrp-bot.service
  for _ in {1..60}; do
    curl -fsS http://127.0.0.1:8080/ >/dev/null 2>&1 && break
    sleep 2
  done
  curl -fsS http://127.0.0.1:8080/ >/dev/null
  systemctl --user start "${BOT_UNITS[@]}"
}

verify_deployment() {
  log "Verifying services"
  local unit state
  for unit in caddy.service fbrp-bot.service; do
    state="$(sudo systemctl is-active "$unit" 2>/dev/null || true)"
    printf '%-42s %s\n' "$unit" "$state"
    [[ "$state" == active ]]
  done
  for unit in "${BOT_UNITS[@]}" fbrp-server.service; do
    state="$(systemctl --user is-active "$unit" 2>/dev/null || true)"
    printf '%-42s %s\n' "$unit" "$state"
    [[ "$state" == active ]]
  done
  state="$(sudo docker inspect --format '{{.State.Health.Status}}' fbrp-mariadb 2>/dev/null || true)"
  printf '%-42s %s\n' fbrp-mariadb "$state"
  [[ "$state" == healthy ]]
  curl -fsS http://127.0.0.1:8080/ >/dev/null
  curl -fsS http://127.0.0.1:30120/fbrp_core/health
  printf '\n'
  local fx_pid
  fx_pid="$(pgrep -f '\+exec server\.cfg' | head -1 || true)"
  if [[ -f "$MARKER" ]]; then
    local since commit restarted=0 started
    IFS=" " read -r since commit <"$MARKER"
    if [[ -n "$fx_pid" ]]; then
      started=$(( $(date +%s) - $(ps -o etimes= -p "$fx_pid" | tr -d ' ') ))
      (( started >= since )) && restarted=1
    fi
    if (( restarted )); then rm -f "$MARKER"; echo "FiveM restart: none pending"
    else echo "FiveM restart PENDING: live game files (${commit:0:12}) are newer than the running server"; fi
  else
    echo "FiveM restart: none pending"
  fi
}

show_status() {
  printf 'Live commit: %s\n' "$(git -C "$ROOT" rev-parse --short=12 HEAD)"
  printf 'Live branch: %s\n' "$(git -C "$ROOT" branch --show-current)"
  verify_deployment
}

deploy_release() {
  backup_database
  if [[ "$NO_START" == 1 ]]; then
    log "Stopping every application service and leaving them stopped"
    stop_bots
    systemctl --user stop fbrp-server.service 2>/dev/null || true
  elif (( CHANGED_SERVICES )); then
    log "Stopping the website, API and bots (FiveM keeps running unless game files changed)"
    stop_bots
  fi
  local previous
  previous="$(git -C "$ROOT" rev-parse HEAD)"
  git -C "$ROOT" merge --ff-only "$TARGET_COMMIT"
  if (( CHANGED_SERVICES )) || [[ "$NO_START" == 1 ]]; then
    install_services || { warn "Install failed; bots remain stopped for inspection."; return 1; }
    install_caddy || { warn "Caddy configuration failed; bots remain stopped for inspection."; return 1; }
  fi
  if (( CHANGED_GAME )); then
    "$ROOT/scripts/apply-game-files.sh" "$TARGET_COMMIT" "$NO_RESTART" "$previous" \
      || { warn "Game install failed; bots remain stopped for inspection."; return 1; }
  fi
  if [[ "$NO_START" != 1 ]] && (( CHANGED_SERVICES )); then start_bots; fi
}

verify_staged_deployment() {
  log "Verifying the staged revision while application services remain stopped"
  local unit state
  for unit in fbrp-bot.service; do
    state="$(sudo systemctl is-active "$unit" 2>/dev/null || true)"
    printf '%-42s %s\n' "$unit" "$state"
    [[ "$state" == inactive || "$state" == failed ]]
  done
  for unit in "${BOT_UNITS[@]}" fbrp-server.service; do
    state="$(systemctl --user is-active "$unit" 2>/dev/null || true)"
    printf '%-42s %s\n' "$unit" "$state"
    [[ "$state" == inactive || "$state" == failed ]]
  done
  printf 'Live commit: %s\n' "$(git -C "$ROOT" rev-parse --short=12 HEAD)"
  [[ "$(git -C "$ROOT" rev-parse HEAD)" == "$TARGET_COMMIT" ]]
}

for option in "${@:3}"; do
  case "$option" in
    --no-restart) NO_RESTART=1 ;;
    --no-start) NO_START=1; NO_RESTART=1 ;;
    *) die "Unknown option: $option" ;;
  esac
done
[[ "$NO_RESTART" == 0 || "$NO_RESTART" == 1 ]] || die "FBRP_DEPLOY_NO_RESTART must be 0 or 1."
[[ "$NO_START" == 0 || "$NO_START" == 1 ]] || die "FBRP_DEPLOY_NO_START must be 0 or 1."
[[ "$NO_START" != 1 ]] || NO_RESTART=1

case "$ACTION" in
  status)
    require_host
    show_status
    ;;
  verify)
    require_host
    verify_deployment
    ;;
  deploy)
    require_host
    require_clean_live_trees
    fetch_and_resolve
    classify_changes
    preflight_tests
    log "Deploying $TARGET_COMMIT"
    deploy_release
    if [[ "$NO_START" == 1 ]]; then verify_staged_deployment; else verify_deployment; fi
    log "Deployment complete"
    if [[ "$NO_START" == 1 ]]; then
      warn "The revision is staged and all application services remain stopped."
    elif [[ "$NO_RESTART" == 1 ]] && (( CHANGED_GAME )); then
      warn "Game changes are live on disk but FiveM was not restarted. They apply at the next FXServer restart (txAdmin or a scheduled restart)."
    fi
    ;;
  help|-h|--help)
    usage
    ;;
  *)
    usage >&2
    die "Unknown command: $ACTION"
    ;;
esac
