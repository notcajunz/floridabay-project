#!/usr/bin/env bash
# Saves the whole Florida Bay project (game server, bot, website, database) to the private GitHub
# repository. Plain files are committed as they are; everything secret or personal is committed
# only as an AES-256 encrypted bundle. Safe to run any time: it is a no-op when nothing changed.
#
#   GITHUB_TOKEN   token with repo access (in services/fbrp-bot/.env)
#   GITHUB_REPO    owner/name of the private repository (created when it does not exist)
#
# Prints human readable progress and finishes with one "RESULT {json}" line.
set -uo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"
export PATH="/home/ubuntu/.local/bin:/usr/local/bin:/usr/bin:/bin"
export GIT_TERMINAL_PROMPT=0 GIT_CONFIG_NOSYSTEM=1
env_file="$root/services/fbrp-bot/.env"
config_dir="$root/.sync"            # never committed (see .gitignore)
mkdir -p "$config_dir"; chmod 700 "$config_dir"

envval() { # read VAR from the environment, else from the bot .env
  local name="$1" current="${!1:-}"
  if [[ -n "$current" ]]; then printf '%s' "$current"; return; fi
  [[ -f "$env_file" ]] && grep -E "^${name}=" "$env_file" | tail -1 | cut -d= -f2- | sed -E 's/^"(.*)"$/\1/; s/^'"'"'(.*)'"'"'$/\1/'
}
GITHUB_TOKEN="$(envval GITHUB_TOKEN)"
GITHUB_REPO="$(envval GITHUB_REPO)"
started="$(date -u +%FT%TZ)"
result() { # ok message pushed
  local ok="$1" message="$2" pushed="$3" commit
  commit="$(git rev-parse --short HEAD 2>/dev/null || true)"
  printf '{"at":"%s","ok":%s,"pushed":%s,"commit":"%s","repo":"%s","message":%s}\n' \
    "$started" "$ok" "$pushed" "$commit" "$GITHUB_REPO" "$(printf '%s' "$message" | python3 -c 'import json,sys;print(json.dumps(sys.stdin.read()))')" > "$config_dir/status.json"
  echo "RESULT $(cat "$config_dir/status.json")"
  [[ "$ok" == true ]]
}
fail() { echo "ERROR: $*" >&2; result false "$*" false; exit 1; }

exec 9>"$config_dir/lock"
flock -n 9 || { echo "A sync is already running."; result false "A sync is already running." false; exit 3; }

# ---- repository -------------------------------------------------------------------------------
if [[ ! -d .git ]]; then
  git init -q -b main || fail "git init failed"
fi
git config user.name "Florida Bay Sync"
git config user.email "sync@floridabay.net"
git config core.autocrlf false
git config gc.auto 256

# Nested repositories (for example the cfx-server-data clone) cannot be tracked as plain files.
while IFS= read -r nested; do
  [[ -z "$nested" || "$nested" == "./.git" ]] && continue
  dest="$config_dir/nested-git/$(echo "$nested" | sed 's#[^A-Za-z0-9]#_#g')"
  mkdir -p "$(dirname "$dest")"
  echo "Moving nested repository $nested aside to $dest"
  mv "$nested" "$dest" || fail "could not move $nested"
done < <(find . \( -path ./artifacts -o -name node_modules -o -path ./server-data/cache \) -prune -o -name .git -print 2>/dev/null)

# ---- encryption key ---------------------------------------------------------------------------
key_file="$config_dir/passphrase"
if [[ ! -s "$key_file" ]]; then
  umask 077; openssl rand -base64 48 > "$key_file"
  echo "Created the encryption passphrase at $key_file - copy it somewhere safe; encrypted files cannot be opened without it."
fi

snap="$root/snapshots"; mkdir -p "$snap"
encrypt() { openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass "file:$key_file" -out "$2" -in "$1"; }

# ---- database ---------------------------------------------------------------------------------
if node "$root/scripts/db-dump.mjs" > "$config_dir/db.sql.tmp" 2> "$config_dir/db.err"; then
  gzip -9n < "$config_dir/db.sql.tmp" > "$config_dir/db.sql.gz.tmp"
  new="$(sha256sum "$config_dir/db.sql.tmp" | cut -d' ' -f1)"
  if [[ ! -f "$snap/fbrp-db.sql.gz.enc" || "$new" != "$(cat "$config_dir/db.sha256" 2>/dev/null)" ]]; then
    encrypt "$config_dir/db.sql.gz.tmp" "$snap/fbrp-db.sql.gz.enc" && echo "$new" > "$config_dir/db.sha256" && echo "Database snapshot updated."
  else echo "Database unchanged."; fi
else
  echo "WARNING: database dump failed: $(head -c 300 "$config_dir/db.err")" >&2
fi
rm -f "$config_dir/db.sql.tmp" "$config_dir/db.sql.gz.tmp"

# ---- private files (secrets, txAdmin state, KVP store, old backups, service tokens + databases) ---
private_paths=()
for item in .env services/fbrp-bot/.env services/gangsmanager/.env services/gangsmanager/gang_manager.db* services/businessmanager/.env services/businessmanager/business_manager.db* services/deptmanager/.env services/deptmanager/department_manager.db* server-data/secrets.cfg server-data/server.cfg server-data/server.cfg.* txData server-data/db backups; do
  [[ -e "$item" ]] && private_paths+=("$item")
done
if ((${#private_paths[@]})); then
  tar --sort=name --mtime='@0' --owner=0 --group=0 --numeric-owner --exclude='*.log' --exclude='*.pid' --exclude='.replxx_history' \
      -cf - "${private_paths[@]}" 2>/dev/null | gzip -9n > "$config_dir/private.tar.gz.tmp"
  new="$(sha256sum "$config_dir/private.tar.gz.tmp" | cut -d' ' -f1)"
  if [[ ! -f "$snap/private-files.tar.gz.enc" || "$new" != "$(cat "$config_dir/private.sha256" 2>/dev/null)" ]]; then
    encrypt "$config_dir/private.tar.gz.tmp" "$snap/private-files.tar.gz.enc" && echo "$new" > "$config_dir/private.sha256" && echo "Private files bundle updated."
  else echo "Private files unchanged."; fi
  rm -f "$config_dir/private.tar.gz.tmp"
fi

# A readable copy of the server config with the license key removed.
if [[ -f server-data/server.cfg ]]; then
  sed -E 's/^(sv_licenseKey[[:space:]]+).*/\1"REPLACE_WITH_CFX_LICENSE_KEY"/' server-data/server.cfg > "$snap/server.cfg.sanitized"
fi
{
  echo "# Restore notes (generated by scripts/github-sync.sh)"
  echo "fxserver_artifact: $(cat artifacts/alpine/.GITCOMMIT 2>/dev/null || ls artifacts/alpine 2>/dev/null | head -1 || echo unknown)"
  echo "node: $(node --version 2>/dev/null)"
  echo "mariadb_image: $(grep -E 'image:' docker-compose.yml | head -1 | sed 's/.*image: *//')"
} > "$snap/RESTORE-INFO.txt"

# ---- guard: never commit a known secret in plain text -------------------------------------------
git add -A >/dev/null 2>&1
leaks=""
secret_values="$config_dir/secret-values.tmp"
: > "$secret_values"; chmod 600 "$secret_values"
# Only values whose key looks secret (Discord IDs and URLs in the same files are public and
# legitimately appear in migrations and docs).
python3 - .env services/fbrp-bot/.env services/gangsmanager/.env services/businessmanager/.env services/deptmanager/.env server-data/secrets.cfg >> "$secret_values" <<'PY'
import re, sys
secret_key = re.compile(r"TOKEN|PASS|SECRET|SALT|KEY|CONNECTION_STRING", re.I)
for path in sys.argv[1:]:
    try:
        lines = open(path).read().splitlines()
    except OSError:
        continue
    for line in lines:
        text = line.strip()
        if not text or text.startswith("#"):
            continue
        match = re.match(r"^([A-Za-z0-9_]+)=(.*)$", text) or re.match(r"^set\s+([A-Za-z0-9_]+)\s+(.*)$", text)
        if not match or not secret_key.search(match.group(1)):
            continue
        value = match.group(2).strip().strip("\"'")
        if len(value) >= 12:
            print(value)
PY
grep -oE 'cfxk_[A-Za-z0-9_]+' server-data/server.cfg 2>/dev/null >> "$secret_values"
if [[ -s "$secret_values" ]]; then
  leaks="$(git grep --cached -l -I -F -f "$secret_values" -- . ':!snapshots' 2>/dev/null | head -5)"
fi
rm -f "$secret_values"
pattern='[MN][A-Za-z0-9]{23,27}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{27,}|discord(app)?\.com/api/webhooks/[0-9]+/[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|cfxk_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}'
leaks="$(printf '%s\n%s' "$leaks" "$(git grep --cached -l -I -E "$pattern" -- . ':!snapshots' ':!*/node_modules/*' 2>/dev/null | head -5)" | sed '/^$/d' | sort -u)"
if [[ -n "$leaks" ]]; then
  git reset -q
  fail "refusing to commit: secrets found in plain text in: $(echo "$leaks" | paste -sd, - | sed 's/,/, /g')"
fi

# ---- commit -----------------------------------------------------------------------------------
if git diff --cached --quiet; then
  changed=false
  echo "No changes to commit."
else
  changed=true
  count="$(git diff --cached --name-only | wc -l)"
  git commit -q -m "Project sync $(date -u +%FT%TZ) (${count} files)" || fail "git commit failed"
  echo "Committed $count changed files as $(git rev-parse --short HEAD)."
fi

# ---- push -------------------------------------------------------------------------------------
if [[ -z "$GITHUB_TOKEN" || -z "$GITHUB_REPO" ]]; then
  result true "Saved locally ($(git rev-parse --short HEAD)). Add GITHUB_TOKEN and GITHUB_REPO to services/fbrp-bot/.env to push to GitHub." false
  exit 0
fi
[[ "$GITHUB_REPO" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] || fail "GITHUB_REPO must look like owner/name"
api() { curl -sS -m 30 -H "Authorization: Bearer $GITHUB_TOKEN" -H "Accept: application/vnd.github+json" -H "X-GitHub-Api-Version: 2022-11-28" "$@"; }
status="$(api -o "$config_dir/repo.json" -w '%{http_code}' "https://api.github.com/repos/$GITHUB_REPO")" || fail "could not reach GitHub"
if [[ "$status" == "404" ]]; then
  owner="${GITHUB_REPO%%/*}"; name="${GITHUB_REPO##*/}"
  login="$(api https://api.github.com/user | python3 -c 'import json,sys;print(json.load(sys.stdin).get("login",""))')"
  if [[ "${login,,}" == "${owner,,}" ]]; then endpoint="https://api.github.com/user/repos"; else endpoint="https://api.github.com/orgs/$owner/repos"; fi
  status="$(api -o "$config_dir/repo.json" -w '%{http_code}' -X POST "$endpoint" -d "{\"name\":\"$name\",\"private\":true,\"description\":\"Florida Bay Roleplay - full project backup\"}")"
  [[ "$status" == "201" ]] || fail "could not create the private repository (HTTP $status): $(head -c 200 "$config_dir/repo.json")"
  echo "Created private repository $GITHUB_REPO."
elif [[ "$status" != "200" ]]; then
  fail "GitHub returned HTTP $status for $GITHUB_REPO (check GITHUB_TOKEN)"
fi
[[ "$(python3 -c 'import json;print(json.load(open("'"$config_dir"'/repo.json")).get("private"))')" == "True" ]] || fail "refusing to push: $GITHUB_REPO is not private"

auth="$(printf 'x-access-token:%s' "$GITHUB_TOKEN" | base64 -w0)"
if git -c credential.helper= -c "http.extraheader=Authorization: Basic $auth" push -q "https://github.com/$GITHUB_REPO.git" HEAD:main 2> "$config_dir/push.err"; then
  result true "Synced to github.com/$GITHUB_REPO at $(git rev-parse --short HEAD)." true
else
  fail "push failed: $(sed -E 's#(https://)[^@/]*@#\1***@#' "$config_dir/push.err" | head -c 300)"
fi
