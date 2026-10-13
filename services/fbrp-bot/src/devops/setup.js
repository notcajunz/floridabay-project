import { ChannelType, PermissionFlagsBits as P, GuildVerificationLevel, GuildDefaultMessageNotifications, GuildExplicitContentFilter } from "discord.js";
import { config, db, invalidateRanks, RANKS, setConfig } from "./store.js";
import { CATEGORIES, ROLES, TICKET_CATEGORY_KEYS, channelName, overwritesFor } from "./layout.js";
import { sleep } from "./util.js";

/**
 * Builds (or repairs) the FBRP | DevOps server from the blueprint in layout.js.
 *
 * It is idempotent: roles, categories and channels are matched by id from the saved config, then by
 * name, and only created when missing. Existing members, messages and anything outside the blueprint
 * are left alone. The one deletion is the empty default scaffolding Discord creates in a new server.
 */

/** "📌┃INFORMATION" and "information" both become "information". */
const norm = (value) => String(value).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

const PACE = 350; // ms between creations, keeps the audit log readable and the REST queue calm

export async function ensureServer(guild, { actorId = null, log = () => {} } = {}) {
  const summary = { rolesCreated: 0, rolesFound: 0, categoriesCreated: 0, channelsCreated: 0, channelsFound: 0, renamed: 0, removed: [] };
  const cfg = await config();
  await guild.roles.fetch();
  await guild.channels.fetch();
  const me = guild.members.me;
  if (!me.permissions.has(P.Administrator) && !me.permissions.has([P.ManageRoles, P.ManageChannels])) throw new Error("The bot needs Manage Roles and Manage Channels (or Administrator).");

  /* ------------------------------------------------------------- roles */
  const ids = {};
  const created = [];
  const known = cfg.roles || {};
  for (const bp of ROLES) {
    let role = (known[bp.key] && guild.roles.cache.get(known[bp.key])) || guild.roles.cache.find((r) => !r.managed && r.id !== guild.id && r.name.toLowerCase() === bp.name.toLowerCase());
    if (role) {
      summary.rolesFound++;
    } else {
      role = await guild.roles.create({
        name: bp.name,
        color: bp.separator ? 0x2b2d31 : bp.color ?? 0,
        hoist: Boolean(bp.hoist),
        mentionable: Boolean(bp.mentionable),
        permissions: bp.permissions || [],
        reason: "FBRP DevOps server setup",
      });
      created.push(role);
      summary.rolesCreated++;
      log(`role ${bp.name}`);
      await sleep(PACE);
    }
    ids[bp.key] = role.id;
  }

  // New roles land at the bottom in creation order (first created ends up lowest). Put our roles in
  // blueprint order using only the slots they already occupy, so nothing climbs above the bot.
  const ours = ROLES.map((bp) => guild.roles.cache.get(ids[bp.key])).filter(Boolean);
  const slots = ours.map((r) => r.position).sort((a, b) => b - a);
  const botTop = me.roles.highest.position;
  const usable = slots.every((p) => p < botTop);
  if (usable && ours.some((r, n) => r.position !== slots[n])) {
    await guild.roles.setPositions(ours.map((role, n) => ({ role, position: slots[n] }))).catch((e) => log(`role order: ${e.message}`));
  }

  // Tighten @everyone: nobody outside leadership should be able to ping the whole server.
  const everyone = guild.roles.everyone;
  if (everyone.permissions.has(P.MentionEveryone)) await everyone.setPermissions(everyone.permissions.remove(P.MentionEveryone), "FBRP DevOps hardening").catch(() => null);

  const roles = {};
  for (const bp of ROLES) if (!bp.separator && !bp.rank) roles[bp.key] = ids[bp.key];
  roles.divisions = ROLES.filter((bp) => bp.division).map((bp) => ids[bp.key]);

  // Ranks table.
  const ranksRows = RANKS.map((r) => [ids[`rank:${r.level}`], r.name, r.level, r.tier]);
  await db.query("DELETE FROM devops_ranks WHERE role_id NOT IN (?)", [ranksRows.map((r) => r[0])]);
  for (const row of ranksRows)
    await db.query("INSERT INTO devops_ranks(role_id,name,level,tier) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE name=VALUES(name),level=VALUES(level),tier=VALUES(tier)", row);
  invalidateRanks();
  await setConfig("roles", roles, actorId);

  /* ------------------------------------------------------------- channels */
  const roleIds = { everyone: guild.id, bot: guild.members.me.id, ...ids, base: ids.base, leadership: ids.leadership, support: ids.support, purchase: ids.purchase };
  const channelIds = { ...(cfg.channels || {}) };
  const categoryIds = {};
  let order = 0;

  for (const cat of CATEGORIES) {
    const name = channelName(cat.emoji, cat.name);
    let parent =
      (cfg.channels?.[`cat:${cat.key}`] && guild.channels.cache.get(cfg.channels[`cat:${cat.key}`])) ||
      guild.channels.cache.find((c) => c.type === ChannelType.GuildCategory && norm(c.name) === norm(cat.name));
    const perms = overwritesFor(cat.access, roleIds, { category: true });
    if (!parent) {
      parent = await guild.channels.create({ name, type: ChannelType.GuildCategory, permissionOverwrites: perms, position: order, reason: "FBRP DevOps server setup" });
      summary.categoriesCreated++;
      log(`category ${name}`);
      await sleep(PACE);
    } else {
      await parent.permissionOverwrites.set(perms, "FBRP DevOps server setup").catch(() => null);
      if (parent.name !== name) {
        await parent.setName(name, "FBRP DevOps server setup").then(() => (summary.renamed++, log(`rename ${name}`)), () => null);
        await sleep(PACE);
      }
    }
    order++;
    channelIds[`cat:${cat.key}`] = parent.id;
    categoryIds[cat.key] = parent.id;

    for (const spec of cat.channels) {
      const voice = spec.type === "voice";
      const display = channelName(spec.emoji, spec.name);
      let channel =
        (cfg.channels?.[spec.key] && guild.channels.cache.get(cfg.channels[spec.key])) ||
        guild.channels.cache.find((c) => c.parentId === parent.id && norm(c.name) === norm(spec.name));
      const overwrites = overwritesFor(spec.access, roleIds);
      if (!channel) {
        channel = await guild.channels.create({
          name: display,
          type: voice ? ChannelType.GuildVoice : ChannelType.GuildText,
          parent: parent.id,
          topic: voice ? undefined : spec.topic,
          permissionOverwrites: overwrites,
          reason: "FBRP DevOps server setup",
        });
        summary.channelsCreated++;
        log(`channel ${display} -> "${channel.name}"`);
        await sleep(PACE);
      } else {
        summary.channelsFound++;
        await channel.permissionOverwrites.set(overwrites, "FBRP DevOps server setup").catch(() => null);
        // Discord stores text channel names lowercase with hyphens, so compare against that form.
        const want = voice ? display : display.toLowerCase().replace(/\s+/g, "-");
        if (channel.name !== want) {
          await channel.setName(display, "FBRP DevOps server setup").then(() => (summary.renamed++, log(`rename ${display}`)), () => null);
          await sleep(PACE);
        }
      }
      channelIds[spec.key] = channel.id;
    }
  }

  const categories = {};
  for (const [type, key] of Object.entries(TICKET_CATEGORY_KEYS)) categories[type] = categoryIds[key];
  categories.all = categories.general;
  await setConfig("categories", categories, actorId);
  await setConfig("channels", channelIds, actorId);

  // Ticket support roles. Existing configuration wins so manual /support role changes survive a repair.
  // Management is never ticket staff, so any leadership row is pruned here (and never seeded).
  const ticketRoles = (cfg.ticketRoles || []).length
    ? cfg.ticketRoles
    : [
        { type: "general", roleId: ids.support, level: "support" },
        { type: "purchase", roleId: ids.purchase, level: "support" },
      ];
  const staff = ticketRoles.filter((r) => String(r.roleId) !== String(ids.leadership));
  if (JSON.stringify(staff) !== JSON.stringify(cfg.ticketRoles || [])) await setConfig("ticketRoles", staff, actorId);

  /* ------------------------------------------------------------- server settings */
  await guild
    .edit({
      verificationLevel: GuildVerificationLevel.Low,
      defaultMessageNotifications: GuildDefaultMessageNotifications.OnlyMentions,
      explicitContentFilter: GuildExplicitContentFilter.AllMembers,
      systemChannel: null,
      reason: "FBRP DevOps server setup",
    })
    .catch((e) => log(`server settings: ${e.message}`));

  /* ------------------------------------------------------------- default scaffolding */
  // Discord's blank-server defaults. Only removed when untouched: no messages and no members inside.
  const defaults = guild.channels.cache.filter(
    (c) =>
      ((c.type === ChannelType.GuildText && c.name === "general") || (c.type === ChannelType.GuildVoice && c.name === "General")) &&
      !Object.values(channelIds).includes(c.id),
  );
  for (const channel of defaults.values()) {
    const untouched = channel.type === ChannelType.GuildVoice ? channel.members.size === 0 : !channel.lastMessageId;
    if (!untouched) continue;
    await channel.delete("FBRP DevOps setup: removing empty default channel").then(() => summary.removed.push(channel.name), () => null);
    await sleep(PACE);
  }
  for (const category of guild.channels.cache.filter((c) => c.type === ChannelType.GuildCategory && ["Text Channels", "Voice Channels"].includes(c.name)).values()) {
    if (guild.channels.cache.some((c) => c.parentId === category.id)) continue;
    await category.delete("FBRP DevOps setup: removing empty default category").then(() => summary.removed.push(category.name), () => null);
    await sleep(PACE);
  }

  await setConfig("ready", true, actorId);
  return summary;
}
