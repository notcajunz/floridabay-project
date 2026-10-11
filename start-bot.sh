#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
bot_root="$repo_root/services/fbrp-bot"
env_file="$bot_root/.env"

if [[ ! -f "$env_file" ]]; then
  echo "Missing $env_file. Copy .env.example and add Discord/MariaDB credentials." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$env_file"
set +a

cd "$bot_root"
/usr/bin/env node src/migrate.js
exec /usr/bin/env node src/index.js
