#!/usr/bin/env bash
# Integrates and releases an owner-approved developer submission using the Claude Code or Codex CLI.
# Started only by the DevOps bot after the owner accepted the submission in the website portal.
#
#   dev-submission-implement.sh --id <submission> --agent claude|codex --dir <staging directory> [--model <name>] [--effort <level>]
#
# Two phases, so the agent never needs git-write, network or deploy rights:
#
#   1. AGENT   The CLI runs with its own login (no API keys) inside a sandbox with an explicit tool
#              allowlist. It may read files, edit files in the workspace and run the test suites.
#              It cannot commit, push, switch branches, use the network, or touch the release tooling.
#   2. RELEASE This script (not the agent) checks the changed paths, runs the full test suite, commits,
#              pushes the branch, merges it fast-forward only under the shared release lock, deploys with
#              split-deploy.sh and verifies production, exactly as AGENTS.md describes.
#
# The staging directory holds PROMPT.md, SUBMISSION.md and repo/ (the developer's files, reference only).
# The script writes run.log, final.txt and exit.json into it; the bot picks those up.
#
# Environment:
#   DEV_SUBMISSION_AUTO_RELEASE=0   stop after pushing the branch (default 1: merge, deploy, verify)
#   DEV_SUBMISSION_DRY_RUN=1        print the agent command line and exit before running anything
#   DEV_SUBMISSION_TIMEOUT          agent time limit (default 3h)
#   DEV_SUBMISSION_WORKSPACE_CLAUDE / DEV_SUBMISSION_WORKSPACE_CODEX   override the agent workspaces

set -Eeuo pipefail
IFS=$'\n\t'

readonly SPLIT_ENV="${FBRP_SPLIT_ENV:-/home/ubuntu/.config/fbrp-split.env}"
readonly RELEASE_WORKSPACE=/home/ubuntu/work/fbrp-release
readonly LOCK_DIR=/home/ubuntu/.local/state
readonly LOCK_FILE="$LOCK_DIR/fbrp-release.lock"
readonly DEPLOY=/home/ubuntu/fbrp/scripts/split-deploy.sh
readonly CENTRAL_REMOTE=/home/ubuntu/git/fbrp.git
readonly TIMEOUT="${DEV_SUBMISSION_TIMEOUT:-3h}"
readonly AUTO_RELEASE="${DEV_SUBMISSION_AUTO_RELEASE:-1}"

# Paths an agent change may never touch. A submission that needs one of these is an owner decision.
readonly DENY_PATHS='^(\.env|.*/\.env[^/]*|.*\.pem|.*\.key|.*/secrets?[^/]*|\.git/|\.gitignore|\.gitattributes|\.claude/|\.codex/|AGENTS\.md|CLAUDE\.md|deploy/|scripts/split-deploy\.sh|scripts/dev-submission-implement\.sh|scripts/github-sync\.sh|scripts/configure-control-game-link\.sh|services/fbrp-bot/src/dev-review/|server-data/resources/\[standalone\]/vMenu/vMenu(Client|Server)\.net\.dll)'

# Tools the agent may use. Anything else is refused. There is deliberately no commit, push, checkout,
# reset, network, ssh, sudo, rm or deploy tool in this list.
readonly CLAUDE_ALLOWED='Read,Glob,Grep,Edit,Write,Bash(git status:*),Bash(git diff:*),Bash(git log:*),Bash(git show:*),Bash(git ls-files:*),Bash(npm test:*),Bash(npm run check:*),Bash(node --test:*),Bash(node --check:*),Bash(ls:*)'
readonly CLAUDE_DENIED='WebFetch,WebSearch,Bash(git push:*),Bash(git commit:*),Bash(git checkout:*),Bash(git switch:*),Bash(git reset:*),Bash(git merge:*),Bash(git rebase:*),Bash(git clean:*),Bash(git stash:*),Bash(curl:*),Bash(wget:*),Bash(ssh:*),Bash(scp:*),Bash(sudo:*),Bash(rm:*),Bash(systemctl:*),Bash(flock:*),Bash(bash:*),Bash(sh:*)'
readonly CLAUDE_SETTINGS='{"sandbox":{"enabled":true,"autoAllowBashIfSandboxed":false,"allowUnsandboxedCommands":false,"network":{"allowedDomains":[]}}}'

id="" agent="" dir="" model="" effort=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --id) id="${2:-}"; shift 2 ;;
    --agent) agent="${2:-}"; shift 2 ;;
    --dir) dir="${2:-}"; shift 2 ;;
    --model) model="${2:-}"; shift 2 ;;
    --effort) effort="${2:-}"; shift 2 ;;
    *) echo "unknown argument: $1" >&2; exit 64 ;;
  esac
done

[[ "$id" =~ ^[0-9]+$ ]] || { echo "--id must be a number" >&2; exit 64; }
[[ -z "$model" || "$model" =~ ^[A-Za-z0-9._:-]{1,60}$ ]] || { echo "--model contains unsupported characters" >&2; exit 64; }
[[ -z "$effort" || "$effort" =~ ^[a-z]{3,10}$ ]] || { echo "--effort must be a plain level name" >&2; exit 64; }
model_args=() effort_claude=() effort_codex=()
[[ -z "$model" ]] || model_args=(--model "$model")
[[ -z "$effort" ]] || { effort_claude=(--effort "$effort"); effort_codex=(-c "model_reasoning_effort=\"$effort\""); }
[[ "$agent" == claude || "$agent" == codex ]] || { echo "--agent must be claude or codex" >&2; exit 64; }
[[ -n "$dir" && -f "$dir/PROMPT.md" && -f "$dir/SUBMISSION.md" && -d "$dir/repo" ]] || { echo "staging directory is incomplete: $dir" >&2; exit 64; }

export PATH="/home/ubuntu/.local/bin:/usr/local/bin:/usr/bin:/bin"
log="$dir/run.log"
: >"$log"
exec 2>>"$log"
rm -f "$dir/exit.json" "$dir/final.txt"

finish() {
  local code=$?
  printf '{"exit":%d,"finished":%d}\n' "$code" "$(date +%s)" >"$dir/exit.json"
  exit "$code"
}
trap finish EXIT

say() { printf '[%s] %s\n' "$(date -u +%FT%TZ)" "$*" >>"$log"; }
report() { printf '%s\n' "$*" >>"$dir/final.txt"; }
stop() { say "ERROR: $*"; report "Stopped: $*"; exit 1; }

# The CLIs must use their own subscription login, never an API key from this environment.
unset ANTHROPIC_API_KEY ANTHROPIC_AUTH_TOKEN OPENAI_API_KEY CODEX_API_KEY OPENAI_BASE_URL

grep -qx 'FBRP_ROLE=control' "$SPLIT_ENV" 2>/dev/null || stop "This is not the control server (FBRP_ROLE=control is missing from $SPLIT_ENV)."

case "$agent" in
  claude)
    workspace="${DEV_SUBMISSION_WORKSPACE_CLAUDE:-/home/ubuntu/work/fbrp-claude}"; prefix=claude
    command -v claude >/dev/null || stop "The claude CLI is not installed."
    command -v bwrap >/dev/null || stop "bubblewrap (bwrap) is required for the Claude sandbox and is not installed."
    ;;
  codex)
    workspace="${DEV_SUBMISSION_WORKSPACE_CODEX:-/home/ubuntu/work/fbrp-codex}"; prefix=codex
    command -v codex >/dev/null || stop "The codex CLI is not installed."
    ;;
esac
[[ -d "$workspace/.git" ]] || stop "Workspace $workspace is missing."

# Another agent may be mid-task in the workspace: preserve their work and stop instead of touching it.
if [[ -n "$(git -C "$workspace" status --porcelain)" ]]; then
  stop "Workspace $workspace has uncommitted or untracked changes. Finish or commit that work, then retry from the portal."
fi

agent_command() {
  case "$agent" in
    claude)
      printf '%s\n' claude "${model_args[@]}" "${effort_claude[@]}" -p --permission-mode acceptEdits --allowedTools "$CLAUDE_ALLOWED" --disallowedTools "$CLAUDE_DENIED" --settings "$CLAUDE_SETTINGS" --add-dir "$dir" '<PROMPT.md>'
      ;;
    codex)
      printf '%s\n' codex exec "${model_args[@]}" "${effort_codex[@]}" --sandbox workspace-write -c 'approval_policy="never"' -c 'sandbox_workspace_write.network_access=false' -C "$workspace" --add-dir "$dir" --output-last-message "$dir/final.txt" '- <PROMPT.md>'
      ;;
  esac
}

if [[ "${DEV_SUBMISSION_DRY_RUN:-0}" == 1 ]]; then
  say "Dry run for $agent in $workspace"
  agent_command >>"$log"
  report "Dry run: nothing was started."
  exit 0
fi

# ---- phase 1: the agent edits the workspace on a fresh branch --------------------------------------
git -C "$workspace" fetch -q origin || stop "git fetch origin failed in $workspace."
branch="$prefix/dev-submission-$id"
if git -C "$workspace" show-ref --verify --quiet "refs/heads/$branch" || git -C "$workspace" ls-remote --exit-code --heads origin "$branch" >/dev/null 2>&1; then
  branch="$branch-$(date +%s)"
fi
git -C "$workspace" switch -q -c "$branch" origin/main || stop "Could not create branch $branch from origin/main."
say "Branch $branch created from origin/main in $workspace"

cd "$workspace"
set +e
case "$agent" in
  claude)
    timeout "$TIMEOUT" claude "${model_args[@]}" "${effort_claude[@]}" -p "$(cat "$dir/PROMPT.md")" \
      --permission-mode acceptEdits \
      --allowedTools "$CLAUDE_ALLOWED" \
      --disallowedTools "$CLAUDE_DENIED" \
      --settings "$CLAUDE_SETTINGS" \
      --add-dir "$dir" \
      >"$dir/final.txt"
    ;;
  codex)
    timeout "$TIMEOUT" codex exec "${model_args[@]}" "${effort_codex[@]}" \
      --sandbox workspace-write \
      -c 'approval_policy="never"' \
      -c 'sandbox_workspace_write.network_access=false' \
      -C "$workspace" \
      --add-dir "$dir" \
      --output-last-message "$dir/final.txt" \
      - <"$dir/PROMPT.md" >>"$log"
    ;;
esac
agent_code=$?
set -e
say "$agent exited with code $agent_code"
[[ $agent_code -eq 0 ]] || stop "The $agent CLI failed with exit code $agent_code. Branch $branch in $workspace holds whatever it changed."

# ---- phase 2: this script checks, tests, commits and releases --------------------------------------
changed="$(git status --porcelain --untracked-files=all | sed -E 's/^.. //; s/^"(.*)"$/\1/')"
[[ -n "$changed" ]] || stop "The agent made no changes. Nothing to release."

blocked="$(grep -E "$DENY_PATHS" <<<"$changed" || true)"
[[ -z "$blocked" ]] || stop "The agent touched paths that need the owner: $(tr '\n' ' ' <<<"$blocked")"

git add -A
if git diff --cached --numstat | awk '$1 == "-" || $2 == "-" { found = 1 } END { exit !found }'; then
  git reset -q
  stop "The change contains binary files, which this runner never releases. Review branch $branch by hand."
fi

say "Running the full test suite"
(cd services/fbrp-bot && npm test) >>"$log" 2>&1 || { git reset -q; stop "The test suite failed. Nothing was committed. Branch $branch in $workspace holds the changes."; }
git add -A
git -c user.name="FBRP Dev Intake" -c user.email="dev-intake@floridabay.net" commit -q -m "Integrate developer submission #$id" -m "Accepted by the owner in the portal. Implemented by the $agent CLI and released by scripts/dev-submission-implement.sh." || stop "git commit failed."
commit="$(git rev-parse --short HEAD)"
git push -q -u origin "$branch" || stop "git push of $branch failed."
say "Pushed $branch at $commit"
report ""
report "Branch $branch pushed at $commit. $(git diff --shortstat origin/main...HEAD)"

[[ "$AUTO_RELEASE" == 1 ]] || { report "Automatic release is off: the branch is pushed and waiting for you."; exit 0; }

# Deployment class from the paths, never from anything the agent wrote.
control=0 game=0 other=0
while IFS= read -r path; do
  case "$path" in
    services/*) control=1 ;;
    server-data/*|start.sh|docker-compose.yml) game=1 ;;
    docs/*|README.md|BOT_COMMANDS.md) ;;
    *) other=1 ;;
  esac
done < <(git diff --name-only origin/main...HEAD)
if [[ $other -eq 1 || ( $control -eq 1 && $game -eq 1 ) ]]; then target=all
elif [[ $game -eq 1 ]]; then target=game
elif [[ $control -eq 1 ]]; then target=control
else report "Documentation only: nothing to deploy."; exit 0
fi
say "Deployment class: $target"

mkdir -p "$LOCK_DIR"; chmod 0700 "$LOCK_DIR"
exec 8>"$LOCK_FILE"
flock -w 3600 8 || stop "Could not get the release lock within an hour."
say "Release lock held"

merge_once() {
  git -C "$RELEASE_WORKSPACE" fetch -q origin &&
    git -C "$RELEASE_WORKSPACE" switch -q main &&
    git -C "$RELEASE_WORKSPACE" merge -q --ff-only origin/main &&
    git -C "$RELEASE_WORKSPACE" merge -q --ff-only "origin/$branch"
}
if ! merge_once; then
  say "main moved: merging the latest origin/main into $branch and retesting"
  git fetch -q origin && git merge -q --no-edit origin/main || { git merge --abort 2>/dev/null || true; stop "Merging origin/main into $branch conflicted. Resolve by hand."; }
  (cd services/fbrp-bot && npm test) >>"$log" 2>&1 || stop "Tests failed after merging the latest main."
  git push -q origin "$branch" || stop "Could not push the updated $branch."
  merge_once || stop "Could not fast-forward main to $branch. The lock is released, nothing was pushed to main."
fi
git -C "$RELEASE_WORKSPACE" push -q origin main || stop "Pushing main failed."
say "main pushed"

"$DEPLOY" "$target" main --no-restart >>"$log" 2>&1 || stop "split-deploy.sh $target failed. main is already pushed. Check the log, then decide how to proceed."
"$DEPLOY" verify >>"$log" 2>&1 || stop "split-deploy.sh verify failed after deploying $target. Check the log."
say "Deployed and verified ($target)"
if [[ "$target" == control ]]; then
  report "Released to production: control deployment, verified."
else
  report "Released to production: $target deployment, verified. The FiveM server was NOT restarted: restart it in txAdmin (or wait for the scheduled restart) to load the new game files."
fi
exit 0
