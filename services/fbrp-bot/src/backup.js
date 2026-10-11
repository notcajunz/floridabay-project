import { gzip, gunzip } from "node:zlib";
import { promisify } from "node:util";
import { ChannelType } from "discord.js";
import { db } from "./database.js";

const pack = promisify(gzip);
const unpack = promisify(gunzip);

export const KEEP_BACKUPS = 10;
const CATEGORY = ChannelType.GuildCategory;
let running = null;

export const backupBusy = () => running;

const bits = (value) => String(value ?? 0);

async function snapshotGuild(guild) {
  await guild.members.fetch().catch(() => {});
  await guild.channels.fetch().catch(() => {});
  await guild.roles.fetch().catch(() => {});

  const roles = [...guild.roles.cache.values()].map((role) => ({
    id: role.id,
    name: role.name,
    color: role.colors?.primaryColor ?? role.color ?? 0,
    hoist: role.hoist,
    mentionable: role.mentionable,
    permissions: bits(role.permissions.bitfield),
    position: role.position,
    managed: role.managed,
    everyone: role.id === guild.id,
    unicodeEmoji: role.unicodeEmoji ?? null,
  }));

  const channels = [...guild.channels.cache.values()]
    .filter((channel) => !channel.isThread?.())
    .map((channel) => ({
      id: channel.id,
      name: channel.name,
      type: channel.type,
      topic: channel.topic ?? null,
      nsfw: channel.nsfw ?? null,
      bitrate: channel.bitrate ?? null,
      userLimit: channel.userLimit ?? null,
      rateLimitPerUser: channel.rateLimitPerUser ?? null,
      parentId: channel.parentId ?? null,
      position: channel.rawPosition ?? channel.position ?? 0,
      overwrites: [...(channel.permissionOverwrites?.cache.values() || [])].map((o) => ({
        id: o.id,
        type: o.type,
        allow: bits(o.allow.bitfield),
        deny: bits(o.deny.bitfield),
      })),
    }));

  const members = {};
  for (const member of guild.members.cache.values()) {
    if (member.user.bot) continue;
    const ids = [...member.roles.cache.keys()].filter((id) => id !== guild.id);
    if (ids.length) members[member.id] = ids;
  }

  const bans = await guild.bans
    .fetch()
    .then((list) => [...list.values()].map((ban) => ({ id: ban.user.id, reason: ban.reason ?? null })))
    .catch(() => []);

  return {
    version: 1,
    guild: {
      id: guild.id,
      name: guild.name,
      description: guild.description ?? null,
      verificationLevel: guild.verificationLevel,
      defaultMessageNotifications: guild.defaultMessageNotifications,
      explicitContentFilter: guild.explicitContentFilter,
      afkTimeout: guild.afkTimeout,
      afkChannelId: guild.afkChannelId ?? null,
      systemChannelId: guild.systemChannelId ?? null,
      rulesChannelId: guild.rulesChannelId ?? null,
      preferredLocale: guild.preferredLocale,
    },
    roles,
    channels,
    members,
    bans,
  };
}

/** Saves a backup of every network server the bot is in. */
export async function saveAll(client, { actorId, label = null } = {}) {
  if (running) throw new Error(`A backup ${running} is already running.`);
  running = "save";
  try {
    const network = await db.query("SELECT guild_id,name,kind FROM network_guilds ORDER BY FIELD(kind,'main','staff'),name");
    const skipped = [];
    const taken = [];
    for (const row of network) {
      const guild = client.guilds.cache.get(String(row.guild_id)) || (await client.guilds.fetch(String(row.guild_id)).catch(() => null));
      if (!guild) {
        skipped.push(`${row.name} (${row.guild_id}): bot is not in this server`);
        continue;
      }
      try {
        const data = await snapshotGuild(guild);
        taken.push({ row, guild, data });
      } catch (error) {
        skipped.push(`${row.name} (${row.guild_id}): ${error.message || error}`);
      }
    }
    if (!taken.length) throw new Error("No network server could be backed up.");

    const created = await db.query(
      "INSERT INTO discord_server_backups(label,created_by,created_at,guild_count,skipped) VALUES(?,?,?,?,?)",
      [label ? String(label).slice(0, 100) : null, String(actorId || "system"), Date.now(), taken.length, skipped.length ? skipped.join("\n").slice(0, 4000) : null],
    );
    const id = Number(created.insertId);
    for (const { row, guild, data } of taken) {
      await db.query(
        "INSERT INTO discord_server_backup_guilds(backup_id,guild_id,name,kind,roles,channels,members,data) VALUES(?,?,?,?,?,?,?,?)",
        [id, guild.id, guild.name.slice(0, 100), row.kind, data.roles.length, data.channels.length, Object.keys(data.members).length, await pack(JSON.stringify(data))],
      );
    }
    // Keep the newest KEEP_BACKUPS; cascade removes their per-server data.
    await db.query(
      "DELETE FROM discord_server_backups WHERE id NOT IN (SELECT id FROM (SELECT id FROM discord_server_backups ORDER BY id DESC LIMIT ?) keep)",
      [KEEP_BACKUPS],
    );
    return {
      id,
      skipped,
      guilds: taken.map(({ guild, data }) => ({
        id: guild.id,
        name: guild.name,
        roles: data.roles.length,
        channels: data.channels.length,
        members: Object.keys(data.members).length,
      })),
    };
  } finally {
    running = null;
  }
}

export async function listBackups(limit = 10) {
  return db.query(
    "SELECT id,label,created_by,created_at,guild_count,skipped FROM discord_server_backups ORDER BY id DESC LIMIT ?",
    [limit],
  );
}

const sameOverwrites = (current, saved) => {
  const key = (o) => `${o.id}:${o.type}:${bits(o.allow)}:${bits(o.deny)}`;
  const a = current.map(key).sort().join("|");
  const b = saved.map(key).sort().join("|");
  return a === b;
};

async function restoreGuild(guild, data, { apply, members, skipUser, why }) {
  const out = { rolesCreated: 0, rolesFixed: 0, channelsCreated: 0, channelsFixed: 0, membersFixed: 0, rolesGiven: 0, settings: 0, failed: 0, notes: [] };
  const me = guild.members.me || (await guild.members.fetchMe().catch(() => null));
  if (!me) {
    out.notes.push("Bot member unavailable");
    return out;
  }
  await guild.members.fetch().catch(() => {});
  await guild.channels.fetch().catch(() => {});
  await guild.roles.fetch().catch(() => {});

  const attempt = async (work) => {
    try {
      await work();
      return true;
    } catch (error) {
      out.failed++;
      if (out.notes.length < 5) out.notes.push(String(error.message || error).slice(0, 120));
      return false;
    }
  };

  /* Guild settings */
  const g = data.guild;
  const settings = {};
  if (guild.name !== g.name) settings.name = g.name;
  for (const key of ["verificationLevel", "defaultMessageNotifications", "explicitContentFilter", "afkTimeout"]) {
    if (guild[key] !== g[key]) settings[key] = g[key];
  }
  if (Object.keys(settings).length) {
    if (!apply || (await attempt(() => guild.edit({ ...settings, reason: why })))) out.settings = Object.keys(settings).length;
  }

  /* Roles: match by id, then by name; create what is missing; fix permissions/colour */
  const roleMap = new Map([[guild.id, guild.id]]);
  const used = new Set([guild.id]);
  const botTop = me.roles.highest.position;
  const savedRoles = data.roles.filter((r) => !r.everyone).sort((a, b) => a.position - b.position);
  for (const saved of data.roles.filter((r) => r.everyone)) {
    const everyone = guild.roles.everyone;
    if (bits(everyone.permissions.bitfield) !== saved.permissions && apply) {
      if (await attempt(() => everyone.setPermissions(BigInt(saved.permissions), why))) out.rolesFixed++;
    } else if (bits(everyone.permissions.bitfield) !== saved.permissions) out.rolesFixed++;
  }
  for (const saved of savedRoles) {
    let role = guild.roles.cache.get(saved.id);
    if (role && used.has(role.id)) role = null;
    if (!role) role = guild.roles.cache.find((r) => !used.has(r.id) && !r.managed && r.name === saved.name);
    if (saved.managed) {
      // Integration/bot roles cannot be recreated; map them if they still exist.
      if (role) {
        used.add(role.id);
        roleMap.set(saved.id, role.id);
      }
      continue;
    }
    if (!role) {
      if (!apply) {
        out.rolesCreated++;
        continue;
      }
      let made = null;
      const ok = await attempt(async () => {
        made = await guild.roles.create({
          name: saved.name,
          colors: { primaryColor: saved.color },
          hoist: saved.hoist,
          mentionable: saved.mentionable,
          permissions: BigInt(saved.permissions),
          unicodeEmoji: saved.unicodeEmoji ?? undefined,
          reason: why,
        });
      });
      if (ok && made) {
        out.rolesCreated++;
        used.add(made.id);
        roleMap.set(saved.id, made.id);
        await made.setPosition(Math.max(1, Math.min(saved.position, botTop - 1)), { reason: why }).catch(() => {});
      }
      continue;
    }
    used.add(role.id);
    roleMap.set(saved.id, role.id);
    const drift =
      bits(role.permissions.bitfield) !== saved.permissions ||
      (role.colors?.primaryColor ?? role.color) !== saved.color ||
      role.hoist !== saved.hoist ||
      role.mentionable !== saved.mentionable;
    if (!drift || !role.editable) continue;
    if (!apply) {
      out.rolesFixed++;
      continue;
    }
    if (
      await attempt(() =>
        role.edit({
          colors: { primaryColor: saved.color },
          hoist: saved.hoist,
          mentionable: saved.mentionable,
          permissions: BigInt(saved.permissions),
          reason: why,
        }),
      )
    )
      out.rolesFixed++;
  }

  /* Channels: categories first, then everything else */
  const channelMap = new Map();
  const usedChannels = new Set();
  const ordered = [...data.channels].sort((a, b) => (a.type === CATEGORY ? 0 : 1) - (b.type === CATEGORY ? 0 : 1) || a.position - b.position);
  for (const saved of ordered) {
    const parentId = saved.parentId ? channelMap.get(saved.parentId) ?? null : null;
    let channel = guild.channels.cache.get(saved.id);
    if (channel && (usedChannels.has(channel.id) || channel.type !== saved.type)) channel = null;
    if (!channel) {
      channel = guild.channels.cache.find(
        (c) =>
          !usedChannels.has(c.id) &&
          !c.isThread?.() &&
          c.type === saved.type &&
          c.name === saved.name &&
          (c.parentId ?? null) === (parentId ?? null),
      );
    }
    const overwrites = saved.overwrites
      .map((o) => ({ id: o.type === 0 ? roleMap.get(o.id) : o.id, type: o.type, allow: BigInt(o.allow), deny: BigInt(o.deny) }))
      .filter((o) => o.id && (o.type === 0 ? guild.roles.cache.has(o.id) || used.has(o.id) : guild.members.cache.has(o.id)));
    if (!channel) {
      if (!apply) {
        out.channelsCreated++;
        continue;
      }
      let made = null;
      const ok = await attempt(async () => {
        made = await guild.channels.create({
          name: saved.name,
          type: saved.type,
          topic: saved.topic ?? undefined,
          nsfw: saved.nsfw ?? undefined,
          bitrate: saved.bitrate ?? undefined,
          userLimit: saved.userLimit ?? undefined,
          rateLimitPerUser: saved.rateLimitPerUser ?? undefined,
          parent: parentId && guild.channels.cache.has(parentId) ? parentId : undefined,
          position: saved.position,
          permissionOverwrites: overwrites,
          reason: why,
        });
      });
      if (ok && made) {
        out.channelsCreated++;
        usedChannels.add(made.id);
        channelMap.set(saved.id, made.id);
      }
      continue;
    }
    usedChannels.add(channel.id);
    channelMap.set(saved.id, channel.id);
    const current = [...(channel.permissionOverwrites?.cache.values() || [])].map((o) => ({
      id: o.id,
      type: o.type,
      allow: o.allow.bitfield,
      deny: o.deny.bitfield,
    }));
    const edits = {};
    if (!sameOverwrites(current, overwrites)) edits.permissionOverwrites = overwrites;
    if (saved.topic !== null && "topic" in channel && (channel.topic ?? null) !== saved.topic) edits.topic = saved.topic;
    if (parentId && channel.parentId !== parentId) edits.parent = parentId;
    if (!Object.keys(edits).length || !channel.manageable) continue;
    if (!apply) {
      out.channelsFixed++;
      continue;
    }
    if (await attempt(() => channel.edit({ ...edits, reason: why }))) out.channelsFixed++;
  }

  /* Member role assignments: only re-adds roles a present member has lost */
  if (members) {
    for (const [userId, savedRoleIds] of Object.entries(data.members)) {
      const member = guild.members.cache.get(userId);
      if (!member || member.user.bot) continue;
      if (await skipUser(userId)) continue;
      const missing = savedRoleIds
        .map((id) => roleMap.get(id))
        .filter((id) => id && id !== guild.id && !member.roles.cache.has(id))
        .filter((id) => {
          const role = guild.roles.cache.get(id);
          return role && !role.managed && role.position < botTop;
        });
      if (!missing.length) continue;
      out.membersFixed++;
      out.rolesGiven += missing.length;
      if (apply) await attempt(() => member.roles.add(missing, why));
    }
  }
  return out;
}

/**
 * Restores a backup across the network. Additive: it recreates missing roles/channels and
 * re-applies saved settings, but never deletes anything. `apply:false` is a dry run.
 */
export async function restoreAll(client, { backupId = null, apply = false, members = true, skipUser = async () => false, onProgress = null, actorId } = {}) {
  if (running) throw new Error(`A backup ${running} is already running.`);
  const backup = backupId
    ? await db.one("SELECT * FROM discord_server_backups WHERE id=?", [backupId])
    : await db.one("SELECT * FROM discord_server_backups ORDER BY id DESC LIMIT 1");
  if (!backup) throw new Error("No backup found. Run `/backup save` first.");
  running = "restore";
  try {
    const rows = await db.query("SELECT guild_id,name,data FROM discord_server_backup_guilds WHERE backup_id=? ORDER BY name", [backup.id]);
    const results = [];
    const why = `Florida Bay backup #${backup.id} restore${actorId ? ` by ${actorId}` : ""}`;
    for (const [index, row] of rows.entries()) {
      const guild = client.guilds.cache.get(String(row.guild_id)) || (await client.guilds.fetch(String(row.guild_id)).catch(() => null));
      if (!guild) {
        results.push({ name: row.name, id: row.guild_id, missing: true });
        continue;
      }
      try {
        const data = JSON.parse((await unpack(row.data)).toString("utf8"));
        const out = await restoreGuild(guild, data, { apply, members, skipUser, why });
        results.push({ name: guild.name, id: guild.id, ...out });
      } catch (error) {
        results.push({ name: row.name, id: row.guild_id, error: String(error.message || error) });
      }
      if (onProgress) await onProgress(index + 1, rows.length, results.at(-1)).catch(() => {});
    }
    return { backup, apply, results };
  } finally {
    running = null;
  }
}
