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

This repository is deployed to one production VPS (`fbrp-game`) that runs everything: `floridabay.net`
(website and API), every Discord bot, Caddy, MariaDB, FXServer, txAdmin, the central bare Git remote and the agent
workspaces. There is no second host, tunnel or network mount any more. Local endpoints: MariaDB
`127.0.0.1:3307`, FiveM `127.0.0.1:30120`, txAdmin `127.0.0.1:40120`, website/API `127.0.0.1:8080`
(Caddy fronts the public domains; Cloudflare sits in front of Caddy). Never put IP addresses or credentials in
tracked files.

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

1. Confirm you are on the production host (`/home/ubuntu/fbrp` and `/home/ubuntu/git/fbrp.git` exist).
2. Check the assigned workspace for unrelated changes. Preserve them and stop
   if they prevent safe isolation.
3. Fetch `origin`, switch to `main`, fast-forward it to `origin/main`, and create
   a unique feature branch.
4. Inspect the relevant code and implement the whole requested behavior across
   every affected component. Do not ask the user which server a file belongs to
   when the repository and this document answer that question.

Keep one feature on one branch. Commit and push normally; never force-push.

## Component ownership

- Services: `services/`, including the website, API, Node bots and Python manager bots.
- Game runtime: `server-data/`, FiveM resources, `start.sh`, and `docker-compose.yml`.
- MariaDB runs in the `fbrp-mariadb` container. Schema migration code belongs to the application that owns it
  (the bot runs `migrate.js` on start; `fbrp_core` applies the early migrations).
- `[vehicles]`, `[eup]`, and `[standalone]/vMenu/config` are live production data (personal vehicles/liveries, EUP
  packs, addon peds), written by the website and bots at any time. Treat them as production data, not development
  folders. `[standalone]/vMenu.Enhanced/config` remains only as an inactive rollback snapshot.
- Secrets are Git-ignored. Never reveal, copy into tracked files, rotate, or
  replace Cfx, Corevia, Discord, database, OAuth, or API credentials.
- Corevia and ExeclyAI remain on the original VPS and are outside this project's
  deployment scope unless the user explicitly names them.

## Tests and deployment

Run narrow checks while developing and the complete applicable suites before release. Add or update tests for
changed behavior. `deploy.sh` works out what a release touches: `services/`, `deploy/` and `scripts/` changes
restart the website, API and bots; `server-data/`, `docker-compose.yml` and `start.sh` changes update the game
files and, unless `--no-restart` is given, restart FXServer. A release touching both does both.

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
7. Deploy with exactly one command. AI agents (Claude and Codex) always add `--no-restart`:

```bash
/home/ubuntu/fbrp/scripts/deploy.sh deploy main --no-restart
```

The deploy script tests the exact revision, creates a database backup, enforces fast-forward-only updates,
orders the restarts, and verifies the host. Do not bypass it with manual copies or service restarts.

**FiveM restarts are the owner's call.** With `--no-restart` every change goes
live (the bots restart as usual, game files and server.cfg edits are fast-forwarded) except the FXServer restart itself. The new
game files apply the next time FXServer restarts: the owner restarts it in
txAdmin, a scheduled restart fires, or the owner explicitly asks an agent to
restart it. Never stop or restart `fbrp-server.service` or FXServer on your own
initiative, and say in the report that a FiveM restart is pending. Tell the
owner when a change only works after the restart (client/server version skew
is possible for clients that join before it). A changed `docker-compose.yml` or
`start.sh` needs a real `fbrp-server.service` restart, not only a txAdmin one.

8. Run `/home/ubuntu/fbrp/scripts/deploy.sh verify` and perform focused
   functional checks for the changed behavior that can be checked without a
   FiveM restart. Confirm affected services remain active without a restart
   loop. `verify` prints whether a FiveM restart is still pending.
9. Report the branch, commit, what the release touched, tests, and live verification.

If merge, deployment, migration, or verification fails, keep the release lock
while gathering the immediate evidence, then stop and report the exact state.
Do not improvise a destructive rollback, reset branches, or conceal the failure.

## Requests that are not implementation

Questions, explanations, audits, reviews, status checks, planning, and diagnosis
are read-only unless the user also requests a change. A review request does not
authorize merging or deploying the reviewed branch. A request to implement a
fix does authorize the normal automatic release workflow above.
