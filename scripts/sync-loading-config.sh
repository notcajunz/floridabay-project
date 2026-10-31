#!/usr/bin/env bash
# Usage: sync-loading-config.sh <canonical config.js> <active config.js> [tracks.js]
# Installs the canonical loading screen config (staff list, links, texts) over the active seasonal
# loading screen's config but keeps that screen's own Config.Tracks block, because its songs and posters
# are files that only exist in that resource's media folder. The block comes from the optional tracks.js
# (tracked in git) when it exists, otherwise from the active config.
set -Eeuo pipefail
canonical="$1"
active="$2"
tracks="${3:-}"
source_of_tracks="$active"
if [[ -n "$tracks" && -f "$tracks" ]]; then source_of_tracks="$tracks"; fi
candidate="$(mktemp "${active}.sync.XXXXXX")"
trap 'rm -f -- "$candidate"' EXIT
if [[ -f "$source_of_tracks" ]]; then
  awk '
    NR == FNR {
      if ($0 ~ /^Config\.Tracks = \[/) grab = 1
      if (grab) kept[++n] = $0
      if (grab && $0 ~ /^[ \t]*\];/) { grab = 0; complete = 1 }
      next
    }
    complete && /^Config\.Tracks = \[/ { for (i = 1; i <= n; i++) print kept[i]; skip = 1; next }
    skip { if ($0 ~ /^[ \t]*\];/) skip = 0; next }
    { print }
  ' "$source_of_tracks" "$canonical" >"$candidate"
else
  cat "$canonical" >"$candidate"
fi
install -m 0644 "$candidate" "$active"
