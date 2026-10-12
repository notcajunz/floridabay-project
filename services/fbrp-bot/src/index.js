import {
  AuditLogEvent,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Client,
  Colors,
  EmbedBuilder,
  GatewayIntentBits,
  Partials,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
} from "discord.js";
import { commands } from "./commands.js";
import { findLinkedAccounts } from "./alts.js";
import { publicBase, connectUrl, refreshSiteUrls } from "./site-url.js";
import { runGithubSync, githubStatus } from "./github-sync.js";
import {
  VERIFIED_ROLE_ID,
  verificationRequired,
  isVerified,
  recordVerification as storeVerification,
  grantVerifiedRole,
} from "./verification.js";
import { saveAll, listBackups, restoreAll, backupBusy } from "./backup.js";
import { OWNER_DISCORD_ID, requireOwnerId } from "./access-control.js";
import {
  pool,
  db,
  audit,
  hasPermission,
  safeName,
  hexColor,
  staffLevel,
  superuserIds,
} from "./database.js";
import {
  callGame,
  refreshGame,
  syncMember,
  syncGuild,
  syncAll,
  deleteGlobalSync,
  saveGlobalSync,
  setGlobalSyncServers,
  bindSyncRole,
  setGlobalSyncOrder,
  pushGlobalSyncs,
  applySync,
  networkRows,
  scopeText,
  serial,
  sweep,
  setGateReporter,
  resolveNetworkRoles,
  describeDiscordPermissions,
  enforceAllChannelAccess,
  syncUserAcrossNetwork,
  invalidateBlacklistCache,
  ROLE_AUTHORITATIVE_GROUPS,
} from "./sync.js";
import {
  EVENT_LABEL,
  SECURITY_SETTINGS,
  YOUNG_ACCOUNT_ALERT_DAYS,
  enforceProtectedRoles,
  expireLockdowns,
  getSecuritySettings,
  guardBot,
  guardGuildUpdate,
  guardJoin,
  guardMessage,
  handleAuditEntry,
  lockdown,
  lockdownStates,
  rememberChannel,
  rememberRole,
  securityEvents,
  setSecuritySetting,
  settingChoices,
  settingText,
  sweepBots,
  unlock,
} from "./security.js";
import {
  CATALOG_SOURCES,
  PERMISSION_BUNDLES,
  VMENU_BUNDLES,
  catalogEntries,
  catalogPages,
} from "./permission-catalog.js";
import { createTicketSystem } from "./ticket-system.js";
import {
  COLORS,
  card,
  chunkLines,
  clip,
  embed,
  humanize,
  logEmbed,
  onOff,
  roleRef,
  when,
  who,
  yesNo,
} from "./ui.js";
import { startWebPanel } from "./web-panel.js";
import { createStaffExams } from "./staff-exams.js";
import { createEconomy } from "./economy.js";

const token = String(process.env.DISCORD_BOT_TOKEN || "");
if (!token) throw new Error("DISCORD_BOT_TOKEN is required.");
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildWebhooks,
  ],
  partials: [Partials.GuildMember],
});

const clean = (value, max = 1000) =>
  String(value ?? "")
    .replace(/[\u0000-\u001f]/g, " ")
    .trim()
    .slice(0, max);
const mention = (id) => `<@${id}>`;
const group = (value) => safeName(value, "group name");

/**
 * Posts an audit entry as an embed. `entry` is a log spec (see ui.js logEmbed),
 * a ready-made EmbedBuilder, or a bare string that is wrapped for older callers.
 * `{ content }` posts plain text instead of an embed; `files` attaches files and
 * `components` adds buttons. Every embed is labelled with the server it came from.
 */
async function log(guild, entry, purpose = "staff_audit") {
  const binding = await db.one(
    "SELECT guild_id,channel_id FROM discord_channel_bindings WHERE purpose=?",
    [purpose],
  ).catch(() => null);
  let channel = binding
    ? await client.channels.fetch(String(binding.channel_id)).catch(() => null)
    : null;
  const id = String(process.env.FBRP_LOG_CHANNEL_ID || "");
  if (!channel && id) channel = await client.channels.fetch(id).catch(() => null);
  if (!channel && guild)
    channel = guild.channels.cache.find(
      (item) =>
        item.isTextBased() &&
        ["staff-audit", "mod-logs", "logs"].includes(item.name),
    );
  if (!channel?.isTextBased()) return;
  if (entry?.content)
    return channel.send({ content: entry.content, allowedMentions: { parse: [] } }).catch(() => {});
  const payload =
    entry instanceof EmbedBuilder
      ? entry
      : logEmbed(purpose, typeof entry === "string" ? { description: entry } : entry, guild);
  await channel
    .send({
      embeds: [payload],
      ...(entry?.files?.length ? { files: entry.files } : {}),
      ...(entry?.components?.length ? { components: entry.components } : {}),
      allowedMentions: { parse: [] },
    })
    .catch((error) => console.error(`[FBRP bot] ${purpose} log:`, error.message || error));
}

const staffExams = createStaffExams({ client, db, audit, log });
const economy = createEconomy({ client, db, audit, log, hasPermission });

/** /exam: Head of Management and above open an exam for one member for 60 minutes. */
async function examCommand(i, sub) {
  if (sub === "give") {
    const member = i.options.getUser("member", true);
    const result = await staffExams.give(i.user.id, member.id, i.options.getString("exam", true));
    return card(`${result.exam.title} given`, {
      color: COLORS.success,
      description: `${mention(member.id)} can sit the exam on the portal until <t:${Math.floor(result.expiresAt / 1000)}:t> (<t:${Math.floor(result.expiresAt / 1000)}:R>). It must be submitted before then.`,
      rows: [["Portal", result.link, false], ["DM", result.dmSent ? "Sent with the link" : "Could not DM them - share the link yourself"]],
    });
  }
  if (sub === "revoke") {
    const member = i.options.getUser("member", true);
    const result = await staffExams.revoke(i.user.id, member.id, i.options.getString("exam", true));
    return card(`${result.exam.title} access revoked`, { color: COLORS.warning, rows: [["Member", who(member.id)]] });
  }
  const rows = await staffExams.activeGrants(i.user.id);
  return card("Open exam access", {
    color: COLORS.primary,
    description: rows.length
      ? rows.map((row) => `${mention(row.discord_id)} · **${clean(row.title, 60)}** · given by ${mention(row.granted_by)} · expires <t:${Math.floor(Number(row.expires_at) / 1000)}:R>`).join("\n")
      : "Nobody has open exam access right now.",
  });
}

/** /orgbank: organization wallets on Discord. Balances and ledgers for members, adjustments for managers. */
async function orgbankCommand(i, sub) {
  if (sub === "adjust") {
    const result = await economy.adjust(i.user.id, {
      orgId: i.options.getString("organization", true),
      amount: i.options.getInteger("amount", true),
      reason: i.options.getString("reason", true),
    });
    return card(`Wallet adjusted · ${result.org.name}`, {
      color: result.amount > 0 ? COLORS.success : COLORS.warning,
      rows: [["Change", `${result.amount > 0 ? "+" : "-"}${economy.money(Math.abs(result.amount))}`], ["New balance", economy.money(result.balance)]],
    });
  }
  if (sub === "leader") {
    const member = i.options.getUser("member", true);
    const result = await economy.setLeader(i.user.id, { orgId: i.options.getString("organization", true), discordId: member.id, leader: i.options.getBoolean("leader", true) });
    return card(`${result.leader ? "Leader added" : "Leader removed"} · ${result.org.name}`, {
      color: COLORS.primary,
      rows: [["Member", who(member.id)], ["Spending access", result.leader ? "Yes - can buy from the portal" : "No"]],
    });
  }
  const detail = await economy.summary(i.user.id, i.options.getString("organization") || "");
  const site = publicBase();
  if (sub === "ledger") {
    const lines = detail.transactions.slice(0, 15).map((row) =>
      `\`${Number(row.amount) >= 0 ? "+" : "-"}${economy.money(Math.abs(Number(row.amount)))}\` ${clean(row.description, 70)} · <t:${Math.floor(Number(row.created_at) / 1000)}:R>`);
    return card(`${detail.name} · ledger`, {
      description: lines.length ? lines.join("\n") : "No transactions yet.",
      color: COLORS.primary,
      rows: [["Balance", economy.money(detail.wallet.balance)]],
      footer: site ? `Full history: ${site}/portal#organizations` : undefined,
    });
  }
  const earned = detail.earningsWeek.reduce((sum, row) => sum + Number(row.total || 0), 0);
  const delivered = detail.drugWeek.filter((row) => row.status === "delivered").reduce((sum, row) => sum + Number(row.units || 0), 0);
  return card(`${detail.name} · wallet`, {
    color: COLORS.success,
    rows: [
      ["Balance", `**${economy.money(detail.wallet.balance)}**`],
      ["Earned (7 days)", economy.money(earned)],
      ["Lifetime earned", economy.money(detail.wallet.lifetime_earned)],
      ["Lifetime spent", economy.money(detail.wallet.lifetime_spent)],
      ["Product delivered (7 days)", `${delivered} units`],
      ["Owned", detail.purchases.length ? clip(detail.purchases.map((row) => row.label).join(", "), 900) : "Nothing yet", false],
    ],
    footer: site ? `Spend it at ${site}/portal#organizations` : undefined,
  });
}

/** DMs a member a styled embed; failures (closed DMs) are expected and ignored. */
const dm = (user, title, rows, color = COLORS.warning, description) =>
  user.send({ embeds: [card(title, { description, color, rows })] }).catch(() => {});

async function requirePermission(interaction, object) {
  if (await hasPermission(interaction.user.id, object)) return;
  throw new Error(`You need the \`${object}\` ACE permission.`);
}

/** High-risk control-plane changes are reserved for the one configured community owner. */
function requireOwner(interaction, action = "make this change") {
  requireOwnerId(interaction.user.id, action);
}

const COMMAND_COOLDOWN_SECONDS = 15;

/** Persistent per-user/action cooldown, shared across every Discord in the network. */
async function enforceCommandCooldown(interaction, commandKey, seconds = COMMAND_COOLDOWN_SECONDS) {
  const stamp = Date.now();
  let remaining = 0;
  await db.transaction(async (query) => {
    await query(
      "INSERT IGNORE INTO command_cooldowns(actor_id,command_key,expires_at) VALUES(?,?,0)",
      [interaction.user.id, commandKey],
    );
    const rows = await query(
      "SELECT expires_at FROM command_cooldowns WHERE actor_id=? AND command_key=? FOR UPDATE",
      [interaction.user.id, commandKey],
    );
    const expiresAt = Number(rows[0]?.expires_at || 0);
    if (expiresAt > stamp) {
      remaining = Math.max(1, Math.ceil((expiresAt - stamp) / 1000));
      return;
    }
    await query(
      "UPDATE command_cooldowns SET expires_at=? WHERE actor_id=? AND command_key=?",
      [stamp + seconds * 1000, interaction.user.id, commandKey],
    );
  });
  if (remaining)
    throw new Error(`That command is on cooldown. Try again in ${remaining} second${remaining === 1 ? "" : "s"}.`);
}

/** Staff movement line: `@member --> Rank | @actor | date`. */
const movementLine = (targetId, rankName, actorId) =>
  `${mention(targetId)} --> ${rankName} | ${mention(actorId)} | <t:${Math.floor(Date.now() / 1000)}:D>`;

/** Staff callsign feed: every new or changed callsign is posted here as `@member --> 123`. */
const CALLSIGN_CHANNEL_ID = "1558275244567961690";
async function announceCallsign(discordId, callsign) {
  if (callsign === null || callsign === undefined || callsign === "") return;
  const channel = await client.channels.fetch(CALLSIGN_CHANNEL_ID).catch(() => null);
  if (!channel?.isTextBased()) return console.warn("[FBRP bot] callsign channel is unavailable.");
  await channel
    .send({ content: `${mention(discordId)} --> ${callsign}`, allowedMentions: { parse: [] } })
    .catch((error) => console.error("[FBRP bot] callsign announcement:", error));
}

const levelText = (level) =>
  level === Number.POSITIVE_INFINITY ? "bot owner" : level < 0 ? "no staff rank" : `rank ${level}`;
const publicCaseId = (id) => `FB-${String(id).padStart(8, "0")}`;

/** /staff and /global may only act on members strictly below the actor's highest ACE group rank. */
async function requireOutranks(i, targetId, verb = "manage") {
  if (String(targetId) === i.user.id) throw new Error(`You cannot ${verb} yourself.`);
  if (superuserIds().has(String(targetId))) throw new Error(`You cannot ${verb} a bot owner.`);
  const [actor, target] = await Promise.all([staffLevel(i.user.id), staffLevel(targetId)]);
  if (actor !== Number.POSITIVE_INFINITY && target >= actor)
    throw new Error(`That member (${levelText(target)}) is equal to or above you (${levelText(actor)}).`);
  return { actor, target };
}

async function caseRow(interaction, target, action, reason, expires = null) {
  const result = await db.query(
    "INSERT INTO moderation_cases(guild_id,target_id,actor_id,action,reason,expires_at,created_at) VALUES(?,?,?,?,?,?,?)",
    [
      interaction.guildId,
      target,
      interaction.user.id,
      action,
      clean(reason, 300),
      expires,
      Date.now(),
    ],
  );
  const banId = publicCaseId(result.insertId);
  await db.query("UPDATE moderation_cases SET ban_id=? WHERE id=?", [banId, result.insertId]);
  await audit(interaction.user.id, `moderation.${action}`, target, {
    guild: interaction.guildId,
    reason,
    caseId: result.insertId,
    banId,
    expires,
  });
  return result.insertId;
}

async function aceCommand(i, sub) {
  await requirePermission(i, "fbrp.perms.manage");
  if (sub === "catalog") {
    const bundles = Object.entries(PERMISSION_BUNDLES)
      .map(([name, objects]) => `\`${name}\` - ${objects.length} permissions`)
      .join("\n");
    return embed(
      "Permission bundles",
      clip(`**Curated bundles** · grant with \`/ace bundle\`\n${bundles}\n\nUse **/acelist** to page through every vMenu, EasyAdmin and Florida Bay permission with descriptions.`, 4000),
    );
  }
  if (sub !== "list") requireOwner(i, "edit ACE permissions, groups, memberships, or role bindings");
  if (sub === "group-create") {
    const name = group(i.options.getString("name", true));
    await db.query(
      "INSERT INTO ace_groups(name,label,rank_order,staff_only,created_by) VALUES(?,?,?,?,?)",
      [
        name,
        clean(i.options.getString("label", true), 80),
        i.options.getInteger("rank") || 0,
        i.options.getBoolean("staff_only") || false,
        i.user.id,
      ],
    );
    await audit(i.user.id, "ace.group.create", name, {});
    await refreshGame();
    await log(i.guild, {
      title: "ACE group created",
      color: COLORS.success,
      actor: i.user.id,
      fields: [["Group", `\`${name}\``], ["Label", clean(i.options.getString("label", true), 80)], ["Rank", String(i.options.getInteger("rank") || 0)], ["Staff only", yesNo(i.options.getBoolean("staff_only"))]],
    }, "role_sync");
    return card("ACE group created", {
      color: COLORS.success,
      description: "Staff-only groups apply to FiveM players only while they are clocked in.",
      rows: [["Group", `\`${name}\``], ["Staff only", yesNo(i.options.getBoolean("staff_only"))], ["Rank", String(i.options.getInteger("rank") || 0)]],
    });
  }
  if (sub === "group-delete") {
    const name = group(i.options.getString("name", true));
    if (name === "owner")
      throw new Error("The owner bootstrap group cannot be deleted.");
    await db.query("DELETE FROM ace_groups WHERE name=?", [name]);
    await audit(i.user.id, "ace.group.delete", name, {});
    await refreshGame();
    await log(i.guild, {
      title: "ACE group deleted",
      color: COLORS.danger,
      actor: i.user.id,
      fields: [["Group", `\`${name}\``]],
    }, "role_sync");
    return embed(
      "ACE group deleted",
      `Deleted \`${name}\` and its dependent bindings.`,
      COLORS.warning,
    );
  }
  if (sub === "permission") {
    const name = group(i.options.getString("group", true)),
      object = clean(i.options.getString("object", true), 120),
      mode = i.options.getString("mode", true);
    if (!/^[A-Za-z0-9_.*:-]{1,120}$/.test(object))
      throw new Error("That ACE object contains unsupported characters.");
    if (mode === "remove")
      await db.query(
        "DELETE FROM ace_entries WHERE group_name=? AND object=?",
        [name, object],
      );
    else
      await db.query(
        "INSERT INTO ace_entries(group_name,object,mode) VALUES(?,?,?) ON DUPLICATE KEY UPDATE mode=VALUES(mode)",
        [name, object, mode],
      );
    await audit(i.user.id, "ace.permission", name, { object, mode });
    await refreshGame();
    await log(i.guild, {
      title: mode === "remove" ? "ACE permission removed" : `ACE permission set to ${mode}`,
      color: mode === "allow" ? COLORS.success : COLORS.warning,
      actor: i.user.id,
      fields: [["Group", `\`${name}\``], ["Object", `\`${object}\``], ["Mode", mode]],
    }, "role_sync");
    return card("ACE permission updated", {
      color: COLORS.success,
      rows: [["Group", `\`${name}\``], ["Object", `\`${object}\``], ["Mode", mode]],
    });
  }
  if (sub === "bundle") {
    const name = group(i.options.getString("group", true));
    const bundleName = clean(i.options.getString("bundle", true), 80);
    const mode = i.options.getString("mode", true);
    const objects = PERMISSION_BUNDLES[bundleName];
    if (!objects) throw new Error("Unknown bundle. Use `/ace catalog`.");
    await db.transaction(async (query) => {
      for (const object of objects) {
        if (mode === "grant")
          await query(
            "INSERT INTO ace_entries(group_name,object,mode) VALUES(?,?,'allow') ON DUPLICATE KEY UPDATE mode='allow'",
            [name, object],
          );
        else
          await query(
            "DELETE FROM ace_entries WHERE group_name=? AND object=?",
            [name, object],
          );
      }
    });
    await audit(i.user.id, "ace.bundle", name, { bundle: bundleName, mode });
    await refreshGame();
    await log(i.guild, {
      title: mode === "grant" ? "ACE bundle granted" : "ACE bundle revoked",
      color: mode === "grant" ? COLORS.success : COLORS.warning,
      actor: i.user.id,
      fields: [["Group", `\`${name}\``], ["Bundle", `\`${bundleName}\``], ["Permissions", String(objects.length)]],
    }, "role_sync");
    return card("ACE bundle updated", {
      color: COLORS.success,
      rows: [["Group", `\`${name}\``], ["Bundle", `\`${bundleName}\``], ["Action", mode === "grant" ? "Granted" : "Revoked"], ["Permissions", String(objects.length)]],
    });
  }
  if (sub === "member-add" || sub === "member-remove") {
    const name = group(i.options.getString("group", true)),
      member = i.options.getUser("member", true),
      add = sub === "member-add";
    const staffRow = add
      ? await db.one(
          "SELECT r.id,g.rank_order group_rank FROM staff_roster_ranks r JOIN ace_groups g ON g.name=r.ace_group WHERE r.ace_group=? ORDER BY r.id LIMIT 1",
          [name],
        )
      : null;
    // A staff rank group brings every lower staff rank group with it; other groups (LEO, civ, …) stand alone.
    const groups = staffRow ? [...new Set([name, ...(await staffLadder(staffRow)).map((row) => String(row.ace_group))])] : [name];
    if (add)
      for (const g of groups)
        await db.query(
          "INSERT IGNORE INTO ace_memberships(discord_id,group_name,origin,added_by,added_at) VALUES(?,?,'manual',?,?)",
          [member.id, g, i.user.id, Date.now()],
        );
    else
      await db.query(
        "DELETE FROM ace_memberships WHERE discord_id=? AND group_name=? AND origin='manual'",
        [member.id, name],
      );
    await audit(i.user.id, `ace.member.${add ? "add" : "remove"}`, member.id, {
      group: name,
      ...(groups.length > 1 ? { groups } : {}),
    });
    await refreshGame();
    await syncUserAcrossNetwork(client, member.id);
    await log(i.guild, {
      title: add ? "ACE member added" : "ACE member removed",
      color: add ? COLORS.success : COLORS.warning,
      actor: i.user.id,
      target: member.id,
      fields: [["Group", `\`${name}\``], ...(groups.length > 1 ? [["Lower staff ranks", groups.filter((g) => g !== name).map((g) => `\`${g}\``).join(" ")]] : [])],
    }, "role_sync");
    return card("ACE membership updated", {
      color: COLORS.success,
      rows: [["Member", who(member.id)], ["Group", `\`${name}\``], ...(groups.length > 1 ? [["Lower staff ranks", groups.filter((g) => g !== name).map((g) => `\`${g}\``).join(" ")]] : []), ["Action", add ? "Added" : "Removed"]],
    });
  }
  if (sub === "bind-role") {
    const name = group(i.options.getString("group", true)),
      role = i.options.getRole("role", true);
    await db.query(
      "INSERT IGNORE INTO discord_role_bindings(guild_id,role_id,group_name) VALUES(?,?,?)",
      [i.guildId, role.id, name],
    );
    await syncGuild(client, i.guild);
    await audit(i.user.id, "ace.role.bind", role.id, {
      group: name,
      guild: i.guildId,
    });
    await log(i.guild, {
      title: "Role bound to ACE group",
      color: COLORS.success,
      actor: i.user.id,
      fields: [["Role", `${roleRef(role.id)}\n${clean(role.name, 100)}`], ["Group", `\`${name}\``], ["Server", clean(i.guild.name, 100)]],
    }, "role_sync");
    return card("ACE role bound", {
      color: COLORS.success,
      description: ROLE_AUTHORITATIVE_GROUPS.has(name)
        ? "This role now grants the ACE group automatically. Manual ACE members can still receive the role too."
        : "The bot grants this role to ACE members and removes unauthorized grants.",
      rows: [["Role", roleRef(role.id)], ["Group", `\`${name}\``]],
    });
  }
  if (sub === "unbind-role") {
    const role = i.options.getRole("role", true);
    const only = i.options.getString("group");
    const name = only ? group(only) : null;
    const bound = await db.query(
      `SELECT group_name FROM discord_role_bindings WHERE guild_id=? AND role_id=?${name ? " AND group_name=?" : ""}`,
      name ? [i.guildId, role.id, name] : [i.guildId, role.id],
    );
    if (!bound.length)
      throw new Error(name ? `${role} is not bound to \`${name}\` in this server.` : `${role} is not bound to any ACE group in this server.`);
    await db.query(
      `DELETE FROM discord_role_bindings WHERE guild_id=? AND role_id=?${name ? " AND group_name=?" : ""}`,
      name ? [i.guildId, role.id, name] : [i.guildId, role.id],
    );
    const groups = bound.map((row) => String(row.group_name));
    await audit(i.user.id, "ace.role.unbind", role.id, { groups, guild: i.guildId });
    await syncGuild(client, i.guild);
    await refreshGame();
    await log(i.guild, {
      title: "Role unbound from ACE group",
      color: COLORS.warning,
      actor: i.user.id,
      fields: [["Role", `${roleRef(role.id)}\n${clean(role.name, 100)}`], ["Groups", groups.map((g) => `\`${g}\``).join(" ")], ["Server", clean(i.guild.name, 100)]],
    }, "role_sync");
    return card("Role unbound", {
      color: COLORS.warning,
      description: "The bot no longer grants or strips this role based on ACE membership. Members keep whatever they currently hold. Global-sync roles are managed with /globalsync.",
      rows: [["Role", roleRef(role.id)], ["Unbound from", groups.map((g) => `\`${g}\``).join(" ")]],
    });
  }
  const [groups, entries, bindings] = await Promise.all([
    db.query("SELECT * FROM ace_groups ORDER BY rank_order DESC,name"),
    db.query("SELECT * FROM ace_entries ORDER BY group_name,object"),
    db.query("SELECT * FROM discord_role_bindings WHERE guild_id=?", [
      i.guildId,
    ]),
  ]);
  const blocks = groups.map((row) => {
    const perms =
      entries
        .filter((e) => e.group_name === row.name)
        .map((e) => `${e.mode === "deny" ? "-" : "+"}${e.object}`)
        .join(", ") || "No entries";
    const roles =
      bindings
        .filter((b) => b.group_name === row.name)
        .map((b) => roleRef(b.role_id))
        .join(" ") || "No bound role";
    return [
      `${clean(row.label, 60)} (${row.name})${row.staff_only ? " - duty gated" : ""}`,
      `${roles}\n${clip(perms, 300)}`,
      false,
    ];
  });
  // Discord caps an embed at 6000 characters, so show what fits and say how many were left out.
  const shown = [];
  let used = 0;
  for (const block of blocks) {
    const size = block[0].length + block[1].length;
    if (shown.length >= 20 || used + size > 4800) break;
    shown.push(block);
    used += size;
  }
  const hidden = blocks.length - shown.length;
  return card("ACE groups", {
    description: blocks.length
      ? `${blocks.length} group${blocks.length === 1 ? "" : "s"} configured${hidden ? `, ${hidden} not shown. Use the web panel for the full list.` : "."}`
      : "No ACE groups.",
    rows: shown,
  });
}

async function headtagCommand(i, sub) {
  await requirePermission(i, "fbrp.headtags.manage");
  if (sub === "create") {
    const kind = i.options.getString("kind", true),
      label = clean(i.options.getString("label", true), 40),
      color = hexColor(i.options.getString("color", true));
    let role = i.options.getRole("role");
    let created = false;
    if (!role) {
      role = await i.guild.roles.create({
        name: `${kind === "head" ? "Tag" : "Gang"} · ${label}`,
        color: Number.parseInt(color.slice(1), 16),
        reason: `Headtag created by ${i.user.tag}`,
      });
      created = true;
    }
    const result = await db.query(
      "INSERT INTO headtags(kind,label,color,role_id,guild_id,priority,created_by) VALUES(?,?,?,?,?,?,?)",
      [
        kind,
        label,
        color,
        role.id,
        i.guildId,
        i.options.getInteger("priority") || 0,
        i.user.id,
      ],
    );
    await audit(i.user.id, "headtag.create", result.insertId, {
      kind,
      label,
      color,
      roleId: role.id,
      created,
    });
    await syncGuild(client, i.guild);
    await refreshGame();
    return card("Tag created", {
      color: COLORS.success,
      description: `Players with the role can select it in F6, in the ${kind === "head" ? "top headtag" : "bottom gang-tag"} slot.`,
      rows: [["Label", clean(label)], ["ID", `\`${result.insertId}\``], ["Type", kind === "head" ? "Headtag" : "Gang tag"], ["Role", roleRef(role.id)], ["Color", `\`${color}\``]],
    });
  }
  if (sub === "delete") {
    const id = i.options.getInteger("id", true),
      tag = await db.one("SELECT * FROM headtags WHERE id=?", [id]);
    if (!tag) throw new Error("Tag not found.");
    await db.query("DELETE FROM headtags WHERE id=?", [id]);
    if (i.options.getBoolean("delete_role") && tag.guild_id === i.guildId)
      await i.guild.roles.cache
        .get(String(tag.role_id))
        ?.delete(`Tag deleted by ${i.user.tag}`)
        .catch(() => {});
    await audit(i.user.id, "headtag.delete", id, { label: tag.label });
    await refreshGame();
    return card("Tag deleted", { color: COLORS.warning, rows: [["Label", clean(tag.label)], ["ID", `\`${id}\``]] });
  }
  if (sub === "grant" || sub === "revoke") {
    const id = i.options.getInteger("id", true),
      user = i.options.getUser("member", true),
      tag = await db.one("SELECT * FROM headtags WHERE id=?", [id]);
    if (!tag) throw new Error("Tag not found.");
    const add = sub === "grant";
    if (add)
      await db.query(
        "INSERT IGNORE INTO headtag_grants(discord_id,tag_id,origin,added_by,added_at) VALUES(?,?,'manual',?,?)",
        [user.id, id, i.user.id, Date.now()],
      );
    else
      await db.query(
        "DELETE FROM headtag_grants WHERE discord_id=? AND tag_id=? AND origin='manual'",
        [user.id, id],
      );
    const guild = client.guilds.cache.get(String(tag.guild_id)),
      member = await guild?.members.fetch(user.id).catch(() => null),
      role = guild?.roles.cache.get(String(tag.role_id));
    if (member && role)
      await (
        add
          ? member.roles.add(role, "Headtag grant")
          : member.roles.remove(role, "Headtag revoke")
      ).catch(() => {});
    await audit(i.user.id, `headtag.${sub}`, user.id, { tagId: id });
    await refreshGame();
    return card("Tag access updated", {
      color: COLORS.success,
      rows: [["Member", who(user.id)], ["Tag", clean(tag.label)], ["Access", add ? "Granted" : "Revoked"]],
    });
  }
  const rows = await db.query(
    "SELECT * FROM headtags ORDER BY kind,priority DESC,label",
  );
  return card("Headtags and gang tags", {
    description:
      chunkLines(
        rows.map(
          (row) =>
            `\`${row.id}\` · **${clean(row.label)}** · ${row.kind === "head" ? "Head" : "Gang"} · \`${row.color}\` · ${row.role_id ? roleRef(row.role_id) : "no role"}`,
        ),
        3900,
      )[0] || "No tags.",
  });
}

async function organizationCommand(i, sub) {
  await requirePermission(i, "fbrp.organizations.manage");
  if (sub === "create") {
    const slug = safeName(
        i.options.getString("slug", true),
        "organization slug",
      ),
      name = clean(i.options.getString("name", true), 80),
      type = i.options.getString("type", true),
      color = hexColor(i.options.getString("color", true)),
      groupName = `org_${slug}`,
      tagLabel = clean(i.options.getString("tag") || name, 40);
    const localAccessRole = i.options.getRole("access_role");
    const networkRoleId = clean(i.options.getString("network_role_id") || "", 24);
    const networkGuildId = clean(i.options.getString("network_guild_id") || "", 24);
    if (!localAccessRole && (!/^\d{15,24}$/.test(networkRoleId) || !/^\d{15,24}$/.test(networkGuildId)))
      throw new Error("Choose access_role, or provide both network_role_id and network_guild_id.");
    const accessGuildId = localAccessRole ? i.guildId : networkGuildId;
    const accessRoleId = localAccessRole ? localAccessRole.id : networkRoleId;
    const accessGuild = client.guilds.cache.get(accessGuildId);
    if (!accessGuild || !(await db.one("SELECT guild_id FROM network_guilds WHERE guild_id=?", [accessGuildId])))
      throw new Error("The access role must belong to a registered network server.");
    const accessRole = await accessGuild.roles.fetch(accessRoleId).catch(() => null);
    if (!accessRole) throw new Error("The required access role was not found in that network server.");
    // No Discord role is created: the access role alone decides who can clock in.
    const ids = await db.transaction(async (q) => {
      await q(
        "INSERT INTO ace_groups(name,label,rank_order,staff_only,created_by) VALUES(?,?,300,FALSE,?)",
        [groupName, `${name} Duty`, i.user.id],
      );
      const defaults =
        type === "leo"
          ? [
              "fbrp.police",
              "fbrp.police.cuff",
              "fbrp.police.arrest",
              "fbrp.police.search",
              "fbrp.police.escort",
              "fbrp.vehicles.leo",
            ]
          : type === "fire"
            ? ["fbrp.vehicles.fire"]
            : ["fbrp.civ.restrain", "fbrp.vehicles"];
      for (const object of defaults)
        await q(
          "INSERT INTO ace_entries(group_name,object,mode) VALUES(?,?,'allow')",
          [groupName, object],
        );
      const tag = await q(
        "INSERT INTO headtags(kind,label,color,role_id,guild_id,priority,created_by) VALUES('gang',?,?,NULL,?,0,?)",
        [tagLabel, color, i.guildId, i.user.id],
      );
      const org = await q(
        "INSERT INTO organizations(slug,name,type,color,tag_id,ace_group,guild_id,role_id,created_by) VALUES(?,?,?,?,?,?,?,?,?)",
        [
          slug,
          name,
          type,
          color,
          tag.insertId,
          groupName,
          i.guildId,
          null,
          i.user.id,
        ],
      );
      await q(
        "INSERT INTO organization_role_requirements(org_id,guild_id,role_id,added_by,added_at) VALUES(?,?,?,?,?)",
        [org.insertId, accessGuildId, accessRoleId, i.user.id, Date.now()],
      );
      return { tag: tag.insertId, org: org.insertId };
    });
    await audit(i.user.id, "organization.create", ids.org, {
      slug,
      type,
      tag: ids.tag,
      tagLabel,
      accessGuild: accessGuildId,
      accessRole: accessRoleId,
    });
    await syncGuild(client, accessGuild);
    await refreshGame();
    await log(i.guild, {
      title: "Organization created",
      color: COLORS.success,
      actor: i.user.id,
      fields: [["Name", name], ["Slug", `\`${slug}\``], ["Type", type], ["Tag", tagLabel], ["Required role", `${roleRef(accessRoleId)}\n${clean(accessGuild.name)}`]],
    }, "organizations");
    return card("Organization created", {
      color: COLORS.success,
      description: `Eligible members clock in with \`/duty ${slug}\`. Job, gang tag, permissions and hours update automatically.`,
      rows: [["Name", name], ["Slug", `\`${slug}\``], ["Type", type], ["Tag", tagLabel], ["Required role", `${roleRef(accessRoleId)}\n${clean(accessGuild.name)}`]],
    });
  }
  if (sub === "delete") {
    const slug = safeName(
        i.options.getString("slug", true),
        "organization slug",
      ),
      org = await db.one("SELECT * FROM organizations WHERE slug=?", [slug]);
    if (!org) throw new Error("Organization not found.");
    await db.query("UPDATE organizations SET active=FALSE WHERE id=?", [
      org.id,
    ]);
    await audit(i.user.id, "organization.deactivate", org.id, { slug });
    await refreshGame();
    return card("Organization deactivated", {
      color: COLORS.warning,
      description: "Members can no longer clock into this organization.",
      rows: [["Name", clean(org.name)], ["Slug", `\`${slug}\``]],
    });
  }
  if (sub === "hours") {
    const slug = safeName(
        i.options.getString("slug", true),
        "organization slug",
      ),
      user = i.options.getUser("member"),
      cutoff = Date.now() - 30 * 86400000;
    const rows = await db.query(
      `SELECT s.discord_id,MAX(s.name) name,COUNT(*) shifts,SUM(CASE WHEN s.ended_at IS NULL THEN FLOOR((?-s.started_at)/1000) ELSE s.seconds END) seconds
      FROM organization_shifts s JOIN organizations o ON o.id=s.org_id WHERE o.slug=? AND s.started_at>=? ${user ? "AND s.discord_id=?" : ""} GROUP BY s.discord_id ORDER BY seconds DESC LIMIT 20`,
      user ? [Date.now(), slug, cutoff, user.id] : [Date.now(), slug, cutoff],
    );
    return card(`Organization hours: ${slug}`, {
      description:
        rows
          .map(
            (row, index) =>
              `\`${String(index + 1).padStart(2, "0")}\` · **${clean(row.name)}** · ${(Number(row.seconds || 0) / 3600).toFixed(1)}h across ${row.shifts} shift${Number(row.shifts) === 1 ? "" : "s"}`,
          )
          .join("\n") || "No shifts in the last 30 days.",
      footer: "Florida Bay Roleplay \u00b7 Last 30 days",
    });
  }
  const rows = await db.query(
    "SELECT o.*,COUNT(m.discord_id) members FROM organizations o LEFT JOIN organization_members m ON m.org_id=o.id GROUP BY o.id ORDER BY o.active DESC,o.name",
  );
  return card("Organizations", {
    description:
      rows
        .map(
          (row) =>
            `**${clean(row.name)}** · \`${row.slug}\`\n${row.type} · ${row.members} member${Number(row.members) === 1 ? "" : "s"} · ${row.active ? "Active" : "Inactive"}`,
        )
        .join("\n\n") || "No organizations.",
  });
}

async function radioCommand(i, sub) {
  await requirePermission(i, "fbrp.radio.manage");
  if (sub === "create") {
    const channel = i.options.getInteger("channel", true);
    const name = clean(i.options.getString("name", true), 80);
    const description = clean(i.options.getString("description") || "", 180) || null;
    const color = hexColor(i.options.getString("color") || "#43E8D8");
    const slug = clean(i.options.getString("organization") || "", 40).toLowerCase();
    const org = slug ? await db.one("SELECT id,name,slug FROM organizations WHERE slug=? AND active=TRUE", [slug]) : null;
    if (slug && !org) throw new Error("That active organization was not found.");
    await db.query(
      `INSERT INTO radio_channels(channel,name,description,color,org_id,sort_order,enabled,created_by,created_at)
       VALUES(?,?,?,?,?,?,TRUE,?,?) ON DUPLICATE KEY UPDATE name=VALUES(name),description=VALUES(description),color=VALUES(color),org_id=VALUES(org_id),enabled=TRUE`,
      [channel, name, description, color, org?.id || null, channel, i.user.id, Date.now()],
    );
    await audit(i.user.id, "radio.save", String(channel), { name, description, color, organization: org?.slug || null });
    await refreshGame();
    return card("Radio frequency saved", {
      color: COLORS.success,
      rows: [["Frequency", `\`${channel}\``], ["Name", name], ["Access", org ? `${org.name} · on duty only` : "Public"]],
    });
  }
  if (sub === "delete") {
    const channel = i.options.getInteger("channel", true);
    const row = await db.one("SELECT * FROM radio_channels WHERE channel=?", [channel]);
    if (!row) throw new Error("That managed frequency does not exist.");
    await db.query("DELETE FROM radio_channels WHERE channel=?", [channel]);
    await audit(i.user.id, "radio.delete", String(channel), { name: row.name });
    await refreshGame();
    return card("Radio frequency deleted", { color: COLORS.warning, rows: [["Frequency", `\`${channel}\``], ["Name", clean(row.name)]] });
  }
  const rows = await db.query(`SELECT r.*,o.name org_name,o.slug org_slug FROM radio_channels r LEFT JOIN organizations o ON o.id=r.org_id ORDER BY r.sort_order,r.channel`);
  return card("Managed radio frequencies", {
    description: rows.map((row) => `\`${String(row.channel).padStart(3, "0")}\` · **${clean(row.name)}**\n${row.org_id ? `${clean(row.org_name)} duty only` : "Public"}${row.enabled ? "" : " · disabled"}`).join("\n\n") || "No managed frequencies.",
  });
}

async function networkCommand(i, sub) {
  await requirePermission(i, "fbrp.network.manage");
  if (sub === "add") {
    await db.query(
      "INSERT INTO network_guilds(guild_id,name,kind,added_by,added_at) VALUES(?,?,?,?,?) ON DUPLICATE KEY UPDATE name=VALUES(name),kind=VALUES(kind)",
      [
        i.guildId,
        clean(i.guild.name, 100),
        i.options.getString("kind", true),
        i.user.id,
        Date.now(),
      ],
    );
    const count = await syncGuild(client, i.guild);
    await audit(i.user.id, "network.add", i.guildId, { members: count });
    return card("Network server added", {
      color: COLORS.success,
      rows: [["Server", clean(i.guild.name)], ["Type", i.options.getString("kind", true)], ["Members reconciled", String(count)]],
    });
  }
  if (sub === "remove") {
    await db.query("DELETE FROM network_sync_roles WHERE guild_id=?", [
      i.guildId,
    ]);
    await db.query("DELETE FROM network_guilds WHERE guild_id=?", [i.guildId]);
    await audit(i.user.id, "network.remove", i.guildId, {});
    return card("Network server removed", {
      color: COLORS.warning,
      description: "Global roles remain in place but are no longer managed in this server.",
      rows: [["Server", clean(i.guild.name)]],
    });
  }
  const [guilds, syncs] = await Promise.all([
    db.query("SELECT * FROM network_guilds ORDER BY kind,name"),
    db.query("SELECT * FROM network_syncs ORDER BY sort_order,id"),
  ]);
  return card("Florida Bay network", {
    rows: [
      ["Servers", chunkLines(guilds.map((row) => `**${clean(row.name)}** · ${row.kind} · \`${row.guild_id}\``), 1000)[0] || "None", false],
      ["Global roles", chunkLines(syncs.map((row) => `**${clean(row.role_name)}** · \`${row.group_name}\``), 1000)[0] || "None", false],
    ],
  });
}

function syncInputFromInteraction(i) {
  const value = {};
  const stringOptions = ["name", "scope", "permissions", "color"];
  for (const key of stringOptions) {
    const found = i.options.getString(key);
    if (found !== null) value[key === "name" ? "role_name" : key] = found;
  }
  for (const key of ["all_channels", "hoist", "mentionable"]) {
    const found = i.options.getBoolean(key);
    if (found !== null) value[key] = found;
  }
  // Optional existing roles: one picked in this server, plus role IDs from any other network server.
  const existingRoles = [];
  const here = i.options.getRole("existing_role");
  if (here) existingRoles.push({ guild_id: i.guildId, role_id: here.id });
  const ids = (i.options.getString("existing_roles") || "").split(/[\s,]+/).filter(Boolean);
  if (ids.length) existingRoles.push(...resolveNetworkRoles(client, ids));
  if (existingRoles.length) value.existing_roles = existingRoles;
  return value;
}

const membersField = (swept) => ({
  name: "Members",
  value: `+${swept.added} granted · −${swept.removed} removed`,
  inline: true,
});
const serversField = (lines, empty = "No network servers in scope yet.") => ({
  name: "Servers",
  value: lines.join("\n").slice(0, 1024) || empty,
});

/** A multi-select of every network server; the current picks start ticked. Only the person who opened it can use it. */
async function serverPicker(sync, actor) {
  const picked =
    sync.scope === "custom"
      ? new Set((await db.query("SELECT guild_id FROM network_sync_guilds WHERE sync_id=?", [sync.id])).map((row) => String(row.guild_id)))
      : new Set();
  const rows = (await networkRows()).slice(0, 25);
  if (!rows.length) throw new Error("No network servers yet. Add one with /network add.");
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`gsync:servers:${sync.id}:${actor}`)
      .setPlaceholder(`Servers for ${sync.role_name}`.slice(0, 150))
      .setMinValues(0)
      .setMaxValues(rows.length)
      .addOptions(
        rows.map((row) => ({
          label: clean(client.guilds.cache.get(String(row.guild_id))?.name || row.name, 100),
          description: row.kind,
          value: String(row.guild_id),
          default: picked.has(String(row.guild_id)),
        })),
      ),
  );
}

async function globalSyncServersComponent(i) {
  const [, action, syncId, actor] = i.customId.split(":");
  if (action !== "servers") return;
  if (i.user.id !== actor)
    return i.reply({ embeds: [embed("Not your menu", "Only the person who ran `/globalsync` can pick these servers.", COLORS.danger)], ephemeral: true });
  if (!(await hasPermission(i.user.id, "fbrp.network.manage")))
    return i.reply({ embeds: [embed("Permission required", "You need the `fbrp.network.manage` ACE permission.", COLORS.danger)], ephemeral: true });
  await i.deferUpdate();
  try {
    const { sync, chosen, lines, swept } = await setGlobalSyncServers(client, i.user.id, syncId, i.values);
    await i.editReply({
      embeds: [
        embed(
          `Servers set · ${clean(sync.role_name, 200)}`,
          `**${clean(sync.role_name)}** now lives in ${chosen.length} picked server${chosen.length === 1 ? "" : "s"}. Run **/globalsync servers group:${sync.group_name}** to change them.`,
          COLORS.success,
        ).addFields(membersField(swept), serversField(lines, "-")),
      ],
      components: [],
    });
  } catch (error) {
    await i.editReply({ embeds: [embed("Command failed", clean(error.message || error, 1000), COLORS.danger)], components: [] });
  }
}

async function globalSyncAutocomplete(i) {
  const focused = i.options.getFocused(true);
  const value = String(focused.value).toLowerCase();
  if (focused.name !== "group") return i.respond([]);
  if (["edit", "remove", "move", "servers"].includes(i.options.getSubcommand(false) ?? "")) {
    const rows = await db.query("SELECT group_name,role_name FROM network_syncs ORDER BY sort_order,id");
    return i.respond(
      rows
        .map((row, n) => ({ ...row, n }))
        .filter((row) => row.group_name.includes(value) || row.role_name.toLowerCase().includes(value))
        .slice(0, 25)
        .map((row) => ({ name: `#${row.n + 1} ${row.role_name} ← ${row.group_name}`.slice(0, 100), value: row.group_name })),
    );
  }
  const rows = await db.query("SELECT name,rank_order FROM ace_groups ORDER BY rank_order DESC,name");
  return i.respond(
    rows
      .filter((row) => row.name.includes(value))
      .slice(0, 25)
      .map((row) => ({ name: `${row.name} · rank ${row.rank_order}`, value: row.name })),
  );
}

async function globalSyncCommand(i, sub) {
  await requirePermission(i, "fbrp.network.manage");
  const servers = await networkRows();
  if (sub === "list") {
    const [syncs, links] = await Promise.all([
      db.query("SELECT * FROM network_syncs ORDER BY sort_order,id"),
      db.query("SELECT sync_id,guild_id,managed FROM network_sync_roles"),
    ]);
    const e = embed(
      "Global role syncs",
      syncs.length
        ? `${syncs.length} synced role${syncs.length === 1 ? "" : "s"} across ${servers.length} network server${servers.length === 1 ? "" : "s"}.`
        : "No synced roles yet. Add one with **/globalsync add**.",
    );
    for (const sync of syncs.slice(0, 25)) {
      const where = links
        .filter((link) => Number(link.sync_id) === Number(sync.id))
        .map((link) => `${clean(client.guilds.cache.get(String(link.guild_id))?.name || link.guild_id, 60)}${link.managed ? "" : " (linked)"}`);
      e.addFields({
        name: `${clean(sync.role_name, 100)} ← ${sync.group_name}`.slice(0, 256),
        value: `${await scopeText(sync)} · perms \`${sync.permissions}\` (${describeDiscordPermissions(sync.permissions)})${sync.all_channels ? " · all channels" : ""}\n${where.join(", ") || "not created anywhere yet"}`.slice(0, 1024),
      });
    }
    return e;
  }
  if (sub === "order" || sub === "move") {
    const syncs = await db.query("SELECT * FROM network_syncs ORDER BY sort_order,id");
    if (!syncs.length) throw new Error("No synced roles yet. Add one with /globalsync add.");
    let order = syncs.map((row) => String(row.group_name));
    const given = sub === "order" ? i.options.getString("groups") : null;
    if (sub === "move") {
      const name = i.options.getString("group", true).toLowerCase();
      if (!order.includes(name)) throw new Error(`\`${clean(name)}\` is not synced.`);
      order = order.filter((item) => item !== name);
      order.splice(Math.min(i.options.getInteger("position", true), order.length + 1) - 1, 0, name);
    } else if (given) order = given.split(/[\s,]+/);
    let lines = [];
    if (sub === "move" || given) ({ order, lines } = await setGlobalSyncOrder(client, i.user.id, order));
    const byGroup = new Map(syncs.map((row) => [String(row.group_name), row]));
    const changed = sub === "move" || Boolean(given);
    const e = embed(
      changed ? "Global role order updated" : "Global role order",
      order.map((name, n) => `**${n + 1}.** ${clean(byGroup.get(name)?.role_name || name)} ← \`${name}\``).join("\n"),
      changed ? COLORS.success : COLORS.primary,
    );
    if (lines.length) e.addFields(serversField(lines));
    else e.setFooter({ text: "Change it with /globalsync order groups:<top, …, bottom> or /globalsync move" });
    return e;
  }
  if (sub === "push") {
    const { lines, swept } = await pushGlobalSyncs(client);
    return embed(
      "Global roles pushed",
      `${lines.join("\n") || "No network servers."}\n\nMembers updated: **+${swept.added}** granted · **−${swept.removed}** removed.`,
      COLORS.success,
    );
  }
  const name = i.options.getString("group", true).trim().toLowerCase();
  const existing = await db.one("SELECT * FROM network_syncs WHERE group_name=?", [name]);
  if (sub === "servers") {
    if (!existing) throw new Error(`\`${clean(name)}\` is not synced. Add it with /globalsync add first.`);
    return {
      embeds: [
        embed(
          `Servers · ${clean(existing.role_name, 200)}`,
          `Currently: ${await scopeText(existing)}.\nTick the network servers **${clean(existing.role_name)}** should live in. Unticked servers lose the role${existing.scope === "custom" ? "" : " (this switches it to picked servers)"}.\nServers already using an existing role keep it. To reuse an existing role in another server, run **/globalsync bind** there or **/globalsync edit existing_roles:<role IDs>**.`,
        ),
      ],
      components: [await serverPicker(existing, i.user.id)],
    };
  }
  if (sub === "remove") {
    if (!existing) throw new Error(`\`${clean(name)}\` is not synced.`);
    const lines = await deleteGlobalSync(client, name, i.options.getBoolean("delete_roles") ?? true, i.user.id);
    return embed(`Stopped syncing ${name}`, lines.join("\n") || "No server had the role yet.", COLORS.success);
  }
  if (sub === "bind") {
    const role = i.options.getRole("role", true);
    const { sync, created, lines, swept } = await bindSyncRole(client, i.user.id, name, i.guild, role);
    return embed(
      `${created ? "Created global sync" : "Bound existing role"} · ${clean(sync.role_name, 200)}`,
      `${role} is now the \`${name}\` role in **${clean(i.guild.name)}** and is left as-is. Direct members of **${name}** (added with **/ace member-add**) wear it; anyone else who gets it is stripped and reported.${created ? `\nThe sync was created from this role with scope **${await scopeText(sync)}**; change it with **/globalsync edit**.` : ""}`,
      COLORS.success,
    ).addFields(membersField(swept), serversField(lines));
  }
  if (sub === "add" && existing)
    throw new Error(`\`${clean(name)}\` is already synced. Use **/globalsync edit** to change it.`);
  if (sub === "edit" && !existing)
    throw new Error(`\`${clean(name)}\` is not synced. Create it with **/globalsync add** first.`);
  const { sync, needsPicker, lines, swept } = await saveGlobalSync(client, i.user.id, name, syncInputFromInteraction(i));
  const summary = embed(
    `${existing ? "Updated" : "Created"} global sync · ${clean(sync.role_name, 200)}`,
    `Direct members of **${name}** (added with **/ace member-add** or the panel) wear this role in the servers below. Anyone else who gets it is stripped and reported.`,
    COLORS.success,
  ).addFields(
    {
      name: "Permissions",
      value: `\`${sync.permissions}\` · ${describeDiscordPermissions(sync.permissions)}`.slice(0, 1024),
      inline: true,
    },
    {
      name: "All channels",
      value: sync.all_channels
        ? "Sees and chats in every text channel, sees and joins every voice channel"
        : "No",
      inline: true,
    },
  );
  // Picking servers happens in a menu; nothing is created or removed until the choice is made.
  if (needsPicker)
    return {
      embeds: [summary.addFields({ name: "Servers", value: "Pick the network servers this role lives in below. Servers you gave an existing role for are already ticked." })],
      components: [await serverPicker(sync, i.user.id)],
    };
  return summary.addFields(membersField(swept), serversField(lines));
}

async function moderationCommand(i, sub) {
  await requirePermission(i, ["ban", "kick"].includes(sub) ? `fbrp.discord.mod.${sub}` : "fbrp.discord.mod");
  if (sub === "purge") {
    if (!i.channel?.isTextBased() || !("bulkDelete" in i.channel))
      throw new Error("This channel cannot bulk delete messages.");
    const count = i.options.getInteger("count", true),
      reason = i.options.getString("reason", true);
    const deleted = await i.channel.bulkDelete(count, true);
    const id = await caseRow(i, i.channelId, "purge", reason);
    await log(i.guild, {
      title: "Messages purged",
      color: COLORS.warning,
      actor: i.user.id,
      fields: [["Channel", `${i.channel}`], ["Messages", String(deleted.size)], ["Reason", clean(reason, 300), false]],
      footer: publicCaseId(id),
    }, "moderation");
    return card("Messages purged", {
      color: COLORS.warning,
      rows: [["Messages", String(deleted.size)], ["Channel", `${i.channel}`], ["Case", `\`${publicCaseId(id)}\``], ["Reason", clean(reason, 300), false]],
    });
  }
  if (sub === "unban") {
    const id = clean(i.options.getString("user_id", true), 24),
      reason = i.options.getString("reason", true);
    await i.guild.bans.remove(id, reason);
    const caseId = await caseRow(i, id, "unban", reason);
    await log(i.guild, {
      title: "Member unbanned",
      color: COLORS.success,
      actor: i.user.id,
      target: id,
      fields: [["Reason", clean(reason, 300), false]],
      footer: publicCaseId(caseId),
    }, "unbans");
    return card("Member unbanned", {
      color: COLORS.success,
      rows: [["User", `\`${id}\``], ["Case", `\`${publicCaseId(caseId)}\``], ["Reason", clean(reason, 300), false]],
    });
  }
  const user = i.options.getUser("member", true),
    member = await i.guild.members.fetch(user.id).catch(() => null),
    reason = i.options.getString("reason", true);
  if (!member) throw new Error("That member is not in this server.");
  await requireOutranks(i, user.id, "moderate");
  let action = sub,
    expires = null;
  if (sub === "ban") {
    if (!member.bannable)
      throw new Error("The bot role is not high enough to ban that member.");
    await enforceCommandCooldown(i, "mod.ban");
    await member.ban({
      reason,
      deleteMessageSeconds: (i.options.getInteger("delete_days") || 0) * 86400,
    });
  }
  if (sub === "kick") {
    if (!member.kickable)
      throw new Error("The bot role is not high enough to kick that member.");
    await enforceCommandCooldown(i, "mod.kick");
    await member.kick(reason);
  }
  if (sub === "timeout") {
    const minutes = i.options.getInteger("minutes", true);
    expires = minutes ? Date.now() + minutes * 60000 : null;
    await member.timeout(minutes * 60000, reason);
    action = minutes ? "timeout" : "untimeout";
  }
  const id = await caseRow(i, user.id, action, reason, expires);
  if (["ban", "kick", "timeout", "warn"].includes(action))
    await dm(user, `Florida Bay ${action}`, [
      ["Case ID", `\`${publicCaseId(id)}\``],
      ["Server", clean(i.guild.name, 100)],
      ...(expires ? [["Expires", when(expires)]] : []),
      ["Reason", clean(reason, 300), false],
      ...(["ban"].includes(action) ? [["Appeal", `${publicBase()}/portal.html#punishments`, false]] : []),
    ]);
  const verdict = {
    ban: "Member banned",
    kick: "Member kicked",
    timeout: "Member timed out",
    untimeout: "Timeout removed",
    warn: "Member warned",
  }[action] || humanize(action);
  const tone = ["untimeout"].includes(action)
    ? COLORS.success
    : ["timeout", "warn"].includes(action)
      ? COLORS.warning
      : COLORS.danger;
  await log(i.guild, {
    title: verdict,
    color: tone,
    actor: i.user.id,
    target: user.id,
    fields: [
      ...(expires ? [["Expires", when(expires)]] : []),
      ["Reason", clean(reason, 300), false],
    ],
    footer: publicCaseId(id),
  }, action === "ban" ? "bans" : "moderation");
  return card(verdict, {
    color: tone,
    rows: [["Member", who(user.id)], ["Case", `\`${publicCaseId(id)}\``], ...(expires ? [["Expires", when(expires)]] : []), ["Reason", clean(reason, 300), false]],
  });
}

async function serverCommand(i, sub) {
  if (sub === "status") {
    const started = Date.now();
    const health = await callGame("/health", null, "GET").catch(() => null);
    const dbOk = await db
      .one("SELECT 1 ok")
      .then(() => true)
      .catch(() => false);
    return card("Florida Bay status", {
      color: health?.ok && dbOk ? COLORS.success : COLORS.warning,
      rows: [
        ["Discord bot", `Online\n${client.ws.ping}ms`],
        ["Database", dbOk ? "Online" : "Offline"],
        ["FiveM core", health?.ok ? "Online" : "Unreachable"],
        ...(health?.ok ? [["Players", String(health.players)], ["AOP", clean(health.aop) || "None"]] : []),
        ["Probe time", `${Date.now() - started}ms`],
      ],
    });
  }
  await requirePermission(i, "fbrp.ops");
  if (sub === "aop") {
    const value = clean(i.options.getString("value", true), 60);
    await db.query(
      "INSERT INTO server_state(`key`,value,updated_by,updated_at) VALUES('aop',?,?,?) ON DUPLICATE KEY UPDATE value=VALUES(value),updated_by=VALUES(updated_by),updated_at=VALUES(updated_at)",
      [JSON.stringify(value), i.user.id, Date.now()],
    );
    await callGame("/state", { key: "aop", value }).catch(() => {});
    await audit(i.user.id, "server.aop", null, { value });
    return card("AOP updated", { color: COLORS.success, rows: [["Area of play", value]] });
  }
  if (sub === "peacetime") {
    const value = i.options.getBoolean("enabled", true);
    await db.query(
      "INSERT INTO server_state(`key`,value,updated_by,updated_at) VALUES('peacetime',?,?,?) ON DUPLICATE KEY UPDATE value=VALUES(value),updated_by=VALUES(updated_by),updated_at=VALUES(updated_at)",
      [JSON.stringify(value), i.user.id, Date.now()],
    );
    await callGame("/state", { key: "peacetime", value }).catch(() => {});
    await audit(i.user.id, "server.peacetime", null, { value });
    return card("Peacetime updated", { color: COLORS.success, rows: [["Peacetime", value ? "Active" : "Inactive"]] });
  }
  const message = clean(i.options.getString("message", true), 300);
  await callGame("/announce", { message });
  await audit(i.user.id, "server.announce", null, { message });
  return card("Announcement sent", { color: COLORS.success, description: message });
}

/** Roster rank joined with its category range and ACE group rank. */
async function staffRank(id) {
  const row = await db.one(
    `SELECT r.*,c.name category_name,c.callsign_start,c.callsign_end,g.rank_order group_rank,g.label group_label,g.staff_only group_staff_only
     FROM staff_roster_ranks r JOIN staff_roster_categories c ON c.id=r.category_id
     LEFT JOIN ace_groups g ON g.name=r.ace_group WHERE r.id=?`,
    [id],
  );
  if (!row) throw new Error("Staff rank not found. Pick one from the list.");
  if (!row.ace_group) throw new Error(`${row.name} has no ACE group. Set one with /roster rank-upsert ace_group or the web panel (Roster ranks).`);
  return row;
}

/** Autocomplete for /staff add and /staff move rank: only ranks whose ACE group sits below the caller. */
async function staffRankAutocomplete(i) {
  const needle = String(i.options.getFocused() || "").toLowerCase();
  const level = await staffLevel(i.user.id);
  const rows = await db.query(
    `SELECT r.id,r.name,r.ace_group,g.rank_order,c.name category FROM staff_roster_ranks r
     JOIN staff_roster_categories c ON c.id=r.category_id JOIN ace_groups g ON g.name=r.ace_group
     ORDER BY g.rank_order DESC,c.sort_order,r.sort_order`,
  );
  return i.respond(
    rows
      .filter((row) => Number(row.rank_order) < level && `${row.name} ${row.ace_group} ${row.category}`.toLowerCase().includes(needle))
      .slice(0, 25)
      .map((row) => ({ name: `${row.name} · ${row.category} · ${row.ace_group}`.slice(0, 100), value: String(row.id) })),
  );
}

async function setRankRole(rank, discordId, add) {
  if (!rank?.discord_role_id || !rank?.discord_guild_id) return;
  const guild = client.guilds.cache.get(String(rank.discord_guild_id));
  const member = await guild?.members.fetch(String(discordId)).catch(() => null);
  if (member)
    await (add
      ? member.roles.add(String(rank.discord_role_id), "FBRP /staff rank")
      : member.roles.remove(String(rank.discord_role_id), "FBRP /staff rank")
    ).catch(() => {});
}

/** Removes a rank's Discord role only if the member actually wears it. */
async function dropRankRole(rank, discordId) {
  if (!rank?.discord_role_id || !rank?.discord_guild_id) return;
  const guild = client.guilds.cache.get(String(rank.discord_guild_id));
  const member = await guild?.members.fetch(String(discordId)).catch(() => null);
  if (member?.roles.cache.has(String(rank.discord_role_id))) await setRankRole(rank, discordId, false);
}

/** Every active roster member wears this role in each staff Discord that has one by this name. */
const STAFF_TEAM_ROLE = "FBRP | Staff Team";

async function staffTeamRoles() {
  const roles = [];
  for (const row of await db.query("SELECT guild_id FROM network_guilds WHERE kind='staff'")) {
    const guild = client.guilds.cache.get(String(row.guild_id));
    const role = guild?.roles.cache.find((item) => item.name === STAFF_TEAM_ROLE);
    if (role?.editable) roles.push(role);
  }
  return roles;
}

const activeStaff = async (discordId) =>
  Boolean(await db.one("SELECT 1 ok FROM staff_roster_members WHERE discord_id=? AND status<>'removed'", [String(discordId)]));

/** Adds or removes the Staff Team role for one member in every staff Discord they are in. */
async function setStaffTeamRole(discordId, add) {
  for (const role of await staffTeamRoles()) {
    const member = await role.guild.members.fetch(String(discordId)).catch(() => null);
    if (!member || member.user.bot || member.roles.cache.has(role.id) === add) continue;
    await (add ? member.roles.add(role, "FBRP staff roster member") : member.roles.remove(role, "Removed from the FBRP staff roster")).catch((error) =>
      console.error(`[FBRP staff] Staff Team role for ${discordId}:`, error.message || error),
    );
  }
}

/** Gives the Staff Team role to every active roster member missing it (startup, every 10 minutes, /roster sync). */
async function syncStaffTeamRoles() {
  const roster = await db.query("SELECT discord_id FROM staff_roster_members WHERE status<>'removed'");
  for (const row of roster) await setStaffTeamRole(row.discord_id, true);
}

/** The rank plus every staff rank whose ACE group sits below it; /staff add grants all of them. */
async function staffLadder(rank) {
  return db.query(
    `SELECT r.*,g.rank_order group_rank FROM staff_roster_ranks r JOIN ace_groups g ON g.name=r.ace_group
     WHERE r.id=? OR g.rank_order<? ORDER BY g.rank_order DESC`,
    [rank.id, Number(rank.group_rank)],
  );
}

/** Every ACE group a staff rank maps to; /staff moves members between these. */
const STAFF_GROUPS_SQL = "SELECT DISTINCT ace_group FROM staff_roster_ranks WHERE ace_group IS NOT NULL";

/** /staff add, or /staff move (existing staff only: no welcome DM, optional reason). */
async function staffAdd(i, move = false) {
  await requirePermission(i, "fbrp.staff.assign");
  const user = i.options.getUser("member", true);
  if (user.bot) throw new Error("Bots cannot be staff.");
  const rank = await staffRank(Number(i.options.getString("rank", true)));
  const { actor } = await requireOutranks(i, user.id, "change the staff rank of");
  if (actor !== Number.POSITIVE_INFINITY && Number(rank.group_rank) >= actor)
    throw new Error(`You can only add members to groups below your own rank. ${rank.name} uses \`${rank.ace_group}\` (rank ${rank.group_rank}); your highest group is rank ${actor}.`);
  const previous = await db.one(
    `SELECT m.*,r.discord_role_id,r.discord_guild_id FROM staff_roster_members m
     LEFT JOIN staff_roster_ranks r ON r.id=m.rank_id WHERE m.discord_id=?`,
    [user.id],
  );
  const active = previous && previous.status !== "removed";
  const reason = move ? clean(i.options.getString("reason") || "", 300) || null : null;
  if (move && !active) throw new Error("That member is not on the staff roster. Use /staff add instead.");
  if (move && Number(previous.rank_id) === Number(rank.id)) throw new Error(`That member is already ${rank.name}.`);
  let callsign = i.options.getInteger("callsign");
  if (callsign) await checkCallsign(callsign, rank, user.id);
  else {
    const keep = active && previous.callsign && Number(previous.callsign) >= Number(rank.callsign_start) && Number(previous.callsign) <= Number(rank.callsign_end);
    callsign = keep ? Number(previous.callsign) : await nextCallsign(rank);
  }
  const ladder = await staffLadder(rank);
  const groups = [...new Set(ladder.map((row) => String(row.ace_group)))];
  const marks = groups.map(() => "?").join(",");
  const removedGroups = await db.transaction(async (q) => {
    const old = await q(
      `SELECT DISTINCT group_name FROM ace_memberships WHERE discord_id=? AND origin='manual' AND group_name NOT IN (${marks}) AND group_name IN (${STAFF_GROUPS_SQL})`,
      [user.id, ...groups],
    );
    await q(
      `DELETE FROM ace_memberships WHERE discord_id=? AND origin='manual' AND group_name NOT IN (${marks}) AND group_name IN (${STAFF_GROUPS_SQL})`,
      [user.id, ...groups],
    );
    for (const name of groups)
      await q(
        "INSERT IGNORE INTO ace_memberships(discord_id,group_name,origin,added_by,added_at) VALUES(?,?,'manual',?,?)",
        [user.id, name, i.user.id, Date.now()],
      );
    const stamp = Date.now();
    await q(
      `INSERT INTO staff_roster_members(discord_id,display_name,username,rank_name,rank_id,callsign,status,joined_at,rank_changed_at,updated_at,added_by)
       VALUES(?,?,?,?,?,?,'active',?,?,?,?)
       ON DUPLICATE KEY UPDATE display_name=VALUES(display_name),username=VALUES(username),rank_name=VALUES(rank_name),
         rank_changed_at=IF(rank_id<=>VALUES(rank_id) AND status<>'removed',rank_changed_at,VALUES(rank_changed_at)),
         joined_at=IF(status='removed',VALUES(joined_at),joined_at),rank_id=VALUES(rank_id),callsign=VALUES(callsign),status='active',
         updated_at=VALUES(updated_at),removed_at=NULL,removed_by=NULL,removal_reason=NULL`,
      [user.id, user.globalName || user.username, user.username, rank.name, rank.id, callsign, stamp, stamp, stamp, i.user.id],
    );
    await q(
      "INSERT INTO staff_roster_history(discord_id,action,actor_id,details,created_at) VALUES(?,?,?,?,?)",
      [user.id, move ? "staff_move" : "staff_add", i.user.id, JSON.stringify({ rank: rank.id, group: rank.ace_group, callsign, from: previous?.rank_id || null, ...(reason ? { reason } : {}) }), stamp],
    );
    return old.map((row) => String(row.group_name));
  });
  const ladderIds = new Set(ladder.map((row) => Number(row.id)));
  for (const row of await db.query("SELECT id,discord_role_id,discord_guild_id FROM staff_roster_ranks"))
    if (!ladderIds.has(Number(row.id))) await dropRankRole(row, user.id);
  for (const row of ladder) await setRankRole(row, user.id, true);
  await setStaffTeamRole(user.id, true);
  if (!active || Number(previous.callsign) !== Number(callsign)) await announceCallsign(user.id, callsign);
  await audit(i.user.id, move ? "staff.move" : "staff.add", user.id, { rank: rank.id, rankName: rank.name, from: previous?.rank_name || null, group: rank.ace_group, groups, callsign, removedGroups, reason });
  await refreshGame();
  await syncUserAcrossNetwork(client, user.id);
  const welcome = move ? null : await sendStaffWelcome(user, rank, callsign);
  const rows = [
    ["Rank", `${clean(rank.name)}\n${clean(rank.category_name)}`],
    ["ACE group", `\`${rank.ace_group}\` (rank ${rank.group_rank})`],
    ...(groups.length > 1 ? [["Lower ranks included", groups.filter((g) => g !== rank.ace_group).map((g) => `\`${g}\``).join(" ")]] : []),
    ["Callsign", String(callsign)],
    ...(active && previous.rank_name && Number(previous.rank_id) !== Number(rank.id) ? [["Previous rank", clean(previous.rank_name)]] : []),
    ...(removedGroups.length ? [["Left groups", removedGroups.map((g) => `\`${g}\``).join(" ")]] : []),
    ...(welcome ? [["Welcome DM", welcome.sent ? (welcome.invited ? "Sent with a single-use staff-server invite" : "Sent") : "Could not deliver (their DMs may be closed)"]] : []),
    ...(reason ? [["Reason", reason, false]] : []),
  ];
  await log(i.guild, { content: movementLine(user.id, clean(rank.name), i.user.id) }, "roster");
  await log(i.guild, { title: "Staff ACE membership set", color: COLORS.success, actor: i.user.id, target: user.id, fields: [["Groups", groups.map((g) => `\`${g}\``).join(" ")], ...(removedGroups.length ? [["Removed from", removedGroups.map((g) => `\`${g}\``).join(" ")]] : [])] }, "role_sync");
  return card(move ? "Staff member moved" : active ? "Staff rank changed" : "Staff member added", {
    color: COLORS.success,
    description: `${mention(user.id)} now has the ${clean(rank.name)} permissions${rank.group_staff_only ? " (in game they apply while clocked in)" : ""}.`,
    rows: [["Member", who(user.id)], ...rows],
  });
}

async function staffRemove(i) {
  await requirePermission(i, "fbrp.staff.assign");
  const user = i.options.getUser("member", true);
  const reason = clean(i.options.getString("reason", true), 300);
  await requireOutranks(i, user.id, "remove");
  const roster = await db.one(
    `SELECT m.*,r.discord_role_id,r.discord_guild_id FROM staff_roster_members m
     LEFT JOIN staff_roster_ranks r ON r.id=m.rank_id WHERE m.discord_id=?`,
    [user.id],
  );
  const groups = (
    await db.query(
      `SELECT DISTINCT group_name FROM ace_memberships WHERE discord_id=? AND origin='manual' AND group_name IN (${STAFF_GROUPS_SQL})`,
      [user.id],
    )
  ).map((row) => String(row.group_name));
  if (!groups.length && (!roster || roster.status === "removed")) throw new Error("That member is not staff.");
  const stamp = Date.now();
  await db.transaction(async (q) => {
    await q(`DELETE FROM ace_memberships WHERE discord_id=? AND origin='manual' AND group_name IN (${STAFF_GROUPS_SQL})`, [user.id]);
    await q(
      "UPDATE staff_roster_members SET status='removed',callsign=NULL,removed_at=?,removed_by=?,removal_reason=?,updated_at=? WHERE discord_id=?",
      [stamp, i.user.id, reason, stamp, user.id],
    );
    await q(
      "INSERT INTO staff_roster_history(discord_id,action,actor_id,details,created_at) VALUES(?,?,?,?,?)",
      [user.id, "staff_remove", i.user.id, JSON.stringify({ reason, groups, callsign: roster?.callsign ?? null }), stamp],
    );
    await q(
      "UPDATE staff_shifts SET ended_at=heartbeat_at,seconds=GREATEST(0,FLOOR((heartbeat_at-started_at)/1000)),end_reason='forceout',actor_id=?,note=? WHERE discord_id=? AND ended_at IS NULL",
      [i.user.id, "Removed from staff", user.id],
    );
  });
  await setRankRole(roster, user.id, false);
  await setStaffTeamRole(user.id, false);
  await callGame("/forceout", { discord: user.id, actor: i.user.id, reason: "Removed from staff" }).catch(() => {});
  await audit(i.user.id, "staff.remove", user.id, { reason, groups, rank: roster?.rank_name || null, callsign: roster?.callsign ?? null });
  await refreshGame();
  await syncUserAcrossNetwork(client, user.id);
  const rows = [
    ["Rank", clean(roster?.rank_name) || "None"],
    ["Callsign released", roster?.callsign ? String(roster.callsign) : "None"],
    ["ACE groups removed", groups.map((g) => `\`${g}\``).join(" ") || "None"],
    ["Reason", reason, false],
  ];
  await log(i.guild, { content: movementLine(user.id, "Removed", i.user.id) }, "roster");
  await log(i.guild, { title: "Staff ACE membership removed", color: COLORS.warning, actor: i.user.id, target: user.id, fields: [["Groups", groups.map((g) => `\`${g}\``).join(" ") || "None"]] }, "role_sync");
  return card("Staff member removed", { color: COLORS.warning, rows: [["Member", who(user.id)], ...rows] });
}

async function staffCommand(i, sub) {
  if (sub === "add") return staffAdd(i);
  if (sub === "move") return staffAdd(i, true);
  if (sub === "remove") return staffRemove(i);
  await requirePermission(i, "fbrp.staff.manage");
  const cutoff = Date.now() - 7 * 86400000;
  if (sub === "hours") {
    const user = i.options.getUser("member", true),
      row = await db.one(
        "SELECT COUNT(*) shifts,COALESCE(SUM(CASE WHEN ended_at IS NULL THEN FLOOR((?-started_at)/1000) ELSE seconds END),0) seconds FROM staff_shifts WHERE discord_id=? AND started_at>=?",
        [Date.now(), user.id, cutoff],
      );
    return card("Staff hours", {
      rows: [["Member", who(user.id)], ["Time on duty", `${(Number(row.seconds) / 3600).toFixed(1)} hours`], ["Shifts", String(row.shifts)]],
      footer: "Florida Bay Roleplay \u00b7 Last 7 days",
    });
  }
  if (sub === "leaderboard") {
    const days = i.options.getInteger("days") || 7,
      start = Date.now() - days * 86400000,
      rows = await db.query(
        "SELECT discord_id,MAX(name) name,COUNT(*) shifts,SUM(CASE WHEN ended_at IS NULL THEN FLOOR((?-started_at)/1000) ELSE seconds END) seconds FROM staff_shifts WHERE started_at>=? GROUP BY discord_id ORDER BY seconds DESC LIMIT 20",
        [Date.now(), start],
      );
    return card("Staff leaderboard", {
      description:
        rows
          .map(
            (row, index) =>
              `\`${String(index + 1).padStart(2, "0")}\` · **${clean(row.name)}** · ${(Number(row.seconds) / 3600).toFixed(1)}h across ${row.shifts} shift${Number(row.shifts) === 1 ? "" : "s"}`,
          )
          .join("\n") || "No recorded shifts.",
      footer: `Florida Bay Roleplay \u00b7 Last ${days} days`,
    });
  }
  const user = i.options.getUser("member", true),
    reason = i.options.getString("reason", true),
    stamp = Date.now();
  const result = await db.query(
    "UPDATE staff_shifts SET ended_at=heartbeat_at,seconds=GREATEST(0,FLOOR((heartbeat_at-started_at)/1000)),end_reason='forceout',actor_id=?,note=? WHERE discord_id=? AND ended_at IS NULL",
    [i.user.id, reason, user.id],
  );
  await callGame("/forceout", {
    discord: user.id,
    actor: i.user.id,
    reason,
  }).catch(() => {});
  await audit(i.user.id, "staff.forceout", user.id, {
    reason,
    rows: result.affectedRows,
    stamp,
  });
  await log(i.guild, { title: "Staff clock-out enforced", color: COLORS.warning, actor: i.user.id, target: user.id, fields: [["Shifts closed", String(result.affectedRows)], ["Reason", clean(reason, 300), false]] }, "staff_duty");
  return card("Staff clock-out enforced", {
    color: COLORS.warning,
    rows: [["Member", who(user.id)], ["Shifts closed", String(result.affectedRows)], ["Reason", clean(reason, 300), false]],
  });
}

async function protectRoleCommand(i, sub) {
  await requirePermission(i, "fbrp.roles.protect");
  if (sub === "list") {
    const rows = await db.query(
      "SELECT * FROM protected_roles WHERE guild_id=?",
      [i.guildId],
    );
    return card("Protected roles", {
      description:
        rows
          .map((row) => `${roleRef(row.role_id)}\nProtected by ${mention(row.added_by)} ${when(row.added_at)}`)
          .join("\n\n") || "No roles are protected in this server.",
    });
  }
  const role = i.options.getRole("role", true);
  if (sub === "add") {
    await db.query(
      "INSERT IGNORE INTO protected_roles(guild_id,role_id,added_by,added_at) VALUES(?,?,?,?)",
      [i.guildId, role.id, i.user.id, Date.now()],
    );
    await log(i.guild, {
      title: "Role protected",
      color: COLORS.success,
      actor: i.user.id,
      fields: [["Role", roleRef(role.id)]],
    }, "protected_roles");
    return card("Role protected", {
      color: COLORS.success,
      description: "Changes to this role are now enforced and audited.",
      rows: [["Role", roleRef(role.id)]],
    });
  }
  if (sub === "remove") {
    await db.query(
      "DELETE FROM protected_roles WHERE guild_id=? AND role_id=?",
      [i.guildId, role.id],
    );
    await log(i.guild, {
      title: "Role protection removed",
      color: COLORS.warning,
      actor: i.user.id,
      fields: [["Role", roleRef(role.id)]],
    }, "protected_roles");
    await db.query(
      "DELETE FROM protected_role_access WHERE guild_id=? AND role_id=?",
      [i.guildId, role.id],
    );
    return card("Protection removed", {
      color: COLORS.warning,
      description: "This role is no longer guarded.",
      rows: [["Role", roleRef(role.id)]],
    });
  }
  const isUser = sub.endsWith("user"),
    add = sub.startsWith("allow-"),
    subject = isUser
      ? i.options.getUser("member", true)
      : i.options.getRole("manager_role", true);
  if (add)
    await db.query(
      "INSERT IGNORE INTO protected_role_access(guild_id,role_id,subject_type,subject_id,added_by) VALUES(?,?,?,?,?)",
      [i.guildId, role.id, isUser ? "user" : "role", subject.id, i.user.id],
    );
  else
    await db.query(
      "DELETE FROM protected_role_access WHERE guild_id=? AND role_id=? AND subject_type=? AND subject_id=?",
      [i.guildId, role.id, isUser ? "user" : "role", subject.id],
    );
  const subjectRef = isUser ? mention(subject.id) : roleRef(subject.id);
  await log(i.guild, {
    title: add ? "Protected-role manager added" : "Protected-role manager removed",
    color: add ? COLORS.success : COLORS.warning,
    actor: i.user.id,
    fields: [["Role", roleRef(role.id)], [isUser ? "Member" : "Manager role", subjectRef]],
  }, "protected_roles");
  return card("Protected-role access updated", {
    color: COLORS.success,
    rows: [["Role", roleRef(role.id)], [isUser ? "Member" : "Manager role", subjectRef], ["Access", add ? "Can manage" : "Cannot manage"]],
  });
}

async function botguardCommand(i, sub) {
  await requirePermission(i, "fbrp.security.manage");
  if (sub === "allow-bot" || sub === "deny-bot") {
    const id = clean(i.options.getString("bot_id", true), 24);
    if (!/^\d{15,24}$/.test(id))
      throw new Error("Enter a valid Discord bot user ID.");
    const add = sub === "allow-bot";
    if (add)
      await db.query(
        "INSERT INTO network_allowed_bots(bot_id,label,added_by,added_at) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE label=VALUES(label),added_by=VALUES(added_by),added_at=VALUES(added_at)",
        [
          id,
          clean(i.options.getString("label"), 80) || null,
          i.user.id,
          Date.now(),
        ],
      );
    else
      await db.query("DELETE FROM network_allowed_bots WHERE bot_id=?", [id]);
    await audit(i.user.id, `botguard.${add ? "allow" : "deny"}`, id, {});
    return card("Bot Guard updated", {
      color: add ? COLORS.success : COLORS.warning,
      rows: [["Application", `\`${id}\``], ["Status", add ? "Approved" : "No longer approved"]],
    });
  }
  if (
    ["trust-user", "trust-role", "untrust-user", "untrust-role"].includes(sub)
  ) {
    const isUser = sub.endsWith("user"),
      add = sub.startsWith("trust-"),
      subject = isUser
        ? i.options.getUser("member", true)
        : i.options.getRole("role", true);
    if (add)
      await db.query(
        "INSERT IGNORE INTO network_bot_adder_allowlist(guild_id,subject_type,subject_id,added_by,added_at) VALUES(?,?,?,?,?)",
        [
          i.guildId,
          isUser ? "user" : "role",
          subject.id,
          i.user.id,
          Date.now(),
        ],
      );
    else
      await db.query(
        "DELETE FROM network_bot_adder_allowlist WHERE guild_id=? AND subject_type=? AND subject_id=?",
        [i.guildId, isUser ? "user" : "role", subject.id],
      );
    return card("Trusted bot adder", {
      color: COLORS.success,
      rows: [[isUser ? "Member" : "Role", isUser ? mention(subject.id) : roleRef(subject.id)], ["Can add approved bots", yesNo(add)]],
    });
  }
  if (sub === "exempt-add" || sub === "exempt-remove") {
    requireOwner(i, "manage security exemptions");
    const user = i.options.getUser("member", true),
      add = sub === "exempt-add";
    if (add)
      await db.query(
        "INSERT INTO discord_security_exemption_scopes(discord_id,guild_id,reason,added_by,added_at) VALUES(?,'*',?,?,?) ON DUPLICATE KEY UPDATE reason=VALUES(reason),added_by=VALUES(added_by),added_at=VALUES(added_at)",
        [user.id, i.options.getString("reason", true), i.user.id, Date.now()],
      );
    else
      await db.query(
        "DELETE FROM discord_security_exemption_scopes WHERE discord_id=? AND guild_id='*'",
        [user.id],
      );
    return card("Security exemptions updated", {
      color: COLORS.warning,
      rows: [["Member", who(user.id)], ["Exempt from enforcement", yesNo(add)]],
    });
  }
  if (sub === "sweep") {
    const result = await sweepBots(i.guild);
    return card("Bot Guard sweep", {
      color: result.failed ? COLORS.warning : COLORS.success,
      rows: [["Removed", String(result.removed)], ["Failed", String(result.failed)]],
    });
  }
  const [bots, adders, exemptions] = await Promise.all([
    db.query("SELECT * FROM network_allowed_bots"),
    db.query(
      "SELECT * FROM network_bot_adder_allowlist WHERE guild_id IN (?,'*')",
      [i.guildId],
    ),
    db.query("SELECT * FROM discord_security_exemption_scopes ORDER BY discord_id,guild_id"),
  ]);
  return card("Bot Guard policy", {
    rows: [
      ["Approved applications", chunkLines(bots.map((row) => `\`${row.bot_id}\` · ${clean(row.label || "")}`))[0] || "None", false],
      ["Trusted adders", chunkLines(adders.map((row) => `${row.subject_type === "role" ? roleRef(row.subject_id) : mention(row.subject_id)} · ${row.subject_type}`))[0] || "None", false],
      ["Security exemptions", chunkLines(exemptions.map((row) => `${mention(row.discord_id)} · ${row.guild_id === "*" ? "global" : `server \`${row.guild_id}\``} · ${clean(row.reason, 100)}`))[0] || "None", false],
    ],
  });
}

const securityLog = (guild, entry) => log(guild, entry, "security");

async function securityCommand(i, sub) {
  await requirePermission(i, "fbrp.security.manage");
  if (sub.startsWith("exempt-")) {
    requireOwner(i, "manage security exemptions");
    if (sub === "exempt-list") {
      const rows = await db.query("SELECT * FROM discord_security_exemption_scopes ORDER BY guild_id='*' DESC,added_at DESC");
      return card("Automated-security exemptions", {
        description: "These bypass anti-nuke, anti-raid/account-age, anti-spam, Bot Guard and protected-role enforcement. They never grant ACE permissions or block manual moderation.",
        rows: [["Accounts", chunkLines(rows.map((row) => `${mention(row.discord_id)} · ${row.guild_id === "*" ? "all network servers" : `\`${row.guild_id}\``}\n${clean(row.reason, 160)}`), 3800)[0] || "None", false]],
      });
    }
    const user = i.options.getUser("member", true);
    const guildId = i.options.getString("scope", true) === "global" ? "*" : i.guildId;
    const add = sub === "exempt-add";
    if (add) {
      const reason = clean(i.options.getString("reason", true), 200);
      await db.query(
        "INSERT INTO discord_security_exemption_scopes(discord_id,guild_id,reason,added_by,added_at) VALUES(?,?,?,?,?) ON DUPLICATE KEY UPDATE reason=VALUES(reason),added_by=VALUES(added_by),added_at=VALUES(added_at)",
        [user.id, guildId, reason, i.user.id, Date.now()],
      );
      await audit(i.user.id, "security.exempt.add", user.id, { guildId, reason });
    } else {
      await db.query("DELETE FROM discord_security_exemption_scopes WHERE discord_id=? AND guild_id=?", [user.id, guildId]);
      await audit(i.user.id, "security.exempt.remove", user.id, { guildId });
    }
    await securityLog(i.guild, {
      title: add ? "Security exemption added" : "Security exemption removed",
      color: add ? COLORS.success : COLORS.warning,
      actor: i.user.id,
      target: user.id,
      fields: [["Scope", guildId === "*" ? "Every network server" : `${clean(i.guild.name)} only`]],
    });
    return card(add ? "Security exemption added" : "Security exemption removed", {
      color: add ? COLORS.success : COLORS.warning,
      description: add
        ? `${mention(user.id)} now bypasses automated security ${guildId === "*" ? "across the network" : `only in **${clean(i.guild.name)}**`}. Manual moderation and permissions are unchanged.`
        : `${mention(user.id)} is subject to automated security again ${guildId === "*" ? "across the network" : `in **${clean(i.guild.name)}**`}.`,
    });
  }
  if (sub === "config") {
    const key = i.options.getString("setting", true);
    const meta = SECURITY_SETTINGS[key];
    if (!meta) throw new Error("Pick a setting from the list.");
    const raw = i.options.getString("value");
    const hint = meta.type === "bool" ? "`on` or `off`" : meta.type === "int" ? `a number from ${meta.min} to ${meta.max}` : meta.values.map((v) => `\`${v}\``).join(", ");
    if (raw === null) {
      const current = (await getSecuritySettings())[key];
      return card(meta.label, { rows: [["Current value", settingText(key, current)], ["Default", settingText(key, meta.default)], ["Accepts", hint]] });
    }
    const before = (await getSecuritySettings())[key];
    const value = await setSecuritySetting(key, raw, i.user.id);
    await securityLog(i.guild, {
      title: "Security setting changed",
      color: COLORS.warning,
      actor: i.user.id,
      fields: [["Setting", meta.label, false], ["Before", settingText(key, before)], ["After", settingText(key, value)]],
    });
    return card("Security setting updated", {
      color: COLORS.success,
      description: "Applies to every Florida Bay network server.",
      rows: [["Setting", meta.label, false], ["Before", settingText(key, before)], ["After", settingText(key, value)]],
    });
  }
  if (sub === "lockdown" || sub === "unlock") {
    const locking = sub === "lockdown";
    const guilds = i.options.getBoolean("network")
      ? (await networkRows()).map((row) => client.guilds.cache.get(String(row.guild_id))).filter(Boolean)
      : [i.guild];
    const reason = clean(i.options.getString("reason") || (locking ? "Manual lockdown" : "Lifted by staff"), 300);
    const minutes = locking ? (i.options.getInteger("minutes") ?? (await getSecuritySettings()).lockdown_minutes) : 0;
    const results = [];
    for (const guild of guilds) {
      try {
        if (locking) await lockdown(guild, { reason, actorId: i.user.id, minutes, log: securityLog });
        else await unlock(guild, { reason, actorId: i.user.id, log: securityLog });
        results.push(`✅ **${clean(guild.name, 80)}**`);
      } catch (error) {
        results.push(`⚠️ **${clean(guild.name, 80)}** · ${clean(error.message || error, 120).replace(/\*\*/g, "")}`);
      }
    }
    return card(locking ? "🔒 Lockdown started" : "🔓 Lockdown lifted", {
      color: locking ? COLORS.danger : COLORS.success,
      description: `> ${reason}`,
      rows: [
        ["Servers", results.join("\n") || "None", false],
        ...(locking ? [["Auto-unlock", minutes ? `After ${minutes} min` : "Manual (`/security unlock`)"]] : []),
      ],
    });
  }
  if (sub === "events") {
    const all = i.options.getBoolean("all_servers") ?? false;
    const rows = await securityEvents(all ? null : i.guildId, 20);
    const items = rows.map((row) => {
      const server = all ? `\n${clean(client.guilds.cache.get(String(row.guild_id))?.name || row.guild_id, 60)}` : "";
      return `${when(row.created_at)} · **${EVENT_LABEL[row.event_type] || humanize(row.event_type)}** · ${humanize(row.outcome)}${row.actor_id ? ` · by ${mention(row.actor_id)}` : ""}${server}`;
    });
    return card(all ? "Security events · all servers" : `Security events · ${clean(i.guild.name, 80)}`, {
      description: chunkLines(items, 4000)[0] || "No security events recorded yet.",
    });
  }
  const [s, states, servers, counts] = await Promise.all([
    getSecuritySettings(),
    lockdownStates(),
    networkRows(),
    db.query("SELECT event_type,COUNT(*) n FROM network_security_events WHERE created_at>=? GROUP BY event_type ORDER BY n DESC", [Date.now() - 86400000]),
  ]);
  const lockLines = servers.map((row) => {
    const state = states[String(row.guild_id)];
    const name = clean(client.guilds.cache.get(String(row.guild_id))?.name || row.name, 60);
    return state ? `🔒 **${name}** · locked${state.until ? `, lifts ${when(state.until)}` : " until unlocked"}` : `🟢 ${name}`;
  });
  return card("Security status", {
    description: `These protections scan **every** account on every Florida Bay network server, staff and server owners included. Every human account under ${YOUNG_ACCOUNT_ALERT_DAYS} days old creates an alert, including exempt accounts. The bot and accounts with a \`/security exempt-add\` exemption are skipped only for automated enforcement. Server owners are detected and reported, but Discord does not let a bot act against them.`,
    rows: [
      ["Anti-nuke", `${onOff(s.antinuke)}\n${s.nuke_limit} of a kind or ${s.nuke_total} danger points in ${s.nuke_window}s\nPunishment: ${s.nuke_punishment}${s.nuke_network_ban ? " (network-wide)" : ""}\nUndo damage: ${onOff(s.nuke_restore)} · Failsafe lockdown: ${onOff(s.nuke_failsafe_lockdown)}`],
      ["Anti-raid", `${onOff(s.antiraid)}\n${s.raid_joins} joins in ${s.raid_window}s · ${s.raid_suspicious_joins} high-risk joins in ${Math.round(s.raid_suspicious_window / 60)} min · ${s.raid_message_accounts} new accounts posting the same message\n${s.raid_lockdown ? `Lockdown${s.lockdown_minutes ? ` for ${s.lockdown_minutes} min` : ""}` : "Alert only"} · raiders: ${s.raid_kick_new ? s.raid_action : "left alone"}`],
      ["Anti-spam", `${onOff(s.antispam)}\n${s.spam_messages} msgs in ${s.spam_window}s · ${s.spam_mentions} mentions · ${s.spam_duplicates} repeats · ${s.spam_channels} channels · ${s.spam_lines} lines\nTimeout: ${s.spam_timeout} min${s.spam_escalate ? ", doubling for repeat offenders" : ""}\nScam links: ${onOff(s.scam_filter)}`],
      ["Guards", `Permission guard: ${onOff(s.permission_guard)}\nAdmin grant guard: ${onOff(s.admin_grant_guard)}\nWebhook guard: ${onOff(s.webhook_guard)}\nInvite filter: ${onOff(s.invite_filter)}\nBot guard: On`],
      ["New accounts", `Alert every join under ${YOUNG_ACCOUNT_ALERT_DAYS}d\nConfigured action: ${s.young_account_days && s.young_account_action !== "off" ? `younger than ${s.young_account_days}d: ${s.young_account_action}` : "none"}\nDuring lockdown: ${s.raid_kick_new ? `act if younger than ${s.raid_account_days}d` : "allowed"}`],
      ["Last 24 hours", counts.map((row) => `${EVENT_LABEL[row.event_type] || humanize(row.event_type)} · ${row.n}`).join("\n") || "No events"],
      ["Servers", chunkLines(lockLines, 1000)[0] || "No network servers", false],
    ],
    footer: "Florida Bay Roleplay · Change settings with /security config",
  });
}

/** Lowest free callsign in a rank's category range. */
async function nextCallsign(rank) {
  const rows = await db.query(
    "SELECT callsign FROM staff_roster_members WHERE callsign BETWEEN ? AND ? ORDER BY callsign",
    [rank.callsign_start, rank.callsign_end],
  );
  const used = new Set(rows.map((row) => Number(row.callsign)));
  for (let value = Number(rank.callsign_start); value <= Number(rank.callsign_end); value++)
    if (!used.has(value)) return value;
  throw new Error(`No callsigns remain in ${rank.category_name || "that category"}.`);
}

/** Throws when a specific callsign is outside the rank's range or held by someone else. */
async function checkCallsign(callsign, rank, discordId) {
  if (callsign < Number(rank.callsign_start) || callsign > Number(rank.callsign_end))
    throw new Error(`Callsign must be within ${rank.callsign_start}–${rank.callsign_end}.`);
  const holder = await db.one("SELECT discord_id FROM staff_roster_members WHERE callsign=? AND discord_id<>?", [callsign, String(discordId)]);
  if (holder) throw new Error(`Callsign ${callsign} already belongs to ${mention(holder.discord_id)}.`);
}

async function rosterCommand(i, sub) {
  const permission = ["list", "profile"].includes(sub)
    ? "fbrp.roster.view"
    : ["discipline", "discipline-revoke"].includes(sub)
      ? "fbrp.roster.discipline"
      : ["category-upsert", "category-delete", "rank-upsert", "rank-delete", "job-upsert", "job-delete", "sync"].includes(sub)
        ? "fbrp.roster.config"
        : "fbrp.roster.manage";
  await requirePermission(i, permission);
  const history = (discordId, action, details) =>
    db.query(
      "INSERT INTO staff_roster_history(discord_id,action,actor_id,details,created_at) VALUES(?,?,?,?,?)",
      [discordId, action, i.user.id, JSON.stringify(details || {}), Date.now()],
    );
  const rankById = async (id) => {
    const row = await db.one(
      `SELECT r.*,c.name category_name,c.callsign_start,c.callsign_end
       FROM staff_roster_ranks r JOIN staff_roster_categories c ON c.id=r.category_id WHERE r.id=?`,
      [id],
    );
    if (!row) throw new Error("Roster rank not found.");
    return row;
  };
  if (sub === "list") {
    const [categories, ranks, members, jobs] = await Promise.all([
      db.query("SELECT * FROM staff_roster_categories ORDER BY sort_order,name"),
      db.query("SELECT * FROM staff_roster_ranks ORDER BY category_id,sort_order,name"),
      db.query(`SELECT m.*,r.name rank,c.name category,
        (SELECT COUNT(*) FROM staff_roster_discipline d WHERE d.discord_id=m.discord_id AND d.revoked_at IS NULL) discipline
        FROM staff_roster_members m LEFT JOIN staff_roster_ranks r ON r.id=m.rank_id
        LEFT JOIN staff_roster_categories c ON c.id=r.category_id WHERE m.status<>'removed'
        ORDER BY c.sort_order,r.sort_order,m.callsign`),
      db.query("SELECT j.*,COUNT(m.discord_id) members FROM staff_roster_jobs j LEFT JOIN staff_roster_member_jobs m ON m.job_id=j.id GROUP BY j.id ORDER BY j.sort_order,j.name"),
    ]);
    const config = categories.map((c) => `\`C${c.id}\` · **${clean(c.name)}** · callsigns ${c.callsign_start} to ${c.callsign_end}`);
    const rankText = ranks.map((r) => `\`R${r.id}\` · **${clean(r.name)}**${r.discord_role_id ? ` · ${roleRef(r.discord_role_id)}` : ""} · ${(Number(r.weekly_seconds) / 3600).toFixed(0)}h per week`);
    const roster = members.map((row) => `${row.callsign ? `\`${row.callsign}\` · ` : ""}${mention(row.discord_id)} · **${clean(row.rank || row.rank_name)}** · ${row.status}${Number(row.discipline) ? ` · ${row.discipline} active warning${Number(row.discipline) === 1 ? "" : "s"}` : ""}`);
    const jobText = jobs.map((j) => `\`J${j.id}\` · **${clean(j.name)}**${j.discord_role_id ? ` · ${roleRef(j.discord_role_id)}` : ""} · ${j.members} member${Number(j.members) === 1 ? "" : "s"}`);
    const sections = [
      ["Categories", config],
      ["Ranks", rankText],
      ["Secondary jobs", jobText],
    ];
    const list = card("Staff roster", {
      description: `${members.length} active staff member${members.length === 1 ? "" : "s"} across ${categories.length} categor${categories.length === 1 ? "y" : "ies"}.`,
      rows: sections.map(([name, items]) => [name, chunkLines(items)[0] || "None", false]),
    });
    const memberChunks = chunkLines(roster);
    memberChunks.slice(0, 2).forEach((chunk, index) => list.addFields({ name: index ? "Staff (continued)" : "Staff", value: chunk }));
    if (!memberChunks.length) list.addFields({ name: "Staff", value: "Empty" });
    return list;
  }
  if (sub === "category-upsert") {
    const id = i.options.getInteger("id"), name = clean(i.options.getString("name", true), 80);
    const start = i.options.getInteger("start", true), end = i.options.getInteger("end", true);
    if (end < start) throw new Error("Callsign end must be greater than or equal to start.");
    const order = i.options.getInteger("order") || 0;
    if (id) await db.query("UPDATE staff_roster_categories SET name=?,callsign_start=?,callsign_end=?,sort_order=? WHERE id=?", [name, start, end, order, id]);
    else await db.query("INSERT INTO staff_roster_categories(name,callsign_start,callsign_end,sort_order,created_at) VALUES(?,?,?,?,?)", [name, start, end, order, Date.now()]);
    await log(i.guild, {
      title: id ? "Roster category updated" : "Roster category created",
      color: COLORS.success,
      actor: i.user.id,
      fields: [["Category", name], ["Callsigns", `${start} to ${end}`]],
    }, "roster");
    return card("Roster category saved", { color: COLORS.success, rows: [["Category", name], ["Callsigns", `${start} to ${end}`]] });
  }
  if (sub === "category-delete") {
    const id = i.options.getInteger("id", true);
    await db.query("DELETE FROM staff_roster_categories WHERE id=?", [id]);
    await log(i.guild, { title: "Roster category deleted", color: COLORS.warning, actor: i.user.id, fields: [["Category ID", `\`${id}\``]] }, "roster");
    return card("Roster category deleted", { color: COLORS.warning, rows: [["Category ID", `\`${id}\``]] });
  }
  if (sub === "rank-upsert") {
    const id = i.options.getInteger("id"), category = i.options.getInteger("category", true);
    const name = clean(i.options.getString("name", true), 80), role = i.options.getRole("role");
    const weekly = (i.options.getInteger("weekly_hours") || 0) * 3600;
    const days = i.options.getInteger("minimum_days") || 0, order = i.options.getInteger("order") || 0;
    const aceGroup = i.options.getString("ace_group") ? group(i.options.getString("ace_group")) : null;
    if (aceGroup && !(await db.one("SELECT name FROM ace_groups WHERE name=?", [aceGroup]))) throw new Error(`ACE group \`${aceGroup}\` does not exist.`);
    if (id) await db.query("UPDATE staff_roster_ranks SET category_id=?,name=?,discord_role_id=?,discord_guild_id=?,ace_group=?,sort_order=?,weekly_seconds=?,minimum_days=? WHERE id=?", [category, name, role?.id || null, role ? i.guildId : null, aceGroup, order, weekly, days, id]);
    else await db.query("INSERT INTO staff_roster_ranks(category_id,name,discord_role_id,discord_guild_id,ace_group,sort_order,weekly_seconds,minimum_days,created_at) VALUES(?,?,?,?,?,?,?,?,?)", [category, name, role?.id || null, role ? i.guildId : null, aceGroup, order, weekly, days, Date.now()]);
    const rows = [["Rank", name], ["Role", role ? roleRef(role.id) : "Not mapped"], ["ACE group", aceGroup ? `\`${aceGroup}\`` : "Not mapped"], ["Weekly hours", `${weekly / 3600}h`]];
    await log(i.guild, {
      title: id ? "Roster rank updated" : "Roster rank created",
      color: COLORS.success,
      actor: i.user.id,
      fields: rows,
    }, "roster");
    return card("Roster rank saved", { color: COLORS.success, rows });
  }
  if (sub === "rank-delete") {
    const id = i.options.getInteger("id", true);
    await db.query("DELETE FROM staff_roster_ranks WHERE id=?", [id]);
    await log(i.guild, { title: "Roster rank deleted", color: COLORS.warning, actor: i.user.id, fields: [["Rank ID", `\`${id}\``]] }, "roster");
    return card("Roster rank deleted", { color: COLORS.warning, rows: [["Rank ID", `\`${id}\``]] });
  }
  if (sub === "job-upsert") {
    const id = i.options.getInteger("id"), name = clean(i.options.getString("name", true), 80);
    const description = clean(i.options.getString("description") || "", 300), role = i.options.getRole("role");
    const order = i.options.getInteger("order") || 0;
    if (id) await db.query("UPDATE staff_roster_jobs SET name=?,description=?,discord_role_id=?,discord_guild_id=?,sort_order=? WHERE id=?", [name, description, role?.id || null, role ? i.guildId : null, order, id]);
    else await db.query("INSERT INTO staff_roster_jobs(name,description,discord_role_id,discord_guild_id,sort_order,created_at) VALUES(?,?,?,?,?,?)", [name, description, role?.id || null, role ? i.guildId : null, order, Date.now()]);
    await log(i.guild, {
      title: id ? "Staff job updated" : "Staff job created",
      color: COLORS.success,
      actor: i.user.id,
      fields: [["Job", name], ["Role", role ? roleRef(role.id) : "Not mapped"]],
    }, "roster");
    return card("Staff job saved", {
      color: COLORS.success,
      description: description || undefined,
      rows: [["Job", name], ["Role", role ? roleRef(role.id) : "Not mapped"]],
    });
  }
  if (sub === "job-delete") {
    const id = i.options.getInteger("id", true);
    await db.query("DELETE FROM staff_roster_jobs WHERE id=?", [id]);
    await log(i.guild, { title: "Staff job deleted", color: COLORS.warning, actor: i.user.id, fields: [["Job ID", `\`${id}\``]] }, "roster");
    return card("Staff job deleted", { color: COLORS.warning, rows: [["Job ID", `\`${id}\``]] });
  }
  if (sub === "discipline-revoke") {
    const id = i.options.getInteger("id", true), reason = clean(i.options.getString("reason", true), 300);
    const row = await db.one("SELECT * FROM staff_roster_discipline WHERE id=? AND revoked_at IS NULL", [id]);
    if (!row) throw new Error("Active discipline record not found.");
    await db.query("UPDATE staff_roster_discipline SET revoked_at=?,revoked_by=?,revoke_reason=? WHERE id=?", [Date.now(), i.user.id, reason, id]);
    await history(row.discord_id, "discipline_revoke", { id, reason });
    await log(i.guild, {
      title: "Discipline revoked",
      color: COLORS.success,
      actor: i.user.id,
      target: row.discord_id,
      fields: [["Record", `${humanize(row.kind)} #${id}`], ["Reason", reason, false]],
    }, "roster");
    return card("Discipline revoked", {
      color: COLORS.success,
      rows: [["Member", who(row.discord_id)], ["Record", `${humanize(row.kind)} #${id}`], ["Reason", reason, false]],
    });
  }
  if (sub === "sync") {
    const ranks = await db.query("SELECT * FROM staff_roster_ranks WHERE discord_role_id IS NOT NULL AND discord_guild_id IS NOT NULL ORDER BY sort_order");
    let synced = 0;
    for (const rank of ranks) {
      const guild = client.guilds.cache.get(String(rank.discord_guild_id));
      if (!guild) continue;
      const role = await guild.roles.fetch(String(rank.discord_role_id)).catch(() => null);
      if (!role) continue;
      for (const member of role.members.values()) {
        if (member.user.bot) continue;
        const detail = await rankById(rank.id);
        const existing = await db.one("SELECT callsign FROM staff_roster_members WHERE discord_id=?", [member.id]);
        const callsign = existing?.callsign || await nextCallsign(detail);
        if (!existing?.callsign) await announceCallsign(member.id, callsign);
        await db.query(`INSERT INTO staff_roster_members(discord_id,display_name,username,rank_name,rank_id,callsign,status,joined_at,rank_changed_at,updated_at,added_by)
          VALUES(?,?,?,?,?,?,'active',?,?,?,?) ON DUPLICATE KEY UPDATE display_name=VALUES(display_name),username=VALUES(username),rank_name=VALUES(rank_name),rank_id=VALUES(rank_id),status='active',updated_at=VALUES(updated_at)`,
        [member.id, member.displayName, member.user.username, rank.name, rank.id, callsign, Date.now(), Date.now(), Date.now(), i.user.id]);
        synced++;
      }
    }
    const jobs = await db.query("SELECT * FROM staff_roster_jobs WHERE discord_role_id IS NOT NULL AND discord_guild_id IS NOT NULL");
    for (const job of jobs) {
      const guild = client.guilds.cache.get(String(job.discord_guild_id));
      if (!guild) continue;
      const role = await guild.roles.fetch(String(job.discord_role_id)).catch(() => null);
      if (!role) continue;
      const roster = await db.query("SELECT discord_id FROM staff_roster_members WHERE status<>'removed'");
      for (const row of roster) {
        const member = await guild.members.fetch(String(row.discord_id)).catch(() => null);
        if (member?.roles.cache.has(String(job.discord_role_id)))
          await db.query("INSERT IGNORE INTO staff_roster_member_jobs(discord_id,job_id,assigned_by,assigned_at) VALUES(?,?,?,?)", [row.discord_id, job.id, i.user.id, Date.now()]);
        else
          await db.query("DELETE FROM staff_roster_member_jobs WHERE discord_id=? AND job_id=?", [row.discord_id, job.id]);
      }
    }
    await syncStaffTeamRoles();
    await log(i.guild, {
      title: "Roster synchronized",
      color: COLORS.success,
      actor: i.user.id,
      fields: [["Assignments", String(synced)]],
    }, "role_sync");
    return card("Roster synchronized", {
      color: COLORS.success,
      description: "Staff assignments were reconciled from Discord roles.",
      rows: [["Assignments", String(synced)]],
    });
  }
  const user = i.options.getUser("member", true);
  if (sub === "job-assign" || sub === "job-remove") {
    const jobId = i.options.getInteger("job", true);
    const job = await db.one("SELECT * FROM staff_roster_jobs WHERE id=?", [jobId]);
    if (!job) throw new Error("Staff job not found.");
    const add = sub === "job-assign";
    if (add) await db.query("INSERT IGNORE INTO staff_roster_member_jobs(discord_id,job_id,assigned_by,assigned_at) VALUES(?,?,?,?)", [user.id, jobId, i.user.id, Date.now()]);
    else await db.query("DELETE FROM staff_roster_member_jobs WHERE discord_id=? AND job_id=?", [user.id, jobId]);
    if (job.discord_role_id && job.discord_guild_id) {
      const guild = client.guilds.cache.get(String(job.discord_guild_id));
      const member = await guild?.members.fetch(user.id).catch(() => null);
      if (member) await (add ? member.roles.add(String(job.discord_role_id), "FBRP roster job") : member.roles.remove(String(job.discord_role_id), "FBRP roster job")).catch(() => {});
    }
    await history(user.id, add ? "job_assign" : "job_remove", { job: jobId });
    await log(i.guild, { title: add ? "Staff job assigned" : "Staff job removed", color: add ? COLORS.success : COLORS.warning, actor: i.user.id, target: user.id, fields: [["Job", clean(job.name)]] }, "roster");
    return card("Staff job updated", {
      color: COLORS.success,
      rows: [["Member", who(user.id)], ["Job", clean(job.name)], ["Action", add ? "Assigned" : "Removed"]],
    });
  }
  if (sub === "profile") {
    const row = await db.one(`SELECT m.*,r.name rank,c.name category,r.weekly_seconds
      FROM staff_roster_members m LEFT JOIN staff_roster_ranks r ON r.id=m.rank_id LEFT JOIN staff_roster_categories c ON c.id=r.category_id WHERE m.discord_id=?`, [user.id]);
    if (!row) throw new Error("That member has no roster record.");
    const [discipline, historyRows, hours, jobs] = await Promise.all([
      db.query("SELECT * FROM staff_roster_discipline WHERE discord_id=? ORDER BY created_at DESC LIMIT 10", [user.id]),
      db.query("SELECT * FROM staff_roster_history WHERE discord_id=? ORDER BY created_at DESC LIMIT 10", [user.id]),
      db.one("SELECT COALESCE(SUM(CASE WHEN ended_at IS NULL THEN FLOOR((?-started_at)/1000) ELSE seconds END),0) seconds FROM staff_shifts WHERE discord_id=? AND started_at>=?", [Date.now(), user.id, Date.now() - 7 * 86400000]),
      db.query("SELECT j.name FROM staff_roster_member_jobs m JOIN staff_roster_jobs j ON j.id=m.job_id WHERE m.discord_id=? ORDER BY j.sort_order,j.name", [user.id]),
    ]);
    return card(`Roster profile: ${clean(user.username)}`, {
      description: `${mention(user.id)}\n\`${user.id}\``,
      rows: [
        ["Rank", clean(row.rank || row.rank_name) || "None"],
        ["Category", clean(row.category) || "Uncategorized"],
        ["Callsign", row.callsign ? String(row.callsign) : "Unassigned"],
        ["Status", humanize(row.status)],
        ["Weekly hours", `${(Number(hours?.seconds || 0) / 3600).toFixed(1)} of ${(Number(row.weekly_seconds || 0) / 3600).toFixed(1)}`],
        ["Tickets handled", String(row.tickets_handled || 0)],
        ["Jobs", jobs.map((j) => clean(j.name)).join(", ") || "None", false],
        ["Note", clean(row.activity_note, 500) || "None", false],
        ["Discipline", chunkLines(discipline.map((d) => `\`#${d.id}\` · ${humanize(d.kind)} · ${d.revoked_at ? "revoked" : "active"} · ${clean(d.reason, 100)}`))[0] || "None", false],
        ["Recent history", chunkLines(historyRows.map((h) => `${humanize(h.action)} · ${when(h.created_at)}`))[0] || "None", false],
      ],
    });
  }
  if (sub === "add") {
    const rank = await rankById(i.options.getInteger("rank", true));
    let callsign = i.options.getInteger("callsign");
    if (callsign) await checkCallsign(callsign, rank, user.id);
    const previous = await db.one("SELECT callsign,status FROM staff_roster_members WHERE discord_id=?", [user.id]);
    const keep = previous?.callsign && Number(previous.callsign) >= Number(rank.callsign_start) && Number(previous.callsign) <= Number(rank.callsign_end);
    callsign ||= keep ? Number(previous.callsign) : await nextCallsign(rank);
    const displayName = user.globalName || user.username;
    await db.query(`INSERT INTO staff_roster_members(discord_id,display_name,username,rank_name,rank_id,callsign,status,joined_at,rank_changed_at,updated_at,added_by)
      VALUES(?,?,?,?,?,?,'active',?,?,?,?) ON DUPLICATE KEY UPDATE display_name=VALUES(display_name),username=VALUES(username),rank_name=VALUES(rank_name),rank_id=VALUES(rank_id),callsign=VALUES(callsign),status='active',rank_changed_at=VALUES(rank_changed_at),updated_at=VALUES(updated_at),removed_at=NULL,removed_by=NULL,removal_reason=NULL`,
    [user.id, displayName, user.username, rank.name, rank.id, callsign, Date.now(), Date.now(), Date.now(), i.user.id]);
    await history(user.id, "add_or_update", { rank: rank.id, callsign });
    if (rank.discord_role_id && rank.discord_guild_id) {
      const guild = client.guilds.cache.get(String(rank.discord_guild_id));
      const member = await guild?.members.fetch(user.id).catch(() => null);
      if (member) await member.roles.add(String(rank.discord_role_id), "FBRP staff roster rank").catch(() => {});
    }
    await setStaffTeamRole(user.id, true);
    if (previous?.status === "removed" || Number(previous?.callsign) !== Number(callsign)) await announceCallsign(user.id, callsign);
    await log(i.guild, {
      title: "Roster member saved",
      color: COLORS.success,
      actor: i.user.id,
      target: user.id,
      fields: [["Rank", rank.name], ["Callsign", String(callsign)]],
    }, "roster");
    return card("Roster member saved", {
      color: COLORS.success,
      rows: [["Member", who(user.id)], ["Rank", rank.name], ["Callsign", String(callsign)]],
    });
  }
  if (sub === "remove") {
    const reason = clean(i.options.getString("reason", true), 300);
    await db.query("UPDATE staff_roster_members SET status='removed',callsign=NULL,removed_at=?,removed_by=?,removal_reason=?,updated_at=? WHERE discord_id=?", [Date.now(), i.user.id, reason, Date.now(), user.id]);
    await history(user.id, "remove", { reason });
    await setStaffTeamRole(user.id, false);
    await log(i.guild, {
      title: "Roster member removed",
      color: COLORS.warning,
      actor: i.user.id,
      target: user.id,
      fields: [["Reason", reason, false]],
    }, "roster");
    return card("Roster member removed", { color: COLORS.warning, rows: [["Member", who(user.id)], ["Reason", reason, false]] });
  }
  if (sub === "status") {
    const status = i.options.getString("status", true);
    await db.query("UPDATE staff_roster_members SET status=?,updated_at=? WHERE discord_id=?", [status, Date.now(), user.id]);
    await history(user.id, "status", { status });
    await log(i.guild, { title: "Roster status changed", color: COLORS.primary, actor: i.user.id, target: user.id, fields: [["Status", humanize(status)]] }, "roster");
    return card("Roster status updated", { color: COLORS.success, rows: [["Member", who(user.id)], ["Status", humanize(status)]] });
  }
  if (sub === "callsign") {
    const row = await db.one(`SELECT m.*,r.id rank_id,c.name category_name,c.callsign_start,c.callsign_end FROM staff_roster_members m JOIN staff_roster_ranks r ON r.id=m.rank_id JOIN staff_roster_categories c ON c.id=r.category_id WHERE m.discord_id=?`, [user.id]);
    if (!row) throw new Error("That member is not on the roster.");
    const callsign = i.options.getInteger("callsign") || await nextCallsign(row);
    await checkCallsign(callsign, row, user.id);
    await db.query("UPDATE staff_roster_members SET callsign=?,updated_at=? WHERE discord_id=?", [callsign, Date.now(), user.id]);
    await history(user.id, "callsign", { from: row.callsign, to: callsign });
    if (Number(row.callsign) !== Number(callsign)) await announceCallsign(user.id, callsign);
    await log(i.guild, {
      title: "Callsign changed",
      color: COLORS.primary,
      actor: i.user.id,
      target: user.id,
      fields: [["Previous", row.callsign ? String(row.callsign) : "None"], ["New", String(callsign)]],
    }, "roster");
    return card("Callsign updated", {
      color: COLORS.success,
      rows: [["Member", who(user.id)], ["Previous", row.callsign ? String(row.callsign) : "None"], ["New", String(callsign)]],
    });
  }
  if (sub === "note") {
    const note = clean(i.options.getString("note", true), 500);
    await db.query("UPDATE staff_roster_members SET activity_note=?,updated_at=? WHERE discord_id=?", [note, Date.now(), user.id]);
    await history(user.id, "note", { note });
    await log(i.guild, { title: "Roster note updated", color: COLORS.primary, actor: i.user.id, target: user.id, fields: [["Note", note, false]] }, "roster");
    return card("Roster note updated", { color: COLORS.success, rows: [["Member", who(user.id)], ["Note", note, false]] });
  }
  const kind = i.options.getString("kind", true), reason = clean(i.options.getString("reason", true), 500);
  const result = await db.query("INSERT INTO staff_roster_discipline(discord_id,kind,reason,actor_id,created_at) VALUES(?,?,?,?,?)", [user.id, kind, reason, i.user.id, Date.now()]);
  await history(user.id, "discipline", { id: result.insertId, kind, reason });
  await dm(user, `Staff ${kind} in ${i.guild.name}`, [["Record", `${humanize(kind)} #${result.insertId}`], ["Reason", reason, false]]);
  await log(i.guild, {
    title: "Staff discipline issued",
    color: COLORS.warning,
    actor: i.user.id,
    target: user.id,
    fields: [["Record", `${humanize(kind)} #${result.insertId}`], ["Reason", reason, false]],
  }, "roster");
  return card("Staff discipline issued", {
    color: COLORS.warning,
    rows: [["Member", who(user.id)], ["Record", `${humanize(kind)} #${result.insertId}`], ["Reason", reason, false]],
  });
}

async function userinfoCommand(i) {
  await requirePermission(i, "fbrp.investigate");
  const user = i.options.getUser("member", true),
    cutoff = Date.now() - 30 * 86400000;
  const [players, groups, orgs, cases, discipline, hours] = await Promise.all([
    db.query(
      "SELECT id,name,license,last_seen FROM players WHERE discord_id=? ORDER BY last_seen DESC LIMIT 5",
      [user.id],
    ),
    db.query(
      "SELECT DISTINCT group_name FROM ace_memberships WHERE discord_id=? ORDER BY group_name",
      [user.id],
    ),
    db.query(
      "SELECT o.name FROM organization_members m JOIN organizations o ON o.id=m.org_id WHERE m.discord_id=? AND o.active=TRUE ORDER BY o.name",
      [user.id],
    ),
    db.query(
      "SELECT id,action,reason,created_at FROM moderation_cases WHERE target_id=? ORDER BY id DESC LIMIT 5",
      [user.id],
    ),
    db.query(
      "SELECT id,kind,reason,created_at FROM staff_roster_discipline WHERE discord_id=? AND revoked_at IS NULL ORDER BY id DESC LIMIT 5",
      [user.id],
    ),
    db.one(
      "SELECT COALESCE(SUM(CASE WHEN ended_at IS NULL THEN FLOOR((?-started_at)/1000) ELSE seconds END),0) seconds FROM staff_shifts WHERE discord_id=? AND started_at>=?",
      [Date.now(), user.id, cutoff],
    ),
  ]);
  return card(`User information: ${clean(user.username)}`, {
    description: `${mention(user.id)}\n\`${user.id}\``,
    rows: [
      ["Staff time", `${(Number(hours?.seconds || 0) / 3600).toFixed(1)} hours`],
      ["ACE groups", groups.map((row) => `\`${row.group_name}\``).join(" ") || "None", false],
      ["Game identities", chunkLines(players.map((row) => `\`#${row.id}\` · ${clean(row.name)} · last seen ${new Date(row.last_seen).toISOString().slice(0, 10)}`))[0] || "None linked", false],
      ["Organizations", chunkLines(orgs.map((row) => clean(row.name)))[0] || "None", false],
      ["Recent cases", chunkLines(cases.map((row) => `\`#${row.id}\` · ${humanize(row.action)} · ${clean(row.reason, 80)}`))[0] || "None", false],
      ["Active staff discipline", chunkLines(discipline.map((row) => `\`#${row.id}\` · ${humanize(row.kind)} · ${clean(row.reason, 80)}`))[0] || "None", false],
    ],
    footer: "Florida Bay Roleplay \u00b7 Staff time covers 30 days",
  });
}

async function officeCommand(i, sub) {
  await requirePermission(i, "fbrp.office.manage");
  if (sub === "list") {
    const rows = await db.query(
      "SELECT * FROM offices WHERE guild_id=? ORDER BY set_at",
      [i.guildId],
    );
    return card("Office ownership", {
      description:
        rows.map((row) => `<#${row.channel_id}> · ${mention(row.owner_id)}`).join("\n") || "No offices assigned.",
    });
  }
  const channel = i.options.getChannel("channel", true);
  if (channel.type !== ChannelType.GuildVoice)
    throw new Error("Choose a voice channel.");
  if (sub === "clear") {
    const row = await db.one(
      "SELECT owner_id FROM offices WHERE guild_id=? AND channel_id=?",
      [i.guildId, channel.id],
    );
    await db.query("DELETE FROM offices WHERE guild_id=? AND channel_id=?", [
      i.guildId,
      channel.id,
    ]);
    if (row)
      await channel.permissionOverwrites
        .delete(row.owner_id, "Office assignment cleared")
        .catch(() => {});
    return card("Office cleared", { color: COLORS.warning, rows: [["Office", `${channel}`], ["Owner", "Unassigned"]] });
  }
  const user = i.options.getUser("member", true);
  const previous = await db.one(
    "SELECT owner_id FROM offices WHERE guild_id=? AND channel_id=?",
    [i.guildId, channel.id],
  );
  if (previous && String(previous.owner_id) !== user.id)
    await channel.permissionOverwrites
      .delete(String(previous.owner_id), "Office owner replaced")
      .catch(() => {});
  await db.query(
    "INSERT INTO offices(guild_id,channel_id,owner_id,set_by,set_at) VALUES(?,?,?,?,?) ON DUPLICATE KEY UPDATE owner_id=VALUES(owner_id),set_by=VALUES(set_by),set_at=VALUES(set_at)",
    [i.guildId, channel.id, user.id, i.user.id, Date.now()],
  );
  await channel.permissionOverwrites.edit(
    user.id,
    {
      ViewChannel: true,
      Connect: true,
      ManageChannels: true,
      MoveMembers: true,
    },
    "Florida Bay office owner",
  );
  await audit(i.user.id, "office.set", channel.id, { owner: user.id });
  return card("Office owner assigned", { color: COLORS.success, rows: [["Office", `${channel}`], ["Owner", who(user.id)]] });
}

async function vmenuCommand(i, sub) {
  await requirePermission(i, "fbrp.perms.manage");
  if (sub === "catalog") return aceListPayload(0, "vmenu");
  const name = group(i.options.getString("group", true));
  const exists = await db.one("SELECT name FROM ace_groups WHERE name=?", [name]);
  if (!exists) throw new Error("ACE group not found.");
  if (sub === "show") {
    const rows = await db.query("SELECT object,mode FROM ace_entries WHERE group_name=? AND object LIKE 'vMenu.%' ORDER BY object", [name]);
    return card(`vMenu permissions: ${name}`, {
      description: chunkLines(rows.map((row) => `\`${row.object}\` · **${row.mode}**`), 3900)[0] || "No vMenu permissions assigned.",
    });
  }
  requireOwner(i, "edit vMenu ACE permissions");
  if (sub === "permission") {
    const object = clean(i.options.getString("permission", true), 120);
    const mode = i.options.getString("mode", true);
    if (!/^vMenu\.[A-Za-z0-9.*_-]+$/.test(object)) throw new Error("The permission must begin with `vMenu.` and contain only supported characters.");
    if (mode === "remove") await db.query("DELETE FROM ace_entries WHERE group_name=? AND object=?", [name, object]);
    else await db.query("INSERT INTO ace_entries(group_name,object,mode) VALUES(?,?,?) ON DUPLICATE KEY UPDATE mode=VALUES(mode)", [name, object, mode]);
    await audit(i.user.id, "vmenu.permission", name, { object, mode });
    await refreshGame();
    await log(i.guild, { title: mode === "remove" ? "vMenu permission removed" : `vMenu permission set to ${mode}`, color: mode === "allow" ? COLORS.success : COLORS.warning, actor: i.user.id, fields: [["Group", `\`${name}\``], ["Permission", `\`${object}\``]] }, "role_sync");
    return card("vMenu permission updated", { color: COLORS.success, rows: [["Group", `\`${name}\``], ["Permission", `\`${object}\``], ["Mode", mode]] });
  }
  const bundle = i.options.getString("bundle", true);
  const mode = i.options.getString("mode", true);
  const objects = VMENU_BUNDLES[bundle];
  await db.transaction(async (query) => {
    for (const object of objects) {
      if (mode === "grant") await query("INSERT INTO ace_entries(group_name,object,mode) VALUES(?,?,'allow') ON DUPLICATE KEY UPDATE mode='allow'", [name, object]);
      else await query("DELETE FROM ace_entries WHERE group_name=? AND object=?", [name, object]);
    }
  });
  await audit(i.user.id, "vmenu.bundle", name, { bundle, mode });
  await refreshGame();
  await log(i.guild, { title: mode === "grant" ? "vMenu bundle granted" : "vMenu bundle revoked", color: mode === "grant" ? COLORS.success : COLORS.warning, actor: i.user.id, fields: [["Group", `\`${name}\``], ["Bundle", `\`${bundle}\``], ["Permissions", String(objects.length)]] }, "role_sync");
  return card("vMenu bundle updated", { color: COLORS.success, rows: [["Group", `\`${name}\``], ["Bundle", `\`${bundle}\``], ["Action", mode === "grant" ? "Granted" : "Revoked"], ["Permissions", String(objects.length)]] });
}

/* --------------------------------- /global --------------------------------- */
const CENSORED_ROLE = "FBRP | Censored";
const blacklistPending = new Set();
// The support (ticket panel) channel stays readable so a blacklisted member can open a ticket.
const SUPPORT_ACCESS = { ViewChannel: true, ReadMessageHistory: true, SendMessages: false };
const VOICE_ACCESS = { ViewChannel: true, Connect: true, Speak: true, Stream: true, UseVAD: true };
const GLOBAL_ACE = {
  warn: "fbrp.global.warn",
  timeout: "fbrp.global.timeout",
  untimeout: "fbrp.global.timeout",
  kick: "fbrp.global.kick",
  ban: "fbrp.global.ban",
  blacklist: "fbrp.global.blacklist",
  unblacklist: "fbrp.global.blacklist",
  unban: "fbrp.global.unban",
  invite: "fbrp.global.invite",
  restore: "fbrp.global.restore",
  lookup: "fbrp.global.lookup",
};
const GLOBAL_LOG = { ban: "bans", unban: "unbans", blacklist: "blacklists", unblacklist: "blacklists" };

async function mainGuild() {
  const row = await db.one("SELECT guild_id FROM network_guilds WHERE kind='main' ORDER BY added_at LIMIT 1");
  return row ? client.guilds.cache.get(String(row.guild_id)) || null : null;
}

const activeGlobal = (userId, action) =>
  db.one(
    "SELECT id,ban_id,expires_at,game_ban_id FROM moderation_cases WHERE guild_id='global' AND target_id=? AND action=? AND active=TRUE ORDER BY id DESC LIMIT 1",
    [String(userId), action],
  );

function parseDuration(raw) {
  const match = String(raw || "").trim().toLowerCase().match(/^(\d{1,5})\s*(s|m|h|d|w)$/);
  if (!match) return null;
  return Number(match[1]) * { s: 1000, m: 60000, h: 3600000, d: 86400000, w: 604800000 }[match[2]];
}

/** True when a role overwrite already grants/denies exactly the requested flags. */
function overwriteMatches(channel, roleId, permissions) {
  const current = channel.permissionOverwrites.cache.get(roleId);
  if (!current) return false;
  return Object.entries(permissions).every(([flag, value]) => (value ? current.allow.has(flag) : current.deny.has(flag)));
}

/** Creates or repairs the isolation role: no permissions, every channel hidden except support and waiting rooms. */
async function ensureCensoredRole(guild, only = null) {
  await guild.roles.fetch();
  let role = guild.roles.cache.find((r) => r.name === CENSORED_ROLE) || null;
  if (role?.managed) throw new Error(`The existing ${CENSORED_ROLE} role is managed by an integration and cannot be used.`);
  if (!role) role = await guild.roles.create({ name: CENSORED_ROLE, permissions: [], reason: "FBRP global blacklist isolation role" });
  if (!role.editable) throw new Error(`Move the bot role above ${CENSORED_ROLE}, then try again.`);
  if (role.permissions.bitfield !== 0n) await role.setPermissions(0n, "FBRP global blacklist roles have no server-wide permissions");
  const binding = await db.one("SELECT channel_id FROM discord_channel_bindings WHERE purpose='ticket_panel' AND guild_id=?", [guild.id]);
  if (!only) await guild.channels.fetch().catch(() => {});
  const support =
    (binding && guild.channels.cache.get(String(binding.channel_id))) ||
    guild.channels.cache.find((ch) => ch.type === ChannelType.GuildText && /support/i.test(ch.name)) ||
    null;
  if (!support) throw new Error("No support channel was found in the main server. Post the ticket panel there first.");
  const waiting = new Set(guild.channels.cache.filter((ch) => ch.isVoiceBased() && /waiting/i.test(ch.name)).map((ch) => ch.id));
  let failed = 0;
  for (const ch of only ? [only] : guild.channels.cache.values()) {
    if (ch.isThread?.() || !ch.permissionOverwrites) continue;
    const permissions = ch.id === support.id ? SUPPORT_ACCESS : waiting.has(ch.id) ? VOICE_ACCESS : { ViewChannel: false };
    if (overwriteMatches(ch, role.id, permissions)) continue;
    const ok = await ch.permissionOverwrites
      .edit(role.id, permissions, { reason: "FBRP global blacklist channel isolation" })
      .then(() => true, () => false);
    if (!ok) failed++;
  }
  if (failed) throw new Error(`The bot could not set ${failed} channel overwrite${failed === 1 ? "" : "s"} for ${CENSORED_ROLE}.`);
  return { role, support };
}

/** Strips every ordinary role from a main-server member and leaves only the isolation role. */
async function censorMember(member, reason) {
  if (!member.manageable) throw new Error("The member is above the bot, so their main-server roles cannot be removed.");
  const { role } = await ensureCensoredRole(member.guild);
  const managed = member.roles.cache.filter((r) => r.managed).map((r) => r.id);
  await member.roles.set([role.id, ...managed], reason.slice(0, 500));
  const tickets = new Set(
    (await db.query("SELECT channel_id FROM support_tickets WHERE author_id=? AND status='open' AND channel_id IS NOT NULL", [member.id])).map((row) => String(row.channel_id)),
  );
  for (const ch of member.guild.channels.cache.values())
    if (ch.permissionOverwrites?.cache.has(member.id) && !tickets.has(ch.id))
      await ch.permissionOverwrites.delete(member.id, "FBRP global blacklist removed member-specific channel access").catch(() => {});
  return role;
}

/** Runs one action in every network server and reports each outcome ("✓ …", "✗ …", or null to skip). */
async function acrossNetwork(fn, { skipMain = false } = {}) {
  const results = [];
  let ok = 0;
  const main = skipMain ? await mainGuild() : null;
  for (const row of await networkRows()) {
    if (main && String(row.guild_id) === main.id) continue;
    const guild = client.guilds.cache.get(String(row.guild_id));
    if (!guild) {
      results.push(`⚠️ ${clean(row.name, 80)} · bot not in server`);
      continue;
    }
    const result = await fn(guild).catch((error) => `✗ ${clean(error?.message || "failed", 80)}`);
    if (result === null) continue;
    if (result.startsWith("✓")) ok++;
    results.push(`${result.slice(0, 1)} **${clean(guild.name, 80)}**${result.length > 1 ? ` · ${result.slice(1).trim()}` : ""}`);
  }
  return { results, ok };
}

/** Parses the JSON role array kept in discord_member_cache/pending restores. */
function storedRoleIds(value) {
  if (Array.isArray(value)) return value.map(String);
  try {
    const parsed = JSON.parse(String(value || "[]"));
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

/** Saves each live membership before /global blacklist removes any roles or bans the member. */
async function captureRoleRestoreSnapshots(discordId, actorId) {
  let captured = 0;
  for (const row of await networkRows()) {
    const guild = client.guilds.cache.get(String(row.guild_id));
    const member = await guild?.members.fetch(String(discordId)).catch(() => null);
    if (!member) continue;
    const roles = [...member.roles.cache.keys()];
    await db.query(
      `INSERT INTO discord_role_restore_snapshots(guild_id,discord_id,roles,captured_by,captured_at,source)
       VALUES(?,?,?,?,?,'global_blacklist')
       ON DUPLICATE KEY UPDATE roles=VALUES(roles),captured_by=VALUES(captured_by),captured_at=VALUES(captured_at),source=VALUES(source)`,
      [guild.id, String(discordId), JSON.stringify(roles), String(actorId), Date.now()],
    );
    captured++;
  }
  await audit(actorId, "global.blacklist.role_snapshot", discordId, { captured });
  return captured;
}

/**
 * Backfills the main-server snapshot for blacklists performed before snapshot storage existed.
 * Discord's role-update audit entry contains the exact roles removed by censorMember.
 */
async function recoverLegacyBlacklistSnapshots(discordId, actorId) {
  const latest = await db.one(
    "SELECT created_at FROM moderation_cases WHERE guild_id='global' AND target_id=? AND action='blacklist' ORDER BY id DESC LIMIT 1",
    [String(discordId)],
  );
  if (!latest) return 0;
  let recovered = 0;
  for (const row of await networkRows()) {
    if (await db.one("SELECT 1 FROM discord_role_restore_snapshots WHERE guild_id=? AND discord_id=?", [String(row.guild_id), String(discordId)])) continue;
    const guild = client.guilds.cache.get(String(row.guild_id));
    if (!guild) continue;
    const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.MemberRoleUpdate, limit: 100 }).catch(() => null);
    const removed = new Set();
    for (const entry of logs?.entries.values() || []) {
      if (String(entry.targetId) !== String(discordId) || String(entry.executorId) !== String(client.user.id)) continue;
      if (entry.createdTimestamp + 10000 < Number(latest.created_at)) continue;
      for (const change of entry.changes || [])
        if (change.key === "$remove" && Array.isArray(change.new))
          for (const role of change.new) if (role?.id) removed.add(String(role.id));
    }
    if (!removed.size) continue;
    const cached = await db.one("SELECT roles FROM discord_member_cache WHERE guild_id=? AND discord_id=?", [guild.id, String(discordId)]);
    const roles = [...new Set([guild.id, ...storedRoleIds(cached?.roles), ...removed])]
      .filter((id) => guild.roles.cache.get(id)?.name !== CENSORED_ROLE);
    await db.query(
      `INSERT INTO discord_role_restore_snapshots(guild_id,discord_id,roles,captured_by,captured_at,source)
       VALUES(?,?,?,?,?,'audit_recovery')`,
      [guild.id, String(discordId), JSON.stringify(roles), String(actorId), Date.now()],
    );
    recovered++;
  }
  return recovered;
}

/** Restores the ACE source of any global-sync roles present in saved snapshots. */
async function restoreSyncedMemberships(discordId, snapshots, actorId) {
  const groups = new Set();
  for (const snapshot of snapshots) {
    const ids = storedRoleIds(snapshot.roles);
    if (!ids.length) continue;
    const rows = await db.query(
      `SELECT DISTINCT s.group_name FROM network_sync_roles r
       JOIN network_syncs s ON s.id=r.sync_id
       WHERE r.guild_id=? AND r.role_id IN (${ids.map(() => "?").join(",")})`,
      [String(snapshot.guild_id), ...ids],
    );
    for (const row of rows) groups.add(String(row.group_name));
  }
  for (const groupName of groups)
    await db.query(
      "INSERT IGNORE INTO ace_memberships(discord_id,group_name,origin,added_by,added_at) VALUES(?,?,'manual',?,?)",
      [String(discordId), groupName, String(actorId), Date.now()],
    );
  return [...groups];
}

/** Creates a private, single-use member invite in one network server. */
async function createMemberInvite(guild, target, reason, maxAge = 600) {
  if (await guild.members.fetch(target.id).catch(() => null)) return { state: "member" };
  if (await guild.bans.fetch(target.id).catch(() => null)) return { state: "banned" };
  const channel = inviteChannel(guild);
  if (!channel) return { state: "failed", detail: "no channel where the bot can create an invite" };
  const created = await channel.createInvite({
    maxAge,
    maxUses: 1,
    unique: true,
    reason: reason.slice(0, 512),
  }).catch((error) => ({ error }));
  if (!created?.url)
    return { state: "failed", detail: clean(created?.error?.message || "could not create invite", 100) };
  return { state: "invited", invite: created };
}

/** Applies and consumes one /global restore snapshot for a member. */
async function applyPendingRoleRestore(member) {
  const pending = await db.one(
    "SELECT roles,requested_by,expires_at FROM discord_pending_role_restores WHERE guild_id=? AND discord_id=?",
    [member.guild.id, member.id],
  );
  if (!pending) return null;
  if (Number(pending.expires_at) < Date.now()) {
    await db.query("DELETE FROM discord_pending_role_restores WHERE guild_id=? AND discord_id=?", [member.guild.id, member.id]);
    return { restored: 0, skipped: 0, expired: true };
  }
  await member.guild.roles.fetch().catch(() => {});
  const wanted = [...new Set(storedRoleIds(pending.roles))];
  const roles = wanted
    .map((id) => member.guild.roles.cache.get(id))
    .filter((role) => role && role.id !== member.guild.id && !role.managed && role.editable && role.name !== CENSORED_ROLE);
  const missing = roles.filter((role) => !member.roles.cache.has(role.id));
  if (missing.length) await member.roles.add(missing, `/global restore requested by ${pending.requested_by}`);
  await db.query("DELETE FROM discord_pending_role_restores WHERE guild_id=? AND discord_id=?", [member.guild.id, member.id]);
  await db.query("DELETE FROM discord_role_restore_snapshots WHERE guild_id=? AND discord_id=?", [member.guild.id, member.id]);
  await audit(pending.requested_by, "global.restore.applied", member.id, {
    guild: member.guild.id,
    restored: missing.map((role) => role.id),
    skipped: wanted.length - roles.length,
  });
  await log(member.guild, {
    title: "Global role restore applied",
    color: COLORS.success,
    actor: pending.requested_by,
    target: member.id,
    fields: [
      ["Restored", missing.map((role) => roleRef(role.id)).join(" ") || "No missing roles"],
      ["Unavailable / unmanaged", String(wanted.length - roles.length)],
    ],
  }, "role_sync");
  return { restored: missing.length, skipped: wanted.length - roles.length, expired: false };
}

/** One network-wide case (guild_id 'global'), audited and posted to the matching log channel. */
async function globalCase(target, actor, action, reason, durationMs, results, gameBanId = null) {
  const stamp = Date.now();
  const text = clean(reason || "No reason provided.", 300);
  const inserted = await db.query(
    "INSERT INTO moderation_cases(guild_id,target_id,actor_id,action,reason,expires_at,created_at,active,duration_ms,game_ban_id) VALUES('global',?,?,?,?,?,?,?,?,?)",
    [String(target), String(actor), action, text, durationMs ? stamp + durationMs : null, stamp, !["unban", "untimeout", "kick", "unblacklist"].includes(action), durationMs || null, gameBanId],
  );
  const id = Number(inserted.insertId);
  const banId = publicCaseId(id);
  await db.query("UPDATE moderation_cases SET ban_id=? WHERE id=?", [banId, id]);
  await audit(actor, `global.${action}`, target, { caseId: id, banId, reason: text, durationMs, gameBanId, results });
  const lifting = action.startsWith("un");
  await log((await mainGuild()) || client.guilds.cache.first(), {
    title: `${banId} · ${humanize(action)}`,
    description: "Applied across the Florida Bay network.",
    server: false,
    color: lifting ? COLORS.success : ["ban", "blacklist"].includes(action) ? COLORS.danger : COLORS.warning,
    actor,
    target,
    fields: [
      ["Status", durationMs ? `Until ${when(stamp + durationMs)}` : lifting || action === "kick" ? "Lifted / one-off" : "Active"],
      ...(gameBanId ? [["Game ban", `#${gameBanId}`]] : []),
      ["Reason", text, false],
      ["Servers", results.join("\n") || "Recorded on the network record", false],
    ],
    footer: `Florida Bay Roleplay · ${banId}`,
  }, GLOBAL_LOG[action] || "moderation");
  return id;
}

async function notifyGlobal(userId, action, reason, until = null, banId = null) {
  const user = await client.users.fetch(String(userId)).catch(() => null);
  if (!user) return;
  await dm(
    user,
    `Florida Bay network ${action}`,
    [
      ...(banId ? [["Case ID", `\`${banId}\``]] : []),
      ["Reason", clean(reason, 300) || "No reason provided.", false],
      ...(until ? [["Ends", when(until)]] : []),
      ...(["ban", "blacklist"].includes(action) ? [["Appeal", "Open a **Ban Appeal** ticket from the Florida Bay support panel.", false]] : []),
    ],
    COLORS.warning,
    "A moderation action was applied across **every Florida Bay Discord server**.",
  );
}

/** Every stored game identifier for a Discord user, in the formats EasyAdmin bans by. */
async function gameIdentifiers(discordId) {
  const rows = await db.query(
    "SELECT p.license,i.identifier FROM players p LEFT JOIN player_identifiers i ON i.player_id=p.id WHERE p.discord_id=?",
    [String(discordId)],
  );
  const ids = new Set([`discord:${discordId}`]);
  for (const row of rows) {
    if (row.license) ids.add(String(row.license).includes(":") ? String(row.license) : `license:${row.license}`);
    if (/^(license|license2|discord|fivem|steam|live|xbl):[A-Za-z0-9]+$/.test(String(row.identifier || ""))) ids.add(String(row.identifier));
  }
  return { ids: [...ids], linked: rows.length > 0 };
}

const MAX_ALT_BANS = 15;

/** Bans one user in every network server (pre-emptively when they are not a member), as /global ban does. */
function banAcrossNetwork(userId, reason, deleteMessageSeconds = 0) {
  return acrossNetwork(async (g) => {
    const m = await g.members.fetch(userId).catch(() => null);
    if (m && !m.bannable) return "✗ member is above the bot";
    await g.members.ban(userId, { reason: `Florida Bay global ban: ${reason || "no reason"}`.slice(0, 512), deleteMessageSeconds });
    return m ? "✓" : "✓ pre-emptive (not a member)";
  });
}

/**
 * Splits linked accounts into those that may be banned and those left alone (with why).
 * Accounts that already have a global ban/blacklist, or that `skip` names, are dropped quietly.
 */
async function screenAlts(linked, skip = new Set()) {
  const bannable = [];
  const skipped = [];
  for (const alt of linked?.alts || []) {
    if (skip.has(alt.discordId)) continue;
    if ((await activeGlobal(alt.discordId, "ban")) || (await activeGlobal(alt.discordId, "blacklist"))) continue;
    let why = null;
    if (alt.discordId === OWNER_DISCORD_ID || superuserIds().has(alt.discordId)) why = "bot owner";
    else if ((await staffLevel(alt.discordId)) >= 0) why = "has a staff rank";
    else if (await db.one("SELECT 1 FROM discord_security_exemption_scopes WHERE discord_id=? AND guild_id='*' LIMIT 1", [alt.discordId])) why = "security-exempt";
    if (why) skipped.push({ ...alt, why });
    else bannable.push(alt);
  }
  return { bannable, skipped };
}

/**
 * Applies a global ban to each linked account, recorded as its own case tied to `rootCaseId`.
 * With `game`, each alt is also banned through EasyAdmin by their own identifiers.
 */
async function banLinkedAlts(alts, { rootCaseId, actorId, reason, durationMs = null, game = false }) {
  const rootBan = publicCaseId(rootCaseId);
  const lines = [];
  for (const alt of alts.slice(0, MAX_ALT_BANS)) {
    const label = alt.strength === "strong" ? "linked account" : "shared IP";
    try {
      const why = clean(`Alt of ${rootBan} (${alt.evidence.join(", ")}) · ${reason || "no reason"}`, 300);
      const { results, ok } = await banAcrossNetwork(alt.discordId, why);
      let gameBanId = null;
      if (game) {
        const { ids } = await gameIdentifiers(alt.discordId);
        const banned = await callGame("/ban", {
          identifiers: ids,
          reason: `${clean(why, 200)} (Florida Bay global ban)`,
          seconds: durationMs ? Math.round(durationMs / 1000) : null,
          banner: "Florida Bay alt detection",
          discord: alt.discordId,
        }).catch(() => null);
        gameBanId = banned?.ok && banned.banid ? Number(banned.banid) : null;
        results.push(gameBanId ? `✓ **FiveM** · EasyAdmin ban #${gameBanId}` : "✗ **FiveM** · game ban failed");
      }
      const id = await globalCase(alt.discordId, actorId, "ban", why, durationMs, results, gameBanId);
      await db.query("UPDATE moderation_cases SET source_case_id=? WHERE id=?", [rootCaseId, id]);
      await notifyGlobal(alt.discordId, "ban", `This account is linked to a globally banned account (${rootBan}). ${reason || ""}`, durationMs ? Date.now() + durationMs : null, publicCaseId(id));
      lines.push(`${ok ? "✓" : "✗"} ${mention(alt.discordId)} · ${label} · \`${publicCaseId(id)}\``);
    } catch (error) {
      console.error(`[FBRP global] alt ban ${alt.discordId} (${rootBan}):`, error);
      lines.push(`✗ ${mention(alt.discordId)} · ${label} · ${clean(error?.message || "failed", 80)}`);
    }
  }
  for (const alt of alts.slice(MAX_ALT_BANS))
    lines.push(`• ${mention(alt.discordId)} · not banned yet (limit of ${MAX_ALT_BANS} per run; the next sweep continues)`);
  return lines;
}

let altSweepBusy = false;
/** Bans accounts that became linked to a banned user after the ban (new Discord on the same game account, etc.). */
async function sweepLinkedAlts() {
  if (altSweepBusy) return;
  altSweepBusy = true;
  try {
    const roots = await db.query(
      "SELECT id,target_id,reason,expires_at,game_ban_id FROM moderation_cases WHERE guild_id='global' AND action='ban' AND active=TRUE AND alt_scan=TRUE AND source_case_id IS NULL",
    );
    for (const root of roots) {
      const remaining = root.expires_at ? Number(root.expires_at) - Date.now() : null;
      if (remaining !== null && remaining <= 0) continue;
      // Anyone already derived from this ban (even if since appealed) is left alone.
      const done = new Set((await db.query("SELECT target_id FROM moderation_cases WHERE source_case_id=?", [root.id])).map((row) => String(row.target_id)));
      const { bannable } = await screenAlts(await findLinkedAccounts(db, root.target_id), done);
      if (!bannable.length) continue;
      await banLinkedAlts(bannable, { rootCaseId: Number(root.id), actorId: client.user.id, reason: root.reason, durationMs: remaining, game: Boolean(root.game_ban_id) });
    }
  } finally {
    altSweepBusy = false;
  }
}

/** Lifts a user's network blacklist (isolation role in main, bans elsewhere unless still globally banned). */
async function liftGlobalBlacklist(id, actorId, auditReason, reason) {
  await db.query("UPDATE moderation_cases SET active=FALSE WHERE guild_id='global' AND target_id=? AND action='blacklist' AND active=TRUE", [id]);
  invalidateBlacklistCache();
  const stillBanned = await activeGlobal(id, "ban");
  const { results, ok } = await acrossNetwork(async (g) => {
    const main = await mainGuild();
    if (g.id === main?.id) {
      const member = await g.members.fetch(id).catch(() => null);
      const role = g.roles.cache.find((r) => r.name === CENSORED_ROLE);
      if (!member || !role || !member.roles.cache.has(role.id)) return null;
      await member.roles.remove(role, auditReason);
      return "✓ isolation role removed";
    }
    if (stillBanned) return "• still under global ban";
    if (!(await g.bans.fetch(id).catch(() => null))) return null;
    await g.members.unban(id, reason || "Global blacklist lifted");
    return "✓ unbanned";
  });
  const caseId = await globalCase(id, actorId, "unblacklist", reason, null, results);
  return { caseId, results, ok };
}

/**
 * Lifts every active global ban for a user across the network. `game` also removes the
 * linked EasyAdmin bans; "linked" does so only when one exists (and stays quiet otherwise).
 */
async function liftGlobalBan(id, actorId, reason, { game = false } = {}) {
  const bans = await db.query("SELECT id,game_ban_id FROM moderation_cases WHERE guild_id='global' AND target_id=? AND action='ban' AND active=TRUE", [id]);
  const linked = bans.filter((row) => row.game_ban_id);
  let liftedGame = 0;
  if (game) for (const ban of linked)
    if ((await callGame("/unban", { banid: Number(ban.game_ban_id) }).catch(() => null))?.ok) liftedGame++;
  if (game === "linked" && liftedGame < linked.length)
    throw new Error("FiveM could not lift the linked game ban (is the server online?). Nothing was changed in Discord.");
  const { results, ok } = await acrossNetwork(async (g) =>
    (await g.bans.fetch(id).catch(() => null))
      ? (await g.members.unban(id, reason || "Global ban lifted").then(() => true, () => false)) ? "✓ unbanned" : "✗ could not unban"
      : null,
  );
  await db.query("UPDATE moderation_cases SET active=FALSE WHERE guild_id='global' AND target_id=? AND action='ban' AND active=TRUE", [id]);
  if (game === true || (game === "linked" && linked.length))
    results.push(`${liftedGame ? "✓" : "•"} **FiveM** · ${liftedGame ? `${liftedGame} game ban(s) lifted` : "no linked game ban found (or FiveM core unreachable)"}`);
  // Alt accounts that were banned because of this ban follow it (unless they are blacklisted).
  const derived = bans.length
    ? await db.query("SELECT DISTINCT target_id FROM moderation_cases WHERE source_case_id IN (?) AND action='ban' AND active=TRUE", [bans.map((row) => row.id)])
    : [];
  let altsLifted = 0;
  for (const row of derived) {
    const altId = String(row.target_id);
    if (altId === String(id) || (await activeGlobal(altId, "blacklist"))) continue;
    await liftGlobalBan(altId, actorId, `Source ban lifted: ${reason || "no reason"}`, { game: Boolean(game) }).then(() => altsLifted++, (error) =>
      console.error(`[FBRP global] lift alt ${altId}:`, error.message),
    );
  }
  if (altsLifted) results.push(`✓ ${altsLifted} linked alt account${altsLifted === 1 ? "" : "s"} unbanned too`);
  const caseId = await globalCase(id, actorId, "unban", reason, null, results);
  return { caseId, results, ok };
}

/**
 * Approved website appeals lift the punishment they were filed against, whatever its source:
 * network ban/blacklist, a single Discord server ban, or an EasyAdmin game ban. The reviewer
 * needs the same permission the matching manual unban command requires.
 */
async function liftAppealedCase(caseId, actorId, response = "") {
  const c = await db.one("SELECT * FROM moderation_cases WHERE id=?", [Number(caseId)]);
  if (!c) throw new Error("The punishment for this appeal no longer exists.");
  const banId = c.ban_id || publicCaseId(c.id);
  const reason = clean(`Appeal approved for ${banId}${response ? ` · ${response}` : ""}`, 300);
  const need = async (object) => {
    if (!(await hasPermission(actorId, object)))
      throw new Error(`Approving this appeal lifts the punishment, which needs the \`${object}\` permission. Nothing was changed.`);
  };
  let results = [];
  if (!c.active) results = ["• Punishment was already inactive"];
  else if (c.guild_id === "global" && c.action === "blacklist") {
    await need(GLOBAL_ACE.unblacklist);
    ({ results } = await liftGlobalBlacklist(String(c.target_id), actorId, `Appeal ${banId} approved`, reason));
  } else if (c.guild_id === "global") {
    await need(GLOBAL_ACE.unban);
    if (await activeGlobal(c.target_id, "blacklist")) throw new Error("This member is also globally blacklisted. Appeal or lift the blacklist first.");
    ({ results } = await liftGlobalBan(String(c.target_id), actorId, reason, { game: "linked" }));
  } else if (c.guild_id === "game") {
    await need("easyadmin.player.ban.remove");
    const lifted = await callGame("/unban", { banid: Number(c.game_ban_id) }).catch(() => null);
    if (!lifted?.ok) throw new Error("FiveM could not lift the EasyAdmin ban (is the server online?). Nothing was changed.");
    await db.query("UPDATE moderation_cases SET active=FALSE WHERE id=?", [c.id]);
    results = [`✓ **FiveM** · EasyAdmin ban #${c.game_ban_id} lifted`];
  } else {
    await need("fbrp.discord.mod.ban");
    const guild = client.guilds.cache.get(String(c.guild_id));
    if (!guild) throw new Error("The bot is no longer in the server this ban was issued in.");
    if (await guild.bans.fetch(String(c.target_id)).catch(() => null))
      await guild.members.unban(String(c.target_id), reason);
    await db.query("UPDATE moderation_cases SET active=FALSE WHERE id=?", [c.id]);
    results = [`✓ **${clean(guild.name, 80)}** · unbanned`];
    await log(guild, { title: `Appeal approved · ${banId}`, color: COLORS.success, actor: actorId, target: c.target_id, fields: [["Reason", reason, false]], footer: banId }, "unbans");
  }
  await audit(actorId, "appeal.lift", c.target_id, { caseId: c.id, banId, results });
  const user = await client.users.fetch(String(c.target_id)).catch(() => null);
  if (user)
    await dm(user, "Your Florida Bay appeal was approved", [
      ["Case ID", `\`${banId}\``],
      ...(response ? [["Staff response", clean(response, 1000), false]] : []),
    ], COLORS.success, "Your punishment has been lifted. Welcome back to Florida Bay.");
  return { banId, results };
}

async function globalCommand(i, sub) {
  await requirePermission(i, GLOBAL_ACE[sub]);
  const reason = i.options.getString("reason");
  if (sub === "unban" || sub === "unblacklist") {
    const id = i.options.getString("user_id", true).replace(/\D/g, "");
    if (!/^\d{15,24}$/.test(id)) throw new Error("Enter a Discord user ID.");
    if (sub === "unblacklist") {
      if (!(await activeGlobal(id, "blacklist"))) throw new Error("That user is not globally blacklisted.");
      const { caseId, results, ok } = await liftGlobalBlacklist(id, i.user.id, `Global blacklist lifted by ${i.user.tag}`, reason);
      return card(`${publicCaseId(caseId)} · blacklist lifted`, {
        color: COLORS.success,
        description: `${mention(id)} is no longer blacklisted (${ok} server${ok === 1 ? "" : "s"} updated). Run **/global restore** to give back their saved roles in every server.`,
        rows: [["Servers", results.join("\n") || "Nothing to change", false]],
      });
    }
    if (await activeGlobal(id, "blacklist")) throw new Error("That user is globally blacklisted. Use /global unblacklist instead.");
    const game = Boolean(i.options.getBoolean("game"));
    if (game && !(await hasPermission(i.user.id, "easyadmin.player.ban.remove")))
      throw new Error("Lifting the game ban needs `easyadmin.player.ban.remove`. Nothing was changed.");
    const { caseId, results, ok } = await liftGlobalBan(id, i.user.id, reason, { game });
    return card(`${publicCaseId(caseId)} · unbanned`, {
      color: COLORS.success,
      description: `Unbanned ${mention(id)} in ${ok} server${ok === 1 ? "" : "s"}.`,
      rows: [["Servers", results.join("\n") || "Not banned anywhere", false]],
    });
  }
  let user;
  if (sub === "restore") {
    const id = i.options.getString("user_id", true).replace(/\D/g, "");
    if (!/^\d{15,24}$/.test(id)) throw new Error("Enter a Discord user ID.");
    user = await client.users.fetch(id).catch(() => null);
    if (!user) throw new Error("Discord could not find a user with that ID.");
  } else user = i.options.getUser("user", true);
  if (sub === "invite") {
    if (user.bot) throw new Error("Bots cannot be invited to network servers.");
    const results = [];
    const links = [];
    for (const row of await networkRows()) {
      const guild = client.guilds.cache.get(String(row.guild_id));
      if (!guild) {
        results.push(`⚠️ **${clean(row.name, 80)}** · bot not in server`);
        continue;
      }
      const outcome = await createMemberInvite(guild, user, `/global invite by ${i.user.tag} for ${user.tag}`);
      if (outcome.state === "invited") {
        links.push(`**${clean(guild.name, 80)}:** ${outcome.invite.url}`);
        results.push(`✓ **${clean(guild.name, 80)}** · invite created`);
      } else if (outcome.state === "member") results.push(`• **${clean(guild.name, 80)}** · already a member`);
      else if (outcome.state === "banned") results.push(`⛔ **${clean(guild.name, 80)}** · banned; no invite created`);
      else results.push(`✗ **${clean(guild.name, 80)}** · ${outcome.detail}`);
    }
    if (!links.length) throw new Error(`No invites were created. ${results.join(" ")}`);
    const sent = await user.send({
      embeds: [embed("Florida Bay network invites", `${mention(i.user.id)} invited you to the Florida Bay network.\n\n${links.join("\n")}\n\nSingle use · expires in 10 minutes.`)],
    }).then(() => true, () => false);
    await audit(i.user.id, "global.invite", user.id, { sent, servers: links.length, results });
    return card(sent ? "Network invites sent" : "Could not DM network invites", {
      color: sent ? COLORS.success : COLORS.warning,
      description: sent
        ? `${mention(user.id)} received ${links.length} single-use invite${links.length === 1 ? "" : "s"} by DM.`
        : `${mention(user.id)} has DMs closed. Send them these links yourself:\n\n${links.join("\n")}`,
      rows: chunkLines(results, 1000).map((value, index) => [`Servers${index ? ` (${index + 1})` : ""}`, value, false]),
    });
  }
  if (sub === "restore") {
    if (user.bot) throw new Error("Bots cannot receive a role restore.");
    if (await activeGlobal(user.id, "blacklist"))
      throw new Error("That user is still globally blacklisted. Run /global unblacklist first, then /global restore; their saved roles are kept until then.");
    await requireOutranks(i, user.id, "restore roles for");
    const recovered = await recoverLegacyBlacklistSnapshots(user.id, i.user.id);
    const snapshots = await db.query(
      `SELECT n.guild_id,n.name,COALESCE(s.roles,c.roles) roles,
              CASE WHEN s.roles IS NULL THEN 'cache' ELSE s.source END source
         FROM network_guilds n
         LEFT JOIN discord_role_restore_snapshots s ON s.guild_id=n.guild_id AND s.discord_id=?
         LEFT JOIN discord_member_cache c ON c.guild_id=n.guild_id AND c.discord_id=?
        WHERE s.roles IS NOT NULL OR c.roles IS NOT NULL
        ORDER BY n.name`,
      [user.id, user.id],
    );
    if (!snapshots.length) throw new Error("No previous network-server membership was found for that user.");
    const restoredGroups = await restoreSyncedMemberships(user.id, snapshots, i.user.id);
    const expiry = Date.now() + 7 * 86400000;
    const results = [];
    const links = [];
    for (const snapshot of snapshots) {
      const guild = client.guilds.cache.get(String(snapshot.guild_id));
      if (!guild) {
        results.push(`⚠️ **${clean(snapshot.name, 80)}** · bot not in server`);
        continue;
      }
      await db.query(
        `INSERT INTO discord_pending_role_restores(guild_id,discord_id,roles,requested_by,requested_at,expires_at)
         VALUES(?,?,?,?,?,?) ON DUPLICATE KEY UPDATE roles=VALUES(roles),requested_by=VALUES(requested_by),requested_at=VALUES(requested_at),expires_at=VALUES(expires_at)`,
        [guild.id, user.id, JSON.stringify(storedRoleIds(snapshot.roles)), i.user.id, Date.now(), expiry],
      );
      const member = await guild.members.fetch(user.id).catch(() => null);
      if (member) {
        const applied = await applyPendingRoleRestore(member).catch((error) => ({ error }));
        if (applied?.error) results.push(`✗ **${clean(guild.name, 80)}** · role restore failed: ${clean(applied.error.message, 80)}`);
        else results.push(`✓ **${clean(guild.name, 80)}** · already joined; ${applied.restored} role${applied.restored === 1 ? "" : "s"} restored now`);
        continue;
      }
      const outcome = await createMemberInvite(guild, user, `/global restore by ${i.user.tag} for ${user.tag}`, 7 * 86400);
      if (outcome.state === "invited") {
        links.push(`**${clean(guild.name, 80)}:** ${outcome.invite.url}`);
        results.push(`✓ **${clean(guild.name, 80)}** · invite created; roles restore on join`);
      } else if (outcome.state === "banned") results.push(`⛔ **${clean(guild.name, 80)}** · still banned; roles are queued but no invite was created`);
      else results.push(`✗ **${clean(guild.name, 80)}** · roles queued; ${outcome.detail || "invite failed"}`);
    }
    const syncedServers = await syncUserAcrossNetwork(client, user.id);
    const sent = !links.length || await user.send({
      embeds: [embed("Your Florida Bay access was restored", `Join each previous server below. Your saved roles will be restored when you join.\n\n${links.join("\n")}\n\nSingle use · expires in 7 days.`)],
    }).then(() => true, () => false);
    await audit(i.user.id, "global.restore", user.id, { sent, invites: links.length, snapshots: snapshots.length, recovered, restoredGroups, syncedServers, results, expiresAt: expiry });
    return card(sent ? "Network access restored" : "Could not DM restore invites", {
      color: sent ? COLORS.success : COLORS.warning,
      description: sent
        ? `${mention(user.id)} was restored across ${snapshots.length} previous network server${snapshots.length === 1 ? "" : "s"}. ${links.length ? `${links.length} invite${links.length === 1 ? " was" : "s were"} sent by DM.` : "They were already present wherever restoration was possible."}`
        : `${mention(user.id)} has DMs closed. Send them these links yourself:\n\n${links.join("\n")}`,
      rows: chunkLines(results, 1000).map((value, index) => [`Servers${index ? ` (${index + 1})` : ""}`, value, false]),
      footer: `Florida Bay Roleplay · ${restoredGroups.length} global-sync membership${restoredGroups.length === 1 ? "" : "s"} restored · Authorization expires in 7 days`,
    });
  }
  if (sub === "lookup") {
    const lines = [];
    for (const row of await networkRows()) {
      const g = client.guilds.cache.get(String(row.guild_id));
      const m = g ? await g.members.fetch(user.id).catch(() => null) : null;
      const banned = !m && g ? Boolean(await g.bans.fetch(user.id).catch(() => null)) : false;
      const censored = m?.roles.cache.some((r) => r.name === CENSORED_ROLE);
      lines.push(
        `${m ? (censored ? "🟠" : "🟢") : banned ? "⛔" : "⚪"} **${clean(g?.name || row.name, 80)}**${m ? `${m.isCommunicationDisabled() ? " · timed out" : ""}${censored ? " · blacklisted (isolated)" : ""}` : banned ? " · banned" : g ? " · not a member" : " · bot not in server"}`,
      );
    }
    const [cases, groups, level] = await Promise.all([
      db.query("SELECT * FROM moderation_cases WHERE guild_id='global' AND target_id=? ORDER BY id DESC LIMIT 10", [user.id]),
      db.query("SELECT DISTINCT group_name FROM ace_memberships WHERE discord_id=? ORDER BY group_name", [user.id]),
      staffLevel(user.id),
    ]);
    return card(`Network lookup · ${clean(user.username, 80)}`, {
      description: lines.join("\n") || "No network servers.",
      rows: [
        ["Member", who(user.id)],
        ["ACE groups", groups.map((row) => `\`${row.group_name}\``).join(" ") || "None"],
        ["Staff level", levelText(level)],
        [`Global cases (${cases.length})`, cases.map((c) => `\`${c.ban_id || publicCaseId(c.id)}\` **${c.action}** ${when(c.created_at)} · ${clean(c.reason, 80)}${c.active ? "" : " (inactive)"}`).join("\n") || "None", false],
      ],
    });
  }
  await requireOutranks(i, user.id, "moderate");
  if (["ban", "kick", "blacklist"].includes(sub))
    await enforceCommandCooldown(i, `global.${sub}`);
  if (sub === "warn") {
    const c = await globalCase(user.id, i.user.id, "warn", reason, null, ["Recorded on the network record"]);
    await notifyGlobal(user.id, "warning", reason, null, publicCaseId(c));
    return card(`${publicCaseId(c)} · warned`, { color: COLORS.warning, rows: [["Member", who(user.id)], ["Reason", clean(reason, 300), false]] });
  }
  if (sub === "timeout") {
    const ms = parseDuration(i.options.getString("duration", true));
    if (!ms || ms > 28 * 86400000) throw new Error("Use a duration up to 28d, like 10m or 2h.");
    const { results, ok } = await acrossNetwork(async (g) => {
      const m = await g.members.fetch(user.id).catch(() => null);
      if (!m) return null;
      if (!m.moderatable) return "✗ member is above the bot";
      await m.timeout(ms, reason || undefined);
      return "✓";
    });
    const c = await globalCase(user.id, i.user.id, "timeout", reason, ms, results);
    await notifyGlobal(user.id, "timeout", reason, Date.now() + ms, publicCaseId(c));
    return card(`${publicCaseId(c)} · timed out`, {
      color: COLORS.warning,
      description: `${mention(user.id)} is timed out in ${ok} server${ok === 1 ? "" : "s"} until ${when(Date.now() + ms)}.`,
      rows: [["Servers", results.join("\n") || "Not in any network server", false]],
    });
  }
  if (sub === "untimeout") {
    const { results, ok } = await acrossNetwork(async (g) => {
      const m = await g.members.fetch(user.id).catch(() => null);
      if (!m?.isCommunicationDisabled()) return null;
      await m.timeout(null, reason || undefined);
      return "✓";
    });
    await db.query("UPDATE moderation_cases SET active=FALSE WHERE guild_id='global' AND target_id=? AND action='timeout' AND active=TRUE", [user.id]);
    const c = await globalCase(user.id, i.user.id, "untimeout", reason, null, results);
    return card(`${publicCaseId(c)} · timeout lifted`, {
      color: COLORS.success,
      description: `Timeout lifted in ${ok} server${ok === 1 ? "" : "s"}.`,
      rows: [["Servers", results.join("\n") || "No active timeouts", false]],
    });
  }
  if (sub === "kick") {
    const { results, ok } = await acrossNetwork(async (g) => {
      const m = await g.members.fetch(user.id).catch(() => null);
      if (!m) return null;
      if (!m.kickable) return "✗ member is above the bot";
      await m.kick(reason || undefined);
      return "✓";
    });
    const c = await globalCase(user.id, i.user.id, "kick", reason, null, results);
    await notifyGlobal(user.id, "kick", reason, null, publicCaseId(c));
    return card(`${publicCaseId(c)} · kicked`, {
      color: COLORS.danger,
      description: `Kicked ${mention(user.id)} from ${ok} server${ok === 1 ? "" : "s"}.`,
      rows: [["Servers", results.join("\n") || "Not in any network server", false]],
    });
  }
  if (sub === "ban") {
    const raw = i.options.getString("duration");
    const ms = parseDuration(raw);
    if (raw && !ms) throw new Error("Use a duration like 7d, or leave it empty for permanent.");
    let gameBanId = null;
    let gameLine = null;
    const huntAlts = i.options.getBoolean("alts") !== false;
    let linked = null;
    if (huntAlts)
      linked = await findLinkedAccounts(db, user.id).catch((error) => {
        console.error("[FBRP global] alt lookup:", error);
        return null;
      });
    const { bannable, skipped } = await screenAlts(linked);
    if (i.options.getBoolean("game")) {
      const needed = ms ? "easyadmin.player.ban.temporary" : "easyadmin.player.ban.permanent";
      if (!(await hasPermission(i.user.id, needed))) throw new Error(`The game ban needs \`${needed}\`. Nothing was changed.`);
      const { ids: own, linked: hasGameAccount } = await gameIdentifiers(user.id);
      const ids = [...new Set([...own, ...(linked?.banIdentifiers || []), ...bannable.map((alt) => `discord:${alt.discordId}`)])];
      const result = await callGame("/ban", {
        identifiers: ids,
        reason: `${clean(reason, 200)} (Florida Bay global ban)`,
        seconds: ms ? Math.round(ms / 1000) : null,
        banner: i.user.username,
        discord: user.id,
      }).catch((error) => ({ ok: false, error: error.message }));
      gameBanId = result?.ok && result.banid ? Number(result.banid) : null;
      gameLine = gameBanId
        ? `✓ **FiveM** · EasyAdmin ban #${gameBanId}${hasGameAccount ? "" : " (Discord identifier only; no linked game account yet)"}`
        : `✗ **FiveM** · game ban failed (${clean(result?.error || "FiveM core unreachable or not updated", 80)})`;
    }
    const deleteMessageSeconds = (i.options.getInteger("delete_days") || 0) * 86400;
    const { results, ok } = await banAcrossNetwork(user.id, reason, deleteMessageSeconds);
    if (gameLine) results.push(gameLine);
    const c = await globalCase(user.id, i.user.id, "ban", reason, ms, results, gameBanId);
    if (huntAlts) await db.query("UPDATE moderation_cases SET alt_scan=TRUE WHERE id=?", [c]);
    const altLines = await banLinkedAlts(bannable, { rootCaseId: c, actorId: i.user.id, reason, durationMs: ms, game: gameBanId !== null });
    for (const alt of skipped) altLines.push(`• ${mention(alt.discordId)} · linked but not banned (${alt.why})`);
    if (linked?.unlinkedAccounts)
      altLines.push(`• ${linked.unlinkedAccounts} linked game account${linked.unlinkedAccounts === 1 ? "" : "s"} with no Discord attached${gameBanId ? " (covered by the game ban)" : ""}`);
    if (huntAlts && !altLines.length) altLines.push("No linked accounts found.");
    await notifyGlobal(user.id, "ban", reason, ms ? Date.now() + ms : null, publicCaseId(c));
    return card(`${publicCaseId(c)} · banned`, {
      color: COLORS.danger,
      description: `Banned ${mention(user.id)} from ${ok} server${ok === 1 ? "" : "s"}${ms ? ` until ${when(Date.now() + ms)}` : ""}. Servers added to the network later inherit the ban.${
        bannable.length ? ` ${bannable.length} linked account${bannable.length === 1 ? "" : "s"} banned with them.` : ""
      }`,
      rows: [
        ["Servers", results.join("\n") || "-", false],
        ...(huntAlts ? [["Linked accounts", chunkLines(altLines, 1000)[0], false]] : []),
      ],
    });
  }
  // blacklist
  const existing = await activeGlobal(user.id, "blacklist");
  if (existing) throw new Error(`That member is already globally blacklisted by ${existing.ban_id || publicCaseId(existing.id)}.`);
  const main = await mainGuild();
  if (!main) throw new Error("The main Florida Bay Discord is unavailable. Register it with /network add kind:Main.");
  const member = await main.members.fetch(user.id).catch(() => null);
  if (member && !member.manageable) throw new Error("The member is above the bot, so their main-server roles cannot be removed.");
  await captureRoleRestoreSnapshots(user.id, i.user.id);
  blacklistPending.add(user.id);
  try {
    const results = [];
    if (member) {
      const role = await censorMember(member, `Florida Bay global blacklist: ${reason || "no reason"}`);
      results.push(`✓ **${clean(main.name, 80)}** · roles removed; ${roleRef(role.id)} assigned`);
    } else {
      await ensureCensoredRole(main);
      results.push(`• **${clean(main.name, 80)}** · not a member; restriction applies on join`);
    }
    const others = await acrossNetwork(async (g) => {
      const present = Boolean(await g.members.fetch(user.id).catch(() => null));
      await g.members.ban(user.id, { reason: `Florida Bay global blacklist: ${reason || "no reason"}`.slice(0, 512) });
      return present ? "✓ banned" : "✓ pre-emptively banned";
    }, { skipMain: true });
    results.push(...others.results);
    const c = await globalCase(user.id, i.user.id, "blacklist", reason, null, results);
    await notifyGlobal(user.id, "blacklist", reason, null, publicCaseId(c));
    invalidateBlacklistCache();
    return card(`${publicCaseId(c)} · blacklisted`, {
      color: COLORS.danger,
      description: `${mention(user.id)} is blacklisted. Main-server roles were removed and bans were applied in ${others.ok} other server${others.ok === 1 ? "" : "s"}.`,
      rows: [["Servers", results.join("\n"), false]],
    });
  } finally {
    blacklistPending.delete(user.id);
  }
}

/** Website verification: the page members must pass before joining any network server. */
const verifyPageUrl = () => `${publicBase()}/verify.html`;

/** Called by the website after a successful Discord sign-in. */
async function recordPortalVerification({ discordId, address, connections, method }) {
  const stored = await storeVerification(db, { discordId, address, connections, method });
  const role = await grantVerifiedRole(client, discordId);
  await audit(discordId, "verify.complete", discordId, { method, role });
  await log((await mainGuild()) || client.guilds.cache.first(), {
    title: "Member verified",
    color: role === "failed" ? COLORS.warning : COLORS.success,
    target: discordId,
    fields: [
      ["Method", humanize(method)],
      ["Verified role", humanize(role)],
      ["Identity links recorded", String(stored.links)],
    ],
  }, "verification");
  return { role };
}

/** Everyone already holding the verified role when verification started counts as verified. */
async function grandfatherVerifiedMembers() {
  let found = 0;
  for (const guild of client.guilds.cache.values()) {
    const role = guild.roles.cache.get(VERIFIED_ROLE_ID);
    if (!role) continue;
    found++;
    if (!(await guild.members.fetch().catch(() => null))) continue;
    let added = 0;
    for (const member of role.members.values()) {
      if (member.user.bot) continue;
      const result = await db.query(
        "INSERT IGNORE INTO member_verifications(discord_id,verified_at,last_verified_at,method) VALUES(?,?,?,'grandfathered')",
        [member.id, Date.now(), Date.now()],
      );
      added += Number(result.affectedRows || 0);
    }
    console.log(`[FBRP verify] ${guild.name}: ${role.members.size} members hold the verified role (${added} newly recorded).`);
  }
  if (!found) console.warn(`[FBRP verify] WARNING: verified role ${VERIFIED_ROLE_ID} was not found in any server the bot is in; no role can be given.`);
}

/**
 * Unverified accounts cannot join any network server: they are sent the verification link and
 * removed. Verified accounts get the verified role. Returns true when the member was removed.
 */
async function enforceVerificationOnJoin(member) {
  if (!verificationRequired() || member.user.bot) return false;
  if (!(await networkRows()).some((row) => String(row.guild_id) === member.guild.id)) return false;
  const id = member.id;
  const role = member.guild.roles.cache.get(VERIFIED_ROLE_ID);
  if (await isVerified(db, id)) {
    if (role && !member.roles.cache.has(role.id))
      await member.roles.add(role, "Verified on the Florida Bay website").catch((error) => console.error(`[FBRP verify] role for ${id}:`, error.message));
    return false;
  }
  if (id === OWNER_DISCORD_ID || superuserIds().has(id) || (await staffLevel(id)) >= 0) return false;
  if (await db.one("SELECT 1 FROM discord_security_exemption_scopes WHERE discord_id=? AND guild_id='*' LIMIT 1", [id])) return false;
  await dm(
    member.user,
    "Verify to join Florida Bay",
    [["Verify here", verifyPageUrl(), false]],
    COLORS.warning,
    "Every Florida Bay server requires a verified account. Verify on the website with Discord (it takes a few seconds), then join again.",
  ).catch(() => {});
  const removed = await member.kick("Florida Bay verification required").then(() => true, () => false);
  await audit(client.user.id, "verify.removed_unverified", id, { guild: member.guild.id, removed });
  return removed;
}

/** Enforces active global bans/blacklists on someone joining a network server. Returns true when handled. */
async function enforceGlobalOnJoin(member) {
  const blacklist = await activeGlobal(member.id, "blacklist");
  if (blacklist) {
    const caseId = blacklist.ban_id || publicCaseId(blacklist.id);
    const main = await mainGuild();
    if (member.guild.id === main?.id) await censorMember(member, `Florida Bay global blacklist · ${caseId}`);
    else await member.guild.members.ban(member.id, { reason: `Florida Bay global blacklist · ${caseId}` });
    await log(member.guild, { title: "Blacklisted member rejoined", color: COLORS.danger, target: member.id, fields: [["Server", clean(member.guild.name, 100)], ["Case", `\`${caseId}\``], ["Action", member.guild.id === main?.id ? "Isolated" : "Banned"]] }, "blacklists");
    return true;
  }
  const ban = await activeGlobal(member.id, "ban");
  if (ban) {
    const caseId = ban.ban_id || publicCaseId(ban.id);
    await member.guild.members.ban(member.id, { reason: `Florida Bay global ban · ${caseId}` }).catch(() => {});
    await log(member.guild, { title: "Globally banned member joined", color: COLORS.danger, target: member.id, fields: [["Server", clean(member.guild.name, 100)], ["Case", `\`${caseId}\``], ["Action", "Banned"]] }, "bans");
    return true;
  }
  return false;
}

/** Re-applies every active global ban and blacklist (startup, and when a server joins the network). */
async function reconcileGlobalCases(onlyGuild = null) {
  const cases = await db.query("SELECT id,ban_id,target_id,action FROM moderation_cases WHERE guild_id='global' AND action IN ('ban','blacklist') AND active=TRUE ORDER BY id");
  if (!cases.length) return;
  const main = await mainGuild();
  if (cases.some((c) => c.action === "blacklist") && main && (!onlyGuild || onlyGuild.id === main.id)) await ensureCensoredRole(main);
  for (const c of cases)
    for (const row of await networkRows()) {
      const caseId = c.ban_id || publicCaseId(c.id);
      const g = client.guilds.cache.get(String(row.guild_id));
      if (!g || (onlyGuild && g.id !== onlyGuild.id)) continue;
      if (c.action === "blacklist" && g.id === main?.id) {
        const member = await g.members.fetch(String(c.target_id)).catch(() => null);
        if (member) await censorMember(member, `Florida Bay global blacklist · ${caseId}`).catch((error) => console.error(`[FBRP global] censor ${c.target_id}:`, error.message));
        continue;
      }
      if (await g.bans.fetch(String(c.target_id)).catch(() => null)) continue;
      await g.members.ban(String(c.target_id), { reason: `Florida Bay global ${c.action} · ${caseId}` }).catch((error) => console.error(`[FBRP global] ban ${c.target_id} in ${g.id}:`, error.message));
    }
}

/** Temporary global bans lift themselves everywhere; finished timeouts stop counting as active. */
async function expireGlobalCases() {
  await db.query("UPDATE moderation_cases SET active=FALSE WHERE guild_id='global' AND action='timeout' AND active=TRUE AND expires_at IS NOT NULL AND expires_at<?", [Date.now()]);
  const expired = await db.query("SELECT * FROM moderation_cases WHERE guild_id='global' AND action='ban' AND active=TRUE AND expires_at IS NOT NULL AND expires_at<?", [Date.now()]);
  for (const c of expired) {
    await db.query("UPDATE moderation_cases SET active=FALSE WHERE id=?", [c.id]);
    if (await activeGlobal(c.target_id, "blacklist")) continue;
    const { results } = await acrossNetwork(async (g) =>
      (await g.members.unban(String(c.target_id), `Global case ${c.ban_id || publicCaseId(c.id)} expired`).then(() => true, () => false)) ? "✓" : null,
    );
    await globalCase(c.target_id, client.user.id, "unban", `Temporary global ban ${c.ban_id || publicCaseId(c.id)} expired`, null, results);
  }
}

/** One page of /acelist. Buttons carry page, source and search so paging needs no state. */
function aceListPayload(page = 0, source = "all", search = "") {
  const entries = catalogEntries(source, search);
  const pages = catalogPages(entries);
  const index = Math.max(0, Math.min(Number(page) || 0, pages.length - 1));
  const label = CATALOG_SOURCES[source]?.label || "vMenu, EasyAdmin and Florida Bay";
  const result = embed(
    `ACE permissions · ${label}${search ? ` · "${clean(search, 40)}"` : ""}`,
    pages[index] || "No permission matched that search.",
  ).setFooter({ text: `${entries.length} permission${entries.length === 1 ? "" : "s"} · Page ${index + 1} of ${Math.max(1, pages.length)} · Grant with /ace permission or the web panel` });
  const encoded = encodeURIComponent(search).slice(0, 60);
  const components = pages.length > 1
    ? [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`acelist:${index - 1}:${source}:${encoded}`).setLabel("Previous").setStyle(ButtonStyle.Secondary).setDisabled(index === 0),
        new ButtonBuilder().setCustomId(`acelist:${index + 1}:${source}:${encoded}`).setLabel("Next").setStyle(ButtonStyle.Primary).setDisabled(index >= pages.length - 1),
      )]
    : [];
  return { embeds: [result], components };
}

async function aceListCommand(i) {
  await requirePermission(i, "fbrp.perms.manage");
  return aceListPayload(0, i.options.getString("source") || "all", i.options.getString("search") || "");
}

const COMMAND_PERMISSIONS = {
  backup: "Bot owner only",
  help: "Everyone",
  invite: "Bot owner only (Discord ID 1090083387638812755)",
  join: "`fbrp.network.join`; `user:` needs `fbrp.network.join.others`",
  acelist: "`fbrp.perms.manage`",
  global: "`fbrp.global.<action>` (warn, timeout, kick, ban, blacklist, unban, invite, restore, lookup); moderated/restored targets must rank below you",
  blacklist: "`fbrp.global.blacklist`; target must rank below you",
  ticket: "Everyone; staff actions require `fbrp.tickets.support`",
  support: "`fbrp.tickets.manage`",
  ace: "`fbrp.perms.manage`",
  vmenu: "`fbrp.perms.manage`",
  headtag: "`fbrp.headtags.manage`",
  organization: "`fbrp.organizations.manage`",
  radio: "`fbrp.radio.manage`",
  network: "`fbrp.network.manage`",
  globalsync: "`fbrp.network.manage`",
  mod: "`fbrp.discord.mod`; ban/kick may use `fbrp.discord.mod.<action>`",
  server: "`/server status`: Everyone; other actions: `fbrp.ops`",
  staff: "`add`/`move`/`remove`: `fbrp.staff.assign` (ranks below yours only); others: `fbrp.staff.manage`",
  protectrole: "`fbrp.roles.protect`",
  botguard: "`fbrp.security.manage`",
  security: "`fbrp.security.manage`",
  roster: "`fbrp.roster.view`, `fbrp.roster.manage`, `fbrp.roster.discipline`, or `fbrp.roster.config` by action",
  userinfo: "`fbrp.investigate`",
  office: "`fbrp.office.manage`",
  orgbank: "`balance`/`ledger`: organization members; `adjust`/`leader`: `fbrp.organizations.manage`",
  exam: "Head of Management and above",
};

function commandPermission(command, sub = "") {
  if (command === "ticket") {
    if (["open", "mine"].includes(sub)) return "Everyone";
    if (["close", "request-close", "transcript"].includes(sub)) return "Ticket owner or `fbrp.tickets.support`";
    if (sub === "list") return "`fbrp.tickets`";
    return "`fbrp.tickets.support`";
  }
  if (command === "server" && sub === "status") return "Everyone";
  if (command === "staff") return ["add", "move", "remove"].includes(sub) ? "`fbrp.staff.assign` (ranks below yours only)" : "`fbrp.staff.manage`";
  if (command === "global") return `\`${GLOBAL_ACE[sub] || "fbrp.global"}\`${sub === "lookup" ? "" : "; target must rank below you"}`;
  if (command === "roster") {
    if (["list", "profile"].includes(sub)) return "`fbrp.roster.view`";
    if (["discipline", "discipline-revoke"].includes(sub)) return "`fbrp.roster.discipline`";
    if (["category-upsert", "category-delete", "rank-upsert", "rank-delete", "job-upsert", "job-delete", "sync"].includes(sub)) return "`fbrp.roster.config`";
    return "`fbrp.roster.manage`";
  }
  return COMMAND_PERMISSIONS[command] || "See command response";
}

function helpPages(filter = "") {
  const needle = String(filter || "").toLowerCase().replace(/^\//, "");
  const selected = commands.filter((command) => !needle || command.name.includes(needle));
  if (!selected.length) return [{ title: "Command help", description: "No command matched that filter." }];
  return selected.flatMap((command) => {
    const options = (command.options || []).filter((option) => option.type === 1);
    const lines = options.length
      ? options.map((option) => `\`/${command.name} ${option.name}\` · ${option.description}\nPermission: ${commandPermission(command.name, option.name)}`).join("\n\n")
      : `\`/${command.name}\` · ${command.description}\nPermission: ${commandPermission(command.name)}`;
    const blocks = lines.split("\n\n");
    const chunks = [];
    let chunk = "";
    for (const block of blocks) {
      if (chunk && chunk.length + block.length + 2 > 3300) {
        chunks.push(chunk);
        chunk = "";
      }
      chunk += `${chunk ? "\n\n" : ""}${block}`;
    }
    if (chunk) chunks.push(chunk);
    return chunks.map((description, index) => ({
      title: `Command help · /${command.name}${chunks.length > 1 ? ` · ${index + 1}/${chunks.length}` : ""}`,
      description: `${index === 0 ? `${command.description}\n\n` : ""}${description}`,
    }));
  });
}

function helpPayload(page = 0, filter = "") {
  const pages = helpPages(filter);
  const index = Math.max(0, Math.min(Number(page) || 0, pages.length - 1));
  const item = pages[index];
  const result = embed(item.title, clip(item.description, 4000));
  result.setFooter({ text: `Florida Bay Roleplay · Commands ${index + 1} of ${pages.length}` });
  const encoded = encodeURIComponent(filter).slice(0, 60);
  const components = pages.length > 1
    ? [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`help:${index - 1}:${encoded}`).setLabel("Previous").setStyle(ButtonStyle.Secondary).setDisabled(index === 0),
        new ButtonBuilder().setCustomId(`help:${index + 1}:${encoded}`).setLabel("Next").setStyle(ButtonStyle.Primary).setDisabled(index === pages.length - 1),
      )]
    : [];
  return { embeds: [result], components };
}

/** Builds the board as one header embed plus one embed per network server (Discord allows 10 embeds and 6000 characters per message). */
async function protectedRoleBoardEmbeds() {
  const [servers, roles, access] = await Promise.all([
    db.query("SELECT guild_id,name FROM network_guilds ORDER BY name"),
    db.query("SELECT guild_id,role_id FROM protected_roles ORDER BY guild_id,role_id"),
    db.query("SELECT guild_id,role_id,subject_type,subject_id FROM protected_role_access ORDER BY guild_id,role_id,subject_type,subject_id"),
  ]);
  const sections = [];
  for (const row of servers) {
    const guild = client.guilds.cache.get(String(row.guild_id));
    const resolved = [];
    for (const item of roles.filter((r) => String(r.guild_id) === String(row.guild_id))) {
      const role = guild ? await guild.roles.fetch(String(item.role_id)).catch(() => null) : null;
      const managers = access
        .filter((a) => String(a.guild_id) === String(row.guild_id) && String(a.role_id) === String(item.role_id))
        .map((a) => (a.subject_type === "role" ? roleRef(a.subject_id) : mention(a.subject_id)));
      resolved.push({ id: String(item.role_id), role, managers });
    }
    resolved.sort((x, y) => (y.role?.position ?? -1) - (x.role?.position ?? -1));
    sections.push({
      name: clean(guild?.name || row.name || row.guild_id, 100),
      available: Boolean(guild),
      roles: resolved,
    });
  }
  const totalRoles = sections.reduce((n, section) => n + section.roles.length, 0);
  const totalManagers = sections.reduce((n, section) => n + section.roles.reduce((m, r) => m + r.managers.length, 0), 0);
  const header = card("Protected roles", {
    description:
      "These roles are locked across the Florida Bay network. Only the managers listed under a role, the bot, and exempt staff can grant or remove it. Any other change is reverted automatically and logged to the security channel.",
    rows: [
      ["Protected roles", String(totalRoles)],
      ["Servers", String(sections.length)],
      ["Delegated managers", String(totalManagers)],
    ],
    footer: "Florida Bay Roleplay \u00b7 Updates automatically",
  });
  if (!sections.length) {
    header.setDescription("No network servers are configured yet. Add one with `/network add`.");
    return [header];
  }
  // Keep the whole message under 6000 characters by sharing what the header leaves over.
  const visible = sections.slice(0, 9);
  const headerSize = 600;
  const budget = Math.max(400, Math.floor((5600 - headerSize) / visible.length));
  const embeds = [header];
  for (const section of visible) {
    const blocks = section.roles.map(({ id, role, managers }) => {
      const label = role ? roleRef(id) : `Deleted role \`${id}\``;
      const managed = managers.length ? managers.join(" ") : "No delegated managers";
      return `${label}\n${managed}`;
    });
    let body = "";
    let shown = 0;
    for (const block of blocks) {
      const next = `${body}${body ? "\n\n" : ""}${block}`;
      if (next.length > budget - 120) break;
      body = next;
      shown += 1;
    }
    if (shown < blocks.length) body += `${body ? "\n\n" : ""}and ${blocks.length - shown} more. See the web panel for the full list.`;
    const e = card(section.name, {
      description: body || "No protected roles in this server.",
      color: section.available ? COLORS.primary : COLORS.warning,
      footer: section.available
        ? `${section.roles.length} protected role${section.roles.length === 1 ? "" : "s"}`
        : "The bot is not in this server",
    });
    e.setTimestamp(null);
    embeds.push(e);
  }
  if (sections.length > visible.length)
    embeds[embeds.length - 1].setFooter({ text: `${sections.length - visible.length} more server(s) not shown` });
  return embeds;
}

async function ensureProtectedRoleBoard() {
  const binding = await db.one("SELECT channel_id FROM discord_channel_bindings WHERE purpose='protected_roles'");
  if (!binding) return;
  const channel = await client.channels.fetch(String(binding.channel_id)).catch(() => null);
  if (!channel?.isTextBased()) throw new Error("Protected-role board channel is unavailable.");
  const embeds = await protectedRoleBoardEmbeds();
  const config = await db.one("SELECT value FROM bot_config WHERE `key`='protected_role_board'");
  let value = config?.value || {};
  if (typeof value === "string") try { value = JSON.parse(value); } catch { value = {}; }
  let message = value.message_id ? await channel.messages.fetch(String(value.message_id)).catch(() => null) : null;
  const payload = { content: "", embeds, components: [], allowedMentions: { parse: [] } };
  if (message) await message.edit(payload);
  else message = await channel.send(payload);
  await db.query("INSERT INTO bot_config(`key`,value,updated_by,updated_at) VALUES('protected_role_board',?,?,?) ON DUPLICATE KEY UPDATE value=VALUES(value),updated_by=VALUES(updated_by),updated_at=VALUES(updated_at)", [JSON.stringify({ channel_id: channel.id, message_id: message.id }), client.user.id, Date.now()]);
}

const ticketSystem = createTicketSystem({ client, db, audit, hasPermission, clean, safeName, embed, card, colors: COLORS, log });
let webPanelServer = null;

/** ACE group autocomplete for /ace unbind-role and /roster rank-upsert ace_group. */
async function aceGroupAutocomplete(i) {
  const focused = i.options.getFocused(true);
  if (i.commandName === "staff" && focused.name === "rank") return staffRankAutocomplete(i);
  if (focused.name !== "group" && focused.name !== "ace_group") return i.respond([]);
  const needle = String(focused.value || "").toLowerCase();
  const rows = await db.query("SELECT name,label,rank_order FROM ace_groups ORDER BY rank_order DESC,name");
  return i.respond(
    rows
      .filter((row) => `${row.name} ${row.label}`.toLowerCase().includes(needle))
      .slice(0, 25)
      .map((row) => ({ name: `${row.label} · ${row.name} · rank ${row.rank_order}`.slice(0, 100), value: row.name })),
  );
}

/** A text channel in the guild where the bot may create invites that new members can see. */
function inviteChannel(guild) {
  const me = guild.members.me;
  const usable = (channel) =>
    channel?.isTextBased?.() &&
    !channel.isThread?.() &&
    channel.permissionsFor(me)?.has(PermissionFlagsBits.CreateInstantInvite) &&
    channel.permissionsFor(guild.roles.everyone)?.has(PermissionFlagsBits.ViewChannel);
  return [guild.rulesChannel, guild.systemChannel, ...guild.channels.cache.sort((a, b) => a.rawPosition - b.rawPosition).values()].find(usable) || null;
}

/** Sends every /staff add recipient their assignment and, when needed, a one-use staff invite. */
async function sendStaffWelcome(user, rank, callsign) {
  const row = await db.one("SELECT guild_id FROM network_guilds WHERE kind='staff' ORDER BY added_at LIMIT 1");
  const guild = row ? client.guilds.cache.get(String(row.guild_id)) : null;
  let invite = null;
  let alreadyThere = false;
  if (guild) {
    alreadyThere = Boolean(await guild.members.fetch(user.id).catch(() => null));
    if (!alreadyThere) {
      const me = guild.members.me;
      const channel = guild.channels.cache
        .filter((item) => item?.isTextBased?.() && !item.isThread?.() && item.permissionsFor(me)?.has(PermissionFlagsBits.CreateInstantInvite))
        .sort((a, b) => a.rawPosition - b.rawPosition)
        .first();
      if (channel)
        invite = await channel
          .createInvite({ maxAge: 7 * 86400, maxUses: 1, unique: true, reason: `/staff add welcome for ${user.tag}` })
          .catch(() => null);
    }
  }
  const portal = publicBase();
  const details = [
    `Welcome to the **Florida Bay Roleplay staff team**. Your staff access is ready.`,
    "",
    `**Rank:** ${clean(rank.name, 80)}`,
    `**Callsign:** ${callsign}`,
    `**In-game access:** ${rank.group_staff_only ? "Clock in with `/clockin` before using staff permissions." : "Active immediately."}`,
    ...(invite ? ["", `**Staff server:** ${invite.url}`, "This invite works once and also expires after seven days."] : []),
    ...(alreadyThere ? ["", `You are already in **${clean(guild.name, 100)}**, so no new invite was needed.`] : []),
    ...(!guild ? ["", "The staff Discord is not configured yet. Ask management for access."] : !alreadyThere && !invite ? ["", "I could not create a staff-server invite. Ask management for access."] : []),
    ...(portal ? ["", `**Staff portal:** ${portal}/portal.html#profile`] : []),
  ];
  const sent = await user
    .send({ embeds: [embed("Your Florida Bay staff access", details.join("\n"), COLORS.success)] })
    .then(() => true, () => false);
  // A single-use invite that never reached its recipient should not be left active.
  if (!sent && invite) await invite.delete("Staff welcome DM could not be delivered").catch(() => {});
  await audit(client.user.id, "staff.welcome_dm", user.id, { sent, invited: sent && Boolean(invite), staffGuild: guild?.id || null });
  return { sent, invited: sent && Boolean(invite) };
}

// Only this Discord account may get the bot's Administrator invite link.
const INVITE_OWNER_ID = OWNER_DISCORD_ID;

async function inviteCommand(i) {
  if (i.user.id !== INVITE_OWNER_ID) throw new Error("Only the bot owner can use /invite.");
  const url = new URL("https://discord.com/oauth2/authorize");
  url.searchParams.set("client_id", client.application?.id || client.user.id);
  url.searchParams.set("permissions", PermissionFlagsBits.Administrator.toString());
  url.searchParams.set("integration_type", "0");
  url.searchParams.set("scope", "bot applications.commands");
  return embed("Add Florida Bay Network", `[Add the bot with Administrator](${url})\n\n${url}`, COLORS.success);
}

async function joinCommand(i) {
  const target = i.options.getUser("user") ?? i.user;
  const self = target.id === i.user.id;
  await requirePermission(i, self ? "fbrp.network.join" : "fbrp.network.join.others");
  if (target.bot) throw new Error("Bots cannot be invited with /join.");
  const id = i.options.getString("server", true);
  const network = await db.one("SELECT guild_id,kind FROM network_guilds WHERE guild_id=?", [id]);
  const guild = client.guilds.cache.get(id);
  if (!network || !guild) throw new Error("Pick a network server from the list.");
  if (await guild.members.fetch(target.id).catch(() => null))
    return embed("Already a member", `${self ? "You are" : `${mention(target.id)} is`} already in **${clean(guild.name)}**.`);
  const channel = inviteChannel(guild);
  if (!channel)
    throw new Error(`The bot cannot create an invite in **${clean(guild.name)}**. Give it Create Invite in a channel everyone can see.`);
  const invite = await channel.createInvite({
    maxAge: 600,
    maxUses: 1,
    unique: true,
    reason: `/join by ${i.user.tag} for ${target.tag}`,
  });
  await audit(i.user.id, "network.join", guild.id, { target: target.id, invite: invite.code });
  const note = "Single use · expires in 10 minutes. Any global roles you hold are applied automatically when you join.";
  if (!self) {
    const sent = await target
      .send({ embeds: [embed(`Invite to ${clean(guild.name, 200)}`, `${mention(i.user.id)} invited you to **${clean(guild.name)}**.
${invite.url}

${note}`)] })
      .then(() => true, () => false);
    return embed(
      sent ? "Invite sent" : "Could not DM them",
      sent
        ? `${mention(target.id)} was sent a single-use invite to **${clean(guild.name)}** by DM.`
        : `${mention(target.id)} has DMs closed. Give them this single-use invite yourself:
${invite.url}`,
      sent ? COLORS.success : COLORS.warning,
    );
  }
  return embed(`Join ${clean(guild.name, 200)}`, `${invite.url}

${note}`, COLORS.success);
}

async function joinAutocomplete(i) {
  const value = String(i.options.getFocused()).toLowerCase();
  const rows = await networkRows();
  return i.respond(
    rows
      .filter((row) => client.guilds.cache.has(String(row.guild_id)))
      .map((row) => ({
        name: `${client.guilds.cache.get(String(row.guild_id)).name} · ${row.kind.replace(/^./, (c) => c.toUpperCase())}`.slice(0, 100),
        value: String(row.guild_id),
      }))
      .filter((choice) => choice.name.toLowerCase().includes(value))
      .slice(0, 25),
  );
}

const autocompleters = {
  join: joinAutocomplete,
  ace: aceGroupAutocomplete,
  roster: aceGroupAutocomplete,
  staff: aceGroupAutocomplete,
  globalsync: globalSyncAutocomplete,
  security: (i) => i.respond(i.options.getFocused(true).name === "setting" ? settingChoices(i.options.getFocused()) : []),
  ticket: ticketSystem.autocomplete,
  support: ticketSystem.autocomplete,
};

setGateReporter(async ({ member, role, groups, mode, removed, by }) => {
  const grantedBy =
    mode === "live"
      ? by ? who(by) : "Unknown (no audit-log entry)"
      : "Found during a role sweep (granted while the bot was offline)";
  await log(
    member.guild,
    {
      title: removed ? "Unauthorized role grant removed" : "Unauthorized role grant not removed",
      color: removed ? COLORS.warning : COLORS.danger,
      description: removed
        ? `${mention(member.id)} held ${roleRef(role.id)} without belonging to its ACE group, so the bot removed it.`
        : `${mention(member.id)} holds ${roleRef(role.id)} without belonging to its ACE group, and the bot could not remove it. Move the bot role above it.`,
      fields: [
        ["Member", who(member.id)],
        ["Role", `${roleRef(role.id)}\n${clean(role.name, 100)}`],
        ["Granted by", grantedBy],
        ["Required ACE group", groups.map((name) => `\`${name}\``).join(" ") || "None", false],
      ],
      footer: "Florida Bay Roleplay \u00b7 Group-bound roles are granted with /ace member-add",
    },
    "security",
  );
});

function backupSummary(run) {
  const total = run.results.reduce(
    (t, r) => ({
      roles: t.roles + (r.rolesCreated || 0),
      fixedRoles: t.fixedRoles + (r.rolesFixed || 0),
      channels: t.channels + (r.channelsCreated || 0),
      fixedChannels: t.fixedChannels + (r.channelsFixed || 0),
      members: t.members + (r.membersFixed || 0),
      failed: t.failed + (r.failed || 0),
    }),
    { roles: 0, fixedRoles: 0, channels: 0, fixedChannels: 0, members: 0, failed: 0 },
  );
  const verb = run.apply ? "" : "would be ";
  return card(run.apply ? `Backup #${run.backup.id} restored` : `Restore preview · backup #${run.backup.id}`, {
    color: run.apply ? COLORS.success : COLORS.warning,
    description: run.apply ? undefined : "Nothing was changed. Run again with `confirm:true` to apply.",
    rows: [
      ["Servers", String(run.results.length)],
      [`Roles ${verb}created`, String(total.roles)],
      [`Roles ${verb}fixed`, String(total.fixedRoles)],
      [`Channels ${verb}created`, String(total.channels)],
      [`Channels ${verb}fixed`, String(total.fixedChannels)],
      [`Members ${verb}updated`, String(total.members)],
      ...(total.failed ? [["Failed actions", String(total.failed)]] : []),
      [
        "Per server",
        chunkLines(
          run.results.map((r) =>
            r.missing ? `**${clean(r.name, 60)}** · bot not in server`
              : r.error ? `**${clean(r.name, 60)}** · error: ${clean(r.error, 80)}`
              : `**${clean(r.name, 60)}** · +${r.rolesCreated}/~${r.rolesFixed} roles · +${r.channelsCreated}/~${r.channelsFixed} channels · ${r.membersFixed} members${r.failed ? ` · ${r.failed} failed` : ""}`),
          1000,
        )[0] || "None",
        false,
      ],
    ],
  });
}

async function backupCommand(i, sub) {
  requireOwner(i, "manage server backups");
  if (sub === "save") {
    const result = await saveAll(client, { actorId: i.user.id, label: i.options.getString("label") });
    await audit(i.user.id, "backup.save", String(result.id), { servers: result.guilds.length, skipped: result.skipped.length });
    return card(`Backup #${result.id} saved`, {
      color: result.skipped.length ? COLORS.warning : COLORS.success,
      rows: [
        ["Servers", String(result.guilds.length)],
        ["Saved", chunkLines(result.guilds.map((g) => `**${clean(g.name, 60)}** · ${g.roles} roles · ${g.channels} channels · ${g.members} members`), 1000)[0] || "None", false],
        ...(result.skipped.length ? [["Skipped", chunkLines(result.skipped.map((s) => clean(s, 150)), 1000)[0], false]] : []),
      ],
    });
  }
  if (sub === "list") {
    const rows = await listBackups(i.user.id, 10);
    return card("Server backups", {
      description: rows.map((r) => `**#${r.id}** · ${r.guild_count} servers · <t:${Math.floor(Number(r.created_at) / 1000)}:f>${r.label ? ` · ${clean(r.label, 60)}` : ""}`).join("\n") || "No backups yet. Run `/backup save`.",
    });
  }
  const apply = i.options.getBoolean("confirm") === true;
  const common = {
    backupId: i.options.getInteger("backup_id"),
    members: i.options.getBoolean("members") !== false,
    actorId: i.user.id,
    // Never hand roles back to someone who is currently blacklisted; the enforcer would strip them again.
    skipUser: async (userId) => Boolean(await activeGlobal(userId, "blacklist")),
  };
  if (!apply) return backupSummary(await restoreAll(client, { ...common, apply: false }));
  if (backupBusy()) throw new Error("A backup operation is already running.");
  void (async () => {
    try {
      const run = await restoreAll(client, {
        ...common,
        apply: true,
        onProgress: (done, total, r) => i.editReply({ embeds: [card("Restoring servers…", { color: COLORS.warning, description: `${done}/${total} · last: **${clean(r.name, 60)}**` })] }).catch(() => {}),
      });
      await audit(i.user.id, "backup.restore", String(run.backup.id), { servers: run.results.length });
      const summary = backupSummary(run);
      await i.editReply({ embeds: [summary] }).catch(() => {});
      await i.user.send({ embeds: [summary] }).catch(() => {});
      await log(i.guild, summary, "security").catch(() => {});
    } catch (error) {
      console.error("[FBRP backup] restore:", error);
      await i.editReply({ embeds: [embed("Restore failed", clean(error.message || error, 1000), COLORS.danger)] }).catch(() => {});
    }
  })();
  return card("Restore started", { color: COLORS.warning, description: "Restoring every network server. This message updates as each server finishes, and the summary is DMed to you." });
}

/** /verification: owner-only visibility and manual overrides for website verification. */
async function verificationCommand(i, sub) {
  if (i.user.id !== OWNER_DISCORD_ID && !superuserIds().has(i.user.id)) throw new Error("Only a Florida Bay owner can use /verification.");
  if (sub === "status") {
    const user = i.options.getUser("user");
    if (user) {
      const [row, links] = await Promise.all([
        db.one("SELECT * FROM member_verifications WHERE discord_id=?", [user.id]),
        db.query("SELECT kind,COUNT(*) n FROM identity_links WHERE discord_id=? GROUP BY kind", [user.id]),
      ]);
      return card(`Verification · ${clean(user.username, 60)}`, {
        color: row ? COLORS.success : COLORS.warning,
        rows: [
          ["Status", row ? `✓ verified ${when(Number(row.verified_at))} (${row.method})` : "✗ not verified"],
          ["Recorded links", links.map((link) => `${link.kind} ×${link.n}`).join(", ") || "None"],
        ],
      });
    }
    const [totals, methods, linked] = await Promise.all([
      db.one("SELECT COUNT(*) n FROM member_verifications"),
      db.query("SELECT method,COUNT(*) n FROM member_verifications GROUP BY method"),
      db.one("SELECT COUNT(DISTINCT discord_id) n FROM identity_links"),
    ]);
    return card("Website verification", {
      rows: [
        ["Required", verificationRequired() ? "Yes, for every network server and the game" : "No"],
        ["Verified role", `<@&${VERIFIED_ROLE_ID}>`],
        ["Verified members", String(totals.n)],
        ["By method", methods.map((row) => `${row.method}: ${row.n}`).join("\n") || "None", false],
        ["Members with stored links", String(linked.n)],
        ["Verify page", verifyPageUrl(), false],
      ],
    });
  }
  const user = i.options.getUser("user", true);
  if (sub === "grant") {
    await db.query(
      "INSERT INTO member_verifications(discord_id,verified_at,last_verified_at,method,granted_by) VALUES(?,?,?,'manual',?) ON DUPLICATE KEY UPDATE last_verified_at=VALUES(last_verified_at),granted_by=VALUES(granted_by)",
      [user.id, Date.now(), Date.now(), i.user.id],
    );
    const role = await grantVerifiedRole(client, user.id, `Verification granted by ${i.user.tag}`);
    await audit(i.user.id, "verify.grant", user.id, { role });
    await log((await mainGuild()) || i.guild, {
      title: "Verification granted manually",
      color: role === "failed" ? COLORS.warning : COLORS.success,
      actor: i.user.id,
      target: user.id,
      fields: [["Verified role", humanize(role)]],
    }, "verification");
    return card("Verification granted", { color: COLORS.success, description: `${mention(user.id)} is verified (role: ${role}).` });
  }
  await db.query("DELETE FROM member_verifications WHERE discord_id=?", [user.id]);
  for (const guild of client.guilds.cache.values()) {
    const member = guild.roles.cache.has(VERIFIED_ROLE_ID) ? await guild.members.fetch(user.id).catch(() => null) : null;
    if (member?.roles.cache.has(VERIFIED_ROLE_ID)) await member.roles.remove(VERIFIED_ROLE_ID, `Verification revoked by ${i.user.tag}`).catch(() => {});
  }
  await audit(i.user.id, "verify.revoke", user.id, {});
  await log((await mainGuild()) || i.guild, {
    title: "Verification revoked",
    color: COLORS.warning,
    actor: i.user.id,
    target: user.id,
  }, "verification");
  return card("Verification revoked", { color: COLORS.warning, description: `${mention(user.id)} must verify again before rejoining a network server.` });
}

const WELCOME_CATEGORY_ID = "1558252351624585246";

/** The welcome channel message: how to fully verify, plus what Florida Bay is. */
function welcomePayload(guild) {
  const site = publicBase();
  const connect = `connect ${connectUrl().replace(/^fivem:\/\/connect\//, "") || "join.floridabay.net"}`;
  const ticketChannel = String(process.env.FBRP_TICKET_PANEL_CHANNEL_ID || "");
  const help = ticketChannel && guild.channels.cache.has(ticketChannel) ? `open a ticket in <#${ticketChannel}>` : "open a support ticket";
  const embed = card("Welcome to Florida Bay Roleplay", {
    color: COLORS.primary,
    description:
      "A Florida-inspired roleplay city where police, fire/rescue, EMS and civilians share one living world, run by staff you can hold accountable. Follow the steps below to go from new member to in the city.",
    rows: [
      [
        "✅ How to fully verify",
        [
          `**1.** Open **${site}/verify.html** and press **Verify with Discord**.`,
          `**2.** Approve the Discord prompt. Your <@&${VERIFIED_ROLE_ID}> role is applied automatically.`,
          "**3.** Keep the **Discord desktop app** open on the PC you play on, so FiveM can see your Discord account.",
          `**4.** In FiveM press **F8** and enter \`${connect}\`.`,
          `Sign-in not working? Use the one-time code option on the portal, or ${help}.`,
        ].join("\n"),
        false,
      ],
      [
        "🔒 Why verification is required",
        "Every Florida Bay server and the city itself require a verified account. This keeps ban evasion out of the whole network: we store only an irreversible hash of your IP address and of accounts linked to your Discord (such as Steam or Xbox), never the IP itself. Accounts linked to a banned account are banned with it.",
        false,
      ],
      [
        "🌴 What the city offers",
        [
          "• **Police:** cuffing, searches, police MDT with warrants and citations, and Bolingbroke prison.",
          "• **Fire, rescue & EMS:** downed state with EMS revive, treatment and diagnosis.",
          "• **Civilians:** IDs, registered vehicles, the F7 garage, fishing and a full emote menu.",
          "• **Organizations:** gangs, businesses and departments with their own duty, tags and ranks.",
          "• **Custom HUD, proximity voice and role-based head tags.**",
        ].join("\n"),
        false,
      ],
      [
        "🎮 Key controls",
        "**M** vMenu · **F5** third-eye interactions · **F6** tags · **F7** garage · **K** vehicle panel · **F9** voice range · **G** engine · **B** seatbelt",
        false,
      ],
      [
        "🛡️ Community & moderation",
        `Moderation is network-wide: a global ban applies to every Florida Bay server and the city. Punishments can be appealed from the member portal. Need help? ${help[0].toUpperCase()}${help.slice(1)}.`,
        false,
      ],
    ],
    footer: "Florida Bay Roleplay · Verify once, play everywhere",
  });
  const components = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel("Verify now").setStyle(ButtonStyle.Link).setURL(`${site}/verify.html`),
      new ButtonBuilder().setLabel("Member portal").setStyle(ButtonStyle.Link).setURL(`${site}/portal.html`),
    ),
  ];
  return { embeds: [embed], components };
}

/** Publicly answers !f8 in every registered network server with the current connect command. */
async function replyWithF8Command(message) {
  if (message.author.bot || !message.guild || message.content.trim().toLowerCase() !== "!f8") return;
  const registered = (await networkRows()).some((row) => String(row.guild_id) === message.guild.id);
  if (!registered) return;

  const address = connectUrl().replace(/^fivem:\/\/connect\//, "") || "join.floridabay.net";
  const response = card("Connect to Florida Bay Roleplay", {
    color: COLORS.primary,
    description: "Open FiveM, press **F8**, paste the command below, and press **Enter**.",
    rows: [
      ["F8 connect command", `\`connect ${address}\``, false],
      ["Before you join", "Keep the Discord desktop app open so FiveM can verify your account and sync your roles.", false],
    ],
    footer: "Florida Bay Roleplay · See you beyond the bridge",
  });
  await message.reply({
    embeds: [response],
    allowedMentions: { parse: [], repliedUser: false },
  });
}

/** /welcome: owner-only. Creates (or refreshes) the welcome channel and its verification guide. */
async function welcomeCommand(i) {
  if (i.user.id !== OWNER_DISCORD_ID && !superuserIds().has(i.user.id)) throw new Error("Only a Florida Bay owner can use /welcome.");
  const categoryId = i.options.getChannel("category")?.id || WELCOME_CATEGORY_ID;
  const category = await client.channels.fetch(categoryId).catch(() => null);
  if (!category || category.type !== ChannelType.GuildCategory)
    throw new Error(`Category ${categoryId} was not found, or it is not a category the bot can see.`);
  const guild = category.guild;
  let channel = guild.channels.cache.find((item) => item.parentId === category.id && item.type === ChannelType.GuildText && item.name === "welcome");
  const created = !channel;
  if (!channel)
    channel = await guild.channels.create({
      name: "welcome",
      type: ChannelType.GuildText,
      parent: category.id,
      position: 0,
      topic: "Start here: how to verify and join Florida Bay Roleplay.",
      permissionOverwrites: [
        {
          id: guild.roles.everyone.id,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
          deny: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.AddReactions, PermissionFlagsBits.CreatePublicThreads, PermissionFlagsBits.CreatePrivateThreads, PermissionFlagsBits.SendMessagesInThreads],
        },
        {
          id: client.user.id,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages],
        },
      ],
      reason: `Welcome channel created by ${i.user.tag}`,
    });
  const payload = welcomePayload(guild);
  const title = payload.embeds[0].data.title;
  const recent = await channel.messages.fetch({ limit: 25 }).catch(() => null);
  const existing = recent?.find((message) => message.author.id === client.user.id && message.embeds[0]?.title === title);
  const message = existing ? await existing.edit(payload) : await channel.send(payload);
  await audit(i.user.id, "welcome.setup", channel.id, { created, guild: guild.id, message: message.id });
  return card(created ? "Welcome channel created" : "Welcome channel updated", {
    color: COLORS.success,
    description: `${existing ? "Refreshed the guide in" : "Posted the guide in"} <#${channel.id}> (${clean(guild.name, 80)}).`,
    rows: [["Message", `[Jump to it](${message.url})`]],
  });
}

/** /github: owner-only. Saves the whole project (code, website, game server, database) to the private repository. */
async function githubCommand(i, sub) {
  if (i.user.id !== OWNER_DISCORD_ID) throw new Error("Only the Florida Bay owner can use /github.");
  if (sub === "status") {
    const state = await githubStatus();
    return card("GitHub sync", {
      color: state.last?.ok ? COLORS.success : COLORS.warning,
      rows: [
        ["Repository", state.configured ? `\`${state.repo}\` (private)` : "Not configured. Add `GITHUB_TOKEN` and `GITHUB_REPO` to the bot .env."],
        ["Last sync", state.last ? `${state.last.ok ? "✓" : "✗"} <t:${Math.floor(Date.parse(state.last.at) / 1000)}:R> · \`${state.last.commit || "-"}\`${state.last.pushed ? " · pushed" : " · local only"}` : "Never"],
        ["Details", clean(state.last?.message || "-", 300), false],
        ["Running now", state.running ? "Yes" : "No"],
      ],
    });
  }
  const result = await runGithubSync();
  await audit(i.user.id, "github.sync", result.repo || "local", { ok: result.ok, pushed: result.pushed, commit: result.commit });
  return card(result.ok ? (result.pushed ? "GitHub is up to date" : "Saved locally") : "GitHub sync failed", {
    color: result.ok ? (result.pushed ? COLORS.success : COLORS.warning) : COLORS.danger,
    rows: [
      ["Result", clean(result.message, 400), false],
      ["Commit", result.commit ? `\`${result.commit}\`` : "-"],
      ["Repository", result.repo ? `\`${result.repo}\`` : "Not configured"],
      ["Log", `\`\`\`\n${clean(result.log || "-", 900)}\n\`\`\``, false],
    ],
  });
}

const handlers = {
  welcome: welcomeCommand,
  github: (i) => githubCommand(i, i.options.getSubcommand()),
  verification: (i) => verificationCommand(i, i.options.getSubcommand()),
  backup: backupCommand,
  invite: inviteCommand,
  join: joinCommand,
  ace: aceCommand,
  headtag: headtagCommand,
  organization: organizationCommand,
  radio: radioCommand,
  network: networkCommand,
  globalsync: globalSyncCommand,
  mod: moderationCommand,
  server: serverCommand,
  staff: staffCommand,
  protectrole: protectRoleCommand,
  botguard: botguardCommand,
  security: securityCommand,
  ticket: ticketSystem.command,
  support: ticketSystem.supportCommand,
  vmenu: vmenuCommand,
  roster: rosterCommand,
  global: globalCommand,
  blacklist: (i) => globalCommand(i, "blacklist"),
  acelist: aceListCommand,
  userinfo: userinfoCommand,
  office: officeCommand,
  orgbank: orgbankCommand,
  exam: examCommand,
};

async function forwardGameAudit() {
  const stored = await db.one("SELECT value FROM bot_config WHERE `key`='game_audit_cursor'");
  if (!stored) {
    const latest = await db.one("SELECT COALESCE(MAX(id),0) id FROM audit_log");
    await db.query(
      "INSERT INTO bot_config(`key`,value,updated_by,updated_at) VALUES('game_audit_cursor',?,?,?)",
      [JSON.stringify(Number(latest?.id || 0)), client.user.id, Date.now()],
    );
    return;
  }
  let cursor = Number(typeof stored.value === "string" ? JSON.parse(stored.value) : stored.value) || 0;
  const rows = await db.query("SELECT * FROM audit_log WHERE id>? ORDER BY id LIMIT 50", [cursor]);
  for (const row of rows) {
    const action = String(row.action);
    let purpose = null;
    if (action.startsWith("staff.clock")) purpose = "staff_duty";
    else if (action.startsWith("organization.clock")) purpose = "organizations";
    else if (["economy.delivery", "economy.seizure", "economy.service_payout"].includes(action)) purpose = "organizations";
    else if (
      action.startsWith("dispatch.") ||
      action.startsWith("interaction.") ||
      action.startsWith("justice.") ||
      action.startsWith("medical.") ||
      action === "vehicle.spawn"
    )
      purpose = "game";
    else if (String(row.actor_id) === "web-panel") purpose = "staff_audit";
    if (purpose) {
      let payload = row.payload || {};
      if (typeof payload === "string") try { payload = JSON.parse(payload); } catch { payload = {}; }
      const isId = (value) => /^\d{15,24}$/.test(String(value));
      const details = Object.entries(payload)
        .slice(0, 12)
        .map(([key, value]) => [humanize(key), clip(typeof value === "object" ? JSON.stringify(value) : value, 200) || "None"]);
      await log(client.guilds.cache.first(), {
        title: humanize(action),
        actor: isId(row.actor_id) ? row.actor_id : undefined,
        fields: [
          ...(!isId(row.actor_id) && row.actor_id ? [["Actor", `\`${clean(row.actor_id, 80)}\``]] : []),
          ...(row.target_id ? [["Target", isId(row.target_id) ? who(row.target_id) : `\`${clean(row.target_id, 80)}\``]] : []),
          ...details,
        ],
        footer: `Florida Bay Roleplay \u00b7 ${action}`,
        server: false,
      }, purpose);
    }
    cursor = Number(row.id);
  }
  if (rows.length)
    await db.query("UPDATE bot_config SET value=?,updated_by=?,updated_at=? WHERE `key`='game_audit_cursor'", [JSON.stringify(cursor), client.user.id, Date.now()]);
}

async function registerCommands(guild) {
  try {
    await guild.commands.set(commands);
    console.log(`[FBRP bot] Registered ${commands.length} commands in ${guild.name}.`);
  } catch (error) {
    console.error(`[FBRP bot] Could not register commands in ${guild.name} (${guild.id}). Re-invite the bot with the applications.commands scope:`, error.message || error);
  }
}

client.on("guildCreate", (guild) => {
  void registerCommands(guild);
  void log(guild, { title: "Bot added to a server", color: COLORS.primary, fields: [["Server", `**${clean(guild.name, 100)}**\n\`${guild.id}\``], ["Members", String(guild.memberCount)], ["Owner", who(guild.ownerId)]] }, "security").catch(() => {});
});

client.once("clientReady", async () => {
  console.log(`[FBRP bot] Logged in as ${client.user.tag}`);
  const superusers = String(process.env.FBRP_SUPERUSER_IDS || process.env.FBRP_OWNER_DISCORD_ID || "")
    .split(",").map((id) => id.trim()).filter(Boolean);
  // Keep every configured superuser in the in-game owner group as well. Checking
  // only whether the group had any member left later superusers without FiveM
  // ACE permissions when another owner was already present.
  for (const ownerId of superusers)
    await db.query(
      "INSERT IGNORE INTO ace_memberships(discord_id,group_name,origin,added_by,added_at) VALUES(?,'owner','bootstrap',?,?)",
      [ownerId, client.user.id, Date.now()],
    );
  // Bring the public site and portal online before the slower, network-wide
  // role reconciliation so a Discord outage cannot hold the website closed.
  await refreshSiteUrls().catch((error) => console.error("[FBRP bot] site url check:", error));
  setInterval(() => void refreshSiteUrls().catch(() => {}), 300000).unref();
  await staffExams.seed().catch((error) => console.error("[FBRP bot] staff exam seed:", error));
  await economy.seed().catch((error) => console.error("[FBRP bot] economy seed:", error));
  webPanelServer ??= startWebPanel({
    client,
    db,
    audit,
    refreshGame,
    syncAll,
    saveGlobalSync,
    deleteGlobalSync,
    bindSyncRole,
    setGlobalSyncOrder,
    pushGlobalSyncs,
    ensureTicketPanel: ticketSystem.ensurePanel,
    createWebsiteTicket: ticketSystem.create,
    websiteTicketAction: ticketSystem.webAction,
    websiteTicketTypes: ticketSystem.ticketTypes,
    websiteTicketPriorities: ticketSystem.priorities,
    websiteTicketTranscript: ticketSystem.websiteTranscript,
    ensureProtectedRoleBoard,
    announceCallsign,
    ownerDiscordId: OWNER_DISCORD_ID,
    hasPermission,
    liftAppealedCase,
    recordVerification: recordPortalVerification,
    staffExams,
    economy,
    log,
  });
  // Commands are registered per guild (instant updates) in every server the bot is in, plus any
  // listed in DISCORD_GUILD_IDS. guildCreate below covers servers it joins later.
  const guildIds = new Set([
    ...String(process.env.DISCORD_GUILD_IDS || process.env.DISCORD_GUILD_ID || "").split(",").map((id) => id.trim()).filter(Boolean),
    ...client.guilds.cache.keys(),
  ]);
  for (const guildId of guildIds) {
    const guild = await client.guilds.fetch(guildId).catch(() => null);
    if (guild) await registerCommands(guild);
  }
  await grandfatherVerifiedMembers().catch((error) => console.error("[FBRP verify] grandfather:", error));
  // Report gated roles that were granted while the bot was offline, then do the full reconcile.
  await serial(() => sweep(client, "sweep", { fetch: true }))
    .then((r) => (r.added || r.removed) && console.log(`[FBRP global sync] startup role sweep: +${r.added} / -${r.removed}`))
    .catch((error) => console.error("[FBRP bot] startup role sweep:", error));
  await syncAll(client).catch((error) =>
    console.error("[FBRP bot] initial sync:", error),
  );
  await ticketSystem.ensurePanel().catch((error) =>
    console.error("[FBRP bot] ticket panel:", error),
  );
  await ticketSystem.backfillControls().catch((error) =>
    console.error("[FBRP bot] ticket controls:", error),
  );
  await ticketSystem.backfillTranscripts()
    .then(({ found, saved }) => found && console.log(`[FBRP bot] Hosted ticket transcripts: ${saved}/${found} backfilled.`))
    .catch((error) => console.error("[FBRP bot] transcript backfill:", error));
  await ensureProtectedRoleBoard().catch((error) =>
    console.error("[FBRP bot] protected-role board:", error),
  );
  await reconcileGlobalCases().catch((error) => console.error("[FBRP global] startup reconcile:", error));
  await db.query("DELETE FROM discord_pending_role_restores WHERE expires_at<?", [Date.now()]).catch((error) =>
    console.error("[FBRP global] pending restore cleanup:", error),
  );
  setInterval(() => void expireGlobalCases().catch((error) => console.error("[FBRP global] expiry:", error)), 60000).unref();
  setInterval(() => void sweepLinkedAlts().catch((error) => console.error("[FBRP global] alt sweep:", error)), 300000).unref();
  setInterval(() => void db.query("DELETE FROM discord_pending_role_restores WHERE expires_at<?", [Date.now()]).catch((error) => console.error("[FBRP global] pending restore cleanup:", error)), 3600000).unref();
  await forwardGameAudit().catch((error) => console.error("[FBRP bot] audit forwarder:", error));
  setInterval(() => void forwardGameAudit().catch((error) => console.error("[FBRP bot] audit forwarder:", error)), 5000).unref();
  setInterval(() => void ensureProtectedRoleBoard().catch((error) => console.error("[FBRP bot] protected-role board:", error)), 300000).unref();
  setInterval(() => void expireLockdowns(client, securityLog).catch((error) => console.error("[FBRP security] lockdown expiry:", error)), 30000).unref();
  setInterval(() => void enforceAllChannelAccess(client).catch((error) => console.error("[FBRP bot] global channel access:", error)), 600000).unref();
  // Catches gated roles granted while the bot was offline or disconnected.
  setInterval(() => void serial(() => sweep(client, "sweep")).catch((error) => console.error("[FBRP bot] role sweep:", error)), 600000).unref();
  await syncStaffTeamRoles().catch((error) => console.error("[FBRP staff] Staff Team roles:", error));
  setInterval(() => void syncStaffTeamRoles().catch((error) => console.error("[FBRP staff] Staff Team roles:", error)), 600000).unref();
  client.user.setActivity("Florida Bay Roleplay");
});

/** Subcommands that only read data; everything else is written to the staff audit channel. */
const READ_ONLY = new Set(["list", "catalog", "profile", "hours", "leaderboard", "status", "lookup", "show", "mine", "notes", "config", "transcript", "events"]);
const optionText = (option) => {
  if (option.user) return `${mention(option.user.id)} \`${option.user.id}\``;
  if (option.role) return `${roleRef(option.role.id)} \`${option.role.id}\``;
  if (option.channel) return `<#${option.channel.id}>`;
  return clean(String(option.value), 300);
};

/** Every slash command that changes something (and every failed command) is logged with its options. */
async function logCommandUse(i, error) {
  const sub = i.options.getSubcommand(false);
  const readOnly = !sub ? ["userinfo", "acelist", "help"].includes(i.commandName) : READ_ONLY.has(sub);
  if (readOnly && !error) return;
  const data = i.options.data[0]?.type === 1 ? i.options.data[0].options || [] : i.options.data;
  await log(i.guild, {
    title: `/${i.commandName}${sub ? ` ${sub}` : ""}${error ? " failed" : ""}`,
    color: error ? COLORS.danger : COLORS.primary,
    actor: i.user.id,
    fields: [
      ["Server", `${clean(i.guild?.name || "DM", 80)}\n<#${i.channelId}>`],
      ...data.slice(0, 18).map((option) => [humanize(option.name), optionText(option)]),
      ...(error ? [["Error", clean(error.message || error, 500), false]] : []),
    ],
  }, "staff_audit");
}

client.on("interactionCreate", async (i) => {
  if (i.isButton() && i.customId.startsWith("help:")) {
    const [, page, rawFilter = ""] = i.customId.split(":");
    await i.update(helpPayload(Number(page), decodeURIComponent(rawFilter)));
    return;
  }
  if (i.isButton() && i.customId.startsWith("acelist:")) {
    const [, page, source = "all", rawSearch = ""] = i.customId.split(":");
    await i.update(aceListPayload(Number(page), source, decodeURIComponent(rawSearch)));
    return;
  }
  if (i.isStringSelectMenu() && i.customId.startsWith("gsync:")) return globalSyncServersComponent(i);
  if (i.isAutocomplete()) {
    const complete = autocompleters[i.commandName];
    if (complete) await complete(i).catch((error) => console.error(`[FBRP bot] /${i.commandName} autocomplete:`, error));
    return;
  }
  if (await ticketSystem.component(i)) return;
  if (i.isChatInputCommand() && i.commandName === "ticket" && i.options.getSubcommand() === "open") {
    try {
      await i.showModal(await ticketSystem.modal(i.options.getString("type", true)));
    } catch (error) {
      await i.reply({ embeds: [embed("Could not open ticket", clean(error.message || error, 1000), COLORS.danger)], ephemeral: true }).catch(() => {});
    }
    return;
  }
  if (i.isChatInputCommand() && i.commandName === "help") {
    await i.reply({ ...helpPayload(0, i.options.getString("command") || ""), ephemeral: true });
    return;
  }
  if (!i.isChatInputCommand() || !handlers[i.commandName]) return;
  await i.deferReply({ ephemeral: true });
  try {
    const result = await handlers[i.commandName](
      i,
      i.options.getSubcommand(false),
    );
    if (["protectrole", "network"].includes(i.commandName))
      await ensureProtectedRoleBoard().catch(() => {});
    if (i.commandName === "network" && i.options.getSubcommand(false) === "add")
      void reconcileGlobalCases(i.guild).catch((error) => console.error("[FBRP global] network add reconcile:", error));
    await i.editReply(result instanceof EmbedBuilder ? { embeds: [result] } : result);
    void logCommandUse(i, null).catch(() => {});
  } catch (error) {
    void logCommandUse(i, error).catch(() => {});
    console.error(`[FBRP bot] /${i.commandName}:`, error);
    await i
      .editReply({
        embeds: [
          embed(
            "Command failed",
            clean(error.message || error, 1000),
            COLORS.danger,
          ),
        ],
      })
      .catch(() => {});
  }
});

const securityError = (what) => (error) => console.error(`[FBRP security] ${what}:`, error);

/** Records bans created directly in Discord, outside /mod and /global. */
async function recordNativeDiscordBan(ban) {
  await new Promise((resolve) => setTimeout(resolve, 1400));
  const logs = await ban.guild.fetchAuditLogs({ type: AuditLogEvent.MemberBanAdd, limit: 6 }).catch(() => null);
  const entry = logs?.entries.find((item) => String(item.target?.id ?? item.targetId) === ban.user.id && Date.now() - item.createdTimestamp < 20000);
  const actor = entry?.executorId || "discord";
  // Bot-driven bans already receive a case from the command that initiated them.
  if (actor === client.user.id) return;
  const recent = await db.one(
    "SELECT id FROM moderation_cases WHERE guild_id=? AND target_id=? AND action='ban' AND created_at>? LIMIT 1",
    [ban.guild.id, ban.user.id, Date.now() - 30000],
  );
  if (recent) return;
  const inserted = await db.query(
    "INSERT INTO moderation_cases(guild_id,target_id,target_name,actor_id,action,source,reason,created_at,active) VALUES(?,?,?,?,'ban','discord_native',?,?,TRUE)",
    [ban.guild.id, ban.user.id, ban.user.globalName || ban.user.username, actor, clean(entry?.reason || "Banned directly in Discord", 300), Date.now()],
  );
  const banId = publicCaseId(inserted.insertId);
  await db.query("UPDATE moderation_cases SET ban_id=? WHERE id=?", [banId, inserted.insertId]);
  await audit(actor, "moderation.native_ban", ban.user.id, { guild: ban.guild.id, banId });
  await log(ban.guild, {
    title: `Discord ban recorded · ${banId}`,
    color: COLORS.danger,
    actor: /^\d{15,24}$/.test(actor) ? actor : undefined,
    target: ban.user.id,
    fields: [["Reason", clean(entry?.reason || "Banned directly in Discord", 300), false]],
    footer: banId,
  }, "bans");
  await dm(ban.user, "Florida Bay ban", [
    ["Case ID", `\`${banId}\``],
    ["Server", clean(ban.guild.name, 100)],
    ["Reason", clean(entry?.reason || "Banned directly in Discord", 300), false],
    ["Appeal", `${publicBase()}/portal.html#punishments`, false],
  ]);
}

client.on("guildMemberAdd", (member) => {
  void guardBot(member, securityLog)
    .then(async () => {
      // Security join alerts must run before verification/global enforcement can remove the member.
      if (member.user.bot || await guardJoin(member, securityLog) || await enforceVerificationOnJoin(member) || await enforceGlobalOnJoin(member)) return;
      await applyPendingRoleRestore(member);
      await syncMember(client, member);
      if (await activeStaff(member.id)) await setStaffTeamRole(member.id, true);
    })
    .catch((error) => console.error("[FBRP bot] member add:", error));
});
/** Keeps a blacklisted main-server member at the isolation role only. */
async function enforceBlacklistRoles(member) {
  if (member.user.bot || blacklistPending.has(member.id)) return;
  if (!(await activeGlobal(member.id, "blacklist"))) return;
  const main = await mainGuild();
  if (member.guild.id !== main?.id) return;
  const censored = member.guild.roles.cache.find((r) => r.name === CENSORED_ROLE);
  const ordinary = member.roles.cache.some((r) => r.id !== member.guild.id && r.id !== censored?.id && !r.managed);
  if (!censored || !member.roles.cache.has(censored.id) || ordinary)
    await censorMember(member, "Florida Bay global blacklist re-enforcement");
}
client.on("guildMemberUpdate", (oldMember, newMember) => {
  void enforceProtectedRoles(oldMember, newMember, securityLog)
    .then(() => enforceBlacklistRoles(newMember))
    .then(() => syncMember(client, newMember, { alert: "live" }))
    .catch((error) => console.error("[FBRP bot] member update:", error));
});
client.on("channelCreate", (channel) => {
  void enforceAllChannelAccess(client, channel).catch((error) =>
    console.error("[FBRP bot] global channel access:", error),
  );
  void (async () => {
    const main = await mainGuild();
    if (channel.guild?.id !== main?.id) return;
    if (await db.one("SELECT id FROM moderation_cases WHERE guild_id='global' AND action='blacklist' AND active=TRUE LIMIT 1"))
      await ensureCensoredRole(channel.guild, channel);
  })().catch((error) => console.error("[FBRP global] blacklist channel enforcement:", error));
});
// Anti-nuke reads every audit-log entry as it is created, so each action is tied to the exact account that made it.
client.on("guildAuditLogEntryCreate", (entry, guild) => void handleAuditEntry(entry, guild, securityLog).catch(securityError("audit entry")));
// Snapshots let anti-nuke rebuild what an attacker deleted.
client.on("channelDelete", (channel) => rememberChannel(channel));
client.on("roleDelete", (role) => {
  rememberRole(role);
  setTimeout(() => void ensureProtectedRoleBoard().catch(() => {}), 1500);
});
client.on("roleUpdate", () => {
  setTimeout(() => void ensureProtectedRoleBoard().catch(() => {}), 1500);
});
client.on("guildBanAdd", (ban) => void recordNativeDiscordBan(ban).catch(securityError("ban record")));
client.on("guildUpdate", (oldGuild, newGuild) => void guardGuildUpdate(oldGuild, newGuild, securityLog).catch(securityError("guild update")));
client.on("messageCreate", (message) => {
  void guardMessage(message, securityLog).catch(securityError("message"));
  void replyWithF8Command(message).catch((error) =>
    console.error("[FBRP bot] !f8 reply:", error.message || error),
  );
});

const shutdown = async (signal) => {
  console.log(`[FBRP bot] ${signal}, shutting down.`);
  webPanelServer?.close();
  client.destroy();
  await pool.end();
  process.exit(0);
};
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("unhandledRejection", (error) =>
  console.error("[FBRP bot] unhandled rejection:", error),
);
await client.login(token);
