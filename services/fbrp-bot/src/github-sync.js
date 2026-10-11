import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const script = path.join(root, "scripts/github-sync.sh");
const statusFile = path.join(root, ".sync/status.json");

let running = null;

/** Runs scripts/github-sync.sh (database dump, encrypted private files, commit, push). One run at a time. */
export function runGithubSync() {
  if (running) return running;
  running = new Promise((resolve) => {
    execFile("bash", [script], { cwd: root, timeout: 15 * 60 * 1000, maxBuffer: 4 * 1024 * 1024, env: process.env }, (error, stdout, stderr) => {
      const output = `${stdout || ""}${stderr || ""}`;
      const line = output.split("\n").reverse().find((item) => item.startsWith("RESULT "));
      let parsed = null;
      try {
        parsed = line ? JSON.parse(line.slice(7)) : null;
      } catch {}
      resolve({
        ok: Boolean(parsed?.ok),
        pushed: Boolean(parsed?.pushed),
        commit: parsed?.commit || null,
        repo: parsed?.repo || null,
        message: parsed?.message || (error ? String(error.message).slice(0, 300) : "The sync script gave no result."),
        log: output.replace(/^RESULT .*$/gm, "").trim().split("\n").slice(-10).join("\n"),
      });
    });
  }).finally(() => {
    running = null;
  });
  return running;
}

/** The result of the last sync, read from the script's status file. */
export async function githubStatus() {
  const configured = Boolean(process.env.GITHUB_TOKEN && process.env.GITHUB_REPO);
  const last = await readFile(statusFile, "utf8").then((text) => JSON.parse(text), () => null);
  return { configured, repo: process.env.GITHUB_REPO || null, last, running: Boolean(running) };
}
