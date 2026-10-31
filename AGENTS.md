# Florida Bay RP agent instructions

## Default behavior

The user should only need to describe the desired result. Translate ordinary
requests such as "add", "fix", "change", "remove", or "build" into a complete
production delivery: inspect, implement, test, commit, push, merge, deploy, and
verify. Do not require the user to repeat this workflow.

An implementation request explicitly authorizes deploying that request after
its tests pass. If the user says `do not deploy`, `code only`, `plan`, `review`,
`diagnose`, or otherwise limits the task, respect that limit and do not deploy.
Never infer authorization to change DNS, rotate credentials, delete production
data, perform a destructive migration, or expand beyond the requested feature.

If blocked, exhaust safe diagnostics and report the exact blocker. Never hide a
partial deployment or claim success before production verification passes.

## Production topology

This is one repository deployed to two production VPSs:

- `control`: `floridabay.net`, the web/API service, every Discord bot, Caddy,
  the central bare Git remote, and agent workspaces.
- `game`: FXServer, txAdmin, MariaDB, FiveM resources, and the HTTPS redirect
  for `join.floridabay.net`.

Read `/home/ubuntu/.config/fbrp-split.env` at the start of every task to confirm
the current host. Normal development, release, and deployment happen from the
control VPS. Never put IP addresses or credentials in tracked files.

The hosts communicate through `fbrp-game-tunnel.service`. On control, MariaDB
is `127.0.0.1:13307`, FiveM HTTP is `127.0.0.1:30121`, and txAdmin is
`127.0.0.1:40121`. These are private tunnel endpoints, not public listeners.

## Workspaces and isolation

- Codex workspace: `/home/ubuntu/work/fbrp-codex`
- Claude workspace: `/home/ubuntu/work/fbrp-claude`
- Release workspace: `/home/ubuntu/work/fbrp-release`
- Live production checkout: `/home/ubuntu/fbrp`
- Central remote: `/home/ubuntu/git/fbrp.git`

Codex must work only in the Codex workspace and use a new `codex/<slug>` branch.
Claude must work only in the Claude workspace and use a new `claude/<slug>`
branch. Never edit the live checkout to implement a feature. Do not reuse,
reset, or discard another agent's branch or uncommitted work.

At the beginning of an implementation:

1. Confirm `FBRP_ROLE=control` in the split environment file.
2. Check the assigned workspace for unrelated changes. Preserve them and stop
   if they prevent safe isolation.
3. Fetch `origin`, switch to `main`, fast-forward it to `origin/main`, and create
   a unique feature branch.
4. Inspect the relevant code and implement the whole requested behavior across
   every affected component. Do not ask the user which server a file belongs to
   when the repository and this document answer that question.

Keep one feature on one branch. Commit and push normally; never force-push.

## Component ownership

- Control runtime: `services/`, including the website, API, Node bots, and
  Python manager bots.
- Game runtime: `server-data/`, FiveM resources, `start.sh`, and
  `docker-compose.yml`.
- MariaDB runs on game. Schema migration code belongs to the application that
  owns it. Changes spanning schema and consumers require an `all` deployment.
- The control-side `[vehicles]`, `[eup]`, and `[standalone]/vMenu/config` paths
  are SSHFS views of authoritative game directories. They support personals/liveries,
  EUP packs, and addon peds. `[standalone]/vMenu.Enhanced/config` remains mounted
  only as an inactive rollback snapshot.
  Treat these mounted paths as live production data, not development folders.
- Secrets are Git-ignored. Never reveal, copy into tracked files, rotate, or
  replace Cfx, Corevia, Discord, database, OAuth, or API credentials.
- Corevia and ExeclyAI remain on the original VPS and are outside this project's
  deployment scope unless the user explicitly names them.

## Tests and deployment classification

Run narrow checks while developing and the complete applicable suites before
release. Add or update tests for changed behavior. Classify the release as:

- `control`: only website, API, or bot code changed.
- `game`: only FiveM/game code changed.
- `all`: both planes changed, database compatibility changed, or coordinated
  restarts are required.

When uncertain between a narrower deployment and `all`, use `all`.

## Automatic release workflow

After implementation and tests succeed:

1. Fetch `origin` again. Incorporate the latest `origin/main` without rewriting
   published history, resolve conflicts carefully, and rerun affected tests.
2. Commit the complete feature and push its branch to `origin`.
3. Create `/home/ubuntu/.local/state` with mode `0700`, then acquire
   `/home/ubuntu/.local/state/fbrp-release.lock` with `flock`. Treat failure to
   create or acquire the lock as fatal. Hold the lock continuously through
   merge, push, deployment, and verification so that Codex and Claude cannot
   release simultaneously.
4. In `/home/ubuntu/work/fbrp-release`, fetch `origin`, switch to `main`, and
   fast-forward to `origin/main`.
5. Merge the feature with `git merge --ff-only origin/<feature-branch>`. If this
   cannot fast-forward because `main` advanced, return to the agent workspace,
   merge the latest `origin/main` into the feature branch without force-pushing,
   rerun tests, push, and retry.
6. Push release `main` to `origin`.
7. Deploy from the control VPS using exactly one command. AI agents (Claude and
   Codex) always add `--no-restart` to `game` and `all` deployments:

```bash
/home/ubuntu/fbrp/scripts/split-deploy.sh control main
/home/ubuntu/fbrp/scripts/split-deploy.sh game main --no-restart
/home/ubuntu/fbrp/scripts/split-deploy.sh all main --no-restart
```

The deploy script tests the exact revision, creates a database backup for game
deployments, enforces fast-forward-only updates, orders coordinated restarts,
and verifies both hosts. Do not bypass it with manual copies or service restarts.

**FiveM restarts are the owner's call.** With `--no-restart` every change goes
live (the control plane restarts as usual, game files and server.cfg edits are
fast-forwarded on the game host) except the FXServer restart itself. The new
game files apply the next time FXServer restarts: the owner restarts it in
txAdmin, a scheduled restart fires, or the owner explicitly asks an agent to
restart it. Never stop or restart `fbrp-server.service` or FXServer on your own
initiative, and say in the report that a FiveM restart is pending. Tell the
owner when a change only works after the restart (client/server version skew
is possible for clients that join before it). A changed `docker-compose.yml` or
`start.sh` needs a real `fbrp-server.service` restart, not only a txAdmin one.

8. Run `/home/ubuntu/fbrp/scripts/split-deploy.sh verify` and perform focused
   functional checks for the changed behavior that can be checked without a
   FiveM restart. Confirm affected services remain active without a restart
   loop. `verify` prints whether a FiveM restart is still pending.
9. Report the branch, commit, deployment class, tests, and live verification.

If merge, deployment, migration, or verification fails, keep the release lock
while gathering the immediate evidence, then stop and report the exact state.
Do not improvise a destructive rollback, reset branches, or conceal the failure.

## Requests that are not implementation

Questions, explanations, audits, reviews, status checks, planning, and diagnosis
are read-only unless the user also requests a change. A review request does not
authorize merging or deploying the reviewed branch. A request to implement a
fix does authorize the normal automatic release workflow above.
