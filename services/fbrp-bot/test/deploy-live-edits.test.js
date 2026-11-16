import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const script = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../scripts/split-deploy.sh"), "utf8");

/** Run the script's two pure helpers on sample input in a real bash. */
const bash = (body) => {
  const grab = (name) => script.match(new RegExp(`^${name}\\(\\) \\{.*\\}$`, "m"))[0];
  const policy = script.match(/^readonly TOLERATED_LIVE_EDITS=.*$/m)[0];
  return execFileSync("bash", ["-c", `${policy}\n${grab("blocking_dirty_paths")}\n${grab("overlapping_paths")}\n${body}`], { encoding: "utf8" });
};

test("live player vehicle edits alone never block a release", () => {
  const out = bash(`printf '%s\\n' 'server-data/resources/[vehicles]/fbrp_pv_x/.fbrp-import.json' 'server-data/resources/[vehicles]/fbrp_pv_x/data/handling.meta' | blocking_dirty_paths`);
  assert.equal(out, "");
});

test("inactive Enhanced config and active legacy vMenu addon edits never block a release", () => {
  const out = bash(`printf '%s\\n' 'server-data/resources/[standalone]/vMenu.Enhanced/config/announcements.json' 'server-data/resources/[standalone]/vMenu.Enhanced/config/ped-models.json' 'server-data/resources/[standalone]/vMenu.Enhanced/fxmanifest.lua' 'server-data/resources/[standalone]/vMenu/config/addons.json' | blocking_dirty_paths`);
  assert.equal(out, "server-data/resources/[standalone]/vMenu.Enhanced/fxmanifest.lua\n");
});

test("game deploys atomically switch the untracked server config to legacy vMenu", () => {
  assert.match(script, /grep -Fxq 'ensure vMenu\.Enhanced' "\$server_cfg"/);
  assert.match(script, /\$0 == "ensure vMenu\.Enhanced"\) print "ensure vMenu"/);
  assert.match(script, /grep -Fxq 'ensure vMenu' "\$server_cfg"/);
  assert.match(script, /! grep -Fxq 'ensure vMenu\.Enhanced' "\$server_cfg"/);
  const startup = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../start.sh"), "utf8");
  assert.match(startup, /grep -Fxq 'ensure vMenu\.Enhanced' "\$server_cfg"/);
  assert.match(startup, /\$0 == "ensure vMenu\.Enhanced"\) print "ensure vMenu"/);
  assert.match(startup, /! grep -Fxq 'ensure vMenu\.Enhanced' "\$server_cfg"/);
});

test("game startup enables RageUI before Luxart and also enables Not Wanted", () => {
  const startup = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../start.sh"), "utf8");
  for (const source of [script, startup]) {
    assert.match(source, /print "ensure RageUI"\s+print "ensure lvc"\s+print "ensure NotWanted"/);
    assert.match(source, /grep -Fxq 'ensure RageUI' "\$server_cfg"/);
    assert.match(source, /grep -Fxq 'ensure lvc' "\$server_cfg"/);
    assert.match(source, /grep -Fxq 'ensure NotWanted' "\$server_cfg"/);
  }
});

test("the active seasonal loading screen receives the canonical staff config", () => {
  const startup = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../start.sh"), "utf8");
  for (const source of [script, startup]) {
    assert.match(source, /canonical_loading_config=.*fbrp_loading\/web\/assets\/scripts\/config\.js/);
    assert.match(source, /active_loading_config=.*fbrp-LChalloween\/assets\/scripts\/config\.js/);
    assert.match(source, /scripts\/sync-loading-config\.sh" "\$canonical_loading_config" "\$active_loading_config"/);
  }
  const config = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../server-data/resources/[fbrp]/fbrp_loading/web/assets/scripts/config.js"), "utf8");
  assert.match(config, /name: "! 102 cajunz"[\s\S]{0,80}description: \["Owner"\]/);
  assert.doesNotMatch(config, /description: \["Co-Owner"\]/);
  assert.equal((config.match(/description: \["Owner"\]/g) || []).length, 1);
});

test("any other tracked change still blocks, even beside vehicle edits", () => {
  const out = bash(`printf '%s\\n' 'server-data/resources/[vehicles]/a/b' 'services/fbrp-bot/src/x.js' 'server-data/resources/[eup]/y' | blocking_dirty_paths`);
  assert.equal(out, "services/fbrp-bot/src/x.js\nserver-data/resources/[eup]/y\n");
});

test("a release that changes a live-edited file is refused, unrelated ones pass", () => {
  const out = bash(`d=$(mktemp); c=$(mktemp)
printf '%s\\n' 'server-data/resources/[vehicles]/a/handling.meta' 'server-data/resources/[vehicles]/b/x' >"$d"
printf '%s\\n' 'services/y.js' 'server-data/resources/[vehicles]/a/handling.meta' >"$c"
overlapping_paths "$d" "$c"
printf '%s\\n' 'services/y.js' >"$c"
echo --; overlapping_paths "$d" "$c"`);
  assert.equal(out, "server-data/resources/[vehicles]/a/handling.meta\n--\n");
});

test("the gate runs before fetching and the overlap check after the target is known", () => {
  assert.match(script, /require_clean_live_trees\n\s+fetch_and_resolve/);
  assert.match(script, /Target commit: %s\\n' "\$TARGET_COMMIT"\n\s+require_no_live_edit_overlap/);
  assert.doesNotMatch(script, /status --porcelain --untracked-files=no\)" \]\] \\/);
});

test("overlap check counts untracked vehicle files and compares against each host's own HEAD", () => {
  const body = script.match(/^readonly OVERLAP_SCRIPT='([\s\S]*?)'\nrequire_no_live_edit_overlap/m)[1];
  const dir = fs.mkdtempSync(path.join(process.env.TMPDIR || "/tmp", "overlap-"));
  const git = (...args) => execFileSync("git", ["-C", dir, "-c", "user.name=t", "-c", "user.email=t@t", ...args], { encoding: "utf8" });
  const v = "server-data/resources/[vehicles]";
  git("init", "-q", "-b", "main");
  fs.mkdirSync(path.join(dir, v, "a"), { recursive: true });
  fs.writeFileSync(path.join(dir, v, "a/handling.meta"), "1");
  git("add", "-A"); git("commit", "-q", "-m", "base");
  const base = git("rev-parse", "HEAD").trim();
  fs.mkdirSync(path.join(dir, v, ".replaced-a"), { recursive: true });
  fs.writeFileSync(path.join(dir, v, "a/handling.meta"), "2");
  git("stash", "-q"); // a release adds a file the live tree also has untracked, and edits the tracked one
  fs.mkdirSync(path.join(dir, v, ".replaced-a"), { recursive: true });
  fs.writeFileSync(path.join(dir, v, ".replaced-a/x"), "r");
  fs.writeFileSync(path.join(dir, v, "a/handling.meta"), "3");
  git("add", "-A"); git("commit", "-q", "-m", "release");
  const target = git("rev-parse", "HEAD").trim();
  git("reset", "-q", "--hard", base);
  fs.mkdirSync(path.join(dir, v, ".replaced-a"), { recursive: true });
  fs.writeFileSync(path.join(dir, v, ".replaced-a/x"), "live");
  fs.writeFileSync(path.join(dir, v, "a/handling.meta"), "live");
  const out = execFileSync("bash", ["-c", body, "_", dir, target], { encoding: "utf8" });
  assert.equal(out, `${v}/.replaced-a/x\n${v}/a/handling.meta\n`);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("github sync commits on its own branch and index, never on the live checkout's branch", () => {
  const sync = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../scripts/github-sync.sh"), "utf8");
  assert.match(sync, /export GIT_INDEX_FILE=/);
  assert.match(sync, /sync_ref=refs\/heads\/fbrp-sync/);
  assert.match(sync, /git commit-tree/);
  assert.match(sync, /"\$sync_ref:refs\/heads\/main"/);
  assert.doesNotMatch(sync, /git commit -q/);
  assert.doesNotMatch(sync, /HEAD:main/);
});

test("rewritten sync snapshots never block a release", () => {
  const out = bash(`printf '%s\\n' 'snapshots/fbrp-db.sql.gz.enc' 'snapshots/private-files.tar.gz.enc' | blocking_dirty_paths`);
  assert.equal(out, "");
});

test("github sync leaves the EUP packs out of the backup", () => {
  const sync = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../scripts/github-sync.sh"), "utf8");
  assert.match(sync, /git rm -r -q --cached --ignore-unmatch -- ":\(literal\)\$eup_path"/);
  assert.match(sync, /server-data\/resources\/\[eup\]/);
});

test("the loading config sync keeps the active screen's own songs", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "loading-sync-"));
  const tool = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../scripts/sync-loading-config.sh");
  const canonical = path.join(dir, "canonical.js");
  const active = path.join(dir, "active.js");
  fs.writeFileSync(canonical, 'Config.Eyebrow = "new";\nConfig.Tracks = [\n  { file: "old.webm" },\n];\nConfig.Team = ["new staff"];\n');
  fs.writeFileSync(active, 'Config.Eyebrow = "old";\nConfig.Tracks = [\n{ file: "mine1.webm" },\n{ file: "mine2.webm" },\n];\nConfig.Team = ["old staff"];\n');
  execFileSync("bash", [tool, canonical, active]);
  assert.equal(fs.readFileSync(active, "utf8"), 'Config.Eyebrow = "new";\nConfig.Tracks = [\n{ file: "mine1.webm" },\n{ file: "mine2.webm" },\n];\nConfig.Team = ["new staff"];\n');
  const tracks = path.join(dir, "tracks.js");
  fs.writeFileSync(tracks, 'Config.Tracks = [\n{ file: "tracked.webm" },\n];\n');
  execFileSync("bash", [tool, canonical, active, tracks]);
  assert.match(fs.readFileSync(active, "utf8"), /tracked\.webm/);
  assert.doesNotMatch(fs.readFileSync(active, "utf8"), /mine1|old\.webm/);
  fs.rmSync(active);
  execFileSync("bash", [tool, canonical, active]);
  assert.equal(fs.readFileSync(active, "utf8"), fs.readFileSync(canonical, "utf8"));
  assert.deepEqual(fs.readdirSync(dir).sort(), ["active.js", "canonical.js", "tracks.js"]);
  fs.rmSync(dir, { recursive: true });
});

test("the tracked loading tracks only reference media that ships in the seasonal screen", () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
  const tracks = fs.readFileSync(path.join(root, "server-data/config/loading-tracks.js"), "utf8");
  assert.match(tracks, /^Config\.Tracks = \[/m);
  assert.equal((tracks.match(/file: "assets\/media\/music\/[a-z0-9-]+\.webm"/g) || []).length, 5);
});
