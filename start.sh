#!/usr/bin/env bash
set -euo pipefail

server_root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
artifact_run="$server_root/artifacts/run.sh"
server_cfg="$server_root/server-data/server.cfg"

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

