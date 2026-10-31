#!/usr/bin/env bash
# Rebuild the Florida Bay RP vMenu client/server from the upstream v3.8.68 tag
# plus patches/vmenu-3.8.68-fbrp/fbrp.patch, and copy the DLLs into the vMenu
# resource. Needs a .NET SDK (8.0) on PATH. Run from any checkout:
#
#   scripts/build-vmenu-fbrp.sh [output-resource-dir]
#
# The upstream source is downloaded into a temporary directory, checked against
# the pinned commit, patched, built and discarded. Nothing outside the output
# resource directory is modified.

set -Eeuo pipefail
IFS=$'\n\t'

readonly TAG=v3.8.68
readonly COMMIT=824d891075327d9fd14f11b7f4028b14e243b9d1
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
patch_file="$repo_root/patches/vmenu-3.8.68-fbrp/fbrp.patch"
out_dir="${1:-$repo_root/server-data/resources/[standalone]/vMenu}"

command -v dotnet >/dev/null || { echo "dotnet SDK not found on PATH" >&2; exit 1; }
[[ -f "$patch_file" ]] || { echo "missing $patch_file" >&2; exit 1; }
[[ -d "$out_dir" ]] || { echo "missing output directory $out_dir" >&2; exit 1; }

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

curl -fsSL "https://api.github.com/repos/TomGrobbe/vMenu/tarball/$COMMIT" -o "$work/vmenu.tgz"
mkdir "$work/src"
tar -xzf "$work/vmenu.tgz" -C "$work/src" --strip-components=1
git -C "$work/src" init -q 2>/dev/null || true
(cd "$work/src" && patch -p1 --no-backup-if-mismatch <"$patch_file")

export DOTNET_CLI_TELEMETRY_OPTOUT=1 DOTNET_NOLOGO=1
(cd "$work/src" && dotnet build vMenu/vMenuClient.csproj -c Release -v q && dotnet build vMenuServer/vMenuServer.csproj -c Release -v q)

install -m 0644 "$work/src/build/vMenu/vMenuClient.net.dll" "$out_dir/vMenuClient.net.dll"
install -m 0644 "$work/src/build/vMenu/vMenuServer.net.dll" "$out_dir/vMenuServer.net.dll"
echo "vMenu $TAG + Florida Bay RP patch written to $out_dir"
