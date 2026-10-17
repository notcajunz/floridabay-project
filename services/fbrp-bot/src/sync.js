import {
  AuditLogEvent,
  ChannelType,
  PermissionFlagsBits,
  PermissionsBitField,
} from "discord.js";
import { db, audit } from "./database.js";
import { VERIFICATION_CHANNEL_ID } from "./verification.js";

const origin = (guildId) => `discord:${guildId}`;
// These non-staff ACE groups are intentionally bidirectional: a bound Discord
// role grants the ACE group, while a manual ACE membership can still grant the
// Discord role. Staff roles remain ACE-authoritative and protected.
export const ROLE_AUTHORITATIVE_GROUPS = new Set([
  "law_enforcement",
  "fire_rescue",
  "verified",
  "ban_blacklist_moderator",
  "custom_weapons",
]);
const ROLE_AUTHORITATIVE_GROUP_SQL = [...ROLE_AUTHORITATIVE_GROUPS]
  .map(() => "?")
  .join(",");
// Sector coordination groups. A member joins one by holding a source role in `discord_role_sources`
// (the sector team role that /coord add hands out, or a rank role in the staff server). The synced
// display role this group puts in every other server is never a source, so removing the /coord role
// really removes the group everywhere instead of being held up by a mirrored role.
export const ROLE_SOURCED_GROUPS = new Set([
  "gang_coordination_team",
  "department_coordinator",
  "business_coordinator",
]);
const ROLE_SOURCED_GROUP_SQL = [...ROLE_SOURCED_GROUPS].map(() => "?").join(",");
const MEMBERSHIP_GROUPS = [...ROLE_AUTHORITATIVE_GROUPS, ...ROLE_SOURCED_GROUPS];
const MEMBERSHIP_GROUP_SQL = MEMBERSHIP_GROUPS.map(() => "?").join(",");
const P = PermissionFlagsBits;
const ALL_PERMISSIONS = Object.values(P).reduce((all, bit) => all | bit, 0n);
export const DANGEROUS_ROLE_PERMISSIONS =
  P.Administrator |
  P.ManageGuild |
  P.ManageRoles |
  P.BanMembers |
  P.ManageChannels |
  P.ManageWebhooks;

/** Network server types, in display order. Global role scopes target one type (or all/satellites/custom). */
export const NETWORK_KINDS = ["main", "staff", "gang", "department", "community", "business", "partner", "other"];
export const GLOBAL_SYNC_SCOPES = ["all", "satellites", ...NETWORK_KINDS, "custom"];

export const isBotOwner = (id) =>
  String(id) === "web-panel" || new Set(
    String(process.env.FBRP_SUPERUSER_IDS || process.env.FBRP_OWNER_DISCORD_ID || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  ).has(String(id));

export function parseDiscordPermissions(raw) {
  const value = String(raw ?? "0").trim();
  if (!/^\d{1,20}$/.test(value))
    throw new Error("Permissions must be a Discord permissions integer, such as 0.");
  const bits = BigInt(value);
  if (bits & ~ALL_PERMISSIONS)
    throw new Error("That permissions integer contains bits Discord does not define.");
  return bits;
}

export async function callGame(path, body, method = "POST") {
  const base = String(
    process.env.FBRP_FIVEM_ORIGIN || "http://127.0.0.1:30120/fbrp_core",
  ).replace(/\/$/, "");
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.FBRP_SERVICE_TOKEN || ""}`,
    },
    body: method === "GET" ? undefined : JSON.stringify(body || {}),
    signal: AbortSignal.timeout(3500),
  });
  if (!response.ok) throw new Error(`FiveM API ${response.status}`);
  return response.json();
}

export async function refreshGame() {
  return callGame("/refresh", {}).catch(() => null);
}

async function pickedGuilds(syncId) {
  return new Set(
    (
      await db.query(
        "SELECT guild_id FROM network_sync_guilds WHERE sync_id=?",
        [syncId],
      )
    ).map((row) => String(row.guild_id)),
  );
}

async function guildSettings(syncId) {
  return db.query(
    "SELECT guild_id,permissions,all_channels FROM network_sync_guild_settings WHERE sync_id=?",
    [syncId],
  );
}

/** Applies one server's explicit settings, falling back to the shared-role defaults. */
export function effectiveGuildSync(sync, settings = null) {
  if (!settings) return sync;
  return {
    ...sync,
    permissions: String(settings.permissions),
    all_channels: settings.all_channels === true || Number(settings.all_channels) === 1,
  };
}

async function inScope(sync, guildId, kind) {
  if (sync.scope === "custom")
    return (await pickedGuilds(sync.id)).has(String(guildId));
  return (
    sync.scope === "all" ||
    (sync.scope === "satellites" ? kind !== "main" : sync.scope === kind)
  );
}

function accessFor(channel) {
  if (
    channel.type === ChannelType.GuildVoice ||
    channel.type === ChannelType.GuildStageVoice
  )
    return { ViewChannel: true, Connect: true, Speak: true };
  if (
    channel.type === ChannelType.GuildText ||
    channel.type === ChannelType.GuildAnnouncement ||
    channel.type === ChannelType.GuildForum ||
    channel.type === ChannelType.GuildMedia
  )
    return { ViewChannel: true, SendMessages: true, ReadMessageHistory: true };
  if (channel.type === ChannelType.GuildCategory)
    return {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true,
      Connect: true,
      Speak: true,
    };
  return null;
}

async function applyChannelAccess(guild, roleId, enabled, only = null) {
  const result = { changed: 0, failed: 0 };
  for (const channel of only ? [only] : guild.channels.cache.values()) {
    if (enabled && channel.id === VERIFICATION_CHANNEL_ID) continue;
    const access = accessFor(channel);
    if (!access || !("permissionOverwrites" in channel)) continue;
    const current = channel.permissionOverwrites.cache.get(String(roleId));
    if (!enabled && !current) continue;
    // Discord rate-limits overwrite edits, so leave channels that already grant the access alone.
    if (enabled && current && Object.keys(access).every((flag) => current.allow.has(PermissionFlagsBits[flag]) && !current.deny.has(PermissionFlagsBits[flag])))
      continue;
    const ok = enabled
      ? await channel.permissionOverwrites
          .edit(roleId, access, {
            reason: "Florida Bay global role sync: all-channel access",
          })
          .then(() => true, () => false)
      : await channel.permissionOverwrites
          .delete(
            roleId,
            "Florida Bay global role sync: all-channel access removed",
          )
          .then(() => true, () => false);
    if (ok) result.changed += 1;
    else result.failed += 1;
  }
  return result;
}

const clean = (value) => String(value ?? "").replace(/[`*_~>]|\|\|/g, "").slice(0, 100);
const channelNote = (r) =>
  r.changed || r.failed
    ? ` · all channels: ${r.changed} set${r.failed ? `, ${r.failed} failed` : ""}`
    : "";
export const orderNote = (r) =>
  `${r.moved ? `${r.moved} role${r.moved === 1 ? "" : "s"} moved` : "already in order"}${r.skipped ? ` · ${r.skipped} above the bot's role, left in place` : ""}`;
export const SCOPE_LABEL = {
  all: "Every network server",
  satellites: "Every server except main",
  main: "Main server only",
  staff: "Staff servers",
  gang: "Gang servers",
  department: "Department servers",
  community: "Community servers",
  business: "Business servers",
  partner: "Partner servers",
  other: "Other servers",
  custom: "Individually picked servers",
};

export async function networkRows() {
  return db.query(
    `SELECT * FROM network_guilds ORDER BY FIELD(kind,${NETWORK_KINDS.map((kind) => `'${kind}'`).join(",")}),name`,
  );
}

export async function scopeText(sync) {
  if (sync.scope !== "custom") return SCOPE_LABEL[sync.scope] || sync.scope;
  const picked = await pickedGuilds(sync.id);
  return `Picked servers (${picked.size})`;
}

/** Creates, restyles or links one sync's role in one server. Linked roles only accept explicit permission edits. */
async function ensureRole(guild, sync, updateLinkedPermissions = false) {
  const saved = await db.one(
    "SELECT role_id,managed FROM network_sync_roles WHERE sync_id=? AND guild_id=?",
    [sync.id, guild.id],
  );
  let role = saved
    ? await guild.roles.fetch(String(saved.role_id)).catch(() => null)
    : null;
  const spec = {
    name: sync.role_name,
    colors: { primaryColor: Number(sync.color || 0) },
    permissions: parseDiscordPermissions(sync.permissions || "0"),
    hoist: Boolean(sync.hoist),
    mentionable: Boolean(sync.mentionable),
  };
  if (role) {
    if (!saved.managed) {
      if (!updateLinkedPermissions)
        return { role, line: `**${clean(role.name)}** · linked existing role (left as-is)` };
      if (role.permissions.bitfield === spec.permissions)
        return { role, line: `**${clean(role.name)}** · linked existing role · permissions up to date` };
      if (!role.editable)
        return { role, line: `**${clean(role.name)}** · linked existing role · above the bot, permissions unchanged` };
      const ok = await role
        .setPermissions(spec.permissions, `Florida Bay global role sync (${sync.group_name})`)
        .then(() => true, () => false);
      return {
        role,
        line: `**${clean(role.name)}** · linked existing role · permissions ${ok ? "updated" : "update refused"}`,
      };
    }
    const drift =
      role.name !== spec.name ||
      role.colors.primaryColor !== spec.colors.primaryColor ||
      role.permissions.bitfield !== spec.permissions ||
      role.hoist !== spec.hoist ||
      role.mentionable !== spec.mentionable;
    if (!drift) return { role, line: `**${clean(role.name)}** · up to date` };
    if (!role.editable)
      return { role, line: `**${clean(role.name)}** · above the bot's role, could not update` };
    const ok = await role
      .edit({ ...spec, reason: `Florida Bay global role sync (${sync.group_name})` })
      .then(() => true, () => false);
    return {
      role,
      line: `**${clean(role.name)}** · ${ok ? "updated" : "update refused (the bot may lack one of those permissions)"}`,
    };
  }

  // Reuse a role already bound to the group in this server, then a same-named role, before creating one.
  const bound = await db.query(
    "SELECT role_id FROM discord_role_bindings WHERE guild_id=? AND group_name=?",
    [guild.id, sync.group_name],
  );
  role = bound
    .map((row) => guild.roles.cache.get(String(row.role_id)))
    .find(Boolean);
  role ??= guild.roles.cache.find(
    (candidate) =>
      candidate.id !== guild.id &&
      !candidate.managed &&
      candidate.name.toLowerCase() === String(sync.role_name).toLowerCase(),
  );
  let managed = false;
  if (!role) {
    role = await guild.roles
      .create({ ...spec, reason: `Florida Bay global role sync for the ${sync.group_name} ACE group` })
      .catch(() => null);
    if (!role)
      return {
        role: null,
        line: `Could not create **${clean(sync.role_name)}** (the bot needs Manage Roles and every permission it grants)`,
      };
    managed = true;
  }
  await db.query(
    `INSERT INTO network_sync_roles(sync_id,guild_id,role_id,managed)
     VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE role_id=VALUES(role_id),managed=VALUES(managed)`,
    [sync.id, guild.id, role.id, managed],
  );
  return {
    role,
    line: `**${clean(role.name)}** · ${managed ? "created" : "linked existing role"}${role.editable ? "" : " · above the bot's role, so it cannot be assigned"}`,
  };
}

async function unlinkRole(client, guildId, syncId, deleteManaged = true) {
  const mapped = await db.one(
    "SELECT role_id,managed FROM network_sync_roles WHERE sync_id=? AND guild_id=?",
    [syncId, guildId],
  );
  if (!mapped) return null;
  await db.query(
    "DELETE FROM network_sync_roles WHERE sync_id=? AND guild_id=?",
    [syncId, guildId],
  );
  const guild = client.guilds.cache.get(String(guildId));
  const deleted =
    deleteManaged &&
    Boolean(mapped.managed) &&
    Boolean(guild) &&
    (await guild.roles
      .delete(String(mapped.role_id), "Florida Bay global role sync removed")
      .then(() => true, () => false));
  return deleted ? "role deleted" : "unlinked (role kept)";
}

/**
 * Puts one server's synced roles at the top of every role the bot can manage, in the network order
 * (sort_order, top first). Every other role below the bot keeps its relative order underneath them.
 * Roles at or above the bot's highest role cannot be moved by the bot and stay where they are.
 */
export async function applyRoleOrder(guild, database = db) {
  const rows = await database.query(
    `SELECT r.role_id FROM network_sync_roles r
     JOIN network_syncs s ON s.id=r.sync_id
     WHERE r.guild_id=? AND s.placement='top' ORDER BY s.sort_order,s.id`,
    [guild.id],
  );
  await guild.roles.fetch().catch(() => {});
  const synced = [...new Set(rows.map((row) => String(row.role_id)))]
    .map((id) => guild.roles.cache.get(id))
    .filter(Boolean);
  // Equal-position roles can report editable while Discord rejects the reorder, so require a higher bot role.
  const botPosition = guild.members.me?.roles.highest.position || 0;
  const movable = synced.filter((role) => role.editable && role.position < botPosition);
  const result = { moved: 0, skipped: synced.length - movable.length };
  if (!movable.length) return result;
  const syncedIds = new Set(movable.map((role) => role.id));
  // Discord refuses to move a role that has permissions the bot lacks (or an integration role), and one
  // such role fails the whole reorder. Those stay in their slot; everything else is reordered around them.
  const me = guild.members.me;
  const canMove = (role) =>
    syncedIds.has(role.id) ||
    (role.editable && !role.managed && (me.permissions.has(PermissionFlagsBits.Administrator) || me.permissions.has(role.permissions)));
  // Movable roles between @everyone and the bot, top first: synced roles in network order, then the rest as they are.
  const below = [...guild.roles.cache.values()]
    .filter((role) => role.id !== guild.id && role.position < botPosition && canMove(role))
    .sort((a, b) => b.position - a.position);
  const target = [...movable, ...below.filter((role) => !syncedIds.has(role.id))];
  const slots = below.map((role) => role.position);
  const changes = target
    .map((role, index) => ({ role, position: slots[index] }))
    .filter((change) => change.role.position !== change.position);
  if (!changes.length) return result;
  // Discord sometimes leaves newly-created roles sharing a raw position. Its bulk reorder endpoint rejects
  // those lists, but moving the synced roles individually renumbers the hierarchy and repairs the condition.
  const raw = below.map((role) => role.rawPosition);
  if (new Set(raw).size < raw.length || raw.some((value) => value >= me.roles.highest.rawPosition)) {
    for (let index = movable.length - 1; index >= 0; index--) {
      const role = movable[index];
      const position = slots[index];
      if (role.position === position) continue;
      const moved = await role
        .setPosition(position, { reason: "Florida Bay global role sync: repair network order" })
        .then(() => true, () => false);
      if (moved) result.moved += 1;
    }
    return result;
  }
  await guild.roles.setPositions(changes.map((change) => ({ role: change.role.id, position: change.position })));
  result.moved = changes.filter((change) => syncedIds.has(change.role.id)).length;
  return result;
}

/**
 * Puts syncs with placement 'below' directly under their anchor role (network_sync_anchors, the
 * server's Management Team or Staff Coordination Team role). Several roles on one anchor stack in network order.
 * Roles linked without an anchor are never moved.
 */
async function applyBelowPlacement(guild) {
  const rows = await db.query(
    `SELECT r.role_id,a.below_role_id FROM network_sync_roles r
     JOIN network_syncs s ON s.id=r.sync_id
     JOIN network_sync_anchors a ON a.sync_id=r.sync_id AND a.guild_id=r.guild_id
     WHERE r.guild_id=? AND s.placement='below'
     ORDER BY s.sort_order,s.id`,
    [guild.id],
  );
  const result = { moved: 0, skipped: 0 };
  if (!rows.length) return result;
  await guild.roles.fetch().catch(() => {});
  const botPosition = guild.members.me?.roles.highest.position || 0;
  const tail = new Map();
  for (const row of rows) {
    const role = guild.roles.cache.get(String(row.role_id));
    const anchor = guild.roles.cache.get(tail.get(row.below_role_id) || String(row.below_role_id));
    if (!role || !anchor || !role.editable || anchor.position - 1 >= botPosition) {
      result.skipped += 1;
      continue;
    }
    for (let attempt = 0; attempt < 3; attempt++) {
      const current = guild.roles.cache.get(role.id);
      const above = guild.roles.cache.get(anchor.id);
      if (current.position === above.position - 1) break;
      const target = current.position > above.position ? above.position : above.position - 1;
      const moved = await current.setPosition(target, { reason: "Florida Bay global role sync: below anchor" }).then(() => true, () => false);
      if (!moved) break;
      await guild.roles.fetch().catch(() => {});
      if (attempt === 0) result.moved += 1;
    }
    tail.set(row.below_role_id, role.id);
  }
  return result;
}

/** Creates, restyles or unlinks every synced role in one server to match network_syncs. */
async function syncGuildRoles(client, guild, kind) {
  const lines = [];
  const syncs = await db.query("SELECT * FROM network_syncs ORDER BY sort_order,id");
  const settings = new Map(
    (await db.query(
      "SELECT sync_id,permissions,all_channels FROM network_sync_guild_settings WHERE guild_id=?",
      [guild.id],
    )).map((row) => [Number(row.sync_id), row]),
  );
  for (const sync of syncs) {
    if (await inScope(sync, guild.id, kind)) {
      const effective = effectiveGuildSync(sync, settings.get(Number(sync.id)));
      const { line, role } = await ensureRole(guild, effective, settings.has(Number(sync.id)));
      let channels = "";
      if (role && effective.all_channels)
        channels = channelNote(await applyChannelAccess(guild, role.id, true));
      lines.push(`\`${sync.group_name}\` → ${line}${channels}`);
    } else {
      const removed = await unlinkRole(client, guild.id, sync.id, true);
      if (removed) lines.push(`\`${sync.group_name}\` → out of scope, ${removed}`);
    }
  }
  await applyRoleOrder(guild).catch((error) =>
    lines.push(`Role order: ${clean(error?.message ?? error)}`),
  );
  await applyBelowPlacement(guild).catch((error) =>
    lines.push(`Role placement: ${clean(error?.message ?? error)}`),
  );
  return lines;
}

async function syncGuildRoleDefinitions(client, guild) {
  const network = await db.one(
    "SELECT kind FROM network_guilds WHERE guild_id=?",
    [guild.id],
  );
  if (!network) return [];
  return syncGuildRoles(client, guild, network.kind);
}

/** Creates, restyles or removes one sync's role in every network server to match its scope. */
export async function applySync(client, sync, previous = null) {
  const lines = [];
  const currentSettings = new Map(
    (await guildSettings(sync.id)).map((row) => [String(row.guild_id), row]),
  );
  const previousSettings = new Map(
    (previous?.settings || []).map((row) => [String(row.guild_id), row]),
  );
  for (const network of await networkRows()) {
    const guild = client.guilds.cache.get(String(network.guild_id));
    if (!guild) lines.push(`**${clean(network.name)}** · the bot is not in this server`);
    else if (await inScope(sync, guild.id, network.kind)) {
      const effective = effectiveGuildSync(sync, currentSettings.get(String(guild.id)));
      const before = previous?.sync
        ? effectiveGuildSync(previous.sync, previousSettings.get(String(guild.id)))
        : null;
      const { line, role } = await ensureRole(guild, effective, currentSettings.has(String(guild.id)));
      const channels =
        role && (effective.all_channels || before?.all_channels)
          ? channelNote(await applyChannelAccess(guild, role.id, Boolean(effective.all_channels)))
          : "";
      await applyRoleOrder(guild).catch(() => {});
      await applyBelowPlacement(guild).catch(() => {});
      lines.push(`**${clean(guild.name)}** · ${line}${channels}`);
    } else {
      const mapped = await db.one(
        "SELECT role_id FROM network_sync_roles WHERE sync_id=? AND guild_id=?",
        [sync.id, guild.id],
      );
      const before = previous?.sync
        ? effectiveGuildSync(previous.sync, previousSettings.get(String(guild.id)))
        : null;
      if (mapped && before?.all_channels)
        await applyChannelAccess(guild, String(mapped.role_id), false);
      const removed = await unlinkRole(client, guild.id, sync.id, true);
      if (removed) lines.push(`**${clean(guild.name)}** · not selected, ${removed}`);
    }
  }
  const swept = await serial(() => sweep(client, "none"));
  await refreshGame();
  return { lines, swept };
}

/** Re-creates missing synced roles in every server, then re-syncs every member. */
export async function pushGlobalSyncs(client) {
  const lines = [];
  for (const network of await networkRows()) {
    const guild = client.guilds.cache.get(String(network.guild_id));
    if (!guild) {
      lines.push(`**${clean(network.name)}** · the bot is not in this server`);
      continue;
    }
    const checked = await syncGuildRoles(client, guild, network.kind);
    lines.push(`**${clean(guild.name)}** · ${checked.length} role${checked.length === 1 ? "" : "s"} checked`);
  }
  const swept = await serial(() => sweep(client, "none", { fetch: true }));
  await refreshGame();
  return { lines, swept };
}

async function gatesForGuild(guildId) {
  const rows = await db.query(
    `SELECT role_id,group_name FROM discord_role_bindings WHERE guild_id=?
     UNION ALL
     SELECT r.role_id,s.group_name FROM network_sync_roles r
     JOIN network_syncs s ON s.id=r.sync_id WHERE r.guild_id=?`,
    [guildId, guildId],
  );
  const gates = new Map();
  for (const row of rows) {
    const groups = gates.get(String(row.role_id)) || new Set();
    groups.add(String(row.group_name));
    gates.set(String(row.role_id), groups);
  }
  return gates;
}

async function directMemberships(discordId) {
  return new Set(
    (
      await db.query(
        `SELECT DISTINCT group_name FROM ace_memberships
         WHERE discord_id=?
           AND origin <> 'bootstrap'
           AND (origin NOT LIKE 'discord:%' OR group_name IN (${MEMBERSHIP_GROUP_SQL}))`,
        [discordId, ...MEMBERSHIP_GROUPS],
      )
    ).map((row) => String(row.group_name)),
  );
}

/**
 * Reconciles ACE memberships sourced from this guild's bound Discord roles.
 * One origin row per guild lets a member keep access while they still hold a
 * qualifying role in any other network guild.
 */
async function syncRoleAuthoritativeMemberships(member, actorId) {
  const rows = await db.query(
    `SELECT role_id,group_name FROM discord_role_bindings
       WHERE guild_id=? AND group_name IN (${ROLE_AUTHORITATIVE_GROUP_SQL})
     UNION ALL
     SELECT r.role_id,s.group_name FROM network_sync_roles r
       JOIN network_syncs s ON s.id=r.sync_id
       WHERE r.guild_id=? AND s.group_name IN (${ROLE_AUTHORITATIVE_GROUP_SQL})
     UNION ALL
     SELECT role_id,group_name FROM discord_role_sources
       WHERE guild_id=? AND group_name IN (${ROLE_SOURCED_GROUP_SQL})`,
    [
      member.guild.id,
      ...ROLE_AUTHORITATIVE_GROUPS,
      member.guild.id,
      ...ROLE_AUTHORITATIVE_GROUPS,
      member.guild.id,
      ...ROLE_SOURCED_GROUPS,
    ],
  );
  const heldGroups = new Set(
    rows
      .filter((row) => member.roles.cache.has(String(row.role_id)))
      .map((row) => String(row.group_name)),
  );
  const membershipOrigin = origin(member.guild.id);
  await db.transaction(async (query) => {
    await query(
      `DELETE FROM ace_memberships
       WHERE discord_id=? AND origin=? AND group_name IN (${MEMBERSHIP_GROUP_SQL})`,
      [member.id, membershipOrigin, ...MEMBERSHIP_GROUPS],
    );
    for (const groupName of heldGroups)
      await query(
        "INSERT INTO ace_memberships(discord_id,group_name,origin,added_by,added_at) VALUES(?,?,?,?,?)",
        [member.id, groupName, membershipOrigin, actorId, Date.now()],
      );
  });
}

let sourceRoleCache = { at: 0, ids: new Set() };
/** True when a member update added or removed a role that grants a sector coordination group. */
export async function touchesCoordinationSource(oldMember, newMember) {
  if (Date.now() - sourceRoleCache.at > 30000) {
    const rows = await db.query("SELECT DISTINCT role_id FROM discord_role_sources").catch(() => []);
    sourceRoleCache = { at: Date.now(), ids: new Set(rows.map((row) => String(row.role_id))) };
  }
  if (!sourceRoleCache.ids.size) return false;
  const before = oldMember?.roles?.cache;
  const after = newMember.roles.cache;
  if (!before) return [...sourceRoleCache.ids].some((id) => after.has(id));
  return [...sourceRoleCache.ids].some((id) => before.has(id) !== after.has(id));
}

/** Management and above also wear this rank's Discord roles on top of their own. */
export const STAFF_MANAGEMENT_EXTRA_GROUP = "head_administrator";
const MANAGEMENT_FLOOR_GROUP = "mgmt_team";
export const MANAGEMENT_MEMBERSHIP_GROUP = "mgmt_team";
export const MANAGEMENT_MINIMUM_GROUP = "assistant_community_manager";
export const MANAGEMENT_MEMBERSHIP_ORIGIN = "derived:acm_plus";

/**
 * Makes Management Team membership a derived property of holding ACM or a higher
 * staff ACE rank. All origins for mgmt_team are replaced so a stale manual grant
 * cannot survive a demotion or staff removal.
 */
export async function reconcileManagementMembership(discordId, addedBy = "system", database = db) {
  const id = String(discordId);
  const [eligible, existing] = await Promise.all([
    database.one(
      `SELECT 1 ok FROM ace_memberships m
       JOIN ace_groups held ON held.name=m.group_name
       JOIN ace_groups floor ON floor.name=?
       WHERE m.discord_id=? AND m.group_name<>? AND held.staff_only=TRUE
         AND held.rank_order>=floor.rank_order
         AND (m.origin NOT LIKE 'discord:%' OR m.group_name='ban_blacklist_moderator')
       LIMIT 1`,
      [MANAGEMENT_MINIMUM_GROUP, id, MANAGEMENT_MEMBERSHIP_GROUP],
    ),
    database.query(
      "SELECT origin FROM ace_memberships WHERE discord_id=? AND group_name=?",
      [id, MANAGEMENT_MEMBERSHIP_GROUP],
    ),
  ]);
  const correct = eligible
    ? existing.length === 1 && String(existing[0].origin) === MANAGEMENT_MEMBERSHIP_ORIGIN
    : existing.length === 0;
  if (correct) return { eligible: Boolean(eligible), changed: false };
  await database.transaction(async (query) => {
    await query("DELETE FROM ace_memberships WHERE discord_id=? AND group_name=?", [id, MANAGEMENT_MEMBERSHIP_GROUP]);
    if (eligible)
      await query(
        "INSERT INTO ace_memberships(discord_id,group_name,origin,added_by,added_at) VALUES(?,?,?,?,?)",
        [id, MANAGEMENT_MEMBERSHIP_GROUP, MANAGEMENT_MEMBERSHIP_ORIGIN, String(addedBy), Date.now()],
      );
  });
  return { eligible: Boolean(eligible), changed: true };
}

/** Rebuilds the derived group for every account, including accounts no longer in Discord caches. */
export async function reconcileAllManagementMemberships(addedBy = "system", database = db) {
  const [eligibleRows, existing] = await Promise.all([
    database.query(
      `SELECT DISTINCT m.discord_id FROM ace_memberships m
       JOIN ace_groups held ON held.name=m.group_name
       JOIN ace_groups floor ON floor.name=?
       WHERE m.group_name<>? AND held.staff_only=TRUE
         AND held.rank_order>=floor.rank_order
         AND (m.origin NOT LIKE 'discord:%' OR m.group_name='ban_blacklist_moderator')`,
      [MANAGEMENT_MINIMUM_GROUP, MANAGEMENT_MEMBERSHIP_GROUP],
    ),
    database.query(
      "SELECT discord_id,origin FROM ace_memberships WHERE group_name=?",
      [MANAGEMENT_MEMBERSHIP_GROUP],
    ),
  ]);
  const eligible = new Set(eligibleRows.map((row) => String(row.discord_id)));
  const byAccount = new Map();
  for (const row of existing) byAccount.set(String(row.discord_id), [...(byAccount.get(String(row.discord_id)) || []), String(row.origin)]);
  const changed = new Set([...eligible, ...byAccount.keys()].filter((id) => {
    const origins = byAccount.get(id) || [];
    return eligible.has(id)
      ? origins.length !== 1 || origins[0] !== MANAGEMENT_MEMBERSHIP_ORIGIN
      : origins.length > 0;
  }));
  if (!changed.size) return { eligible: eligible.size, changed: [] };
  await database.transaction(async (query) => {
    for (const id of changed) {
      await query("DELETE FROM ace_memberships WHERE discord_id=? AND group_name=?", [id, MANAGEMENT_MEMBERSHIP_GROUP]);
      if (eligible.has(id))
        await query(
          "INSERT INTO ace_memberships(discord_id,group_name,origin,added_by,added_at) VALUES(?,?,?,?,?)",
          [id, MANAGEMENT_MEMBERSHIP_GROUP, MANAGEMENT_MEMBERSHIP_ORIGIN, String(addedBy), Date.now()],
        );
    }
  });
  return { eligible: eligible.size, changed: [...changed] };
}

let staffRankCache = { at: 0, info: { ranks: new Map(), floor: null } };
/**
 * Staff rank groups (one per roster rank) with their rank_order, plus the rank_order from which a member counts
 * as management. Cached briefly because every member reconcile reads it.
 */
export async function staffRankInfo() {
  if (Date.now() - staffRankCache.at < 15000) return staffRankCache.info;
  const [rows, floor] = await Promise.all([
    db.query(
      `SELECT DISTINCT g.name,g.rank_order FROM staff_roster_ranks r
       JOIN ace_groups g ON g.name=r.ace_group`,
    ),
    db.one("SELECT rank_order FROM ace_groups WHERE name=?", [MANAGEMENT_FLOOR_GROUP]),
  ]);
  const info = {
    ranks: new Map(rows.map((row) => [String(row.name), Number(row.rank_order)])),
    floor: floor ? Number(floor.rank_order) : null,
  };
  staffRankCache = { at: Date.now(), info };
  return info;
}

/**
 * The staff rank groups whose Discord roles a member wears: their top rank, plus Head Administrator and every lower
 * management/ownership rank when they are management or above. Lower ranks stay in their ACE groups regardless; this
 * only decides which Discord roles are granted.
 */
export function staffDisplayGroups(top, info) {
  const keep = new Set([top]);
  const topOrder = info.ranks.get(top) ?? -1;
  if (info.floor !== null && topOrder >= info.floor) {
    keep.add(STAFF_MANAGEMENT_EXTRA_GROUP);
    for (const [name, order] of info.ranks) if (order >= info.floor && order <= topOrder) keep.add(name);
  }
  return keep;
}

/** Memberships with every staff rank group except the member's displayed ones taken out (non-staff groups pass). */
export function visibleMemberships(memberships, info) {
  const held = [...memberships].filter((name) => info.ranks.has(name));
  if (!held.length) return memberships;
  const top = held.reduce((best, name) => (info.ranks.get(name) > info.ranks.get(best) ? name : best));
  const keep = staffDisplayGroups(top, info);
  return new Set([...memberships].filter((name) => !info.ranks.has(name) || keep.has(name)));
}

const lastFullFetch = new Map();
/**
 * Every member of a guild. The GuildMembers intent keeps the cache current once it is full, and Discord
 * allows one full member request per guild every 30 seconds, so only fetch when the cache is incomplete.
 */
export async function allMembers(guild) {
  if (guild.members.cache.size >= guild.memberCount) return guild.members.cache;
  if (Date.now() - (lastFullFetch.get(guild.id) || 0) < 31000) return guild.members.cache;
  lastFullFetch.set(guild.id, Date.now());
  return guild.members.fetch().catch((error) => {
    console.warn(`[FBRP global sync] member fetch for ${guild.name} fell back to cache: ${error.message || error}`);
    return guild.members.cache;
  });
}

let gateReporter = null;
/** index.js routes gate violations to the security log channel. */
export function setGateReporter(fn) {
  gateReporter = fn;
}

async function grantedBy(guild, userId, roleId) {
  const logs = await guild
    .fetchAuditLogs({ type: AuditLogEvent.MemberRoleUpdate, limit: 10 })
    .catch(() => null);
  const entry = logs?.entries.find(
    (item) =>
      item.targetId === userId &&
      Date.now() - item.createdTimestamp < 120000 &&
      item.changes.some(
        (change) =>
          change.key === "$add" &&
          Array.isArray(change.new) &&
          change.new.some((added) => added.id === roleId),
      ),
  );
  return entry?.executorId ?? null;
}

async function reportViolation(member, role, groups, mode, removed) {
  if (!gateReporter) return;
  // One alert per member and role a minute: a repeating grant is already visible in the first one.
  const key = `${member.guild.id}:${member.id}:${role.id}`;
  if (Date.now() - (reportedAt.get(key) || 0) < 60000) return;
  reportedAt.set(key, Date.now());
  if (reportedAt.size > 2000) for (const [k, at] of reportedAt) if (Date.now() - at > 60000) reportedAt.delete(k);
  // The audit-log entry can land a moment after the member update.
  const by =
    mode === "live"
      ? await new Promise((resolve) => setTimeout(resolve, 1500)).then(() =>
          grantedBy(member.guild, member.id, role.id),
        )
      : null;
  await gateReporter({ member, role, groups: [...groups], mode, removed, by });
}

/**
 * Brings one member's gated roles in line with direct ACE membership.
 * alert: "none" (expected change), "live" (someone just granted it), or "sweep" (found later).
 */
let blacklistCache = { at: 0, ids: new Set() };
/** Members under an active /global blacklist (cached briefly; sweeps call this per member). */
export async function blacklistedIds() {
  if (Date.now() - blacklistCache.at < 15000) return blacklistCache.ids;
  const rows = await db.query(
    "SELECT DISTINCT target_id FROM moderation_cases WHERE guild_id='global' AND action='blacklist' AND active=TRUE",
  );
  blacklistCache = { at: Date.now(), ids: new Set(rows.map((row) => String(row.target_id))) };
  return blacklistCache.ids;
}
export function invalidateBlacklistCache() {
  blacklistCache = { at: 0, ids: new Set() };
}

let roleStripCache = { at: 0, ids: new Set() };
/** Accounts actively held without roles/ACE by /global rolestrip. */
export async function roleStrippedIds() {
  if (Date.now() - roleStripCache.at < 15000) return roleStripCache.ids;
  const rows = await db.query("SELECT discord_id FROM global_role_strips WHERE restoring=FALSE").catch(() => []);
  roleStripCache = { at: Date.now(), ids: new Set(rows.map((row) => String(row.discord_id))) };
  return roleStripCache.ids;
}
export function invalidateRoleStripCache() {
  roleStripCache = { at: 0, ids: new Set() };
}

let offenderCache = { at: 0, ids: new Set() };
/** Accounts on the anti-nuke offender list: quarantined network-wide, so role sync never hands roles back. */
async function nukeOffenderIds() {
  if (Date.now() - offenderCache.at < 15000) return offenderCache.ids;
  const rows = await db.query("SELECT discord_id FROM network_nuke_offenders WHERE active=TRUE").catch(() => []);
  offenderCache = { at: Date.now(), ids: new Set(rows.map((row) => String(row.discord_id))) };
  return offenderCache.ids;
}

/** `${guildId}:${memberId}` → { promise, again, alert }: one reconcile per member at a time. */
const reconciling = new Map();
/** `${guildId}:${memberId}:${roleId}` → last alert time, so a role fight can never flood the channel. */
const reportedAt = new Map();
const MAX_RECONCILE_PASSES = 3;

/**
 * Brings one member's gated roles in line with ACE membership. Calls for the same member never overlap:
 * a burst of guildMemberUpdate events (a pardon or restore changing dozens of roles at once) collapses
 * into the run in flight plus at most a few follow-up passes, so no pass acts on a half-applied view.
 */
export function syncMemberRoles(client, member, { alert = "none" } = {}) {
  if (!member || member.user.bot) return Promise.resolve({ added: 0, removed: 0 });
  const key = `${member.guild.id}:${member.id}`;
  const running = reconciling.get(key);
  if (running) {
    running.again = true;
    if (running.alert === "none") running.alert = alert;
    return running.promise;
  }
  const state = { again: false, alert };
  state.promise = (async () => {
    try {
      const total = await reconcileMemberRoles(client, member, { alert });
      for (let pass = 1; state.again && pass < MAX_RECONCILE_PASSES; pass++) {
        state.again = false;
        const live = member.guild.members.cache.get(member.id) || member;
        const next = await reconcileMemberRoles(client, live, { alert: state.alert });
        total.added += next.added;
        total.removed += next.removed;
      }
      return total;
    } finally {
      reconciling.delete(key);
    }
  })();
  reconciling.set(key, state);
  return state.promise;
}

async function reconcileMemberRoles(client, member, { alert = "none" } = {}) {
  // Reconcile role-sourced ACE access before enforcing gates. This prevents a
  // newly granted LEO/fire/verified role from being mistaken for an unauthorized grant.
  const roleStripped = (await roleStrippedIds()).has(member.id);
  if (!roleStripped) await syncRoleAuthoritativeMemberships(member, client.user.id);
  // Bootstrap memberships are reserved for in-game/bot authorization and are
  // intentionally excluded by directMemberships. They must never assign a
  // visible Discord role; only an explicit membership can do that.
  const [gates, memberships, blacklisted, offenders, rankInfo] = await Promise.all([
    gatesForGuild(member.guild.id),
    directMemberships(member.id),
    blacklistedIds(),
    nukeOffenderIds(),
    staffRankInfo(),
  ]);
  // A blacklisted member keeps only the isolation role; gated roles are never granted back.
  // Anti-nuke offenders are treated the same way until /security pardon.
  let quarantined = blacklisted.has(member.id) || offenders.has(member.id) || roleStripped;
  if (quarantined) memberships.clear();
  // Staff keep every lower rank's ACE group, but only wear the Discord role of their top rank (see staffDisplayGroups).
  const wantedRole = (groups) => {
    const visible = visibleMemberships(memberships, rankInfo);
    return [...groups].some((name) => visible.has(name));
  };
  // Before taking a role away, confirm against fresh data. The member cache can lag a burst of role
  // changes, and the blacklist/offender caches can outlive a pardon; acting on either strips roles
  // the member is entitled to, and the resulting update event starts the next round of the fight.
  const removals = [...gates].filter(([roleId, groups]) => member.roles.cache.has(roleId) && !wantedRole(groups));
  if (removals.length) {
    await member.fetch(true).catch(() => null);
    if (quarantined) {
      invalidateBlacklistCache();
      offenderCache = { at: 0, ids: new Set() };
      invalidateRoleStripCache();
      const [freshBlacklist, freshOffenders, freshRoleStrips] = await Promise.all([blacklistedIds(), nukeOffenderIds(), roleStrippedIds()]);
      quarantined = freshBlacklist.has(member.id) || freshOffenders.has(member.id) || freshRoleStrips.has(member.id);
      if (!quarantined) for (const name of await directMemberships(member.id)) memberships.add(name);
    }
  }
  const result = { added: 0, removed: 0 };
  for (const [roleId, groups] of gates) {
    const role = member.guild.roles.cache.get(roleId);
    if (!role) continue;
    const wanted = wantedRole(groups);
    const held = member.roles.cache.has(roleId);
    const groupList = [...groups].join("/");
    if (held && !wanted) {
      const removed =
        role.editable &&
        (await member.roles
          .remove(
            role,
            `Florida Bay: ${role.name} is bound to the ${groupList} ACE group and this member is not in it. Grant it with /ace member-add.`,
          )
          .then(() => true, () => false));
      if (removed) result.removed += 1;
      if (alert !== "none")
        void reportViolation(member, role, groups, alert, removed).catch((error) =>
          console.error("[FBRP global sync] violation alert:", error),
        );
    } else if (wanted && !held && role.editable) {
      const ok = await member.roles
        .add(role, `Florida Bay: member of the ${groupList} ACE group`)
        .then(() => true, () => false);
      if (ok) result.added += 1;
    }
  }
  return result;
}

let sweepChain = Promise.resolve();
/** Sweeps run one at a time so two triggers never race each other on the same member. */
export function serial(fn) {
  const next = sweepChain.then(fn, fn);
  sweepChain = next.catch(() => {});
  return next;
}

/** Applies every role gate to every member of every network server. */
export async function sweep(client, alert = "none", { fetch = false, only = null } = {}) {
  const total = { added: 0, removed: 0 };
  if (!client.isReady()) return total;
  for (const network of await networkRows()) {
    if (only && String(network.guild_id) !== String(only)) continue;
    const guild = client.guilds.cache.get(String(network.guild_id));
    if (!guild) continue;
    const members = fetch ? await allMembers(guild) : guild.members.cache;
    for (const member of members.values()) {
      const result = await syncMemberRoles(client, member, { alert });
      total.added += result.added;
      total.removed += result.removed;
    }
  }
  return total;
}

/** refresh: false lets bulk syncs tell FiveM to reload once at the end instead of once per member. */
export async function syncMember(client, member, { alert = "none", refresh = true } = {}) {
  if (!member || member.user.bot) return;
  const held = new Set(member.roles.cache.keys());
  const tags = await db.query(
    "SELECT id,role_id FROM headtags WHERE guild_id=? AND role_id IS NOT NULL AND enabled=TRUE",
    [member.guild.id],
  );
  const wantedTags = tags
    .filter((row) => held.has(String(row.role_id)))
    .map((row) => Number(row.id));
  await db.transaction(async (query) => {
    await query(
      `INSERT INTO discord_member_cache(guild_id,discord_id,roles,nickname,username,avatar,updated_at) VALUES(?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE roles=VALUES(roles),nickname=VALUES(nickname),username=VALUES(username),avatar=VALUES(avatar),updated_at=VALUES(updated_at)`,
      [
        member.guild.id,
        member.id,
        JSON.stringify([...held]),
        member.nickname,
        member.user.username,
        member.user.displayAvatarURL({ size: 128 }),
        Date.now(),
      ],
    );
    await query("DELETE FROM headtag_grants WHERE discord_id=? AND origin=?", [
      member.id,
      origin(member.guild.id),
    ]);
    for (const tagId of wantedTags)
      await query(
        "INSERT IGNORE INTO headtag_grants(discord_id,tag_id,origin,added_by,added_at) VALUES(?,?,?,?,?)",
        [member.id, tagId, origin(member.guild.id), client.user.id, Date.now()],
      );
    const requirements = await query(
      `SELECT o.id AS org_id,r.guild_id,r.role_id,c.roles
       FROM organizations o
       JOIN organization_role_requirements r ON r.org_id=o.id
       LEFT JOIN discord_member_cache c ON c.guild_id=r.guild_id AND c.discord_id=?
       WHERE o.active=TRUE ORDER BY o.id`,
      [member.id],
    );
    const eligibility = new Map();
    for (const requirement of requirements) {
      let roles = requirement.roles || [];
      if (typeof roles === "string") {
        try {
          roles = JSON.parse(roles);
        } catch {
          roles = [];
        }
      }
      const eligible =
        Array.isArray(roles) &&
        roles.map(String).includes(String(requirement.role_id));
      eligibility.set(
        Number(requirement.org_id),
        Boolean(eligibility.get(Number(requirement.org_id))) || eligible,
      );
    }
    for (const [orgId, eligible] of eligibility) {
      if (eligible)
        await query(
          `INSERT IGNORE INTO organization_members(org_id,discord_id,rank_name,manager,added_by,added_at)
           VALUES(?,?,'Member',FALSE,?,?)`,
          [orgId, member.id, client.user.id, Date.now()],
        );
      else
        await query(
          "DELETE FROM organization_members WHERE org_id=? AND discord_id=?",
          [orgId, member.id],
        );
    }
  });
  await syncMemberRoles(client, member, { alert });
  if (refresh) await refreshGame();
}

export async function syncUserAcrossNetwork(client, discordId) {
  let synced = 0;
  const guilds = await db.query("SELECT guild_id FROM network_guilds");
  for (const row of guilds) {
    const guild = client.guilds.cache.get(String(row.guild_id));
    const member = await guild?.members.fetch(String(discordId)).catch(() => null);
    if (!member || member.user.bot) continue;
    await syncMember(client, member, { refresh: false });
    synced += 1;
  }
  await refreshGame();
  return synced;
}

/** Keeps the network directory aligned with the current Discord server name. */
export async function syncNetworkGuildName(guild, database = db) {
  const name = String(guild?.name || "").trim().slice(0, 100);
  if (!guild?.id || !name) return false;
  const result = await database.query(
    "UPDATE network_guilds SET name=? WHERE guild_id=? AND name<>?",
    [name, String(guild.id), name],
  );
  return Number(result?.affectedRows || 0) > 0;
}

export async function syncGuild(client, guild, options = {}) {
  await syncNetworkGuildName(guild);
  await db.query("DELETE FROM discord_guild_roles WHERE guild_id=?", [guild.id]);
  await guild.roles.fetch().catch(() => {});
  for (const role of guild.roles.cache.values())
    await db.query(
      "INSERT INTO discord_guild_roles(guild_id,role_id,name,updated_at) VALUES(?,?,?,?)",
      [guild.id, role.id, role.name, Date.now()],
    );
  await syncGuildRoleDefinitions(client, guild);
  const members = await allMembers(guild);
  for (const member of members.values())
    if (!member.user.bot) await syncMember(client, member, { refresh: false });
  if (!options.deferRefresh) await refreshGame();
  return members.size;
}

let syncChain = Promise.resolve();
export function queueGlobalSync(client) {
  const next = syncChain.then(() => syncAll(client), () => syncAll(client));
  syncChain = next.catch(() => {});
  return next;
}

export async function syncAll(client, options = {}) {
  const network = await db.query("SELECT guild_id FROM network_guilds");
  let members = 0;
  for (const row of network) {
    const guild = client.guilds.cache.get(String(row.guild_id));
    if (guild) members += await syncGuild(client, guild, { ...options, deferRefresh: true });
  }
  await refreshGame();
  await audit(client.user.id, "network.sync", null, {
    guilds: network.length,
    members,
  });
  return { guilds: network.length, members };
}

const defaultRoleName = (group) =>
  group.replace(/[_-]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());

function normalizeSyncInput(group, input, existing = null) {
  const scope = String(input.scope || existing?.scope || "all");
  if (!GLOBAL_SYNC_SCOPES.includes(scope)) throw new Error("Unknown role-sync scope.");
  const permissions = parseDiscordPermissions(
    input.permissions ?? existing?.permissions ?? "0",
  ).toString();
  let color = input.color ?? existing?.color ?? 0;
  if (typeof color === "string" && /^(default|none|discord|0)?$/i.test(color.trim())) color = 0;
  else if (typeof color === "string") {
    if (!/^#?[0-9a-f]{6}$/i.test(color)) throw new Error("Use a hex color like #43E8D8.");
    color = Number.parseInt(color.replace("#", ""), 16);
  }
  color = Number(color);
  if (!Number.isInteger(color) || color < 0 || color > 0xffffff)
    throw new Error("Use a hex color like #43E8D8.");
  const roleName = String(
    input.role_name || existing?.role_name || defaultRoleName(group),
  ).trim();
  if (roleName.length > 100) throw new Error("Role names are limited to 100 characters.");
  return {
    role_name: roleName,
    scope,
    permissions,
    color,
    hoist: Boolean(input.hoist ?? existing?.hoist),
    mentionable: Boolean(input.mentionable ?? existing?.mentionable),
    all_channels: Boolean(input.all_channels ?? existing?.all_channels),
  };
}

async function requireSyncableGroup(actor, group) {
  const target = await db.one("SELECT name FROM ace_groups WHERE name=?", [group]);
  if (!target)
    throw new Error(`Unknown ACE group \`${clean(group)}\`. Create it with /ace create first.`);
  // The owner group's role marks the top of the network, so only a bot owner may sync it.
  if (group === "owner" && !isBotOwner(actor))
    throw new Error("Only a bot owner can sync the owner group's role.");
}

async function replacePickedGuilds(syncId, guildIds) {
  const known = new Set((await networkRows()).map((row) => String(row.guild_id)));
  const chosen = [...new Set(guildIds.map(String))].filter((id) => known.has(id));
  await db.transaction(async (query) => {
    await query("DELETE FROM network_sync_guilds WHERE sync_id=?", [syncId]);
    for (const guildId of chosen)
      await query(
        "INSERT IGNORE INTO network_sync_guilds(sync_id,guild_id) VALUES(?,?)",
        [syncId, guildId],
      );
  });
  return chosen;
}

async function normalizeGuildSettings(actor, entries) {
  if (!Array.isArray(entries)) return null;
  const known = new Set((await networkRows()).map((row) => String(row.guild_id)));
  const normalized = [];
  const seen = new Set();
  for (const entry of entries) {
    const guildId = String(entry?.guild_id || "");
    if (!known.has(guildId)) throw new Error(`Unknown network server \`${clean(guildId)}\`.`);
    if (seen.has(guildId)) throw new Error("Each network server can only have one role setting.");
    seen.add(guildId);
    const permissions = parseDiscordPermissions(entry.permissions ?? "0").toString();
    if (parseDiscordPermissions(permissions) & DANGEROUS_ROLE_PERMISSIONS && !isBotOwner(actor))
      throw new Error(
        "Only a bot owner can sync a role with Administrator, Manage Server, Manage Roles, Ban Members, Manage Channels or Manage Webhooks.",
      );
    normalized.push({
      guild_id: guildId,
      permissions,
      all_channels: Boolean(entry.all_channels),
    });
  }
  return normalized;
}

async function replaceGuildSettings(syncId, settings) {
  if (!settings) return;
  await db.transaction(async (query) => {
    await query("DELETE FROM network_sync_guild_settings WHERE sync_id=?", [syncId]);
    for (const setting of settings)
      await query(
        `INSERT INTO network_sync_guild_settings(sync_id,guild_id,permissions,all_channels)
         VALUES(?,?,?,?)`,
        [syncId, setting.guild_id, setting.permissions, setting.all_channels],
      );
  });
}

/**
 * Makes an existing Discord role the sync's role in that role's server (left visually unchanged).
 * For individually picked syncs the server is added to the picks; otherwise it must be in scope.
 */
async function linkExistingRole(client, actor, sync, guildId, roleId) {
  const guild = client.guilds.cache.get(String(guildId));
  if (!guild) throw new Error(`The bot is not in server \`${clean(guildId)}\`.`);
  const role = guild.roles.cache.get(String(roleId)) || (await guild.roles.fetch(String(roleId)).catch(() => null));
  if (!role) throw new Error(`Role \`${clean(roleId)}\` was not found in **${clean(guild.name)}**.`);
  if (role.id === guild.id || role.managed)
    throw new Error(`**${clean(role.name)}** cannot be used: choose a normal role, not @everyone or a bot/integration role.`);
  const network = await db.one("SELECT kind FROM network_guilds WHERE guild_id=?", [guild.id]);
  if (!network) throw new Error(`**${clean(guild.name)}** is not part of the network. Add it with /network add first.`);
  if (role.permissions.bitfield & DANGEROUS_ROLE_PERMISSIONS && !isBotOwner(actor))
    throw new Error(`Only a bot owner can use **${clean(role.name)}**: it has dangerous Discord permissions.`);
  const other = await db.one(
    `SELECT s.group_name FROM network_sync_roles r JOIN network_syncs s ON s.id=r.sync_id
     WHERE r.guild_id=? AND r.role_id=? AND s.id<>?`,
    [guild.id, role.id, sync.id],
  );
  if (other)
    throw new Error(`**${clean(role.name)}** is already the \`${other.group_name}\` global-sync role. Remove that sync first.`);
  if (sync.scope === "custom")
    await db.query("INSERT IGNORE INTO network_sync_guilds(sync_id,guild_id) VALUES(?,?)", [sync.id, guild.id]);
  else if (!(await inScope(sync, guild.id, network.kind)))
    throw new Error(
      `**${clean(guild.name)}** is outside the \`${sync.group_name}\` sync's servers (${await scopeText(sync)}). Pick it or change the server type first.`,
    );
  const previous = await db.one(
    "SELECT role_id FROM network_sync_roles WHERE sync_id=? AND guild_id=?",
    [sync.id, guild.id],
  );
  // A bot-created role this replaces is deleted; a previously linked existing role is kept.
  if (previous && String(previous.role_id) !== role.id) await unlinkRole(client, guild.id, sync.id, true);
  await db.query(
    `INSERT INTO network_sync_roles(sync_id,guild_id,role_id,managed)
     VALUES(?,?,?,FALSE) ON DUPLICATE KEY UPDATE role_id=VALUES(role_id),managed=FALSE`,
    [sync.id, guild.id, role.id],
  );
  await audit(actor, "network.sync.bind", role.id, { group: sync.group_name, guild: guild.id });
  return role;
}

/** Finds which network server owns each role ID (role IDs are unique across Discord). */
export function resolveNetworkRoles(client, roleIds) {
  return roleIds.map((roleId) => {
    const id = String(roleId).replace(/[<@&>\s]/g, "");
    if (!/^\d{15,24}$/.test(id)) throw new Error(`\`${clean(roleId)}\` is not a role ID.`);
    const guild = client.guilds.cache.find((item) => item.roles.cache.has(id));
    if (!guild) throw new Error(`No server the bot is in has a role with ID \`${id}\`.`);
    return { guild_id: guild.id, role_id: id };
  });
}

/**
 * existing_roles: [{guild_id, role_id}] - a role_id reuses that existing role in its server; an empty
 * role_id switches a server that used an existing role back to a bot-created one (the old role is kept).
 */
async function applyExistingRoles(client, actor, sync, entries) {
  for (const entry of entries) {
    if (!entry?.guild_id) continue;
    if (entry.role_id) await linkExistingRole(client, actor, sync, entry.guild_id, entry.role_id);
    else {
      const current = await db.one(
        "SELECT managed FROM network_sync_roles WHERE sync_id=? AND guild_id=?",
        [sync.id, entry.guild_id],
      );
      if (current && !current.managed) await unlinkRole(client, entry.guild_id, sync.id, false);
    }
  }
}

/**
 * Creates or edits a global role sync and applies it everywhere. When a sync newly becomes "custom"
 * without a server list, nothing is applied until the servers are picked (needsPicker).
 */
export async function saveGlobalSync(client, actor, rawGroup, input = {}) {
  const group = String(rawGroup || "").trim().toLowerCase();
  await requireSyncableGroup(actor, group);
  const existing = await db.one("SELECT * FROM network_syncs WHERE group_name=?", [group]);
  const oldGuildSettings = existing ? await guildSettings(existing.id) : [];
  const next = normalizeSyncInput(group, input, existing);
  const nextGuildSettings = await normalizeGuildSettings(actor, input.server_settings);
  if (
    parseDiscordPermissions(next.permissions) & DANGEROUS_ROLE_PERMISSIONS &&
    !isBotOwner(actor)
  )
    throw new Error(
      "Only a bot owner can sync a role with Administrator, Manage Server, Manage Roles, Ban Members, Manage Channels or Manage Webhooks.",
    );
  // A new sync joins the bottom of the network role order.
  const order = existing
    ? Number(existing.sort_order)
    : Number(
        (
          await db.one("SELECT COALESCE(MAX(sort_order),0)+1 AS n FROM network_syncs")
        )?.n || 1,
      );
  await db.query(
    `INSERT INTO network_syncs(group_name,role_name,scope,permissions,color,hoist,mentionable,all_channels,sort_order,created_by,created_at)
     VALUES(?,?,?,?,?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE role_name=VALUES(role_name),scope=VALUES(scope),permissions=VALUES(permissions),color=VALUES(color),hoist=VALUES(hoist),mentionable=VALUES(mentionable),all_channels=VALUES(all_channels)`,
    [
      group,
      next.role_name,
      next.scope,
      next.permissions,
      next.color,
      next.hoist,
      next.mentionable,
      next.all_channels,
      order,
      actor,
      Date.now(),
    ],
  );
  const sync = await db.one("SELECT * FROM network_syncs WHERE group_name=?", [group]);
  if (Array.isArray(input.guild_ids)) await replacePickedGuilds(sync.id, input.guild_ids);
  await replaceGuildSettings(sync.id, nextGuildSettings);
  if (Array.isArray(input.existing_roles) && input.existing_roles.length) {
    try {
      await applyExistingRoles(client, actor, sync, input.existing_roles);
    } catch (error) {
      if (!existing) await db.query("DELETE FROM network_syncs WHERE id=?", [sync.id]);
      throw error;
    }
  }
  await audit(actor, existing ? "network.sync.edit" : "network.sync.create", group, {
    ...next,
    server_settings: nextGuildSettings,
  });
  const needsPicker =
    sync.scope === "custom" &&
    existing?.scope !== "custom" &&
    !Array.isArray(input.guild_ids);
  if (needsPicker) return { sync, existing, needsPicker, lines: [], swept: { added: 0, removed: 0 } };
  const { lines, swept } = await applySync(
    client,
    sync,
    existing ? { sync: existing, settings: oldGuildSettings } : null,
  );
  return { sync, existing, needsPicker, lines, swept };
}

/** Switches a sync to hand-picked servers and applies it. */
export async function setGlobalSyncServers(client, actor, syncId, guildIds) {
  const sync = await db.one("SELECT * FROM network_syncs WHERE id=?", [Number(syncId)]);
  if (!sync) throw new Error("That global sync no longer exists.");
  await db.query("UPDATE network_syncs SET scope='custom' WHERE id=?", [sync.id]);
  const chosen = await replacePickedGuilds(sync.id, guildIds);
  await audit(actor, "network.sync.servers", sync.group_name, { guilds: chosen });
  const { lines, swept } = await applySync(client, { ...sync, scope: "custom" });
  return { sync, chosen, lines, swept };
}

/**
 * Binds an ACE group to an existing Discord role. The role becomes that group's global-sync role in
 * this server and is left visually unchanged. If the group is not synced yet, a sync is created
 * from the role so the other network servers get a matching role.
 */
export async function bindSyncRole(client, actor, rawGroup, guild, role) {
  const group = String(rawGroup || "").trim().toLowerCase();
  await requireSyncableGroup(actor, group);
  if (role.id === guild.id || role.managed)
    throw new Error("Choose a normal role, not @everyone or a bot/integration role.");
  let sync = await db.one("SELECT * FROM network_syncs WHERE group_name=?", [group]);
  const created = !sync;
  if (!sync) {
    await db.query(
      `INSERT INTO network_syncs(group_name,role_name,scope,permissions,color,hoist,mentionable,all_channels,sort_order,created_by,created_at)
       VALUES(?,?,'all','0',?,?,?,FALSE,(SELECT n FROM (SELECT COALESCE(MAX(sort_order),0)+1 n FROM network_syncs) t),?,?)`,
      [group, role.name.slice(0, 100), role.colors?.primaryColor || 0, role.hoist, role.mentionable, actor, Date.now()],
    );
    sync = await db.one("SELECT * FROM network_syncs WHERE group_name=?", [group]);
  }
  try {
    await linkExistingRole(client, actor, sync, guild.id, role.id);
  } catch (error) {
    if (created) await db.query("DELETE FROM network_syncs WHERE id=?", [sync.id]);
    throw error;
  }
  const { lines, swept } = await applySync(client, sync);
  return { sync, created, lines, swept };
}

export async function setGlobalSyncOrder(client, actor, groups) {
  const current = await db.query(
    "SELECT group_name FROM network_syncs ORDER BY sort_order,id",
  );
  const known = current.map((row) => String(row.group_name));
  const listed = [...new Set(groups.map((name) => String(name).trim().toLowerCase()).filter(Boolean))];
  const unknown = listed.filter((name) => !known.includes(name));
  if (unknown.length)
    throw new Error(`Not synced: ${unknown.map((name) => `\`${clean(name)}\``).join(", ")}. Check /globalsync list.`);
  // Groups left out keep their current relative order, below the ones listed.
  const order = [...listed, ...known.filter((name) => !listed.includes(name))];
  await db.transaction(async (query) => {
    for (const [index, name] of order.entries())
      await query("UPDATE network_syncs SET sort_order=? WHERE group_name=?", [
        index + 1,
        name,
      ]);
  });
  const lines = [];
  for (const network of await networkRows()) {
    const guild = client.guilds.cache.get(String(network.guild_id));
    if (guild)
      lines.push(
        `**${clean(guild.name)}** · ${await applyRoleOrder(guild).then(orderNote, (error) => `role order failed: ${clean(error?.message ?? error)}`)}`,
      );
  }
  await audit(actor, "network.sync.order", null, { order });
  return { order, lines };
}

export async function deleteGlobalSync(client, rawGroup, deleteRoles = true, actor = null) {
  const group = String(rawGroup || "").trim().toLowerCase();
  const sync = await db.one("SELECT * FROM network_syncs WHERE group_name=?", [group]);
  if (!sync) throw new Error(`\`${clean(group)}\` is not synced.`);
  const lines = [];
  for (const network of await networkRows()) {
    const result = await unlinkRole(client, network.guild_id, sync.id, deleteRoles);
    if (result) lines.push(`**${clean(client.guilds.cache.get(String(network.guild_id))?.name || network.name)}** · ${result}`);
  }
  await db.query("DELETE FROM network_sync_roles WHERE sync_id=?", [sync.id]);
  await db.query("DELETE FROM network_sync_guilds WHERE sync_id=?", [sync.id]);
  await db.query("DELETE FROM network_syncs WHERE id=?", [sync.id]);
  await audit(actor || client.user.id, "network.sync.delete", group, { deleteRoles });
  return lines;
}

export async function enforceAllChannelAccess(client, channel = null) {
  // The verification lobby is intentionally private to the Unverified role, even for
  // network roles configured with the otherwise-global "all channels" option.
  if (channel?.id === VERIFICATION_CHANNEL_ID) return;
  const rows = await db.query(
    `SELECT r.guild_id,r.role_id FROM network_sync_roles r
     JOIN network_syncs s ON s.id=r.sync_id WHERE s.all_channels=TRUE`,
  );
  for (const row of rows) {
    const guild = client.guilds.cache.get(String(row.guild_id));
    if (!guild || (channel && channel.guild?.id !== guild.id)) continue;
    if (guild.roles.cache.has(String(row.role_id)))
      await applyChannelAccess(guild, row.role_id, true, channel);
  }
}

export function describeDiscordPermissions(raw) {
  const bits = parseDiscordPermissions(raw);
  if (!bits) return "none";
  return new PermissionsBitField(bits).toArray().join(", ");
}
