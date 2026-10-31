import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const script = fs.readFileSync(path.join(root, 'scripts/split-deploy.sh'), 'utf8');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

test('only known options are accepted and the environment switch is validated', () => {
  const run = (args, env = {}) => spawnSync('bash', [path.join(root, 'scripts/split-deploy.sh'), ...args], { env: { ...process.env, ...env }, encoding: 'utf8' });
  const bogus = run(['help', 'main', '--bogus']);
  assert.notEqual(bogus.status, 0);
  assert.match(bogus.stderr, /Unknown option: --bogus/);
  const badEnv = run(['help', 'main'], { FBRP_DEPLOY_NO_RESTART: '2' });
  assert.notEqual(badEnv.status, 0);
  assert.match(badEnv.stderr, /must be 0 or 1/);
  const ok = run(['help', 'main', '--no-restart']);
  assert.equal(ok.status, 0);
  assert.match(ok.stdout, /--no-restart/);
});

/** Runs the game-host part of install_game_revision against a throwaway repo with every system command stubbed. */
function runGameInstall(defer) {
  const body = script.match(/game_script "\$TARGET_COMMIT" "\$NO_RESTART" <<'REMOTE'\n([\s\S]*?)\nREMOTE/)[1];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deploy-sim-'));
  try {
    const repo = path.join(dir, 'fbrp');
    const state = path.join(dir, 'state');
    const bin = path.join(dir, 'bin');
    fs.mkdirSync(path.join(repo, 'server-data'), { recursive: true });
    fs.mkdirSync(bin);
    const git = (...args) => execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { encoding: 'utf8' });
    execFileSync('git', ['init', '-q', repo]);
    fs.writeFileSync(path.join(repo, 'server-data/server.cfg'), [
      'ensure fbrp_chat',
      'ensure MarkoMods-NSR9',
      'ensure MarkoMods-SA80',
      'ensure MarkoMods-BenelliM2',
      'ensure MP7A2',
      'ensure Scar17',
      'ensure AKM',
      'ensure As-Val',
      'ensure G17',
      'ensure G36',
      'ensure HK-UMP',
      'ensure M6IC',
      'ensure vMenu',
      'exec config/phone.cfg',
      '',
    ].join('\n'));
    fs.writeFileSync(path.join(repo, 'docker-compose.yml'), 'a');
    git('add', '-A'); git('commit', '-qm', 'one');
    fs.writeFileSync(path.join(repo, 'start.sh'), 'x');
    git('add', '-A'); git('commit', '-qm', 'two');
    const second = git('rev-parse', 'HEAD').trim();
    git('reset', '-q', '--hard', 'HEAD~1');
    const calls = path.join(dir, 'calls.log');
    for (const name of ['systemctl', 'sudo', 'docker']) {
      fs.writeFileSync(path.join(bin, name), `#!/bin/sh\necho "${name} $*" >> "${calls}"\nif [ "${name}" = sudo ]; then echo healthy; fi\nexit 0\n`);
      fs.chmodSync(path.join(bin, name), 0o755);
    }
    const sandboxed = body.replaceAll('/home/ubuntu/fbrp', repo).replaceAll('/home/ubuntu/.local/state', state);
    const result = spawnSync('bash', ['-s', '--', second, defer], { input: sandboxed, env: { ...process.env, PATH: `${bin}:${process.env.PATH}` }, encoding: 'utf8' });
    return {
      result,
      calls: fs.existsSync(calls) ? fs.readFileSync(calls, 'utf8') : '',
      marker: fs.existsSync(path.join(state, 'fbrp-pending-restart')) ? fs.readFileSync(path.join(state, 'fbrp-pending-restart'), 'utf8') : null,
      head: git('rev-parse', 'HEAD').trim(),
      second,
      serverCfg: fs.readFileSync(path.join(repo, 'server-data/server.cfg'), 'utf8'),
    };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('a deferred game install updates the files and never touches FXServer or the database container', () => {
  const run = runGameInstall('1');
  assert.equal(run.result.status, 0, run.result.stderr);
  assert.equal(run.head, run.second);
  assert.doesNotMatch(run.calls, /fbrp-server|stop|start|docker|compose/);
  assert.match(run.marker, new RegExp(`^\\d+ ${run.second}\\n$`));
  assert.match(run.result.stdout, /FiveM restart deferred/);
  assert.match(run.result.stdout, /start\.sh changed/);
  // The server.cfg edits that start.sh would otherwise make are still applied for txAdmin to read.
  assert.match(run.serverCfg, /ensure fbrp_chat\nensure RageUI\nensure lvc\nensure NotWanted\n/);
  assert.doesNotMatch(run.serverCfg, /^ensure (MarkoMods-(NSR9|SA80|BenelliM2)|MP7A2|Scar17|AKM|As-Val|G17|G36|HK-UMP|M6IC)$/m);
});

test('a normal game install still stops, updates and restarts the server and clears the marker', () => {
  const run = runGameInstall('0');
  assert.equal(run.result.status, 0, run.result.stderr);
  assert.match(run.calls, /systemctl --user stop fbrp-server\.service/);
  assert.match(run.calls, /systemctl --user start fbrp-server\.service/);
  assert.equal(run.marker, null);
});

test('AI agents and the dev runner deploy without restarting FiveM', () => {
  const agents = read('AGENTS.md');
  assert.match(agents, /split-deploy\.sh game main --no-restart/);
  assert.match(agents, /split-deploy\.sh all main --no-restart/);
  assert.match(agents, /Never stop or restart `fbrp-server\.service` or FXServer on your own/);
  assert.doesNotMatch(agents, /^\/home\/ubuntu\/fbrp\/scripts\/split-deploy\.sh (game|all) main$/m);
  assert.match(read('CLAUDE.md'), /--no-restart/);
  assert.match(read('scripts/dev-submission-implement.sh'), /"\$DEPLOY" "\$target" main --no-restart/);
  assert.match(script, /FiveM restart PENDING/);
  assert.match(script, /Stopping the control plane only \(FiveM keeps running\)/);
});

test('control deploy installs an automatic recovery policy for Caddy', () => {
  const override = read('deploy/systemd/caddy.service.d/10-fbrp-recovery.conf');
  assert.match(override, /^Restart=on-failure$/m);
  assert.match(override, /^RestartSec=2s$/m);
  assert.match(script, /sudo install -o root -g root -m 0644 "\$service_override" "\$live_service_dir\/10-fbrp-recovery\.conf"/);
  assert.match(script, /sudo systemctl daemon-reload/);
});
