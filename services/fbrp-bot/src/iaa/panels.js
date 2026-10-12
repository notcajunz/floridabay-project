import { allMembers, config, db, ranks, setConfig } from "./store.js";
import { C, card, mention, pages, roleMention } from "./util.js";

/**
 * Self-updating messages: one message per panel, edited in place. Changes queue a refresh that runs
 * a few seconds later so a burst of promotions only edits each panel once.
 */

const BUILDERS = {
  chain: async (guild) => ({ embeds: await chainEmbeds(guild) }),
  directory: async (guild) => ({ embeds: (await directoryEmbeds(guild)).slice(0, 10) }),
  board: async () => ({ embeds: await (await import("./investigations.js")).boardEmbeds() }),
  leaderboard: async () => ({ embeds: [await leaderboardEmbed()] }),
  blacklistedServers: async () => ({ embeds: [await (await import("./intel.js")).serverListEmbed()] }),
};
export const PANELS = Object.keys(BUILDERS);

const queue = new Set();
let timer = null;

export function refreshPanels(guild, ...names) {
  for (const name of names) queue.add(name);
  if (timer) return;
  timer = setTimeout(async () => {
    timer = null;
    const batch = [...queue];
    queue.clear();
    for (const name of batch) await renderPanel(guild, name).catch((e) => console.warn(`[IAA] panel ${name}: ${e.message}`));
  }, 4000);
}

/** Edits the panel message, or posts a new one if it is gone. `force` always posts fresh. */
export async function renderPanel(guild, name, { force = false } = {}) {
  const cfg = await config();
  const channelId = cfg.channels[name];
  if (!channelId || !BUILDERS[name]) return null;
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased()) return null;
  const payload = await BUILDERS[name](guild);
  const saved = cfg.panels[name];
  if (!force && saved?.channelId === channelId) {
    const message = await channel.messages.fetch(saved.messageId).catch(() => null);
    if (message) return message.edit(payload);
  }
  const message = await channel.send(payload);
  await setConfig(`panel:${name}`, { channelId, messageId: message.id });
  return message;
}

export async function renderAll(guild, options) {
  const done = [];
  for (const name of PANELS) if (await renderPanel(guild, name, options).catch(() => null)) done.push(name);
  return done;
}

/* ------------------------------------------------------------------ roster views */

async function rosterData(guild) {
  const ladder = await ranks();
  const members = await allMembers(guild);
  const records = Object.fromEntries((await db.query("SELECT discord_id,callsign FROM iaa_members WHERE status<>'removed'")).map((r) => [r.discord_id, r.callsign]));
  const cfg = await config();
  const byRank = new Map(ladder.map((r) => [r.role_id, []]));
  for (const m of members.values()) {
    if (m.user.bot) continue;
    const rank = ladder.find((r) => m.roles.cache.has(r.role_id));
    if (!rank) continue;
    const flags = [
      cfg.roles.loa && m.roles.cache.has(cfg.roles.loa) ? "🌴" : "",
      cfg.roles.underInvestigation && m.roles.cache.has(cfg.roles.underInvestigation) ? "🔎" : "",
      cfg.roles.orientation && m.roles.cache.has(cfg.roles.orientation) ? "🎓" : "",
    ].join("");
    byRank.get(rank.role_id).push({ member: m, callsign: records[m.id] || null, flags });
  }
  for (const list of byRank.values()) list.sort((a, b) => String(a.callsign || "~").localeCompare(String(b.callsign || "~"), undefined, { numeric: true }));
  return { ladder, byRank, cfg };
}

const person = (p) => `${p.callsign ? `\`${p.callsign}\` ` : ""}${p.member}${p.flags ? ` ${p.flags}` : ""}`;

/** Command staff by name, agents as head counts per rank. */
export async function chainEmbeds(guild) {
  const { ladder, byRank, cfg } = await rosterData(guild);
  const tiers = [...cfg.tiers].sort((a, b) => b.index - a.index);
  const embeds = [];
  for (const tier of tiers) {
    const tierRanks = ladder.filter((r) => r.tier === tier.key);
    if (!tierRanks.length) continue;
    const lines = [];
    for (const rank of tierRanks) {
      const people = byRank.get(rank.role_id);
      if (tier.key === "agent") lines.push(`${roleMention(rank.role_id)} · **${people.length}**`);
      else lines.push(`**${rank.name}**\n${people.length ? people.map((p) => `┗ ${person(p)}`).join("\n") : "┗ *Vacant*"}`);
    }
    embeds.push(
      card(`${tier.key === "agent" ? "🛡️" : "⭐"} ${tier.label}`, {
        color: tier.key === "high_command" ? C.gold : tier.key === "agent" ? C.navy : C.blue,
        description: pages(lines, 4000)[0],
        footer: tier.index === tiers[tiers.length - 1].index ? "🌴 on leave · 🔎 under investigation · 🎓 needs orientation" : undefined,
      }),
    );
  }
  if (embeds.length) embeds[0].setAuthor({ name: "INTERNAL AFFAIRS AGENCY · CHAIN OF COMMAND" });
  const total = [...byRank.values()].reduce((n, l) => n + l.length, 0);
  embeds.push(card("📊 Agency strength", { color: C.grey, description: `**${total}** sworn personnel across **${ladder.length}** ranks.` }));
  return embeds.slice(0, 10);
}

/** Everyone, by rank, with callsigns. */
export async function directoryEmbeds(guild) {
  const { ladder, byRank } = await rosterData(guild);
  const lines = [];
  for (const rank of ladder) {
    const people = byRank.get(rank.role_id);
    if (!people.length) continue;
    lines.push(`\n**${rank.name}** · ${people.length}`);
    for (const p of people) lines.push(`${person(p)}`);
  }
  return pages(lines, 3900).map((text, n) =>
    card(n ? "📱 Employee directory (cont.)" : "📱 IAA employee directory", { color: C.navy, description: text.trim() || "*Nobody on the roster yet.*" }),
  );
}

export async function leaderboardEmbed() {
  const now = Date.now();
  const [investigators, decorated] = await Promise.all([
    db.query("SELECT lead_id,COUNT(*) n FROM iaa_cases WHERE status='closed' AND lead_id IS NOT NULL AND closed_at>=? GROUP BY lead_id ORDER BY n DESC LIMIT 5", [now - 30 * 86400000]),
    db.query("SELECT discord_id,COUNT(*) n FROM iaa_awards GROUP BY discord_id ORDER BY n DESC LIMIT 5"),
  ]);
  const medal = (n) => ["🥇", "🥈", "🥉"][n] || `\`${String(n + 1).padStart(2, " ")}\``;
  return card("🏆 IAA Leaderboard", {
    color: C.gold,
    fields: [
      ["🕵️ Top investigators · 30 days", investigators.map((r, n) => `${medal(n)} ${mention(r.lead_id)} · ${r.n} case${Number(r.n) === 1 ? "" : "s"} closed`).join("\n") || "—", false],
      ["🎖️ Most decorated", decorated.map((r, n) => `${medal(n)} ${mention(r.discord_id)} · ${r.n}`).join("\n") || "—", false],
    ],
    footer: "Refreshes every 10 minutes",
  });
}
