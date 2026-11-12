import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { C, EPHEMERAL, UserError, card, clip, sleep } from "./util.js";

export const RESTART_OWNER_ID = "1090083387638812755";

export const RESTART_TARGETS = Object.freeze({
  game: { label: "Game server", unit: "fbrp-server.service" },
  main: { label: "Main bot, website & API", unit: "fbrp-bot.service", manager: "system" },
  database: { label: "MariaDB", container: "fbrp-mariadb" },
  businesses: { label: "Business Manager", unit: "businesses-bot.service" },
  departments: { label: "Department Manager", unit: "departments-bot.service" },
  dohs: { label: "DOHS Assistant", unit: "dohs-bot.service" },
  gangs: { label: "Gang Manager", unit: "gangs-bot.service" },
  iaa: { label: "IAA Systems", unit: "iaa-bot.service" },
  personals: { label: "Vehicle Manager", unit: "personals-bot.service" },
  roles: { label: "Role Manager", unit: "role-manager-bot.service" },
  staff: { label: "Staff Assistant", unit: "staff-bot.service" },
  devops: { label: "DevOps bot", unit: "devops-bot.service", self: true },
});

export const RESTART_CHOICES = Object.freeze([
  { name: "Everything", value: "all" },
  ...Object.entries(RESTART_TARGETS).map(([value, target]) => ({ name: target.label, value })),
]);

const ALL_ORDER = Object.freeze(["database", "game", "main", "businesses", "departments", "dohs", "gangs", "iaa", "personals", "roles", "staff"]);
const processEnv = () => ({ ...process.env, XDG_RUNTIME_DIR: process.env.XDG_RUNTIME_DIR || `/run/user/${process.getuid?.() ?? 1000}` });

const run = (file, args, timeout = 150_000) =>
  new Promise((resolve, reject) => {
    execFile(file, args, { timeout, env: processEnv() }, (error, stdout, stderr) => {
      if (error) {
        const detail = String(stderr || stdout || error.message).trim();
        reject(new Error(detail || `Command failed: ${file}`));
        return;
      }
      resolve(String(stdout || "").trim());
    });
  });

export const isRestartOwner = (id) => String(id || "") === RESTART_OWNER_ID;

/**
 * The DevOps bot runs with NoNewPrivileges, so it cannot use sudo. System units are restarted through
 * a root-owned systemd path unit (deploy/fbrp-main-restart.path) that restarts exactly fbrp-bot.service
 * whenever this file is written; the bot only needs write access to it.
 */
export const SYSTEM_RESTART_TRIGGERS = Object.freeze({ "fbrp-bot.service": "/run/fbrp-restart/main" });

async function restartSystemUnit(target) {
  const trigger = SYSTEM_RESTART_TRIGGERS[target.unit];
  if (!trigger) throw new Error(`${target.unit} has no restart trigger`);
  const stamp = () => run("/usr/bin/systemctl", ["show", target.unit, "-p", "ActiveEnterTimestampMonotonic", "--value"], 10_000);
  const before = await stamp();
  await writeFile(trigger, `${Date.now()}\n`);
  for (let attempt = 0; attempt < 60; attempt += 1) {
    await sleep(1000);
    const state = await run("/usr/bin/systemctl", ["is-active", target.unit], 10_000).catch((error) => String(error.message || "").trim());
    if (state === "active" && (await stamp()) !== before) return;
  }
  throw new Error(`${target.unit} did not come back active within 60 seconds of the restart request`);
}

async function restartUnit(target) {
  if (target.manager === "system") return restartSystemUnit(target);
  const file = "/usr/bin/systemctl";
  const prefix = ["--user"];
  await run(file, [...prefix, "restart", target.unit]);
  const state = await run(file, [...prefix, "is-active", target.unit], 10_000);
  if (state !== "active") throw new Error(`${target.unit} is ${state || "not active"} after restart`);
}

async function restartDatabase(target) {
  const file = "/usr/bin/docker";
  const prefix = [];
  await run(file, [...prefix, "restart", target.container]);
  for (let attempt = 0; attempt < 90; attempt += 1) {
    const health = await run(file, [...prefix, "inspect", "--format", "{{.State.Health.Status}}", target.container], 10_000);
    if (health === "healthy" || health === "running") return;
    if (health === "unhealthy" || health === "exited" || health === "dead") throw new Error(`${target.container} is ${health} after restart`);
    await sleep(1000);
  }
  throw new Error(`${target.container} did not become healthy within 90 seconds`);
}

async function restartOne(key) {
  const target = RESTART_TARGETS[key];
  if (!target || target.self) throw new Error(`Unsupported direct restart target: ${key}`);
  if (target.container) await restartDatabase(target);
  else await restartUnit(target);
  return target.label;
}

async function scheduleDevopsRestart() {
  const unit = `fbrp-owner-restart-${Date.now()}`;
  await run("/usr/bin/systemd-run", [
    "--user",
    "--on-active=2s",
    `--unit=${unit}`,
    "--collect",
    "/usr/bin/systemctl",
    "--user",
    "restart",
    RESTART_TARGETS.devops.unit,
  ], 10_000);
}

export async function command(i) {
  if (!isRestartOwner(i.user?.id)) throw new UserError("Only the designated FBRP service owner can use restart commands.");
  const key = i.options.getString("service", true);
  if (key !== "all" && !RESTART_TARGETS[key]) throw new UserError("That service is not in the restart allowlist.");

  await i.deferReply(EPHEMERAL);
  const restarted = [];
  try {
    if (key === "devops") {
      await scheduleDevopsRestart();
      return i.editReply({ embeds: [card("♻️ Restart scheduled", { color: C.green, description: "The **DevOps bot** will restart in two seconds. Discord will reconnect it automatically." })] });
    }

    for (const targetKey of key === "all" ? ALL_ORDER : [key]) restarted.push(await restartOne(targetKey));

    if (key === "all") {
      await scheduleDevopsRestart();
      restarted.push("DevOps bot (scheduled)");
    }
    console.log(`[DevOps] service restart by ${i.user.id}: ${restarted.join(", ")}`);
    return i.editReply({
      embeds: [
        card("✅ Services restarted", {
          color: C.green,
          description: restarted.map((label) => `• ${label}`).join("\n"),
          footer: `FBRP · owner ${i.user.id}`,
        }),
      ],
    });
  } catch (error) {
    console.error(`[DevOps] service restart failed for ${i.user.id} (${key}):`, error);
    throw new UserError(`Restart failed${restarted.length ? ` after restarting ${restarted.join(", ")}` : ""}: ${clip(error.message || error, 700)}`);
  }
}
