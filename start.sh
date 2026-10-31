#!/usr/bin/env bash
set -euo pipefail

server_root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
artifact_run="$server_root/artifacts/run.sh"
server_cfg="$server_root/server-data/server.cfg"

# FXServer leaves a newly generated resource cache directory at mode 0600 if
# packing is interrupted. Directories need the execute bit to be traversable;
# an empty, non-traversable cache makes clients receive an invalid resource URI.
# Remove only that known-bad cache so FXServer can build qx-waterdata cleanly.
qx_water_cache="$server_root/server-data/cache/files/qx-waterdata"
if [[ -d "$qx_water_cache" && ! -x "$qx_water_cache" ]]; then
    chmod 0755 "$qx_water_cache"
    if [[ -z "$(find "$qx_water_cache" -mindepth 1 -print -quit)" ]]; then
        rmdir "$qx_water_cache"
    fi
fi

# The seasonal loading screen is an externally managed resource, but it uses
# the same staff configuration as the canonical FBRP loading screen.
canonical_loading_config="$server_root/server-data/resources/[fbrp]/fbrp_loading/web/assets/scripts/config.js"
active_loading_config="$server_root/server-data/resources/[loadingscreen]/fbrp-LChalloween/assets/scripts/config.js"
if [[ -d "$(dirname "$active_loading_config")" ]]; then
    "$server_root/scripts/sync-loading-config.sh" "$canonical_loading_config" "$active_loading_config" "$server_root/server-data/config/loading-tracks.js"
fi

if [[ ! -x "$artifact_run" ]]; then
    echo "FXServer is not installed at: $artifact_run" >&2
    exit 1
fi

# server.cfg is deployment-specific and intentionally untracked. Complete the
# one-time resource rename before txAdmin starts, preserving every other local
# setting (including private convars).
if grep -Fxq 'ensure vMenu.Enhanced' "$server_cfg"; then
    candidate="$(mktemp "${server_cfg}.tmp.XXXXXX")"
    awk '{ if ($0 == "ensure vMenu.Enhanced") print "ensure vMenu"; else print }' "$server_cfg" >"$candidate"
    chmod --reference="$server_cfg" "$candidate"
    mv "$candidate" "$server_cfg"
fi
grep -Fxq 'ensure vMenu' "$server_cfg"
! grep -Fxq 'ensure vMenu.Enhanced' "$server_cfg"

# Keep vendored standalone resources in one deterministic dependency order.
# Remove only these exact public resource lines; private convars remain untouched.
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
grep -Fxq 'ensure RageUI' "$server_cfg"
grep -Fxq 'ensure lvc' "$server_cfg"
grep -Fxq 'ensure NotWanted' "$server_cfg"

export TXHOST_DATA_PATH="${TXHOST_DATA_PATH:-$server_root/txData}"
export TXHOST_TXA_PORT="${TXHOST_TXA_PORT:-40120}"

cd "$server_root/artifacts"
exec ./run.sh

