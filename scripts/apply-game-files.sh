#!/usr/bin/env bash
# Applies the game-side part of a release on this host: fast-forwards the live checkout (a no-op when
# deploy.sh already did), normalizes the untracked server.cfg, syncs the loading screen and either
# restarts FXServer or records that a restart is pending.
#   apply-game-files.sh COMMIT [DEFER=0|1] [PREVIOUS_COMMIT]
# Run by scripts/deploy.sh; never start or stop FXServer anywhere else.
set -Eeuo pipefail
commit="$1"
defer="${2:-0}"
root=/home/ubuntu/fbrp
marker=/home/ubuntu/.local/state/fbrp-pending-restart
# With a deferred restart FXServer keeps running on the code it already loaded.
[[ "$defer" == 1 ]] || systemctl --user stop fbrp-server.service
previous="${3:-$(git -C "$root" rev-parse HEAD)}"
git -C "$root" merge --ff-only "$commit"
# server.cfg is deployment-specific and intentionally untracked. Migrate only the
# exact resource line so secrets and every other local setting stay untouched.
server_cfg="$root/server-data/server.cfg"

# Keep the externally managed seasonal loading screen on the canonical staff
# configuration during no-restart deployments as well as normal starts.
canonical_loading_config="$root/server-data/resources/[fbrp]/fbrp_loading/web/assets/scripts/config.js"
active_loading_config="$root/server-data/resources/[loadingscreen]/fbrp-LChalloween/assets/scripts/config.js"
if [[ -d "$(dirname "$active_loading_config")" ]]; then
  "$root/scripts/sync-loading-config.sh" "$canonical_loading_config" "$active_loading_config" "$root/server-data/config/loading-tracks.js"
fi
[[ -f "$server_cfg" ]]
if grep -Fxq 'ensure vMenu.Enhanced' "$server_cfg"; then
  candidate="$(mktemp "${server_cfg}.tmp.XXXXXX")"
  awk '{ if ($0 == "ensure vMenu.Enhanced") print "ensure vMenu"; else print }' "$server_cfg" >"$candidate"
  chmod --reference="$server_cfg" "$candidate"
  mv "$candidate" "$server_cfg"
fi
grep -Fxq 'ensure vMenu' "$server_cfg"
! grep -Fxq 'ensure vMenu.Enhanced' "$server_cfg"
# Normalize only the requested resource lines, immediately after their shared
# standalone anchor. All deployment-specific settings and secrets are retained.
candidate="$(mktemp "${server_cfg}.resources.XXXXXX")"
awk '
  $0 == "ensure RageUI" || $0 == "ensure lvc" || $0 == "ensure NotWanted" ||
  $0 == "ensure MarkoMods-NSR9" || $0 == "ensure MarkoMods-SA80" ||
  $0 == "ensure MarkoMods-BenelliM2" || $0 == "ensure MP7A2" ||
  $0 == "ensure Scar17" || $0 == "ensure AKM" || $0 == "ensure As-Val" ||
  $0 == "ensure G17" || $0 == "ensure G36" || $0 == "ensure HK-UMP" ||
  $0 == "ensure M6IC" { next }
  { print }
  $0 == "ensure fbrp_chat" {
    print "ensure RageUI"
    print "ensure lvc"
    print "ensure NotWanted"
    inserted=1
  }
  END { if (!inserted) exit 42 }
' "$server_cfg" >"$candidate"
chmod --reference="$server_cfg" "$candidate"
mv "$candidate" "$server_cfg"
# config/resources.cfg (every resource started after fbrp_core) must be exec'd right after phone.cfg.
grep -Fxq 'exec config/phone.cfg' "$server_cfg"
if ! grep -Fxq 'exec config/resources.cfg' "$server_cfg"; then
  candidate="$(mktemp "${server_cfg}.exec.XXXXXX")"
  awk '{ print } $0 == "exec config/phone.cfg" { print "exec config/resources.cfg" }' "$server_cfg" >"$candidate"
  chmod --reference="$server_cfg" "$candidate"
  mv "$candidate" "$server_cfg"
fi
grep -Fxq 'exec config/resources.cfg' "$server_cfg"
grep -Fxq 'ensure RageUI' "$server_cfg"
grep -Fxq 'ensure lvc' "$server_cfg"
grep -Fxq 'ensure NotWanted' "$server_cfg"
cd "$root"
if [[ "$defer" == 1 ]]; then
  # Live now on disk, loaded by FXServer at its next restart. The database container and the service
  # are not touched, so a changed docker-compose.yml or start.sh also waits for that restart.
  mkdir -p "$(dirname "$marker")"
  printf '%s %s\n' "$(date +%s)" "$commit" >"$marker"
  if git -C "$root" diff --name-only "$previous" "$commit" | grep -Eq '^(docker-compose\.yml|start\.sh)$'; then
    echo "NOTE: docker-compose.yml or start.sh changed. Restart fbrp-server.service (not only txAdmin) to apply it."
  fi
  echo "FiveM restart deferred: the new game files apply at the next FXServer restart."
  exit 0
fi
sudo docker compose up -d mariadb
for attempt in $(seq 1 60); do
  [[ "$(sudo docker inspect --format '{{.State.Health.Status}}' fbrp-mariadb 2>/dev/null || true)" == healthy ]] && break
  sleep 2
done
[[ "$(sudo docker inspect --format '{{.State.Health.Status}}' fbrp-mariadb)" == healthy ]]
systemctl --user start fbrp-server.service
rm -f "$marker"
