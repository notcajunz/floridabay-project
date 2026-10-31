import { execFile } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { AGENTS, SFTP_REPO, STATUS } from "./config.js";

const run = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
export const IMPLEMENT_SCRIPT = path.join(repoRoot, "scripts/dev-submission-implement.sh");

export const stagingRoot = () => process.env.DEV_SUBMISSION_ROOT || "/home/ubuntu/work/dev-submissions";
export const stagingDir = (id) => path.join(stagingRoot(), String(Number(id)));
export const unitName = (id) => `fbrp-dev-submission-${Number(id)}`;

/** Starts the runner script in its own systemd user unit, so a control deploy that restarts the bots cannot kill it. */
export async function launchRunner(item) {
  if (!AGENTS.includes(item.agent)) throw new Error("Choose Claude or Codex.");
  const dir = stagingDir(item.id);
  const args = ["--id", String(item.id), "--agent", item.agent, "--dir", dir];
  if (item.repo === SFTP_REPO) {
    const options = JSON.parse(await readFile(path.join(dir, "OPTIONS.json"), "utf8").catch(() => "{}"));
    if (options.model) args.push("--model", String(options.model));
    if (options.effort) args.push("--effort", String(options.effort));
  }
  try {
    await run("systemd-run", ["--user", "--quiet", "--collect", `--unit=${unitName(item.id)}`, "--property=KillMode=control-group", "/bin/bash", IMPLEMENT_SCRIPT, ...args], { timeout: 20_000 });
    return { mode: "systemd" };
  } catch (error) {
    // No user manager (for example on a development machine): fall back to a detached process.
    const { spawn } = await import("node:child_process");
    const child = spawn("/bin/bash", [IMPLEMENT_SCRIPT, ...args], { detached: true, stdio: "ignore" });
    child.unref();
    return { mode: "detached", reason: String(error.message).slice(0, 120) };
  }
}

async function unitActive(id) {
  try {
    const { stdout } = await run("systemctl", ["--user", "is-active", unitName(id)], { timeout: 10_000 });
    return stdout.trim() === "active" || stdout.trim() === "activating";
  } catch {
    return false;
  }
}

const readText = (file) => readFile(file, "utf8").then((text) => text, () => "");

/** Finalises an `implementing` row from the files the runner wrote. Returns true when the row was finished. */
export async function reconcileRun(item, store) {
  const dir = stagingDir(item.id);
  const exitInfo = await readText(path.join(dir, "exit.json"));
  let exitCode = null;
  try {
    exitCode = JSON.parse(exitInfo).exit;
  } catch {}
  if (exitCode === null || !Number.isInteger(exitCode)) {
    if (await unitActive(item.id)) return false;
    // The runner is gone without a result. Give a freshly launched one a minute to appear.
    if (item.runStartedAt && Date.now() - item.runStartedAt < 60_000) return false;
    await store.finishRun(item.id, { exitCode: -1, summary: "The runner stopped without writing a result. Check the log in the portal." });
    return true;
  }
  const final = (await readText(path.join(dir, "final.txt"))).trim();
  const tail = final || (await readText(path.join(dir, "run.log"))).trim().split("\n").slice(-30).join("\n");
  await store.finishRun(item.id, { exitCode, summary: tail.slice(-6000) || (exitCode === 0 ? "Finished without a summary." : "Failed without a summary.") });
  return true;
}

/** Last lines of the run log for the portal. */
export async function logTail(id, lines = 80) {
  const dir = stagingDir(id);
  const [log, final] = await Promise.all([readText(path.join(dir, "run.log")), readText(path.join(dir, "final.txt"))]);
  const merged = `${log.trim()}${final.trim() ? `\n\n--- agent output ---\n${final.trim()}` : ""}`;
  return merged.split("\n").slice(-lines).join("\n").slice(-12000);
}

export const runnerReady = async () => Boolean(await stat(IMPLEMENT_SCRIPT).catch(() => null));
export { STATUS };
