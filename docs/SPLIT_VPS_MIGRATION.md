# Florida Bay RP: exact two-VPS migration guide

This guide moves the current Florida Bay RP installation from this source VPS
to two new VPSs:

- **Control VPS:** website, API, all Discord bots, Caddy, Git, Codex, and Claude.
- **Game VPS:** FiveM/FXServer, txAdmin, MariaDB, resources, and the HTTPS join
  redirect.

Only FBRP is moved. AICaller/ExeclyAI, Ascent, Corevia infrastructure, and other
unrelated source-VPS projects are not changed. The migration copies and reuses
the current Cfx, Corevia, Discord, OAuth, database, and API credentials. It does
not create or replace licenses.

## What “cutover” means

Preparation copies and configures the new servers while the old one stays live.
**Cutover** is the short maintenance window when the script:

1. stops every old FBRP bot and the old FXServer;
2. takes the final file copy and MariaDB dump;
3. restores MariaDB and starts FiveM on the game VPS;
4. starts the website, API, and bots on the control VPS; and
5. creates a temporary web bridge through the old VPS while DNS updates.

There is downtime during these steps. The old and new FXServers are never run
at the same time, which prevents the existing Cfx/Corevia identity from being
used concurrently.

## 1. Save the migration kit in Git

Run on the current/source VPS:

```bash
cd /home/ubuntu/fbrp
git diff --check
git add AGENTS.md CLAUDE.md docs/SPLIT_VPS_MIGRATION.md \
  scripts/three-vps-migration.sh scripts/split-deploy.sh
git commit -m "Add split VPS migration and deployment tooling"
```

Do not add `.env`, `secrets.cfg`, `server.cfg`, or any key. They remain ignored
and are transferred directly over SSH by the migration script.

## 2. Create the SSH key used to bootstrap the new servers

Still on the source VPS:

```bash
test -f /home/ubuntu/.ssh/id_ed25519 || \
  ssh-keygen -t ed25519 -N '' -f /home/ubuntu/.ssh/id_ed25519
cat /home/ubuntu/.ssh/id_ed25519.pub
```

Copy the single `ssh-ed25519 ...` line shown by the last command. Add it as the
SSH key when creating **both** new VPSs.

## 3. Create the two VPSs

Create two clean servers with these exact base settings:

- Ubuntu Server 22.04 LTS, AMD64
- login user `ubuntu`
- SSH key from step 2
- passwordless `sudo` for `ubuntu` (the normal cloud image default)
- unique public IPv4 addresses

Recommended starting sizes based on this installation:

- Control: 2 vCPU, 4 GB RAM, 40 GB SSD
- Game: at least 4 vCPU, 8 GB RAM, 80 GB SSD

Do not install FBRP manually and do not create `/home/ubuntu/fbrp` yourself.
The script deliberately refuses to overwrite a nonempty unrecognized target.

Write the two public IPv4 addresses down:

```text
CONTROL_IP = the website/API/bot VPS
GAME_IP    = the FiveM/MariaDB VPS
```

## 4. Configure provider firewalls

Use the VPS provider's firewall/security-group page. Do not expose MariaDB port
3307 or txAdmin port 40120 publicly.

Control VPS inbound rules:

```text
TCP 22       from your admin IP and the old/source VPS IP
TCP 80       from anywhere
TCP 443      from anywhere
UDP 443      from anywhere
```

Game VPS inbound rules:

```text
TCP 22       from your admin IP, the old/source VPS IP, and CONTROL_IP
TCP 80       from anywhere
TCP 443      from anywhere
UDP 443      from anywhere
TCP 30120    from anywhere
UDP 30120    from anywhere
```

Allow all outbound traffic on both VPSs. After the source is retired, remove
its IP from both TCP 22 rules. The install script also enables UFW locally.

## 5. Test access from the source VPS

Run on the source VPS, replacing only the two values when prompted:

```bash
read -rp 'Control VPS IPv4: ' CONTROL_IP
read -rp 'Game VPS IPv4: ' GAME_IP
printf 'CONTROL_IP=%s\nGAME_IP=%s\n' "$CONTROL_IP" "$GAME_IP"
ssh -o StrictHostKeyChecking=accept-new "ubuntu@$CONTROL_IP" \
  'hostname; sudo -n true; echo control-ok'
ssh -o StrictHostKeyChecking=accept-new "ubuntu@$GAME_IP" \
  'hostname; sudo -n true; echo game-ok'
```

Both commands must print their hostname and an `*-ok` line without requesting
a password. Keep this shell open: `CONTROL_IP` and `GAME_IP` are set in it.

## 6. Lower DNS TTLs before the move

In the DNS provider, change the TTL of these existing records to 300 seconds:

```text
floridabay.net
www.floridabay.net
tx.floridabay.net
join.floridabay.net
```

Do not change their addresses yet. Ideally do this at least one old TTL period
before cutover.

## 7. Prepare both new VPSs

Use `tmux` so an interrupted SSH connection does not stop the preparation:

```bash
cd /home/ubuntu/fbrp
tmux new -s fbrp-move
./scripts/three-vps-migration.sh prepare \
  "ubuntu@$CONTROL_IP" "ubuntu@$GAME_IP"
```

The command installs current Codex and Claude CLIs, Caddy, Docker where needed,
copies FBRP, creates dedicated SSH keys and tunnels, installs services, and
creates isolated agent workspaces. It does **not** stop current production.

If your SSH session drops:

```bash
tmux attach -t fbrp-move
```

Preparation must finish with `Preparation complete` before continuing.

If the control VPS was prepared before the game VPS was purchased, attach the
game host later by running this on control after the game host has an `ubuntu`
account with SSH access:

```bash
cd /home/ubuntu/fbrp
./scripts/configure-control-game-link.sh "ubuntu@$GAME_IP"
```

This creates the encrypted database/FiveM/txAdmin tunnel and mounts all three
authoritative upload locations from game: `[vehicles]` for personals and
liveries, `[eup]` for clothing packs, and vMenu's `config` directory for addon
peds. The game IP is written only to the ignored host configuration, never to
Git.

## 8. Sign into Codex and Claude on both VPSs

Open four terminal sessions. Authentication is per Linux user and per host.

Control VPS, Codex:

```bash
ssh "ubuntu@$CONTROL_IP"
cd /home/ubuntu/work/fbrp-codex
codex login --device-auth
codex
```

Control VPS, Claude:

```bash
ssh "ubuntu@$CONTROL_IP"
cd /home/ubuntu/work/fbrp-claude
claude
```

Choose the appropriate Claude account option and finish its browser login.
Then exit both agents; this step is only verifying authentication.

Game VPS, Codex:

```bash
ssh "ubuntu@$GAME_IP"
cd /home/ubuntu/work/fbrp-codex
codex login --device-auth
codex
```

Game VPS, Claude:

```bash
ssh "ubuntu@$GAME_IP"
cd /home/ubuntu/work/fbrp-claude
claude
```

Again, finish login and then exit. Never run Codex and Claude in the same
workspace; each has its own branch and directory.

## 9. Start the cutover

Announce maintenance and stop making admin/database changes. Return to the
source VPS and the same `tmux` session. If you opened a new shell, set the two
variables again first.

```bash
cd /home/ubuntu/fbrp
read -rp 'Control VPS IPv4: ' CONTROL_IP
read -rp 'Game VPS IPv4: ' GAME_IP
./scripts/three-vps-migration.sh cutover \
  "ubuntu@$CONTROL_IP" "ubuntu@$GAME_IP"
```

Read the summary and type exactly:

```text
CUTOVER
```

Wait for `Cutover complete`. Do not manually start either FXServer during the
operation.

## 10. Change DNS immediately after cutover

Replace the DNS records with:

```text
Name                   Type    Value
floridabay.net (@)     A       CONTROL_IP
www                    CNAME   floridabay.net
tx                     A       CONTROL_IP
join                   A       GAME_IP
```

If the DNS provider offers HTTP proxying (for example, an orange-cloud mode),
set `join` and `tx` to **DNS only**. `join` must resolve directly to the game VPS
because FiveM uses TCP/UDP 30120. Leave TTL at 300 during verification.

The source VPS temporarily forwards old web and txAdmin traffic to control, so
the site remains available to clients with stale DNS. FiveM UDP cannot use that
bridge; stale `join` DNS starts working as caches update.

## 11. Verify everything

Run from the source VPS:

```bash
cd /home/ubuntu/fbrp
./scripts/three-vps-migration.sh verify \
  "ubuntu@$CONTROL_IP" "ubuntu@$GAME_IP"
```

Every listed new service must be `active`, MariaDB must be `healthy`, and both
FiveM health checks must return successfully. Then test manually:

1. Open `https://floridabay.net` and sign in.
2. Use one website/API action that reads the database.
3. Confirm the Discord bots respond once—do not run duplicate bot copies.
4. Open `https://tx.floridabay.net` and confirm txAdmin loads.
5. Join with `fivem://connect/join.floridabay.net`.
6. Open `https://join.floridabay.net`; it should redirect to the main site.
7. Check DNS from any machine:

```bash
getent ahostsv4 floridabay.net | head -1
getent ahostsv4 tx.floridabay.net | head -1
getent ahostsv4 join.floridabay.net | head -1
```

The first two must show `CONTROL_IP`; the last must show `GAME_IP`.

## 12. Emergency rollback

Rollback is safe only before accepting meaningful new production writes on the
new servers. It stops the new deployment and starts the untouched old one. New
database changes made after cutover are not copied back automatically.

```bash
cd /home/ubuntu/fbrp
./scripts/three-vps-migration.sh rollback \
  "ubuntu@$CONTROL_IP" "ubuntu@$GAME_IP"
```

Type `ROLLBACK`, then change all four DNS records back to the source VPS IP.
Never manually start the old FXServer while the new FXServer is running.

## 13. Retire the source FBRP runtime

Wait until DNS is correct everywhere, backups exist, and the new deployment has
been stable for at least several days. Then run:

The old alias `https://cixnservices.xyz/fbrp` currently passes through the
unrelated ExeclyAI Caddy service on the source VPS. If that alias must keep
working after the temporary bridge is stopped, first run:

```bash
cp /home/ubuntu/AICaller/infrastructure/caddy/Caddyfile \
  /home/ubuntu/AICaller/infrastructure/caddy/Caddyfile.before-fbrp-move
nano /home/ubuntu/AICaller/infrastructure/caddy/Caddyfile
```

In the `cixnservices.xyz` block, replace only this old FBRP section:

```caddyfile
  redir /fbrp /fbrp/ permanent
  handle_path /fbrp/* {
    request_body {
      max_size 2MB
    }
    reverse_proxy 172.18.0.1:8080
  }
```

with this permanent redirect:

```caddyfile
  redir /fbrp https://floridabay.net/ permanent
  redir /fbrp/* https://floridabay.net/ permanent
```

Validate and reload that existing Caddy container:

```bash
cd /home/ubuntu/AICaller
sudo docker compose exec -T caddy caddy validate --config /etc/caddy/Caddyfile
sudo docker compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile
curl -I https://cixnservices.xyz/fbrp
```

Then retire the old FBRP bridge and database:

```bash
cd /home/ubuntu/fbrp
./scripts/three-vps-migration.sh retire-source \
  "ubuntu@$CONTROL_IP" "ubuntu@$GAME_IP"
```

Type `RETIRE`. This stops the temporary bridge and the old FBRP MariaDB
container. It deliberately deletes no source files or Docker volumes. Keep the
source VPS until you have separately backed up anything else living on it.

After retirement, raise normal DNS TTLs and restrict TCP 22 at the provider to
your admin IP plus control-to-game access.

## How Codex and Claude work after the move

The migration creates these workspaces on both new hosts:

```text
/home/ubuntu/work/fbrp-codex
/home/ubuntu/work/fbrp-claude
```

It also creates a release workspace on control only:

```text
/home/ubuntu/work/fbrp-release
```

All workspaces use the bare Git repository on control as their shared remote.
The game VPS reaches it through the reverse encrypted SSH tunnel. `AGENTS.md`
instructs Codex and `CLAUDE.md` instructs Claude. Use the matching prompt below
the first time on each host.

### First Codex prompt on the control VPS

```text
Read AGENTS.md completely. Read /home/ubuntu/.config/fbrp-split.env and confirm
this is the control host. Explain the two-VPS architecture, your workspace and
branch, the private tunnel endpoints, and the control/game/all deployment rule.
Do not change files, deploy, restart services, or display secrets. From now on,
follow AGENTS.md for every task and work only in /home/ubuntu/work/fbrp-codex.
```

### First Claude prompt on the control VPS

```text
Read CLAUDE.md and AGENTS.md completely. Read
/home/ubuntu/.config/fbrp-split.env and confirm this is the control host.
Explain the two-VPS architecture, your workspace and branch, and how a feature
that touches the website/API and FiveM is reviewed and deployed. Do not change
files, deploy, restart services, or display secrets. Work only in
/home/ubuntu/work/fbrp-claude.
```

### First Codex prompt on the game VPS

```text
Read AGENTS.md completely. Read /home/ubuntu/.config/fbrp-split.env and confirm
this is the game host. Explain the two-VPS architecture, your workspace and
branch, where MariaDB/FXServer/resources live, and how code reaches the control
Git remote. Do not change files, deploy, restart services, or display secrets.
From now on, follow AGENTS.md and work only in
/home/ubuntu/work/fbrp-codex.
```

### First Claude prompt on the game VPS

```text
Read CLAUDE.md and AGENTS.md completely. Read
/home/ubuntu/.config/fbrp-split.env and confirm this is the game host. Explain
the two-VPS architecture, your workspace and branch, where the authoritative
game files and database live, and the control/game/all deployment rule. Do not
change files, deploy, restart services, or display secrets. Work only in
/home/ubuntu/work/fbrp-claude.
```

## Normal feature and deployment workflow

Agents work concurrently in their own branches. They commit and push to the
control-host Git remote. They do not edit `/home/ubuntu/fbrp`, which is the live
checkout.

For a feature affecting both hosts, keep the API contract and FiveM changes in
the same feature branch when practical. If two agents made separate branches,
merge both into `main` before deploying either side. On the control VPS:

```bash
cd /home/ubuntu/work/fbrp-release
git status --short
git fetch origin --prune
git switch main
git pull --ff-only origin main
```

Review the agent branch, then merge it. Replace `BRANCH_NAME` only:

```bash
git log --oneline --decorate main..origin/BRANCH_NAME
git diff --stat main...origin/BRANCH_NAME
git merge --no-ff "origin/BRANCH_NAME"
git push origin main
```

Deploy from the control VPS according to scope:

```bash
# Website, API, or bot-only feature
/home/ubuntu/fbrp/scripts/split-deploy.sh control main

# FiveM-only feature
/home/ubuntu/fbrp/scripts/split-deploy.sh game main

# Feature touching both sides or changing shared DB compatibility
/home/ubuntu/fbrp/scripts/split-deploy.sh all main
```

The `all` command is the answer when one request changes FiveM, API, and web:
one reviewed Git revision is fetched on both servers, tests run first, MariaDB
is backed up, both application planes are stopped, both checkouts fast-forward
to the same commit, the game side starts first, control starts second, and both
are health-checked.

At any time, inspect without deploying:

```bash
/home/ubuntu/fbrp/scripts/split-deploy.sh status
/home/ubuntu/fbrp/scripts/split-deploy.sh verify
```
