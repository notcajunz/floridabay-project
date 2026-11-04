import { ActionRowBuilder, ButtonBuilder, ButtonStyle, SnowflakeUtil } from "discord.js";
import { findLinkedAccounts } from "../alts.js";
import { publicBase } from "../site-url.js";
import { allMembers, config, db, demand, post, rankOf } from "./store.js";
import { C, EPHEMERAL, UserError, card, clip, mention, meter, respond, ts } from "./util.js";
import { refreshPanels } from "./panels.js";

/**
 * Intel comes from what the FBRP network already records:
 *  - member_guilds: every Discord server the person was in at their last floridabay.net sign-in
 *  - blacklisted_servers (network-wide) and iaa_watch_servers (rival agencies, IAA-only)
 *  - discord_member_cache: which FBRP network servers they are in
 *  - alt detection (shared game identifiers, linked connections, website IPs)
 *  - FBRP moderation cases, prior IAA cases, discipline and the IAA blacklist
 */

const RP_HINT =
  /\b(rp|roleplay|role[\s-]?play|fivem|erlc|er:lc|liberty county|internal affairs|iaa|agency|fbi|cia|dhs|swat|sheriff|police|pd|trooper|highway patrol|department|clan|mafia|cartel|gang|national guard|military)\b/i;

export const TYPES = {
  dual_clanning: { label: "Dual Clanning", icon: "🎭" },
  blacklisted_server: { label: "Blacklisted Server", icon: "🚫" },
  transfer: { label: "Transfer", icon: "🔄" },
  other: { label: "Other", icon: "📁" },
};

const LEVELS = [
  [75, "SEVERE", "🔴", C.red],
  [45, "HIGH", "🟠", C.amber],
  [20, "ELEVATED", "🟡", C.gold],
  [0, "LOW", "🟢", C.green],
];

export async function gatherIntel(userId) {
  const id = String(userId);
  const [servers, blacklist, watch, network, presence, cases, discipline, banned, moderation] = await Promise.all([
    db.query("SELECT guild_id,guild_name,is_owner,last_seen FROM member_guilds WHERE discord_id=? ORDER BY guild_name", [id]),
    db.query("SELECT guild_id,name,reason FROM blacklisted_servers"),
    db.query("SELECT guild_id,name,reason FROM iaa_watch_servers"),
    db.query("SELECT guild_id,name,kind FROM network_guilds"),
    db.query("SELECT guild_id FROM discord_member_cache WHERE discord_id=?", [id]),
    db.query("SELECT reference,type,status,verdict,opened_at FROM iaa_cases WHERE subject_id=? ORDER BY id DESC", [id]),
    db.query("SELECT kind,active FROM iaa_discipline WHERE discord_id=?", [id]),
    db.one("SELECT reason,created_at FROM iaa_blacklist WHERE discord_id=? AND active=1", [id]),
    db.query("SELECT action,active,reason,guild_id,created_at FROM moderation_cases WHERE target_id=? ORDER BY id DESC LIMIT 25", [id]),
  ]);
  const black = new Map(blacklist.map((b) => [b.guild_id, b]));
  const watched = new Map(watch.map((w) => [w.guild_id, w]));
  const networkIds = new Map(network.map((n) => [n.guild_id, n]));

  const blacklistedHits = servers.filter((s) => black.has(s.guild_id)).map((s) => ({ ...s, reason: black.get(s.guild_id).reason }));
  const watchHits = servers.filter((s) => watched.has(s.guild_id)).map((s) => ({ ...s, reason: watched.get(s.guild_id).reason }));
  const rpHits = servers.filter((s) => !black.has(s.guild_id) && !watched.has(s.guild_id) && !networkIds.has(s.guild_id) && RP_HINT.test(s.guild_name));
  const networkPresence = presence.map((p) => networkIds.get(p.guild_id)).filter(Boolean);

  let alts = [];
  try {
    const linked = await findLinkedAccounts(db, id);
    alts = linked.alts.slice(0, 10);
    for (const alt of alts) {
      alt.banned = Boolean(
        await db.one("SELECT 1 FROM moderation_cases WHERE target_id=? AND guild_id='global' AND action IN ('ban','blacklist') AND active=1 LIMIT 1", [alt.discordId]),
      );
    }
  } catch (error) {
    console.warn(`[IAA] alt lookup failed: ${error.message}`);
  }

  const globalAction = moderation.find((m) => m.guild_id === "global" && ["ban", "blacklist"].includes(m.action) && Number(m.active));
  const substantiated = cases.filter((c) => c.verdict === "substantiated").length;
  const reasons = [];
  let score = 0;
  const add = (points, why) => {
    if (points > 0) {
      score += points;
      reasons.push(why);
    }
  };
  add(blacklistedHits.length * 45, `${blacklistedHits.length} blacklisted server(s)`);
  add(watchHits.length * 35, `${watchHits.length} watchlisted agency server(s)`);
  add(Math.min(30, rpHits.length * 6), `${rpHits.length} other RP communities`);
  add(banned ? 50 : 0, "IAA blacklisted");
  add(globalAction ? 25 : 0, `FBRP global ${globalAction?.action}`);
  add(alts.filter((a) => a.banned).length * 20, "linked to banned account(s)");
  add(substantiated * 10, `${substantiated} substantiated IAA case(s)`);
  score = Math.min(100, score);
  const [, level, dot, color] = LEVELS.find(([min]) => score >= min);

  return {
    userId: id,
    gatheredAt: Date.now(),
    servers,
    lastSignIn: servers.reduce((max, s) => Math.max(max, Number(s.last_seen) || 0), 0) || null,
    blacklistedHits,
    watchHits,
    rpHits,
    networkPresence,
    alts,
    cases,
    discipline: { total: discipline.length, active: discipline.filter((d) => Number(d.active)).length },
    banned,
    moderation: { total: moderation.length, active: moderation.filter((m) => Number(m.active)).length, globalAction: globalAction?.action || null },
    score,
    level,
    dot,
    color,
    reasons,
  };
}

export function suggestType(intel) {
  if (intel.blacklistedHits.length) return "blacklisted_server";
  if (intel.watchHits.length || intel.rpHits.length) return "dual_clanning";
  return "other";
}

const serverLine = (s) => `• **${clip(s.guild_name, 60)}**${Number(s.is_owner) ? " 👑" : ""} \`${s.guild_id}\`${s.reason ? `\n  ↳ ${clip(s.reason, 80)}` : ""}`;
const listOf = (rows, max = 8) => (rows.length ? rows.slice(0, max).map(serverLine).join("\n") + (rows.length > max ? `\n…and ${rows.length - max} more` : "") : "None");

export function dossierEmbed(intel, user, { title = "Intel dossier" } = {}) {
  const created = Number(SnowflakeUtil.deconstruct(intel.userId).timestamp);
  const ageDays = Math.floor((Date.now() - created) / 86400000);
  const base = publicBase();
  return card(`🛰️ ${title} · ${user?.username || intel.userId}`, {
    color: intel.color,
    thumbnail: user?.displayAvatarURL?.(),
    description: [
      `**Threat level:** ${intel.dot} **${intel.level}** · ${intel.score}/100`,
      `\`${meter(intel.score)}\``,
      intel.reasons.length ? `*${intel.reasons.join(" · ")}*` : "*No risk indicators found.*",
      "",
      `Account created ${ts(created, "D")} (${ageDays} days)${ageDays < 30 ? " ⚠️ **new account**" : ""}`,
      intel.servers.length
        ? `Server list from website sign-in ${ts(intel.lastSignIn, "R")} · ${intel.servers.length} servers`
        : `⚠️ **No server data.** They have never signed in on the website${base ? ` (${base})` : ""}, so outside servers cannot be checked.`,
    ].join("\n"),
    fields: [
      ["🚫 Blacklisted servers", listOf(intel.blacklistedHits), false],
      ["🎭 Watchlisted agencies", listOf(intel.watchHits), false],
      ["🎮 Other RP communities", listOf(intel.rpHits, 10), false],
      ["🌐 FBRP network", intel.networkPresence.map((n) => n.name).join("\n") || "Not seen"],
      [
        "👥 Linked accounts",
        intel.alts.map((a) => `${mention(a.discordId)} · ${a.strength}${a.banned ? " · **banned**" : ""}`).join("\n") || "None found",
      ],
      [
        "📁 IAA record",
        [
          intel.banned ? `🚫 **Blacklisted:** ${clip(intel.banned.reason, 80)}` : null,
          `${intel.cases.length} prior case(s)`,
          ...intel.cases.slice(0, 3).map((c) => `\`${c.reference}\` ${TYPES[c.type]?.label || c.type} · ${c.verdict || c.status}`),
          `${intel.discipline.total} discipline record(s) (${intel.discipline.active} active)`,
        ]
          .filter(Boolean)
          .join("\n"),
      ],
      ["⚖️ FBRP moderation", `${intel.moderation.total} case(s), ${intel.moderation.active} active${intel.moderation.globalAction ? `\n**Global ${intel.moderation.globalAction} in force**` : ""}`],
    ],
    footer: `Gathered ${new Date(intel.gatheredAt).toISOString().slice(0, 16).replace("T", " ")} UTC · CONFIDENTIAL`,
  });
}

const openButton = (userId, type, label = "Open investigation") =>
  new ButtonBuilder().setCustomId(`iaa:case:new:${userId}:${type}`).setLabel(label).setEmoji("📂").setStyle(ButtonStyle.Danger);

/* ------------------------------------------------------------------ screening */

export async function onJoin(member) {
  const guild = member.guild;
  const banned = await db.one("SELECT reason FROM iaa_blacklist WHERE discord_id=? AND active=1", [member.id]);
  if (banned) {
    const done = await guild.bans.create(member.id, { reason: `IAA blacklist: ${banned.reason}`.slice(0, 500) }).then(
      () => true,
      () => false,
    );
    await post(guild, "blacklists", { embeds: [card("🚫 Blacklisted user rejoined", { color: C.red, description: `${member} (\`${member.id}\`) tried to rejoin and was ${done ? "banned" : "**not** banned (missing permission)"}.\nReason on file: ${banned.reason}` })] }, "security", "botLogs");
    return;
  }
  const intel = await gatherIntel(member.id);
  const created = Number(SnowflakeUtil.deconstruct(member.id).timestamp);
  await post(
    guild,
    "guildLogs",
    {
      embeds: [
        card(`📥 Joined · ${member.user.username}`, {
          color: intel.color,
          thumbnail: member.displayAvatarURL(),
          description: `${member} \`${member.id}\`\nAccount created ${ts(created, "R")}\nThreat ${intel.dot} **${intel.level}** (${intel.score}/100)${intel.reasons.length ? ` · ${intel.reasons.join(", ")}` : ""}`,
        }),
      ],
    },
    "botLogs",
  );
  if (intel.blacklistedHits.length || intel.watchHits.length) await alert(guild, member.user, intel, "join");
}

export async function onLeave(member) {
  const rank = await rankOf(member).catch(() => null);
  await post(
    member.guild,
    "guildLogs",
    {
      embeds: [
        card(`📤 Left · ${member.user.username}`, {
          color: rank ? C.amber : C.grey,
          description: `${member.user} \`${member.id}\`${rank ? `\n⚠️ Left while holding **${rank.name}**. Their roster entry is kept until removed.` : ""}`,
        }),
      ],
    },
    "botLogs",
  );
}

/** Posts one alert per new blacklisted/watchlisted server finding. */
async function alert(guild, user, intel, source) {
  const fresh = [];
  for (const [kind, rows] of [["blacklist", intel.blacklistedHits], ["watch", intel.watchHits]]) {
    for (const s of rows) {
      const result = await db.query("INSERT IGNORE INTO iaa_alerts(discord_id,guild_id,kind,alerted_at) VALUES(?,?,?,?)", [intel.userId, s.guild_id, kind, Date.now()]);
      if (result.affectedRows) fresh.push({ kind, ...s });
    }
  }
  if (!fresh.length) return false;
  const type = fresh.some((f) => f.kind === "blacklist") ? "blacklisted_server" : "dual_clanning";
  const open = await db.one("SELECT reference FROM iaa_cases WHERE subject_id=? AND status<>'closed' LIMIT 1", [intel.userId]);
  await post(
    guild,
    "alerts",
    {
      content: source === "join" ? "🚨 **Screening hit on join**" : "🚨 **Sweep hit**",
      embeds: [
        card(`${type === "blacklisted_server" ? "🚫" : "🎭"} ${user?.username || intel.userId} · new intel`, {
          color: C.red,
          thumbnail: user?.displayAvatarURL?.(),
          description: `${mention(intel.userId)} \`${intel.userId}\`\n\n${fresh.map((f) => `${f.kind === "blacklist" ? "🚫 Blacklisted" : "🎭 Watchlisted"}: **${clip(f.guild_name, 60)}**${f.reason ? ` — ${clip(f.reason, 80)}` : ""}`).join("\n")}\n\nThreat ${intel.dot} **${intel.level}** (${intel.score}/100)${open ? `\n📂 Already under investigation: \`${open.reference}\`` : ""}`,
        }),
      ],
      components: open
        ? []
        : [
            new ActionRowBuilder().addComponents(
              openButton(intel.userId, type),
              new ButtonBuilder().setCustomId(`iaa:intel:view:${intel.userId}`).setLabel("Full dossier").setEmoji("🛰️").setStyle(ButtonStyle.Secondary),
            ),
          ],
    },
    "security",
    "botLogs",
  );
  return fresh.length;
}

/** Re-checks every agency member against both lists. New findings alert once. */
export async function sweep(guild) {
  const cfg = await config();
  const members = await allMembers(guild);
  const rankIds = new Set((await db.query("SELECT role_id FROM iaa_ranks")).map((r) => r.role_id));
  let hits = 0;
  for (const member of members.values()) {
    if (member.user.bot) continue;
    const agency = [...member.roles.cache.keys()].some((id) => rankIds.has(id) || id === cfg.roles.base);
    if (!agency) continue;
    const intel = await gatherIntel(member.id);
    if ((intel.blacklistedHits.length || intel.watchHits.length) && (await alert(guild, member.user, intel, "sweep"))) hits++;
  }
  return hits;
}

/**
 * Every durable source proving that an account completed a Florida Bay website OAuth flow.
 * The UNION deliberately excludes grandfathered/manual verification by itself while retaining
 * old OAuth users whose current verification row or short-lived join grant was later removed.
 */
export const AUTHORIZED_HISTORY_SQL = `
  SELECT discord_id FROM member_verifications WHERE method='discord_oauth'
  UNION SELECT actor_id discord_id FROM audit_log WHERE action='portal.login' AND actor_id REGEXP '^[0-9]{15,24}$'
  UNION SELECT discord_id FROM member_guilds
  UNION SELECT discord_id FROM identity_links
  UNION SELECT discord_id FROM discord_oauth_grants`;

/** Checks every account ever authenticated, including former/non-IAA members. */
export async function authSweep(guild, onProgress = null) {
  const [totalRow, candidates] = await Promise.all([
    db.one(`SELECT COUNT(*) n FROM (${AUTHORIZED_HISTORY_SQL}) authorized_accounts`),
    db.query(
      `SELECT DISTINCT authorized_accounts.discord_id
         FROM (${AUTHORIZED_HISTORY_SQL}) authorized_accounts
         JOIN member_guilds membership ON membership.discord_id=authorized_accounts.discord_id
         LEFT JOIN blacklisted_servers blacklisted ON blacklisted.guild_id=membership.guild_id
         LEFT JOIN iaa_watch_servers watched ON watched.guild_id=membership.guild_id
        WHERE blacklisted.guild_id IS NOT NULL OR watched.guild_id IS NOT NULL
        ORDER BY authorized_accounts.discord_id`,
    ),
  ]);
  let accounts = 0;
  let findings = 0;
  let checkedCandidates = 0;
  for (const row of candidates) {
    const id = String(row.discord_id);
    const intel = await gatherIntel(id);
    if (intel.blacklistedHits.length || intel.watchHits.length) {
      const user = await guild.client.users.fetch(id).catch(() => null);
      const fresh = await alert(guild, user, intel, "auth-sweep");
      if (fresh) {
        accounts++;
        findings += Number(fresh);
      }
    }
    checkedCandidates++;
    if (onProgress && (checkedCandidates % 10 === 0 || checkedCandidates === candidates.length))
      await onProgress({ checked: checkedCandidates, candidates: candidates.length, total: Number(totalRow?.n || 0), accounts, findings });
  }
  return {
    total: Number(totalRow?.n || 0),
    candidates: candidates.length,
    accounts,
    findings,
  };
}

/* ------------------------------------------------------------------ server lists */

export async function serverListEmbed() {
  const [black, watch] = await Promise.all([
    db.query("SELECT * FROM blacklisted_servers ORDER BY name"),
    db.query("SELECT * FROM iaa_watch_servers ORDER BY name"),
  ]);
  const fmt = (r) => `• **${clip(r.name, 60)}** \`${r.guild_id}\`\n  ↳ ${clip(r.reason, 100)}`;
  return card("🚫 Blacklisted & watchlisted servers", {
    color: C.red,
    description: [
      "Membership in a **blacklisted** server is grounds for a *Blacklisted Server* investigation. Membership in a **watchlisted** agency is grounds for a *Dual Clanning* investigation.",
      "Agents are screened on join and swept every few hours. Signing in on the website keeps your server list current.",
    ].join("\n\n"),
    fields: [
      [`Blacklisted (network-wide) · ${black.length}`, black.map(fmt).join("\n").slice(0, 1020) || "None", false],
      [`Watchlisted agencies (IAA) · ${watch.length}`, watch.map(fmt).join("\n").slice(0, 1020) || "None", false],
    ],
  });
}

const SNOWFLAKE = /^\d{15,24}$/;

export async function command(i, actor, group, sub) {
  if (!group && sub === "lookup") {
    await demand(actor, "intel.lookup");
    const user = i.options.getUser("user", true);
    await i.deferReply(EPHEMERAL);
    const intel = await gatherIntel(user.id);
    const open = await db.one("SELECT reference FROM iaa_cases WHERE subject_id=? AND status<>'closed' LIMIT 1", [user.id]);
    return respond(i, {
      embeds: [dossierEmbed(intel, user)],
      components: open ? [] : [new ActionRowBuilder().addComponents(openButton(user.id, suggestType(intel), `Open ${TYPES[suggestType(intel)].label} case`))],
    });
  }
  if (!group && sub === "sweep") {
    await demand(actor, "intel.manage");
    await i.deferReply(EPHEMERAL);
    const hits = await sweep(i.guild);
    return respond(i, `Sweep complete. **${hits}** member(s) produced new alerts.`);
  }
  if (!group && sub === "auth-sweep") {
    await demand(actor, "intel.manage");
    await i.deferReply(EPHEMERAL);
    const result = await authSweep(i.guild, ({ checked, candidates, total, accounts, findings }) =>
      i.editReply({ embeds: [card("🛰️ Historical authorization sweep", {
        color: C.navy,
        description: `Checked **${checked}/${candidates}** account(s) with listed-server matches from **${total}** accounts that have ever authenticated.\n\nNew alerts so far: **${accounts}** account(s), **${findings}** finding(s).`,
      })] }).catch(() => null));
    await db.query(
      "INSERT INTO audit_log(actor_id,action,target_id,payload,created_at) VALUES(?, 'iaa.intel.auth_sweep', NULL, ?, ?)",
      [i.user.id, JSON.stringify(result), Date.now()],
    );
    await post(i.guild, "botLogs", { embeds: [card("🛰️ Historical authorization sweep complete", {
      color: result.findings ? C.amber : C.green,
      fields: [
        ["Run by", mention(i.user.id)],
        ["Ever authenticated", String(result.total)],
        ["Accounts with listed-server matches", String(result.candidates)],
        ["New alert accounts", String(result.accounts)],
        ["New findings", String(result.findings)],
      ],
      footer: "Existing findings are not alerted twice",
    })] });
    return respond(i, `Historical sweep complete. Checked **${result.total}** account(s) that have ever authenticated. **${result.candidates}** account(s) matched a blacklisted or watchlisted server; **${result.accounts}** account(s) produced **${result.findings}** new alert(s).`);
  }
  await demand(actor, sub === "list" ? "intel.lookup" : "intel.manage");
  const table = group === "watchlist" ? "iaa_watch_servers" : "blacklisted_servers";
  const label = group === "watchlist" ? "watchlist" : "server blacklist";
  if (sub === "list") return respond(i, { embeds: [await serverListEmbed()] });
  const guildId = i.options.getString("server_id", true).trim();
  if (!SNOWFLAKE.test(guildId)) throw new UserError("That is not a Discord server ID. Enable Developer Mode, right-click the server, and Copy Server ID.");
  if (sub === "remove") {
    const result = await db.query(`DELETE FROM ${table} WHERE guild_id=?`, [guildId]);
    if (!result.affectedRows) throw new UserError(`\`${guildId}\` is not on the ${label}.`);
    await db.query("DELETE FROM iaa_alerts WHERE guild_id=?", [guildId]);
  } else {
    const name = clip(i.options.getString("name", true), 100);
    const reason = clip(i.options.getString("reason", true), 300);
    const now = Date.now();
    if (table === "blacklisted_servers")
      await db.query(
        "INSERT INTO blacklisted_servers(guild_id,name,reason,added_by,added_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE name=VALUES(name),reason=VALUES(reason),updated_by=VALUES(updated_by),updated_at=VALUES(updated_at)",
        [guildId, name, reason, i.user.id, now, i.user.id, now],
      );
    else
      await db.query("INSERT INTO iaa_watch_servers(guild_id,name,reason,added_by,added_at) VALUES(?,?,?,?,?) ON DUPLICATE KEY UPDATE name=VALUES(name),reason=VALUES(reason)", [
        guildId,
        name,
        reason,
        i.user.id,
        now,
      ]);
  }
  await post(
    i.guild,
    "botLogs",
    { embeds: [card(`${sub === "remove" ? "➖" : "➕"} ${label} ${sub === "remove" ? "removal" : "entry"}`, { color: C.grey, description: `\`${guildId}\` by ${i.user}` })] },
  );
  refreshPanels(i.guild, "blacklistedServers");
  return respond(i, `\`${guildId}\` ${sub === "remove" ? "removed from" : "saved to"} the ${label}.`);
}

export async function viewButton(i, actor, userId) {
  await demand(actor, "intel.lookup");
  await i.deferReply(EPHEMERAL);
  const user = await i.client.users.fetch(userId).catch(() => null);
  return respond(i, { embeds: [dossierEmbed(await gatherIntel(userId), user)] });
}
