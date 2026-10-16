# Florida Bay RP agent instructions

## Production topology

This is one repository deployed to two production VPSs:

- `control`: `floridabay.net`, the web/API service, every Discord bot, Caddy,
  the central bare Git remote, and agent workspaces.
- `game`: FXServer, txAdmin, MariaDB, FiveM resources, and the HTTPS redirect
  for `join.floridabay.net`.

Read `/home/ubuntu/.config/fbrp-split.env` at the start of work to identify the
current host. Never put IP addresses or credentials in tracked files.

The hosts communicate through `fbrp-game-tunnel.service`. On control, MariaDB
is `127.0.0.1:13307`, FiveM HTTP is `127.0.0.1:30121`, and txAdmin is
`127.0.0.1:40121`. These are private tunnel endpoints, not public listeners.

## Where to work

- Codex workspace: `/home/ubuntu/work/fbrp-codex`
- Claude workspace: `/home/ubuntu/work/fbrp-claude`
- Control-only release workspace: `/home/ubuntu/work/fbrp-release`
- Live production checkout: `/home/ubuntu/fbrp`

Make code changes only in the relevant agent workspace. Do not edit the live
production checkout. Do not deploy, restart a production service, alter DNS,
or run a production migration unless the user explicitly asks you to.

Before editing, fetch `origin`, rebase your agent branch on `origin/main`, and
confirm the worktree has no unrelated changes. Keep
one feature on one branch and commit. Push that branch to `origin`; do not
force-push. Another agent may be working concurrently, so do not reuse or reset
their branch and do not discard changes you did not create.

## Component ownership

- Control runtime: `services/`, including website, API, Node bots, and Python
  manager bots.
- Game runtime: `server-data/`, FiveM resources, `start.sh`, and
  `docker-compose.yml`.
- MariaDB runs on game. Schema migration code belongs to the application that
  owns it and must be deployed with both planes when compatibility spans them.
- The control-side `[vehicles]` path is an SSHFS view of the authoritative game
  directory. Treat it as production data.
- Secrets are intentionally Git-ignored. Never reveal, copy into tracked files,
  rotate, or replace Cfx, Corevia, Discord, database, OAuth, or API credentials.

## Validation and release

Run the narrowest relevant checks while developing. Before handing off a
branch, run the complete applicable test suites. Explain whether the change is
`control`, `game`, or `all`:

- `control`: only website/API/bot code changed.
- `game`: only FiveM/game code changed.
- `all`: a feature touches both, changes DB compatibility, or requires a
  coordinated restart.

Reviewed branches are merged into `main` from the control release workspace.
Production is then deployed only from the control VPS with:

```bash
/home/ubuntu/fbrp/scripts/split-deploy.sh control main
/home/ubuntu/fbrp/scripts/split-deploy.sh game main
/home/ubuntu/fbrp/scripts/split-deploy.sh all main
```

The deploy script tests the exact revision, creates a database backup for game
deployments, enforces fast-forward-only updates, orders coordinated restarts,
and verifies both hosts. If deployment fails, inspect and report the failure;
do not improvise a destructive rollback.
