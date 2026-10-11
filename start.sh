#!/usr/bin/env bash
set -euo pipefail

server_root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
artifact_run="$server_root/artifacts/run.sh"

if [[ ! -x "$artifact_run" ]]; then
    echo "FXServer is not installed at: $artifact_run" >&2
    exit 1
fi

export TXHOST_DATA_PATH="${TXHOST_DATA_PATH:-$server_root/txData}"
export TXHOST_TXA_PORT="${TXHOST_TXA_PORT:-40120}"

cd "$server_root/artifacts"
exec ./run.sh

