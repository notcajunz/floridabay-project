/**
 * Application logs for the orgs website.
 *
 * - Department Management sets one main application log in the Department Hub. Every application to
 *   a department is posted there with a link to the website.
 * - An organization's high command can add its own log channel (in the department's Discord or the
 *   Hub), pick a role to ping and choose Accept/Deny buttons or only the website link.
 * - An accepted department applicant is added straight to the department's Discord (the server
 *   linked with `/dept add guild_id:`), through the same authorized join `/join` uses. Applicants who
 *   have not authorized direct joins are added as soon as they verify.
 */

import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, EmbedBuilder, ModalBuilder,
  PermissionFlagsBits, TextInputBuilder, TextInputStyle,
} from "discord.js";
import { recordForOrg } from "./org-authority.js";

export const DEPT_HUB_GUILD_ID = String(process.env.DEPT_HUB_GUILD_ID || "1558235113295315004");
/** Portal organization types the Department Hub runs (ORG_MANAGER_GRANT_TYPES.department). */
export const DEPARTMENT_ORG_TYPES = Object.freeze(["leo", "fire", "government"]);
export const MAIN_LOG_KEY = "dept_application_main_log";
const SNOWFLAKE = /^\d{15,24}$/;
const PENDING_JOIN_DAYS = 14;
const DECISION_STYLE = { accepted: ["Accepted", 0x3ddc97], denied: ["Denied", 0xff5f6d], withdrawn: ["Withdrawn", 0x6f7e92] };

const snowflake = (value) => (SNOWFLAKE.test(String(value ?? "").trim()) ? String(value).trim() : null);
const clip = (value, max) => {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};

/** Button and modal custom ids: orgapp:<accept|deny|note>:<application id>. Exported for tests. */
export const applicationCustomId = (action, id) => `orgapp:${action}:${Number(id)}`;
export function parseApplicationCustomId(customId) {
  const match = /^orgapp:(accept|deny|note):(\d{1,18})$/.exec(String(customId || ""));
  return match ? { action: match[1], id: Number(match[2]) } : null;
}

/** Whether an organization belongs to the Department Hub. Exported for tests. */
export function isDepartmentOrg(org, record = null) {
  return record?.kind === "department" || DEPARTMENT_ORG_TYPES.includes(String(org?.type || ""));
}

/** The embed posted for one application. Exported for tests. */
export function applicationEmbed({ org, application, decision = null, reviewerId = null, join = null }) {
  const color = decision ? DECISION_STYLE[decision]?.[1] : Number.parseInt(String(org.color || "#55c4ff").replace("#", ""), 16) || 0x55c4ff;
  const embed = new EmbedBuilder()
    .setTitle(`${decision ? `${DECISION_STYLE[decision]?.[0] || decision} · ` : "New application · "}${clip(org.name, 200)}`)
    .setDescription(`<@${application.discord_id}> applied to join **${clip(org.name, 200)}**.`)
    .setColor(color)
    .setFooter({ text: `Application #${application.id}` })
    .setTimestamp(new Date(Number(application.created_at) || Date.now()));
  for (const row of (application.answers || []).slice(0, 8))
    embed.addFields({ name: clip(row.question, 250) || "Question", value: clip(row.answer, 1000) || "—" });
  if (decision) {
    embed.addFields({ name: "Decision", value: `${DECISION_STYLE[decision]?.[0] || decision}${reviewerId && SNOWFLAKE.test(String(reviewerId)) ? ` by <@${reviewerId}>` : ""}`, inline: true });
    if (join) embed.addFields({ name: "Department Discord", value: joinSummary(join), inline: true });
  }
  return embed;
}

/** One line about adding the applicant to the department Discord. Exported for tests. */
export function joinSummary(join) {
  const name = join?.guildName ? `**${clip(join.guildName, 80)}**` : "the department Discord";
  switch (join?.state) {
    case "joined": return `Added to ${name}.`;
    case "already": return `Already in ${name}.`;
    case "authorization_required": return `Waiting for the applicant to verify, then they are added to ${name}.`;
    case "banned": return `Banned from ${name}, so they were not added.`;
    case "bot_missing": return "The Florida Bay bot is not in the department Discord, so nobody could be added.";
    case "no_guild": return "No department Discord is linked (`/dept add guild_id:`).";
    case "failed": return `Could not add them to ${name}${join.error ? `: ${clip(join.error, 120)}` : "."}`;
    default: return "Not attempted.";
  }
}

export function createApplicationLogs({ client, db, audit = async () => {}, economy, authority, joinMember, ownerId = "", verifyUrl = () => "" }) {
  let orgsUrl = () => "";
  let reviewer = null;

  /** Wire the orgs website in: its address and its review function (permission checks live there). */
  function attach({ url, review }) {
    if (typeof url === "function") orgsUrl = url;
    if (typeof review === "function") reviewer = review;
  }

  const reviewLink = (org) => `${orgsUrl().replace(/\/$/, "")}/#/o/${encodeURIComponent(org.slug || org.id)}/applications`;

  async function departmentRecord(org) {
    const records = authority ? await authority.records().catch(() => []) : [];
    const record = recordForOrg(records, org);
    return record?.kind === "department" ? record : null;
  }

  /** Owners, network co-owners and Department Management (the department manager roles). */
  async function isDeptManagement(discordId) {
    if (ownerId && String(discordId) === String(ownerId)) return true;
    const access = await economy.managementAccess(discordId).catch(() => null);
    return Boolean(access?.all || DEPARTMENT_ORG_TYPES.every((type) => access?.types?.has(type)));
  }

  function sendableChannels(guild) {
    const me = guild.members.me;
    return [...guild.channels.cache.values()]
      .filter((channel) => [ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type))
      .filter((channel) => {
        const perms = me ? channel.permissionsFor(me) : null;
        return perms?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks]);
      })
      .sort((a, b) => (a.parent?.rawPosition ?? -1) - (b.parent?.rawPosition ?? -1) || a.rawPosition - b.rawPosition)
      .map((channel) => ({ id: channel.id, name: channel.name, category: channel.parent?.name || null }));
  }

  function serverInfo(guild, { roles = true } = {}) {
    return {
      id: guild.id, name: guild.name,
      channels: sendableChannels(guild),
      roles: roles ? [...guild.roles.cache.values()]
        .filter((role) => role.id !== guild.id && !role.managed)
        .sort((a, b) => b.position - a.position)
        .map((role) => ({ id: role.id, name: role.name, color: role.hexColor === "#000000" ? null : role.hexColor })) : [],
    };
  }

  /** Servers whose channels an organization's own log may use: its department Discord, its Hub and its own server. */
  async function logServers(org) {
    const record = await departmentRecord(org);
    const ids = [record?.externalGuildId, record?.guildId, org.guild_id, isDepartmentOrg(org, record) ? DEPT_HUB_GUILD_ID : null].map(snowflake).filter(Boolean);
    return [...new Set(ids)].map((id) => client.guilds.cache.get(id)).filter(Boolean);
  }

  async function orgLog(orgId) {
    const row = await db.one("SELECT guild_id,channel_id,ping_role_id,buttons,updated_by,updated_at FROM org_application_logs WHERE org_id=?", [Number(orgId)]).catch(() => null);
    return row ? { guildId: String(row.guild_id), channelId: String(row.channel_id), pingRoleId: row.ping_role_id ? String(row.ping_role_id) : null, buttons: Boolean(Number(row.buttons)), updatedBy: row.updated_by || null, updatedAt: Number(row.updated_at || 0) } : null;
  }

  async function mainLog() {
    const row = await db.one("SELECT value,updated_by,updated_at FROM bot_config WHERE `key`=?", [MAIN_LOG_KEY]).catch(() => null);
    let value = row?.value;
    if (typeof value === "string") try { value = JSON.parse(value); } catch { value = null; }
    return value?.channel_id ? { guildId: String(value.guild_id || DEPT_HUB_GUILD_ID), channelId: String(value.channel_id), updatedBy: row.updated_by, updatedAt: Number(row.updated_at || 0) } : null;
  }

  /** Settings shown on the Applications tab. */
  async function overview(actorId, orgRef) {
    const { org, perms } = await economy.accessTo(actorId, orgRef);
    if (!perms.applications && !perms.full) throw new Error("Your rank cannot see application settings.");
    const record = await departmentRecord(org);
    const department = isDepartmentOrg(org, record);
    const externalId = snowflake(record?.externalGuildId);
    const external = externalId ? client.guilds.cache.get(externalId) : null;
    const management = department && (await isDeptManagement(actorId));
    const hub = client.guilds.cache.get(DEPT_HUB_GUILD_ID);
    return {
      canEdit: Boolean(perms.full),
      department,
      departmentGuild: externalId ? { id: externalId, name: external?.name || null, botIn: Boolean(external) } : null,
      log: await orgLog(org.id),
      servers: perms.full ? (await logServers(org)).map((guild) => serverInfo(guild)) : [],
      main: management ? { ...(await mainLog()), hub: hub ? serverInfo(hub, { roles: false }) : null } : null,
    };
  }

  function channelIn(guilds, channelId) {
    for (const guild of guilds) {
      const channel = guild.channels.cache.get(String(channelId));
      if (channel) return { guild, channel };
    }
    return null;
  }

  function assertSendable(found) {
    if (!found || ![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(found.channel.type))
      throw new Error("Pick a text channel the Florida Bay bot can see.");
    const perms = found.guild.members.me ? found.channel.permissionsFor(found.guild.members.me) : null;
    if (!perms?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks]))
      throw new Error(`The Florida Bay bot needs View Channel, Send Messages and Embed Links in #${found.channel.name}.`);
  }

  /** High command: the organization's own application log, its ping role and its message style. */
  async function saveOrgLog(actorId, input) {
    const { org, perms } = await economy.accessTo(actorId, input.orgId);
    if (!perms.full) throw new Error("Only the organization's high command can set its application log.");
    const channelId = snowflake(input.channelId);
    if (!channelId) {
      await db.query("DELETE FROM org_application_logs WHERE org_id=?", [org.id]);
      await audit(actorId, "organization.application_log", org.id, { channel: null });
      return { cleared: true };
    }
    const found = channelIn(await logServers(org), channelId);
    assertSendable(found);
    const pingRoleId = snowflake(input.pingRoleId);
    if (pingRoleId && !found.guild.roles.cache.has(pingRoleId)) throw new Error("The ping role must be in the same server as the log channel.");
    const buttons = input.buttons === true || input.buttons === "true" || input.buttons === "buttons" || input.buttons === 1;
    await db.query(
      `INSERT INTO org_application_logs(org_id,guild_id,channel_id,ping_role_id,buttons,updated_by,updated_at) VALUES(?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE guild_id=VALUES(guild_id),channel_id=VALUES(channel_id),ping_role_id=VALUES(ping_role_id),buttons=VALUES(buttons),updated_by=VALUES(updated_by),updated_at=VALUES(updated_at)`,
      [org.id, found.guild.id, channelId, pingRoleId, buttons, String(actorId), Date.now()],
    );
    await audit(actorId, "organization.application_log", org.id, { guild: found.guild.id, channel: channelId, pingRoleId, buttons });
    return { channel: found.channel.name, server: found.guild.name, buttons };
  }

  /** Department Management only: the main application log in the Department Hub. */
  async function saveMainLog(actorId, input) {
    if (!(await isDeptManagement(actorId))) throw new Error("Only Department Management can set the main application log.");
    const channelId = snowflake(input.channelId);
    if (!channelId) {
      await db.query("DELETE FROM bot_config WHERE `key`=?", [MAIN_LOG_KEY]);
      await audit(actorId, "organization.application_main_log", MAIN_LOG_KEY, { channel: null });
      return { cleared: true };
    }
    const hub = client.guilds.cache.get(DEPT_HUB_GUILD_ID);
    if (!hub) throw new Error("The Florida Bay bot is not in the Department Hub.");
    const found = channelIn([hub], channelId);
    assertSendable(found);
    await db.query(
      "INSERT INTO bot_config(`key`,value,updated_by,updated_at) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE value=VALUES(value),updated_by=VALUES(updated_by),updated_at=VALUES(updated_at)",
      [MAIN_LOG_KEY, JSON.stringify({ guild_id: hub.id, channel_id: channelId }), String(actorId), Date.now()],
    );
    await audit(actorId, "organization.application_main_log", MAIN_LOG_KEY, { channel: channelId });
    return { channel: found.channel.name };
  }

  function components(org, application, { buttons }) {
    const row = new ActionRowBuilder();
    if (buttons)
      row.addComponents(
        new ButtonBuilder().setCustomId(applicationCustomId("accept", application.id)).setLabel("Accept").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(applicationCustomId("deny", application.id)).setLabel("Deny").setStyle(ButtonStyle.Danger),
      );
    const link = reviewLink(org);
    if (/^https?:\/\//.test(link)) row.addComponents(new ButtonBuilder().setLabel("Open on the website").setStyle(ButtonStyle.Link).setURL(link));
    return row.components.length ? [row] : [];
  }

  async function post(target, org, application, { kind, buttons, pingRoleId = null }) {
    const guild = client.guilds.cache.get(target.guildId);
    const channel = guild?.channels.cache.get(target.channelId);
    if (!channel?.isTextBased?.()) return;
    const message = await channel.send({
      content: pingRoleId ? `<@&${pingRoleId}>` : undefined,
      embeds: [applicationEmbed({ org, application })],
      components: components(org, application, { buttons }),
      allowedMentions: { roles: pingRoleId ? [pingRoleId] : [], users: [] },
    });
    await db.query("INSERT IGNORE INTO org_application_messages(application_id,channel_id,message_id,kind) VALUES(?,?,?,?)", [Number(application.id), channel.id, message.id, kind]);
  }

  /** A new application: post it to the main log (departments) and the organization's own log. */
  async function applied({ org, application }) {
    const record = await departmentRecord(org).catch(() => null);
    const posts = [];
    const main = isDepartmentOrg(org, record) ? await mainLog() : null;
    const own = await orgLog(org.id);
    if (main && !(own && own.channelId === main.channelId)) posts.push(post(main, org, application, { kind: "main", buttons: false }));
    if (own) posts.push(post(own, org, application, { kind: "org", buttons: own.buttons, pingRoleId: own.pingRoleId }));
    for (const result of await Promise.allSettled(posts))
      if (result.status === "rejected") console.error("[FBRP orgs] application log:", result.reason?.message || result.reason);
  }

  /** Edit every posted message of an application to show the decision; buttons go away. */
  async function updateMessages(org, application, { decision, reviewerId, join }) {
    const rows = await db.query("SELECT channel_id,message_id FROM org_application_messages WHERE application_id=?", [Number(application.id)]).catch(() => []);
    for (const row of rows) {
      try {
        const channel = client.channels.cache.get(String(row.channel_id)) || await client.channels.fetch(String(row.channel_id));
        const message = await channel.messages.fetch(String(row.message_id));
        await message.edit({ content: message.content || null, embeds: [applicationEmbed({ org, application, decision, reviewerId, join })], components: components(org, application, { buttons: false }), allowedMentions: { parse: [] } });
      } catch (error) {
        console.error("[FBRP orgs] application log edit:", error.message || error);
      }
    }
  }

  /** Add an accepted applicant to the department's own Discord. */
  async function joinDepartment(org, discordId) {
    const record = await departmentRecord(org);
    const guildId = snowflake(record?.externalGuildId);
    if (!guildId) return { state: "no_guild" };
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return { state: "bot_missing", guildId };
    const base = { guildId, guildName: guild.name };
    if (await guild.members.fetch(String(discordId)).catch(() => null)) return { ...base, state: "already" };
    try {
      const user = await client.users.fetch(String(discordId));
      const result = await joinMember(guild, user);
      return { ...base, state: result?.state || "failed" };
    } catch (error) {
      return { ...base, state: "failed", error: error.message || String(error) };
    }
  }

  /** Called by the orgs website after a review was saved. Returns how the department join went. */
  async function reviewed({ org, application, decision, actorId }) {
    let join = null;
    if (decision === "accepted" && isDepartmentOrg(org, await departmentRecord(org).catch(() => null))) {
      join = await joinDepartment(org, application.discord_id);
      await db.query("UPDATE org_applications SET join_state=?,join_guild_id=? WHERE id=?", [join.state, join.guildId || null, Number(application.id)]).catch(() => {});
      await audit(actorId, "organization.application_join", org.id, { applicant: application.discord_id, state: join.state, guild: join.guildId || null });
    }
    await updateMessages(org, application, { decision, reviewerId: actorId, join });
    return { join, verifyUrl: join?.state === "authorization_required" ? verifyUrl() : "" };
  }

  /** After someone verifies: add them to departments that accepted them while they could not be added. */
  async function retryJoins(discordId) {
    const rows = await db.query(
      "SELECT a.id,a.org_id,a.discord_id,a.answers,a.reviewer_id,a.created_at,o.id oid,o.slug,o.name,o.type,o.color,o.guild_id FROM org_applications a JOIN organizations o ON o.id=a.org_id WHERE a.discord_id=? AND a.status='accepted' AND a.join_state='authorization_required' AND a.reviewed_at>=?",
      [String(discordId), Date.now() - PENDING_JOIN_DAYS * 86400000],
    ).catch(() => []);
    const results = [];
    for (const row of rows) {
      const org = { id: Number(row.oid), slug: row.slug, name: row.name, type: row.type, color: row.color, guild_id: row.guild_id };
      const join = await joinDepartment(org, discordId);
      await db.query("UPDATE org_applications SET join_state=?,join_guild_id=? WHERE id=?", [join.state, join.guildId || null, Number(row.id)]).catch(() => {});
      const application = { id: Number(row.id), discord_id: String(row.discord_id), answers: parseAnswers(row.answers), created_at: Number(row.created_at) };
      await updateMessages(org, application, { decision: "accepted", reviewerId: row.reviewer_id, join });
      if (join.state === "joined")
        await client.users.fetch(String(discordId)).then((user) => user.send(`✅ You were added to the **${join.guildName}** Discord for **${org.name}**.`)).catch(() => {});
      results.push({ org: org.name, state: join.state });
    }
    return results;
  }

  /** Accept and Deny buttons on a log message (and the optional deny note). */
  async function handleInteraction(i) {
    const parsed = parseApplicationCustomId(i.customId);
    if (!parsed) return false;
    if (parsed.action === "deny" && i.isButton()) {
      const modal = new ModalBuilder().setCustomId(applicationCustomId("note", parsed.id)).setTitle("Deny application").addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("note").setLabel("Note to the applicant (optional)").setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(500)),
      );
      await i.showModal(modal);
      return true;
    }
    await i.deferReply({ ephemeral: true });
    try {
      if (!reviewer) throw new Error("The orgs website is still starting. Try again in a moment.");
      const application = await db.one("SELECT id,org_id FROM org_applications WHERE id=?", [parsed.id]);
      if (!application) throw new Error("That application no longer exists.");
      const decision = parsed.action === "accept" ? "accepted" : "denied";
      const note = parsed.action === "note" ? i.fields.getTextInputValue("note") : "";
      const result = await reviewer(i.user.id, { orgId: application.org_id, applicationId: application.id, decision, note });
      const lines = [`Application ${decision}.`, result.dm ? "The applicant was told by DM." : "Their DMs are closed, so tell them yourself."];
      if (result.join) lines.push(joinSummary(result.join));
      await i.editReply({ content: lines.join(" ") });
    } catch (error) {
      await i.editReply({ content: error.message || "Could not review that application." });
    }
    return true;
  }

  return { attach, overview, saveOrgLog, saveMainLog, applied, reviewed, retryJoins, handleInteraction, isDeptManagement, joinDepartment };
}

function parseAnswers(value) {
  if (Array.isArray(value)) return value;
  try { return JSON.parse(String(value ?? "[]")); } catch { return []; }
}
