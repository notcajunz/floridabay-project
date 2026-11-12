import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { OWNER_DISCORD_ID } from '../src/access-control.js';
import { REVIEW_APPROVER_ID, TRANSFER_USER_ID, canTransfer, isApprover } from '../src/dev-review/config.js';
import { createDevReviewRoutes } from '../src/dev-review/routes.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('only the owner account can open dev review and only one account can transfer', () => {
  assert.equal(REVIEW_APPROVER_ID, '1090083387638812755');
  assert.equal(REVIEW_APPROVER_ID, OWNER_DISCORD_ID);
  assert.equal(TRANSFER_USER_ID, '1090083387638812755');
  assert.equal(isApprover('1090083387638812755'), true);
  assert.equal(canTransfer('1090083387638812755'), true);
  for (const other of ['1090083387638812754', '', null, undefined, '1090083387638812756']) {
    assert.equal(isApprover(other), false);
    assert.equal(canTransfer(other), false);
  }
});

test('the runner script gives the agent a scoped allowlist and sandbox, never a bypass flag', () => {
  const script = read('scripts/dev-submission-implement.sh');
  execFileSync('bash', ['-n', path.join(root, 'scripts/dev-submission-implement.sh')]);
  assert.doesNotMatch(script, /dangerously|bypassPermissions|skip-permissions|--yolo|danger-full-access/i);
  assert.match(script, /--permission-mode acceptEdits/);
  assert.match(script, /--allowedTools "\$CLAUDE_ALLOWED"/);
  assert.match(script, /"sandbox":\{"enabled":true[^}]*"allowUnsandboxedCommands":false/);
  assert.match(script, /--sandbox workspace-write/);
  assert.match(script, /approval_policy="never"/);
  assert.match(script, /network_access=false/);
  const allowed = script.match(/CLAUDE_ALLOWED='([^']+)'/)[1];
  for (const forbidden of ['git push', 'git commit', 'git checkout', 'curl', 'ssh', 'sudo', 'rm', 'deploy.sh', 'flock', 'bash']) assert.ok(!allowed.includes(forbidden), forbidden);
  // The agent phase never releases: committing, pushing, merging and deploying happen in the script afterwards.
  assert.match(script, /git push -q -u origin "\$branch"/);
  assert.match(script, /flock -w 3600 8/);
  assert.match(script, /merge -q --ff-only "origin\/\$branch"/);
  assert.match(script, /"\$DEPLOY" verify/);
  assert.match(script, /DENY_PATHS=/);
  assert.match(script, /binary files/);
  assert.match(script, /unset ANTHROPIC_API_KEY[^\n]*OPENAI_API_KEY/);
  // A dry run prints the command line and starts nothing.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dev-run-'));
  fs.mkdirSync(path.join(dir, 'repo'));
  for (const name of ['PROMPT.md', 'SUBMISSION.md']) fs.writeFileSync(path.join(dir, name), 'x');
  const stubs = path.join(dir, 'stub-bin');
  fs.mkdirSync(stubs);
  // The runner only checks that its CLIs exist in dry-run mode; stub them so the test passes on any host.
  for (const tool of ['claude', 'codex', 'bwrap']) fs.writeFileSync(path.join(stubs, tool), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  const live = path.join(dir, 'live');
  fs.mkdirSync(path.join(live, '.git'), { recursive: true });
  const workspace = path.join(dir, 'ws');
  execFileSync('git', ['init', '-q', workspace]);
  const bin = path.join(dir, 'bin');
  fs.mkdirSync(bin);
  for (const name of ['codex']) { fs.writeFileSync(path.join(bin, name), '#!/bin/sh\nexit 99\n'); fs.chmodSync(path.join(bin, name), 0o755); }
  const result = spawnSync('bash', [path.join(root, 'scripts/dev-submission-implement.sh'), '--id', '5', '--agent', 'codex', '--dir', dir], {
    env: { ...process.env, FBRP_LIVE_ROOT: live, DEV_SUBMISSION_PATH_PREFIX: stubs, DEV_SUBMISSION_DRY_RUN: '1', DEV_SUBMISSION_WORKSPACE_CODEX: workspace, PATH: `${bin}:${process.env.PATH}` },
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(fs.readFileSync(path.join(dir, 'run.log'), 'utf8'), /codex\nexec\n--sandbox\nworkspace-write/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'exit.json'), 'utf8')).exit, 0);
  fs.rmSync(dir, { recursive: true, force: true });
});

function fakeDb() {
  return { async query() { return []; }, async one() { return null; } };
}

function exchange(method, pathname, { session = null, body = {}, headers = {} } = {}) {
  const request = { method, headers };
  const response = {};
  const out = {};
  const sendJson = (_response, status, payload) => { out.status = status; out.body = payload; };
  const raw = Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
  return { request, response, out, args: { request, response, url: new URL(`https://x${pathname}`), session, rawBody: async () => raw, readJson: async () => body, sendJson }, raw };
}

test('dev review routes: strangers and staff are refused, the owner can list, the old webhook is gone', async () => {
  const audits = [];
  const routes = createDevReviewRoutes({ db: fakeDb(), audit: async (...args) => { audits.push(args); } });

  let call = exchange('GET', '/api/dev-review/list');
  assert.equal(await routes.handle(call.args), true);
  assert.equal(call.out.status, 401);

  for (const id of ['1090083387638812754', '123']) {
    call = exchange('GET', '/api/dev-review/list', { session: { id } });
    await routes.handle(call.args);
    assert.equal(call.out.status, 403);
    call = exchange('POST', '/api/dev-review/transfer', { session: { id }, body: { agent: 'claude' } });
    await routes.handle(call.args);
    assert.equal(call.out.status, 403);
  }
  assert.ok(audits.some((entry) => entry[1] === 'devreview.denied'));

  call = exchange('GET', '/api/dev-review/list', { session: { id: OWNER_DISCORD_ID } });
  await routes.handle(call.args);
  assert.equal(call.out.status, 200);
  assert.equal(call.out.body.approver, true);
  assert.equal(call.out.body.config.canTransfer, true);
  assert.ok(call.out.body.config.efforts.claude.includes('high'));

  call = exchange('POST', '/api/dev-review/webhook', { session: { id: OWNER_DISCORD_ID } });
  await routes.handle(call.args);
  assert.equal(call.out.status, 404);
  assert.equal(await routes.handle(exchange('GET', '/api/portal/bootstrap').args), false);
});

test('the portal serves the review page to the owner only and nothing from GitHub remains', () => {
  const panel = read('services/fbrp-bot/src/web-panel.js');
  assert.match(panel, /"\/dev-review": "dev-review\.html"/);
  assert.match(panel, /\["\/dev-review", "\/dev-review\.html"\]\.includes\(url\.pathname\)[\s\S]{0,260}!isApprover\(session\.id\)/);
  assert.doesNotMatch(panel, /signedDevReviewWebhook/);
  assert.match(read('services/fbrp-bot/web/portal.js'), /d\.devReview \?/);
  assert.match(read('services/fbrp-bot/src/dev-review/routes.js'), /if \(!isApprover\(session\.id\)\)/);
  for (const name of ['github.js', 'analyze.js', 'review.js', 'scan.js']) assert.equal(fs.existsSync(path.join(root, 'services/fbrp-bot/src/dev-review', name)), false, name);
  assert.equal(fs.existsSync(path.join(root, 'scripts/dev-repo-setup.sh')), false);
  assert.doesNotMatch(read('services/fbrp-bot/web/dev-review.js'), /innerHTML/);
  assert.doesNotMatch(read('services/fbrp-bot/src/dev-review/config.js'), /GITHUB_DEV|OPENAI/);
});

test('the dev submissions table still exists', () => {
  const migration = read('server-data/resources/[fbrp]/fbrp_core/migrations/103_dev_submissions.sql');
  assert.match(migration, /CREATE TABLE IF NOT EXISTS dev_submissions/);
  assert.doesNotMatch(migration, /^--.*['"`;]/m);
});
