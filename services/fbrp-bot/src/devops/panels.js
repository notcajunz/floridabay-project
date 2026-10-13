import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { allMembers, config, db, ranks, setConfig } from "./store.js";
import { BRAND, C, card, channelMention, pages, roleMention } from "./util.js";

/**
 * Persistent panels: one bot-owned message per panel that is edited in place.
 * The panel name is also the channel key it lives in.
 */
export const PANELS = ["welcome", "rules", "chain", "status", "tasks"];

const notifyRow = () =>
  new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("dv:notify:releases").setLabel("Releases").setEmoji("🚀").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("dv:notify:outages").setLabel("Outages").setEmoji("🚨").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("dv:notify:announcements").setLabel("Announcements").setEmoji("📣").setStyle(ButtonStyle.Secondary),
  );

function welcomeEmbeds(guild, cfg) {
  const ch = (key) => channelMention(cfg.channels[key]);
  return [
    card(`Welcome to ${guild.name}`, {
      color: C.teal,
      thumbnail: guild.iconURL({ size: 256 }),
      description: [
        "This is the home of the **Florida Bay Roleplay** development team: the people who build and run the scripts, bots, website and vehicles behind the city.",
        "",
        `🎫 **Need help or have a purchase question?** Open a private ticket in ${ch("tickets")}.`,
        `🚀 **What did we ship?** See ${ch("releases")}.`,
        `🟢 **Is something down?** Check ${ch("status")}.`,
        `⛓️ **Who is who?** See ${ch("chain")}.`,
      ].join("\n"),
      timestamp: false,
    }),
    card("🔔 Notification roles", {
      color: C.blue,
      description: "Pick what you want to be pinged for. Press a button again to turn it off.\n\n🚀 **Releases** · new versions and changelogs\n🚨 **Outages** · incidents and downtime\n📣 **Announcements** · team and community news",
      timestamp: false,
    }),
  ];
}

function rulesEmbeds() {
  return [
    card("📜 Server rules", {
      color: C.teal,
      description: [
        "**1 · Be respectful.** No harassment, hate or personal attacks.",
        "**2 · Use tickets for support.** Do not DM developers for help. Open a ticket so the right team can see it.",
        "**3 · Never share secrets.** Tokens, passwords, keys and private code stay private. If one leaks, tell leadership immediately.",
        "**4 · No spam or advertising.** That includes invite links and unsolicited DMs.",
        "**5 · Keep it on topic.** Use the channel that fits the conversation.",
        "**6 · Purchases go through Purchase Support.** Refunds and disputes are decided in a ticket, not in public chat.",
        "**7 · Staff decisions are final** unless appealed respectfully through a ticket.",
        "**8 · Follow the Discord Terms of Service** and Community Guidelines.",
      ].join("\n\n"),
      timestamp: false,
    }),
    card("🛠️ Team standards", {
      color: C.blue,
      description: [
        "**Ship safely.** Review before anything goes live, and log deploys in the deployments channel.",
        "**Write it down.** Changes get a release note. Incidents get a timeline.",
        "**Stay in your lane.** Act inside your rank and ask leadership when unsure.",
        "**Protect the community.** Player data and private tickets are confidential.",
      ].join("\n\n"),
      footer: `${BRAND} · Breaking these may lead to discipline up to removal`,
      timestamp: false,
    }),
  ];
}

/* ------------------------------------------------------------------ roster views */

export async function rosterData(guild) {
  const ladder = await ranks();
  const members = await allMembers(guild);
  const cfg = await config();
  const byRank = new Map(ladder.map((r) => [r.role_id, []]));
  const trials = Object.fromEntries((await db.query("SELECT discord_id,trial_ends_at FROM devops_members WHERE status<>'removed' AND trial_ends_at IS NOT NULL")).map((r) => [r.discord_id, Number(r.trial_ends_at)]));
  for (const m of members.values()) {
    if (m.user.bot) continue;
    const rank = ladder.find((r) => m.roles.cache.has(r.role_id));
    if (!rank) continue;
    const flags = [
      cfg.roles.loa && m.roles.cache.has(cfg.roles.loa) ? "🌴" : "",
      cfg.roles.suspended && m.roles.cache.has(cfg.roles.suspended) ? "⛔" : "",
      cfg.roles.warned && m.roles.cache.has(cfg.roles.warned) ? "⚠️" : "",
      cfg.roles.dotm && m.roles.cache.has(cfg.roles.dotm) ? "🌟" : "",
      trials[m.id] && trials[m.id] > Date.now() ? "🎓" : "",
    ].join("");
    byRank.get(rank.role_id).push({ member: m, flags });
  }
  for (const list of byRank.values()) list.sort((a, b) => a.member.displayName.localeCompare(b.member.displayName));
  return { ladder, byRank, cfg };
}

const person = (p) => `${p.member}${p.flags ? ` ${p.flags}` : ""}`;

export async function chainEmbeds(guild) {
  const { ladder, byRank, cfg } = await rosterData(guild);
  const embeds = [];
  const colors = { leadership: C.gold, developer: C.blue };
  let total = 0;
  for (const tier of ["leadership", "developer"]) {
    const lines = [];
    for (const rank of ladder.filter((r) => r.tier === tier)) {
      const people = byRank.get(rank.role_id);
      total += people.length;
      lines.push(`**${roleMention(rank.role_id)}** · ${people.length}\n${people.length ? people.map((p) => `┗ ${person(p)}`).join("\n") : "┗ *Vacant*"}`);
    }
    if (lines.length)
      embeds.push(
        card(tier === "leadership" ? "👑 Leadership" : "💻 Developers", {
          color: colors[tier],
          description: pages(lines, 4000)[0],
          timestamp: false,
        }),
      );
  }
  const divisions = [];
  const members = await allMembers(guild);
  for (const id of cfg.roles.divisions || []) {
    const role = guild.roles.cache.get(id);
    if (!role) continue;
    const count = members.filter((m) => !m.user.bot && m.roles.cache.has(id) && ladder.some((r) => m.roles.cache.has(r.role_id))).size;
    divisions.push(`${roleMention(id)} · **${count}**`);
  }
  if (divisions.length) embeds.push(card("🧩 Teams", { color: C.purple, description: divisions.join("\n"), timestamp: false }));
  if (embeds.length) embeds[0].setAuthor({ name: "FBRP DEVOPS · CHAIN OF COMMAND" });
  embeds.push(
    card("📊 Team strength", {
      color: C.grey,
      description: `**${total}** developer${total === 1 ? "" : "s"} across **${ladder.length}** ranks.\n🎓 on trial · 🌴 on leave · ⛔ suspended · ⚠️ warned · 🌟 Developer of the Month`,
    }),
  );
  return embeds.slice(0, 10);
}

/* ------------------------------------------------------------------ rendering */

async function payloadFor(guild, name) {
  const cfg = await config();
  if (name === "welcome") return { embeds: welcomeEmbeds(guild, cfg), components: [notifyRow()] };
  if (name === "rules") return { embeds: rulesEmbeds(), components: [] };
  if (name === "chain") return { embeds: await chainEmbeds(guild), components: [] };
  if (name === "status") return (await import("./status.js")).statusPayload(guild);
  if (name === "tasks") return (await import("./tasks.js")).boardPayload(guild);
  return null;
}

/** Creates or edits the panel message. Returns it, or null when its channel is not configured. */
export async function renderPanel(guild, name, { fresh = false } = {}) {
  const cfg = await config();
  const channelId = cfg.channels[name];
  if (!channelId) return null;
  const channel = guild.channels.cache.get(channelId) || (await guild.channels.fetch(channelId).catch(() => null));
  if (!channel?.isTextBased()) return null;
  const payload = await payloadFor(guild, name);
  if (!payload) return null;
  const body = { ...payload, allowedMentions: { parse: [] } };
  const saved = cfg.panels[name];
  if (saved && !fresh && saved.channelId === channelId) {
    const message = await channel.messages.fetch(saved.messageId).catch(() => null);
    if (message) return message.edit(body);
  }
  if (saved && fresh) {
    const old = await channel.messages.fetch(saved.messageId).catch(() => null);
    await old?.delete().catch(() => null);
  }
  const message = await channel.send(body);
  await setConfig(`panel:${name}`, { channelId, messageId: message.id });
  return message;
}

export async function renderAll(guild, options) {
  const done = [];
  for (const name of PANELS) if (await renderPanel(guild, name, options).catch((e) => console.warn(`[DevOps] panel ${name}: ${e.message}`))) done.push(name);
  return done;
}

/** Fire-and-forget refresh after a roster change. Debounced so a burst of edits renders once. */
const pending = new Map();
export function refreshPanels(guild, ...names) {
  for (const name of names) {
    const key = `${guild.id}:${name}`;
    clearTimeout(pending.get(key));
    pending.set(
      key,
      setTimeout(() => {
        pending.delete(key);
        renderPanel(guild, name).catch((e) => console.warn(`[DevOps] refresh ${name}: ${e.message}`));
      }, 4000),
    );
  }
}

