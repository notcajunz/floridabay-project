#!/usr/bin/env node
// Restore the Florida Bay main Discord from database backup #58 onto guild
// 1557594282976747550 using the central Florida Bay Network bot.
//
//   --prepare            snapshot the target guild (settings, roles, channels,
//                        bans, member->role lists) and create a run directory
//   --apply RUN_DIR      wipe every channel and non-managed role, then recreate
//                        the backed-up roles, channels and guild settings
//   --verify RUN_DIR     confirm every mapped role/channel exists and that no
//                        human member holds a restored role
//
// Member roles are deliberately never restored or assigned. Bans are untouched.
// The apply step is checkpointed in RUN_DIR and can be re-run after a failure.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import mysql from "../services/fbrp-bot/node_modules/mysql2/promise.js";

const API = "https://discord.com/api/v10";
const BACKUP = 58;
const ROOT = process.env.FBRP_ROOT || "/home/ubuntu/fbrp";
const GUILD = "1557594282976747550";
const BOT_ID = "1558518806417117305";
const OWNER = "1090083387638812755";
const ENV_FILE = `${ROOT}/services/fbrp-bot/.env`;
const wait = (ms) => new Promise((done) => setTimeout(done, ms));

function readEnv(path) {
  const out = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*=/.test(line)) continue;
    const index = line.indexOf("=");
    let value = line.slice(index + 1).trim();
    if ((value[0] === '"' && value.at(-1) === '"') || (value[0] === "'" && value.at(-1) === "'")) value = value.slice(1, -1);
    out[line.slice(0, index)] = value;
  }
  return out;
}

const env = readEnv(ENV_FILE);
const token = env.DISCORD_BOT_TOKEN;
if (!token) throw new Error("DISCORD_BOT_TOKEN is not configured");

async function api(path, { method = "GET", body, reason } = {}) {
  for (let attempt = 0; ; attempt++) {
    const headers = { Authorization: `Bot ${token}` };
    if (body !== undefined) headers["content-type"] = "application/json";
    if (reason) headers["x-audit-log-reason"] = encodeURIComponent(reason);
    const response = await fetch(API + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const out = response.status === 204 ? null : await response.json().catch(() => null);
    if (response.ok) return out;
    if (response.status === 429 && attempt < 8) {
      const ms = Math.ceil(Number(out?.retry_after || 1) * 1000) + 300;
      console.log(`rate limit: waiting ${ms}ms before retrying the same request`);
      await wait(ms);
      continue;
    }
    if (response.status >= 500 && attempt < 6) {
      await wait(Math.min(30000, 1000 * 2 ** attempt));
      continue;
    }
    throw new Error(`${method} ${path} failed ${response.status}: ${out?.message || JSON.stringify(out)}`);
  }
}

const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const load = (path) => JSON.parse(readFileSync(path, "utf8"));
function save(path, value) {
  const temp = `${path}.tmp`;
  writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  renameSync(temp, path);
}

async function openDb() {
  return mysql.createConnection({
    host: env.MARIADB_HOST || "127.0.0.1",
    port: Number(env.MARIADB_PORT || 13307),
    user: env.MARIADB_USER,
    password: env.MARIADB_PASSWORD,
    database: env.MARIADB_DATABASE,
  });
}

async function backupGuild() {
  const db = await openDb();
  try {
    const [rows] = await db.query("SELECT data FROM discord_server_backup_guilds WHERE backup_id=? AND guild_id=?", [BACKUP, GUILD]);
    if (rows.length !== 1) throw new Error(`backup #${BACKUP} has no snapshot of ${GUILD}`);
    return JSON.parse(gunzipSync(rows[0].data));
  } finally {
    await db.end();
  }
}

async function allMembers() {
  const members = [];
  for (let after = "0"; ; ) {
    const page = await api(`/guilds/${GUILD}/members?limit=1000&after=${after}`);
    members.push(...page);
    if (page.length < 1000) return members;
    after = page.at(-1).user.id;
  }
}

async function snapshot() {
  const [guild, roles, channels, bans, members] = await Promise.all([
    api(`/guilds/${GUILD}?with_counts=true`),
    api(`/guilds/${GUILD}/roles`),
    api(`/guilds/${GUILD}/channels`),
    api(`/guilds/${GUILD}/bans?limit=1000`).catch(() => []),
    allMembers().catch(() => []),
  ]);
  return {
    guild,
    roles: [...roles].sort((a, b) => a.id.localeCompare(b.id)),
    channels: [...channels].sort((a, b) => a.id.localeCompare(b.id)),
    bans,
    members: members.map((member) => ({ id: member.user.id, bot: !!member.user.bot, roles: member.roles })),
  };
}

const stable = (snap) => hash({ roles: snap.roles.map((r) => r.id), channels: snap.channels.map((c) => c.id) });

async function prepare() {
  const dir = `/home/ubuntu/backups/discord-main-restore-${new Date().toISOString().replace(/[:.]/g, "")}`;
  mkdirSync(dir, { mode: 0o700 });
  const [me, saved, before] = await Promise.all([api("/users/@me"), backupGuild(), snapshot()]);
  if (me.id !== BOT_ID) throw new Error("DISCORD_BOT_TOKEN is not the Florida Bay Network bot");
  if (before.guild.id !== GUILD || before.guild.owner_id !== OWNER) throw new Error("target guild or owner mismatch");
  writeFileSync(`${dir}/before.json.gz`, gzipSync(JSON.stringify(before)), { mode: 0o600 });
  save(`${dir}/state.json`, { phase: "prepared", beforeHash: stable(before), roleMap: {}, channelMap: {}, pending: null, tempChannel: null });
  save(`${dir}/manifest.json`, {
    version: 1,
    backupId: BACKUP,
    guildId: GUILD,
    preparedAt: new Date().toISOString(),
    before: { name: before.guild.name, roles: before.roles.length, channels: before.channels.length, members: before.members.length, bans: before.bans.length },
    restore: { name: saved.guild.name, roles: saved.roles.filter((r) => !r.managed && !r.everyone).length, channels: saved.channels.length },
  });
  console.log(JSON.stringify(load(`${dir}/manifest.json`)));
  console.log(`PREPARED_RUN_DIR=${dir}`);
}

const rolePrint = (r) => JSON.stringify({ name: r.name, color: Number(r.color || 0), hoist: !!r.hoist, mentionable: !!r.mentionable, permissions: String(r.permissions || 0) });
const channelPrint = (c, parent) => JSON.stringify({ name: c.name, type: Number(c.type), parent: parent || null });

// A request can succeed at Discord while this process dies before saving the
// new id. Re-find a pending object by its exact fingerprint instead of making a duplicate.
async function adopt(saved, state, path) {
  if (!state.pending) return;
  if (state.pending.kind === "role") {
    const all = await api(`/guilds/${GUILD}/roles`);
    const used = new Set(Object.values(state.roleMap));
    const old = saved.roles.find((r) => r.id === state.pending.id);
    const found = all.filter((r) => !r.managed && r.id !== GUILD && !used.has(r.id) && rolePrint(r) === rolePrint(old));
    if (found.length === 1) state.roleMap[old.id] = found[0].id;
    else if (found.length > 1) throw new Error(`cannot safely adopt pending role ${old.name}`);
  } else {
    const all = await api(`/guilds/${GUILD}/channels`);
    const used = new Set(Object.values(state.channelMap));
    const old = saved.channels.find((c) => c.id === state.pending.id);
    const parent = old.parentId ? state.channelMap[old.parentId] : null;
    const found = all.filter((c) => c.id !== state.tempChannel && !used.has(c.id) && channelPrint(c, c.parent_id) === channelPrint(old, parent));
    if (found.length === 1) state.channelMap[old.id] = found[0].id;
    else if (found.length > 1) throw new Error(`cannot safely adopt pending channel ${old.name}`);
  }
  state.pending = null;
  save(path, state);
}

async function apply(arg) {
  const dir = resolve(arg);
  const path = `${dir}/state.json`;
  const state = load(path);
  const saved = await backupGuild();
  const reason = `Florida Bay main restore from backup #${BACKUP} by ${OWNER}`;
  const me = await api("/users/@me");
  if (me.id !== BOT_ID) throw new Error("wrong bot token");

  if (state.phase === "prepared") {
    if (stable(await snapshot()) !== state.beforeHash) throw new Error("guild changed after the snapshot; run --prepare again");
    state.phase = "scaffold";
    save(path, state);
  }

  if (state.phase === "scaffold") {
    // Community servers cannot delete their rules/updates channels, so park both
    // on a temporary channel that is removed after the real channels exist.
    const temp = await api(`/guilds/${GUILD}/channels`, { method: "POST", body: { name: "restore-temp", type: 0 }, reason });
    state.tempChannel = temp.id;
    save(path, state);
    await api(`/guilds/${GUILD}`, { method: "PATCH", body: { rules_channel_id: temp.id, public_updates_channel_id: temp.id, system_channel_id: temp.id, afk_channel_id: null }, reason });
    state.phase = "delete";
    save(path, state);
  }

  if (state.phase === "delete") {
    for (const channel of await api(`/guilds/${GUILD}/channels`)) {
      if (channel.id !== state.tempChannel) await api(`/channels/${channel.id}`, { method: "DELETE", reason });
    }
    for (const role of (await api(`/guilds/${GUILD}/roles`)).filter((r) => r.id !== GUILD && !r.managed)) {
      await api(`/guilds/${GUILD}/roles/${role.id}`, { method: "DELETE", reason });
    }
    state.phase = "roles";
    save(path, state);
  }

  await adopt(saved, state, path);

  if (state.phase === "roles") {
    const current = await api(`/guilds/${GUILD}/roles`);
    const everyone = saved.roles.find((r) => r.everyone);
    state.roleMap[GUILD] = GUILD;
    for (const old of saved.roles.filter((r) => r.managed)) {
      // Managed roles belong to bots/boosts: reuse the live one, never duplicate it.
      const booster = /server booster/i.test(old.name);
      const match = current.find((r) => r.managed && (r.name === old.name || (booster && (r.tags?.premium_subscriber !== undefined || /server booster/i.test(r.name)))));
      if (match) state.roleMap[old.id] = match.id;
    }
    await api(`/guilds/${GUILD}/roles/${GUILD}`, { method: "PATCH", body: { permissions: String(everyone.permissions) }, reason });
    for (const role of saved.roles.filter((r) => !r.everyone && !r.managed).sort((a, b) => b.position - a.position)) {
      if (state.roleMap[role.id]) continue;
      state.pending = { kind: "role", id: role.id };
      save(path, state);
      const made = await api(`/guilds/${GUILD}/roles`, {
        method: "POST",
        body: { name: role.name, color: Number(role.color || 0), hoist: !!role.hoist, mentionable: !!role.mentionable, permissions: String(role.permissions || 0), ...(role.unicodeEmoji ? { unicode_emoji: role.unicodeEmoji } : {}) },
        reason,
      });
      state.roleMap[role.id] = made.id;
      state.pending = null;
      save(path, state);
    }
    state.phase = "channels";
    save(path, state);
  }

  await adopt(saved, state, path);

  if (state.phase === "channels") {
    const ordered = [...saved.channels].sort((a, b) => (a.type === 4 ? 0 : 1) - (b.type === 4 ? 0 : 1) || a.position - b.position);
    for (const channel of ordered) {
      if (state.channelMap[channel.id]) continue;
      const parent = channel.parentId ? state.channelMap[channel.parentId] : null;
      // Only role overwrites (and the owner's own member overwrite) are restored;
      // every other member-specific overwrite is dropped so nobody gets access by name.
      const overwrites = channel.overwrites
        .map((o) => ({ id: o.type === 0 ? state.roleMap[o.id] : o.id, type: o.type, allow: String(o.allow), deny: String(o.deny) }))
        .filter((o) => o.id && (o.type === 0 || o.id === OWNER));
      state.pending = { kind: "channel", id: channel.id };
      save(path, state);
      const made = await api(`/guilds/${GUILD}/channels`, {
        method: "POST",
        body: {
          name: channel.name,
          type: channel.type,
          topic: channel.topic ?? undefined,
          nsfw: channel.nsfw ?? undefined,
          bitrate: channel.bitrate ? Math.min(Number(channel.bitrate), 96000) : undefined,
          user_limit: channel.userLimit ?? undefined,
          rate_limit_per_user: channel.rateLimitPerUser ?? undefined,
          parent_id: parent || undefined,
          position: Number(channel.position || 0),
          permission_overwrites: overwrites,
        },
        reason,
      });
      state.channelMap[channel.id] = made.id;
      state.pending = null;
      save(path, state);
    }
    state.phase = "settings";
    save(path, state);
  }

  if (state.phase === "settings") {
    const mapped = (id) => (id ? state.channelMap[id] || null : null);
    const g = saved.guild;
    await api(`/guilds/${GUILD}`, {
      method: "PATCH",
      body: {
        name: g.name,
        description: g.description ?? null,
        verification_level: g.verificationLevel,
        default_message_notifications: g.defaultMessageNotifications,
        explicit_content_filter: g.explicitContentFilter,
        afk_timeout: g.afkTimeout,
        afk_channel_id: mapped(g.afkChannelId),
        system_channel_id: mapped(g.systemChannelId),
        rules_channel_id: mapped(g.rulesChannelId) || state.tempChannel,
        public_updates_channel_id: mapped(g.systemChannelId) || state.tempChannel,
        preferred_locale: g.preferredLocale,
      },
      reason,
    });
    state.phase = "cleanup";
    save(path, state);
  }

  if (state.phase === "cleanup") {
    const live = await api(`/guilds/${GUILD}`);
    if (state.tempChannel && ![live.rules_channel_id, live.public_updates_channel_id, live.system_channel_id].includes(state.tempChannel)) {
      await api(`/channels/${state.tempChannel}`, { method: "DELETE", reason }).catch(() => null);
      state.tempChannel = null;
    }
    state.phase = "complete";
    state.completedAt = new Date().toISOString();
    save(path, state);
  }

  save(`${dir}/main-id-map.json`, { backupId: BACKUP, sourceGuildId: GUILD, targetGuildId: GUILD, roles: state.roleMap, channels: state.channelMap, tempChannel: state.tempChannel });
  console.log(`main: ${state.phase} (${Object.keys(state.roleMap).length} role mappings, ${Object.keys(state.channelMap).length} channels)`);
}

async function verify(arg) {
  const dir = resolve(arg);
  const map = load(`${dir}/main-id-map.json`);
  const saved = await backupGuild();
  const [roles, channels, guild, members] = await Promise.all([api(`/guilds/${GUILD}/roles`), api(`/guilds/${GUILD}/channels`), api(`/guilds/${GUILD}?with_counts=true`), allMembers()]);
  const roleIds = new Set(roles.map((r) => r.id));
  const channelIds = new Set(channels.map((c) => c.id));
  const missingRoles = Object.entries(map.roles).filter(([, id]) => !roleIds.has(id));
  const missingChannels = Object.entries(map.channels).filter(([, id]) => !channelIds.has(id));
  const unmappedRoles = saved.roles.filter((r) => !map.roles[r.id]).map((r) => r.name);
  const unmappedChannels = saved.channels.filter((c) => !map.channels[c.id]).map((c) => c.name);
  const restored = new Set(Object.values(map.roles).filter((id) => id !== GUILD));
  const managed = new Set(roles.filter((r) => r.managed).map((r) => r.id));
  const humansWithRoles = members.filter((m) => !m.user.bot && m.roles.some((id) => restored.has(id) && !managed.has(id)));
  const result = {
    guild: guild.name,
    liveRoles: roles.length,
    liveChannels: channels.length,
    expectedRoles: saved.roles.length,
    expectedChannels: saved.channels.length,
    missingRoles: missingRoles.length,
    missingChannels: missingChannels.length,
    unmappedRoles,
    unmappedChannels,
    humansHoldingRestoredRoles: humansWithRoles.length,
    rules: guild.rules_channel_id,
    publicUpdates: guild.public_updates_channel_id,
    system: guild.system_channel_id,
  };
  console.log(JSON.stringify(result, null, 2));
  if (missingRoles.length || missingChannels.length || humansWithRoles.length) process.exitCode = 1;
}

const [action, argument] = process.argv.slice(2);
if (action === "--prepare" && !argument) await prepare();
else if (action === "--apply" && argument) await apply(argument);
else if (action === "--verify" && argument) await verify(argument);
else {
  console.error("Usage: restore-main-guild.mjs --prepare | --apply RUN_DIR | --verify RUN_DIR");
  process.exitCode = 2;
}
