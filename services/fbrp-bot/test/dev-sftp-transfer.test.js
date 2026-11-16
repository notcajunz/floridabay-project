import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import test from "node:test";
import { OWNER_DISCORD_ID } from "../src/access-control.js";
import { createDevReviewRoutes } from "../src/dev-review/routes.js";
import { classify, commitBaseline, isDoNotTransfer, isTextFile, listRemote, runTransfer, sftpConfig, sftpConfigured, transferNotes, transferPrompt } from "../src/dev-review/sftp-transfer.js";

const sha = (text) => createHash("sha256").update(text).digest("hex");

function fakeRemote(root) {
  return {
    async list(dir) {
      return fs.readdirSync(dir, { withFileTypes: true }).map((entry) => ({
        name: entry.name,
        isDir: entry.isDirectory(),
        isLink: entry.isSymbolicLink(),
        size: entry.isFile() ? fs.statSync(path.join(dir, entry.name)).size : 0,
      }));
    },
    async download(remote, local) {
      fs.copyFileSync(remote, local);
    },
    close() {},
  };
}

function setup() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fbrp-sftp-"));
  const remote = path.join(tmp, "remote");
  const write = (rel, text) => {
    const file = path.join(remote, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
  };
  process.env.DEV_SUBMISSION_ROOT = path.join(tmp, "staging");
  const baselinePath = path.join(tmp, "baseline.json");
  const config = { ...sftpConfig({}), root: remote, baselinePath, minFreeBytes: 0 };
  return { tmp, remote, write, config, baselinePath, connect: async () => fakeRemote(remote) };
}

test("text files are compared by hash and binaries by size", () => {
  const baseline = { files: {
    "a.lua": { size: 3, sha256: sha("one") },
    "b.lua": { size: 3, sha256: sha("two") },
    "c.ytd": { size: 10 },
    "gone.lua": { size: 1, sha256: sha("x") },
  } };
  const remote = new Map([["a.lua", 3], ["b.lua", 5], ["c.ytd", 10], ["new.js", 4], ["d.ytd", 2]]);
  const plan = classify(remote, baseline);
  assert.deepEqual(plan.added.sort(), ["d.ytd", "new.js"]);
  assert.deepEqual(plan.modified, ["b.lua"]);
  assert.deepEqual(plan.verify, ["a.lua"]);
  assert.deepEqual(plan.deleted, ["gone.lua"]);
  assert.equal(isTextFile("x.LUA"), true);
  assert.equal(isTextFile("x.ytd"), false);
});

test("listing skips caches, secrets, docs and mount snapshots", async () => {
  const { remote, write } = setup();
  write("resources/a/server.lua", "x");
  write("resources/a/README.md", "doc");
  write("resources/a/node_modules/dep.js", "x");
  write("cache/files.dat", "x");
  write("server.cfg", "secret");
  write("secrets.cfg", "secret");
  write("resources/[vehicles].pre-game-mount/v/fxmanifest.lua", "x");
  write("resources/[vehicles]/v/fxmanifest.lua", "x");
  write("resources/[DONOTTRANSFEROVER]/secret_tool/fxmanifest.lua", "x");
  write("resources/[core]/dont transfer/x.lua", "x");
  const files = await listRemote(fakeRemote(remote), remote);
  assert.deepEqual([...files.keys()].sort(), ["resources/[vehicles]/v/fxmanifest.lua", "resources/a/server.lua"]);
  for (const name of ["[DONOTTRANSFEROVER]", "dont transfer", "Do-Not-Transfer", "[DO_NOT_TRANSFER]", "DoNotTransfer"]) assert.equal(isDoNotTransfer(name), true, name);
  for (const name of ["[core]", "transfer_tools", "donation"]) assert.equal(isDoNotTransfer(name), false, name);
});

test("a transfer stages only what differs from the baseline and updates it after success", async () => {
  const { write, config, baselinePath, connect } = setup();
  write("resources/[MOVE_IN_Next_TRANSFER]/a/same.lua", "same");
  write("resources/[MOVE_IN_Next_TRANSFER]/a/edited.lua", "edit1");
  write("resources/[MOVE_IN_Next_TRANSFER]/a/grown.lua", "longer text");
  write("resources/[MOVE_IN_Next_TRANSFER]/a/new.lua", "brand new");
  write("resources/[MOVE_IN_Next_TRANSFER]/a/model.ytd", "binary");
  write("server.cfg", "ignored");
  write("resources/b/outside.lua", "not in the move-in folder");
  fs.writeFileSync(baselinePath, JSON.stringify({ generatedAt: 1, files: {
    "resources/[MOVE_IN_Next_TRANSFER]/a/same.lua": { size: 4, sha256: sha("same") },
    "resources/[MOVE_IN_Next_TRANSFER]/a/edited.lua": { size: 5, sha256: sha("edit0") },
    "resources/[MOVE_IN_Next_TRANSFER]/a/grown.lua": { size: 3, sha256: sha("old") },
    "resources/[MOVE_IN_Next_TRANSFER]/a/model.ytd": { size: 6 },
    "resources/[MOVE_IN_Next_TRANSFER]/a/removed.lua": { size: 1, sha256: sha("x") },
  } }));

  const result = await runTransfer({ id: 7, config, connect });
  assert.deepEqual(result.files.map((f) => `${f.status} ${f.name}`), [
    "modified server-data/resources/[MOVE_IN_Next_TRANSFER]/a/edited.lua",
    "modified server-data/resources/[MOVE_IN_Next_TRANSFER]/a/grown.lua",
    "added server-data/resources/[MOVE_IN_Next_TRANSFER]/a/new.lua",
  ]);
  const staged = path.join(process.env.DEV_SUBMISSION_ROOT, "7");
  assert.equal(fs.readFileSync(path.join(staged, "repo/server-data/resources/[MOVE_IN_Next_TRANSFER]/a/new.lua"), "utf8"), "brand new");
  assert.equal(fs.existsSync(path.join(staged, "repo/server-data/resources/[MOVE_IN_Next_TRANSFER]/a/same.lua")), false);
  assert.equal(fs.existsSync(path.join(staged, "repo/server-data/server.cfg")), false);
  assert.equal(fs.existsSync(path.join(staged, "repo/server-data/resources/b/outside.lua")), false);
  assert.equal(fs.readFileSync(path.join(staged, "deleted.txt"), "utf8"), "", "files missing from the move-in folder are never deleted");

  assert.equal(JSON.parse(fs.readFileSync(baselinePath, "utf8")).files["resources/[MOVE_IN_Next_TRANSFER]/a/edited.lua"].sha256, sha("edit0"));
  assert.equal(await commitBaseline(7, config), true);
  const next = JSON.parse(fs.readFileSync(baselinePath, "utf8")).files;
  assert.equal(next["resources/[MOVE_IN_Next_TRANSFER]/a/edited.lua"].sha256, sha("edit1"));
  assert.equal(next["resources/[MOVE_IN_Next_TRANSFER]/a/new.lua"].size, 9);
  assert.equal(next["resources/[MOVE_IN_Next_TRANSFER]/a/removed.lua"].size, 1);
  assert.equal(await commitBaseline(7, config), false);

  const again = await runTransfer({ id: 8, config, connect });
  assert.deepEqual(again.files, []);
});

test("a transfer refuses more files than the limit", async () => {
  const { write, config, baselinePath, connect } = setup();
  fs.writeFileSync(baselinePath, JSON.stringify({ generatedAt: 1, files: {} }));
  for (let i = 0; i < 601; i += 1) write(`resources/[MOVE_IN_Next_TRANSFER]/a/f${i}.lua`, "x");
  await assert.rejects(() => runTransfer({ id: 9, config, connect }), /more than the 600/);
});

test("notes and prompt tell the agent the dev files have no comments", () => {
  const item = { id: 5, files: [{ name: "server-data/resources/a/x.lua", status: "modified" }, { name: "server-data/resources/a/y.lua", status: "removed" }] };
  assert.match(transferNotes(item), /modified server-data\/resources\/a\/x\.lua/);
  const prompt = transferPrompt(item, "claude", "/tmp/dir");
  assert.match(prompt, /every comment stripped/);
  assert.match(prompt, /cannot and must not commit/);
  assert.doesNotMatch(prompt, /## The owner's additional instructions/);
  assert.match(prompt, /live database is the only source of truth for permissions/);
  assert.match(prompt, /Do not change who has what permission/);
  assert.match(prompt, /no INSERT, UPDATE, DELETE or seed data/);
  assert.match(prompt, /Ignore dev-server-only settings/);
  assert.match(transferNotes(item), /Live permissions and live database data always win/);
  assert.match(transferPrompt(item, "codex", "/tmp/dir", "Also add a /ping command."), /The owner's additional instructions for this transfer[\s\S]*Also add a \/ping command\./);
});

test("the runner script passes a validated --model to the chosen CLI", () => {
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../..");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fbrp-model-"));
  fs.mkdirSync(path.join(dir, "repo"));
  for (const name of ["PROMPT.md", "SUBMISSION.md"]) fs.writeFileSync(path.join(dir, name), "x");
  const split = path.join(dir, "split.env");
  fs.writeFileSync(split, "FBRP_ROLE=control\n");
  const workspace = path.join(dir, "ws");
  execFileSync("git", ["init", "-q", workspace]);
  const run = (agent, ...extra) => spawnSync("bash", [path.join(root, "scripts/dev-submission-implement.sh"), "--id", "5", "--agent", agent, "--dir", dir, ...extra], {
    env: { ...process.env, FBRP_SPLIT_ENV: split, DEV_SUBMISSION_DRY_RUN: "1", DEV_SUBMISSION_WORKSPACE_CODEX: workspace, DEV_SUBMISSION_WORKSPACE_CLAUDE: workspace },
    encoding: "utf8",
  });
  const claude = run("claude", "--model", "claude-opus-5-5");
  assert.equal(claude.status, 0, claude.stderr);
  assert.match(fs.readFileSync(path.join(dir, "run.log"), "utf8"), /claude\n--model\nclaude-opus-5-5\n-p/);
  fs.rmSync(path.join(dir, "run.log"), { force: true });
  const codex = run("codex", "--model", "gpt-5.6-sol");
  assert.equal(codex.status, 0, codex.stderr);
  assert.match(fs.readFileSync(path.join(dir, "run.log"), "utf8"), /codex\nexec\n--model\ngpt-5.6-sol\n/);
  assert.equal(run("claude", "--model", "x; rm -rf /").status, 64);
  fs.rmSync(path.join(dir, "run.log"), { force: true });
  const effort = run("claude", "--effort", "high");
  assert.equal(effort.status, 0, effort.stderr);
  assert.match(fs.readFileSync(path.join(dir, "run.log"), "utf8"), /claude\n--effort\nhigh\n-p/);
  fs.rmSync(path.join(dir, "run.log"), { force: true });
  assert.equal(run("codex", "--effort", "medium").status, 0);
  assert.match(fs.readFileSync(path.join(dir, "run.log"), "utf8"), /codex\nexec\n-c\nmodel_reasoning_effort="medium"\n/);
  assert.equal(run("claude", "--effort", "high; reboot").status, 64);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("the portal transfer route needs the owner, an agent, a configured login and no running transfer", async () => {
  const rows = [];
  const db = {
    async query(sql, params = []) {
      if (/^INSERT INTO dev_submissions/.test(sql)) { rows.push({ id: rows.length + 1, status: params[8], agent: params[9], model: params[10], note: params[11] }); return { insertId: rows.length }; }
      if (/^UPDATE dev_submissions SET status=\?,title=\?,files/.test(sql)) { rows[params[7] - 1].status = params[0]; rows[params[7] - 1].files = params[2]; return { affectedRows: 1 }; }
      if (/^UPDATE dev_submissions SET status=\?,run_finished_at=\?,run_exit=-1/.test(sql)) { rows[params[4] - 1].status = params[0]; rows[params[4] - 1].error = params[2]; return { affectedRows: 1 }; }
      return [];
    },
    async one() { return rows.find((row) => ["transferring", "accepted", "implementing"].includes(row.status)) || null; },
  };
  const audits = [];
  let seen = null;
  let behaviour = async (args) => { seen = args; return { files: [{ name: "server-data/a.lua", status: "added", additions: 0, deletions: 0, size: 1 }] }; };
  const routes = createDevReviewRoutes({ db, audit: async (...args) => { audits.push(args); }, transfer: (args) => behaviour(args) });
  const call = (body, session = { id: OWNER_DISCORD_ID }) => {
    const out = {};
    const args = { request: { method: "POST", headers: {} }, response: {}, url: new URL("https://x/api/dev-review/transfer"), session, rawBody: async () => Buffer.alloc(0), readJson: async () => body, sendJson: (_r, status, payload) => { out.status = status; out.body = payload; } };
    return routes.handle(args).then(() => out);
  };
  const settle = () => new Promise((resolve) => setTimeout(resolve, 20));
  const saved = { ...process.env };
  try {
    for (const key of ["FBRP_DEV_SFTP_HOST", "FBRP_DEV_SFTP_USER", "FBRP_DEV_SFTP_PASSWORD"]) delete process.env[key];
    assert.equal((await call({ agent: "claude" }, { id: "123" })).status, 403);
    assert.equal((await call({ agent: "nope" })).status, 400);
    assert.equal((await call({ agent: "claude" })).status, 503);
    assert.equal(sftpConfigured(), false);

    Object.assign(process.env, { FBRP_DEV_SFTP_HOST: "dev.example", FBRP_DEV_SFTP_USER: "u", FBRP_DEV_SFTP_PASSWORD: "p" });
    assert.equal((await call({ agent: "claude", model: "gpt-5.6-sol" })).status, 400);
    assert.equal((await call({ agent: "claude", instructions: "x".repeat(8001) })).status, 400);
    assert.equal(rows.length, 0);
    assert.equal((await call({ agent: "claude", effort: "extreme" })).status, 400);
    assert.equal((await call({ agent: "codex", effort: "max" })).status, 400);
    const started = await call({ agent: "claude", model: "claude-opus-5-5", effort: "high", instructions: "Add a /ping command." });
    assert.equal(started.status, 202);
    assert.deepEqual(seen, { id: 1, instructions: "Add a /ping command.", options: { model: "claude-opus-5-5", effort: "high" } });
    assert.equal(rows[0].model, "claude-opus-5-5");
    assert.equal(rows[0].note, "Add a /ping command.");
    assert.equal(rows[0].status, "transferring");
    assert.equal((await call({ agent: "claude" })).status, 409);
    await settle();
    assert.equal(rows[0].status, "accepted");
    assert.ok(audits.some((entry) => entry[1] === "devreview.transfer"));

    rows[0].status = "implemented";
    behaviour = async () => { throw new Error("login refused"); };
    assert.equal((await call({ agent: "codex" })).status, 202);
    await settle();
    assert.equal(rows[1].status, "failed");
    assert.match(rows[1].error, /login refused/);

    rows[1].status = "implemented";
    behaviour = async () => ({ files: [] });
    await call({ agent: "claude" });
    await settle();
    assert.equal(rows[2].status, "implemented");
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
  }
});
