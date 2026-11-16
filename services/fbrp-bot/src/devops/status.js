import { execFile } from "node:child_process";
import { db } from "./store.js";
import { C, card, clip, humanDuration, ts } from "./util.js";

/**
 * Live infrastructure status: the game server, the website and the Discord bots, read straight from
 * the host. The same card feeds the public status channel and /devops status.
 */

let discord = null;
export const setClient = (client) => {
  discord = client;
};

const SERVICES = [
  { unit: "fbrp-server", manager: "game", label: "Game server", detail: "FXServer + txAdmin" },
  { unit: "fbrp-bot", manager: "system", label: "Main bot & website", detail: "Discord bot, portal and API" },
  { unit: "iaa-bot", label: "IAA Systems", detail: "Internal Affairs bot" },
  { unit: "staff-bot", label: "Staff Assistant", detail: "Staff roster, coordination team and staff commands bot" },
  { unit: "personals-bot", label: "Vehicle Manager", detail: "Personal vehicles bot" },
  { unit: "role-manager-bot", label: "Role Manager", detail: "Role management bot" },
  { unit: "gangs-bot", label: "Gang Manager", detail: "Gangs economy and roles bot" },
  { unit: "businesses-bot", label: "Business Manager", detail: "Businesses, coordination and hours bot" },
  { unit: "departments-bot", label: "Department Manager", detail: "Department Hub departments, cooldowns and hours bot" },
  { unit: "dohs-bot", label: "DOHS Assistant", detail: "DOHS roster and duty-hours bot" },
  { unit: "devops-bot", label: "DevOps", detail: "This bot" },
];

const systemctl = (manager, ...args) =>
  new Promise((resolve) => {
    const target = String(process.env.FBRP_GAME_SSH || "").trim();
    const key = String(process.env.FBRP_GAME_SSH_KEY || "/home/ubuntu/.ssh/fbrp-game").trim();
    const remote = manager === "game" && target;
    const file = remote ? "/usr/bin/ssh" : "/usr/bin/systemctl";
    const command = remote
      ? ["-i", key, "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes", target, "/usr/bin/systemctl", "--user", ...args]
      : [...(manager === "system" ? [] : ["--user"]), ...args];
    execFile(
      file,
      command,
      { timeout: 4000, env: { ...process.env, XDG_RUNTIME_DIR: process.env.XDG_RUNTIME_DIR || `/run/user/${process.getuid?.() ?? 1000}` } },
      (error, stdout) => resolve(error && !stdout ? "" : String(stdout).trim()),
    );
  });

async function unitState(service) {
  const state = await systemctl(service.manager, "is-active", `${service.unit}.service`);
  if (!state) return { state: "unknown", since: null };
  let since = null;
  if (state === "active") {
    const stamp = await systemctl(service.manager, "show", `${service.unit}.service`, "-p", "ActiveEnterTimestamp", "--value");
    const parsed = Date.parse(stamp);
    since = Number.isFinite(parsed) ? parsed : null;
  }
  return { state, since };
}

const timed = async (work) => {
  const started = Date.now();
  try {
    const value = await work();
    return { ok: true, ms: Date.now() - started, value };
  } catch (error) {
    return { ok: false, ms: Date.now() - started, error: error.message };
  }
};

const fetchJson = async (url) => {
  const response = await fetch(url, { signal: AbortSignal.timeout(3500) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json().catch(() => ({}));
};

export async function collect() {
  const origin = String(process.env.FBRP_FIVEM_ORIGIN || "http://127.0.0.1:30120/fbrp_core").replace(/\/$/, "");
  const panelHost = process.env.FBRP_PANEL_HOST || "127.0.0.1";
  const panelPort = process.env.FBRP_PANEL_PORT || "8080";
  const [units, game, web, database] = await Promise.all([
    Promise.all(SERVICES.map(async (s) => ({ ...s, ...(await unitState(s)) }))),
    timed(() => fetchJson(`${origin}/health`)),
    timed(async () => {
      const r = await fetch(`http://${panelHost}:${panelPort}/`, { signal: AbortSignal.timeout(3500), redirect: "manual" });
      if (r.status >= 500) throw new Error(`HTTP ${r.status}`);
      return r.status;
    }),
    timed(() => db.query("SELECT 1")),
  ]);
  return { units, game, web, database, gateway: discord?.ws?.ping ?? null, at: Date.now() };
}

const dot = (ok, warn = false) => (ok ? "🟢" : warn ? "🟡" : "🔴");

export async function activeIncidents() {
  return db.query("SELECT * FROM devops_incidents WHERE status<>'resolved' ORDER BY severity, opened_at");
}

/** Overall banner from the checks and any open incident. */
function verdict(data, incidents) {
  const down = data.units.filter((u) => u.state !== "active" && u.state !== "unknown").length;
  const critical = incidents.some((i) => Number(i.severity) <= 1) || !data.game.ok || data.units.find((u) => u.unit === "fbrp-server")?.state === "failed";
  if (critical) return { text: "Major outage", color: C.red, icon: "🔴" };
  if (down || incidents.length || !data.web.ok || !data.database.ok) return { text: "Degraded", color: C.amber, icon: "🟡" };
  return { text: "All systems operational", color: C.green, icon: "🟢" };
}

export async function statusEmbeds(data = null) {
  data ||= await collect();
  const incidents = await activeIncidents();
  const v = verdict(data, incidents);
  const rows = data.units.map((u) => {
    const ok = u.state === "active";
    const extra = u.unit === "fbrp-server" && data.game.ok ? ` · ${data.game.value.players ?? "?"}/${data.game.value.maxPlayers ?? "?"} players` : "";
    return `${dot(ok, u.state === "unknown")} **${u.label}** · ${ok ? `up ${u.since ? humanDuration(Date.now() - u.since) : ""}` : u.state}${extra}`;
  });
  const checks = [
    `${dot(data.game.ok)} Game server API · ${data.game.ok ? `${data.game.ms} ms` : clip(data.game.error, 60)}`,
    `${dot(data.web.ok)} Website & portal · ${data.web.ok ? `${data.web.ms} ms` : clip(data.web.error, 60)}`,
    `${dot(data.database.ok)} Database · ${data.database.ok ? `${data.database.ms} ms` : clip(data.database.error, 60)}`,
    `${dot(data.gateway !== null && data.gateway >= 0, true)} Discord gateway · ${data.gateway !== null && data.gateway >= 0 ? `${data.gateway} ms` : "connecting"}`,
  ];
  const embeds = [
    card(`${v.icon} ${v.text}`, {
      color: v.color,
      description: `Last checked ${ts(data.at, "R")} · refreshes every minute`,
      fields: [
        ["Services", rows.join("\n"), false],
        ["Checks", checks.join("\n"), false],
        data.game.ok
          ? ["Game world", `AOP **${data.game.value.aop || "Los Santos"}**${data.game.value.peacetime ? " · peacetime on" : ""}`, false]
          : null,
      ],
      footer: "FBRP · DevOps · status",
    }),
  ];
  if (incidents.length)
    embeds.push(
      card("🚨 Active incidents", {
        color: C.red,
        description: incidents
          .map((x) => `**#${x.id}** ${SEVERITY[x.severity]?.icon || ""} ${clip(x.title, 80)} · *${x.status}* · opened ${ts(x.opened_at, "R")}`)
          .join("\n"),
        timestamp: false,
      }),
    );
  return embeds;
}

export const SEVERITY = {
  1: { label: "SEV1 · Critical", icon: "🔴", color: C.red },
  2: { label: "SEV2 · Major", icon: "🟠", color: 0xe67e22 },
  3: { label: "SEV3 · Minor", icon: "🟡", color: C.amber },
  4: { label: "SEV4 · Notice", icon: "🔵", color: C.blue },
};

export async function statusPayload() {
  return { embeds: await statusEmbeds(), components: [] };
}
