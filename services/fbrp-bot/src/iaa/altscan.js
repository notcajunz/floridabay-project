import { AttachmentBuilder, SnowflakeUtil } from "discord.js";
import { IP_MAX_SHARERS } from "../alts.js";
import { collectMembers } from "../altscan-members.js";
import { db, demand, post } from "./store.js";
import { C, EPHEMERAL, card, clip, mention, respond, ts } from "./util.js";

/**
 * Alt-account scan across every Florida Bay network server.
 *
 * Discord does not expose profile bios to bots (the profile endpoint is user-only), so the
 * "empty or generic bio" signal is approximated by what a bot can see: default avatar, no
 * nickname, a throwaway-looking username and no linked connections on the website.
 *
 * The IAA bot is only in the IAA and main servers. It reads those itself and hands every other network
 * server to the main bot through iaa_altscan_jobs (src/altscan-queue.js), then merges and scores.
 * Members are read live from Discord, so people who joined but never verified are included.
 *
 * Nothing is punished here. The scan only reports; staff decide what to do with the list.
 */

export const DEFAULT_MIN_SCORE = 40;
const DAY = 86400000;
const STRONG_IDENTIFIER = "^(license|license2|fivem|steam|xbl|live):";
const GENERIC_NAME = /^(user|member|player|guest|discord|new)?[_.\-]?\d{3,}$|\d{5,}$|^[a-z]+_[a-z]+\d{2,}$/i;

const isDefaultAvatar = (avatar) => !avatar || /\/embed\/avatars\//.test(String(avatar));
const createdAt = (id) => Number(SnowflakeUtil.deconstruct(String(id)).timestamp);

/**
 * Scores one account from its signals. Pure so the weights are testable.
 * @returns {{ score: number, level: "likely"|"suspicious"|"clean", reasons: string[] }}
 */
export function scoreAccount(signals, now = Date.now()) {
  const reasons = [];
  let score = 0;
  const add = (points, why) => {
    score += points;
    reasons.push(why);
  };

  const ageDays = Math.floor((now - signals.created) / DAY);
  if (ageDays < 7) add(35, `account ${ageDays}d old`);
  else if (ageDays < 30) add(25, `account ${ageDays}d old`);
  else if (ageDays < 90) add(10, `account ${ageDays}d old`);
  else if (ageDays < 180) add(4, `account ${ageDays}d old`);

  const emptyProfile = [];
  if (isDefaultAvatar(signals.avatar)) emptyProfile.push("default avatar");
  if (!signals.nickname) emptyProfile.push("no nickname");
  if (!signals.connections) emptyProfile.push("no linked connections");
  if (emptyProfile.length >= 2 || (emptyProfile.length && ageDays < 30)) add(5 + emptyProfile.length * 5, `empty profile (${emptyProfile.join(", ")})`);
  if (signals.username && GENERIC_NAME.test(signals.username)) add(10, "generic username");

  const strong = signals.strongLinks.size;
  const network = signals.networkLinks.size;
  if (strong) add(Math.min(60, 40 + (strong - 1) * 10), `shares a game/platform identity with ${strong} other account(s)`);
  if (network) add(Math.min(30, 20 + (network - 1) * 5), `shares an IP with ${network} other account(s)`);
  if (signals.bannedLinks) add(30, `linked to ${signals.bannedLinks} globally banned account(s)`);
  if (signals.unverified) add(8, "never verified on the website");
  if (signals.servers >= 4 && ageDays < 30) add(5, `already in ${signals.servers} network servers`);

  score = Math.min(100, score);
  return { score, level: score >= 65 ? "likely" : score >= DEFAULT_MIN_SCORE ? "suspicious" : "clean", reasons };
}

/** Groups of accounts that share one value (connection, IP hash, game identifier). */
function groupsOf(rows, keyOf, idOf, { max = Infinity } = {}) {
  const groups = new Map();
  for (const row of rows) {
    const key = keyOf(row);
    if (!groups.has(key)) groups.set(key, new Set());
    groups.get(key).add(String(idOf(row)));
  }
  return [...groups.values()].filter((set) => set.size > 1 && set.size <= max);
}

async function gather() {
  const links = await db.query("SELECT discord_id, kind, value_hash FROM identity_links");
  const connections = new Map();
  for (const row of links) if (row.kind !== "ip") connections.set(String(row.discord_id), (connections.get(String(row.discord_id)) || 0) + 1);

  const strongGroups = groupsOf(links.filter((r) => r.kind !== "ip"), (r) => `${r.kind}:${r.value_hash}`, (r) => r.discord_id);
  const networkGroups = groupsOf(links.filter((r) => r.kind === "ip"), (r) => r.value_hash, (r) => r.discord_id, { max: IP_MAX_SHARERS });

  // Game server identities. The game database is optional context: a failure must not sink the scan.
  try {
    const rows = await db.query(
      `SELECT i.identifier, p.discord_id
         FROM player_identifiers i JOIN players p ON p.id=i.player_id
        WHERE p.discord_id IS NOT NULL AND i.identifier REGEXP ?`,
      [STRONG_IDENTIFIER],
    );
    strongGroups.push(...groupsOf(rows, (r) => r.identifier, (r) => r.discord_id));
    const licenses = await db.query("SELECT license, discord_id FROM players WHERE discord_id IS NOT NULL AND license IS NOT NULL AND license<>''");
    strongGroups.push(...groupsOf(licenses, (r) => r.license, (r) => r.discord_id));
  } catch (error) {
    console.warn(`[IAA] alt-scan game identity lookup failed: ${error.message}`);
  }

  const banned = new Set(
    (await db.query("SELECT DISTINCT target_id FROM moderation_cases WHERE guild_id='global' AND action IN ('ban','blacklist') AND active=1")).map((r) => String(r.target_id)),
  );
  const verified = new Set((await db.query("SELECT discord_id FROM member_verifications")).map((r) => String(r.discord_id)));
  return { connections, strongGroups, networkGroups, banned, verified };
}

/** Scores the given members (Map of id -> collected member) and returns the flagged ones, worst first. */
export async function scan(members, { minScore = DEFAULT_MIN_SCORE, now = Date.now() } = {}) {
  const { connections, strongGroups, networkGroups, banned, verified } = await gather();
  const ids = new Set(members.keys());
  const strong = new Map();
  const network = new Map();
  const index = (groups, into) => {
    for (const group of groups)
      for (const id of group) {
        if (!ids.has(id)) continue;
        if (!into.has(id)) into.set(id, new Set());
        for (const other of group) if (other !== id) into.get(id).add(other);
      }
  };
  index(strongGroups, strong);
  index(networkGroups, network);

  const results = [];
  for (const member of members.values()) {
    const id = member.id;
    const strongLinks = strong.get(id) || new Set();
    const networkLinks = new Set([...(network.get(id) || [])].filter((other) => !strongLinks.has(other)));
    const linked = [...strongLinks, ...networkLinks];
    const verdict = scoreAccount(
      {
        created: createdAt(id),
        username: member.username,
        nickname: member.display,
        avatar: member.defaultAvatar ? null : "custom",
        servers: member.servers,
        unverified: !verified.has(id),
        connections: connections.get(id) || 0,
        strongLinks,
        networkLinks,
        bannedLinks: linked.filter((other) => banned.has(other)).length,
      },
      now,
    );
    if (verdict.score >= minScore) results.push({ id, username: member.username, servers: member.servers, linked, banned: banned.has(id), ...verdict });
  }
  results.sort((a, b) => b.score - a.score);
  return { scanned: members.size, flagged: results, minScore, unverified: [...ids].filter((id) => !verified.has(id)).length };
}

const csvCell = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;

export function toCsv(results) {
  const header = ["discord_id", "username", "score", "level", "network_servers", "linked_accounts", "reasons"];
  const rows = results.map((r) => [r.id, r.username, r.score, r.level, r.servers, r.linked.join(" "), r.reasons.join("; ")]);
  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
}

const WAIT_MS = 12 * 60000;
const POLL_MS = 3000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Hands the servers this bot is not in to the main bot and waits for the members it read. */
async function handOff(guildIds, requestedBy, onProgress) {
  const job = await db.query("INSERT INTO iaa_altscan_jobs(guild_ids,requested_by,requested_at) VALUES(?,?,?)", [JSON.stringify(guildIds), requestedBy, Date.now()]);
  const id = job.insertId;
  const deadline = Date.now() + WAIT_MS;
  while (Date.now() < deadline) {
    const row = await db.one("SELECT status,progress,problems FROM iaa_altscan_jobs WHERE id=?", [id]);
    if (row.status === "done") {
      const members = await db.query("SELECT discord_id,username,display,default_avatar,servers FROM iaa_altscan_members WHERE job_id=?", [id]);
      await db.query("DELETE FROM iaa_altscan_members WHERE job_id=?", [id]);
      return { members, problems: row.problems ? row.problems.split("\n") : [] };
    }
    if (row.status === "failed") return { members: [], problems: [`Main bot failed: ${row.problems || "unknown error"}`] };
    await onProgress(row.status === "queued" ? "waiting for the main bot to pick it up" : row.progress || "main bot is reading members");
    await sleep(POLL_MS);
  }
  await db.query("UPDATE iaa_altscan_jobs SET status='expired', finished_at=? WHERE id=? AND status='queued'", [Date.now(), id]);
  return { members: [], problems: ["The main bot did not finish in time, so the other network servers were not scanned."] };
}

export async function command(i, actor) {
  await demand(actor, "intel.manage");
  const minScore = i.options.getInteger("min_score") ?? DEFAULT_MIN_SCORE;
  await i.deferReply(EPHEMERAL);
  const status = (text) => i.editReply({ embeds: [card("🕵️ Network alt-account scan", { color: C.navy, description: text })] }).catch(() => null);

  const network = await db.query("SELECT guild_id FROM network_guilds");
  const wanted = new Set([...network.map((n) => String(n.guild_id)), i.guild.id]);
  const local = [...wanted].map((id) => i.client.guilds.cache.get(id)).filter(Boolean);
  const remote = [...wanted].filter((id) => !i.client.guilds.cache.has(id));

  await status(`Reading ${local.length} server(s) here${remote.length ? ` and handing ${remote.length} other network server(s) to the main bot` : ""}…`);
  const handed = remote.length ? handOff(remote, i.user.id, (text) => status(`Main bot: ${text}`)) : Promise.resolve({ members: [], problems: [] });
  const here = await collectMembers(local);
  const there = await handed;

  const members = here.members;
  for (const row of there.members) {
    const id = String(row.discord_id);
    const seen = members.get(id);
    if (seen) {
      seen.servers += Number(row.servers);
      seen.display ||= row.display;
    } else members.set(id, { id, username: row.username, display: row.display, defaultAvatar: Boolean(row.default_avatar), servers: Number(row.servers) });
  }
  const problems = [...here.problems, ...there.problems];

  await status(`Scoring ${members.size} member(s)…`);
  const { scanned, flagged, unverified } = await scan(members, { minScore });
  const likely = flagged.filter((r) => r.level === "likely");

  const top = flagged
    .slice(0, 15)
    .map((r) => `${r.level === "likely" ? "🔴" : "🟠"} ${mention(r.id)} **${r.score}** · ${clip(r.reasons.join(", "), 140)}`)
    .join("\n");
  const embed = card("🕵️ Network alt-account scan", {
    color: likely.length ? C.red : flagged.length ? C.amber : C.green,
    description: [
      `Scanned **${scanned}** distinct member(s) across **${local.length + (remote.length && there.members.length ? remote.length : 0)}** network server(s), including **${unverified}** who never verified.`,
      `**${flagged.length}** flagged at score ≥ ${minScore}: **${likely.length}** likely alt(s), **${flagged.length - likely.length}** suspicious.`,
      problems.length ? `\n⚠️ **Not fully covered:**\n${clip(problems.map((p) => `• ${p}`).join("\n"), 700)}` : "",
      "",
      top || "No accounts met the threshold.",
      flagged.length > 15 ? `\n…and ${flagged.length - 15} more in the attached CSV.` : "",
    ].join("\n"),
    footer: "Indicators, not proof. Discord hides profile bios from bots, so empty-profile checks use avatar, display name and linked connections. Nobody was punished.",
  });

  await db.query("INSERT INTO audit_log(actor_id,action,target_id,payload,created_at) VALUES(?, 'iaa.intel.alt_scan', NULL, ?, ?)", [
    i.user.id,
    JSON.stringify({ scanned, unverified, flagged: flagged.length, likely: likely.length, minScore, handedOff: remote.length, problems: problems.length }),
    Date.now(),
  ]);
  await post(i.guild, "botLogs", {
    embeds: [card("🕵️ Network alt-account scan run", { color: C.grey, description: `By ${mention(i.user.id)} ${ts(Date.now(), "R")} · ${scanned} scanned, ${flagged.length} flagged (${likely.length} likely).` })],
  });

  const files = flagged.length ? [new AttachmentBuilder(Buffer.from(toCsv(flagged), "utf8"), { name: "alt-scan.csv" })] : [];
  return respond(i, { embeds: [embed], files });
}
