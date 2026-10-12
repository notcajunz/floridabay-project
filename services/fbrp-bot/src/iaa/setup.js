import { ChannelType } from "discord.js";
import { allMembers, config, db, invalidateRanks, setConfig } from "./store.js";
import { card, C, roleMention, channelMention, shortRole } from "./util.js";

/**
 * Reads the server's existing roles and channels and turns them into the rank ladder and channel map.
 *
 * Roles
 *  - Command tiers are the plain group roles (Supervisor, Low Command, Trial High Command, High Command).
 *    A tier covers every rank above it up to the next tier role, so "IAA | High Command" (below Assistant
 *    Director) covers Assistant Director through Overseer.
 *  - Ranks are the remaining "IAA | ..." roles, ordered by their position in the role list.
 *  - Status, division, position (coordinators), notification, retired and award roles are recognised by name.
 */

const TIER_PATTERNS = [
  [/^(iaa\s*\|\s*)?trial high command$/i, "trial_high_command", "Trial High Command"],
  [/^(iaa\s*\|\s*)?high command$/i, "high_command", "High Command"],
  [/^(iaa\s*\|\s*)?low command$/i, "low_command", "Low Command"],
  [/^(iaa\s*\|\s*)?supervisors?$/i, "supervisor", "Supervisors"],
];

const SINGLE_ROLES = {
  base: /^internal affairs agency$/i,
  botPermissions: /^iaa\s*\|\s*bot permissions$/i,
  underInvestigation: /under investigation/i,
  suspended: /^iaa\s*\|\s*suspended$/i,
  firstStrike: /first strike/i,
  inactivity: /inactivity warning/i,
  loa: /leave of absence/i,
  orientation: /needs orientation/i,
  investigationDivision: /^iaa\s*\|\s*investigation division$/i,
  reducedHours: /reduced hours/i,
  aotm: /agent of the month/i,
  gold: /^gold medal/i,
  silver: /^silver medal/i,
  bronze: /^bronze medal/i,
};

const DIVISION = /^iaa\s*\|\s*(.+ division|subdivision command)$/i;
const POSITION = /coordinator$/i;
const NOTIFY = /notified$/i;
const RETIRED = /^retired\s+(.+)$/i;
const SEPARATOR = /^[\s─━—\-_=.·]*$/;

/** Channel keys and how to find them. `hint` picks among duplicates by category name. */
const CHANNELS = {
  audit: { name: "audit-log", label: "Audit log" },
  botLogs: { name: "bot-logs", label: "Bot logs" },
  movements: { name: "movements", hint: /important/i, label: "Movements" },
  supMovements: { name: "supervisor-movements", label: "Supervisor movements" },
  cmdMovements: { name: "cmd-movements", label: "Command movements" },
  callsigns: { name: "callsign-changes", label: "Callsign changes" },
  warnings: { name: "warnings", label: "Warnings" },
  punishments: { name: "punishment-logs", hint: /supervisor/i, label: "Punishment logs" },
  cmdPunishments: { name: "cmd-punishments", label: "Command punishments" },
  badges: { name: "badges", label: "Badges & awards" },
  leaderboard: { name: "leaderboard", label: "Leaderboard panel" },
  chain: { name: "chain-of-command", label: "Chain of command panel" },
  directory: { name: "employee-directory", label: "Employee directory panel" },
  clockins: { name: "clockins", label: "In-game clock-in log" },
  leaveRequests: { name: "loa-request", label: "Leave requests" },
  leaveLogs: { name: "leave-logs", label: "Leave logs" },
  blacklistedServers: { name: "blacklisted-servers", label: "Blacklisted servers panel" },
  blacklists: { name: "blacklists", label: "IAA blacklist log" },
  investigations: { name: "user-investigations", label: "Case threads" },
  board: { name: "investigations-board", label: "Investigations board panel" },
  alerts: { name: "user-alerts", label: "Intel alerts" },
  guildLogs: { name: "guild-logs", label: "Join/leave screening" },
  archive: { name: "archived-investigations", label: "Closed case archive" },
  orientation: { name: "orientation-logs", label: "Orientation logs" },
  security: { name: "security-alerts", label: "Security alerts" },
};

/** "📜・movements" → "movements" */
const plain = (name) => String(name).toLowerCase().replace(/^[^a-z0-9]+/, "").trim();

export async function detect(guild) {
  const roles = [...(await guild.roles.fetch()).values()].filter((r) => r.id !== guild.id && !r.managed).sort((a, b) => b.position - a.position);
  const out = { tiers: [], ranks: [], roles: { divisions: [], positions: [], notify: [], retired: {} }, channels: {}, missing: [] };
  const claimed = new Set();

  for (const role of roles) {
    if (SEPARATOR.test(role.name)) {
      claimed.add(role.id);
      continue;
    }
    const tier = TIER_PATTERNS.find(([re]) => re.test(role.name));
    if (tier) {
      out.tiers.push({ key: tier[1], label: tier[2], roleId: role.id, position: role.position });
      claimed.add(role.id);
      continue;
    }
    const single = Object.entries(SINGLE_ROLES).find(([key, re]) => !out.roles[key] && re.test(role.name));
    if (single) {
      out.roles[single[0]] = role.id;
      claimed.add(role.id);
      continue;
    }
    const retired = role.name.match(RETIRED);
    if (retired) {
      out.roles.retired[retired[1].toLowerCase()] = role.id;
      claimed.add(role.id);
      continue;
    }
    for (const [list, re] of [["divisions", DIVISION], ["positions", POSITION], ["notify", NOTIFY]]) {
      if (re.test(role.name)) {
        out.roles[list].push(role.id);
        claimed.add(role.id);
        break;
      }
    }
  }

  if (out.roles.investigationDivision) out.roles.divisions.push(out.roles.investigationDivision);

  // Ranks: unclaimed "IAA | ..." roles. Everything else (SAD, TFD, FBRP network roles) is left alone.
  const rankRoles = roles.filter((r) => !claimed.has(r.id) && /^iaa\s*\|/i.test(r.name)).sort((a, b) => a.position - b.position);
  const tiersByPosition = [...out.tiers].sort((a, b) => a.position - b.position);
  rankRoles.forEach((role, index) => {
    const tier = [...tiersByPosition].reverse().find((t) => t.position < role.position);
    out.ranks.push({ roleId: role.id, name: shortRole(role.name), level: index + 1, tier: tier?.key || "agent", tierRoleId: tier?.roleId || null });
  });

  // Tier order follows role position. Agents (no tier role) are always the bottom.
  out.tiers = [{ key: "agent", label: "Agents", roleId: null, index: 0 }, ...tiersByPosition.map((t, n) => ({ key: t.key, label: t.label, roleId: t.roleId, index: n + 1 }))];

  const channels = [...(await guild.channels.fetch()).values()].filter((c) => c && c.type === ChannelType.GuildText);
  for (const [key, spec] of Object.entries(CHANNELS)) {
    const candidates = channels.filter((c) => plain(c.name) === spec.name);
    const pick = (spec.hint && candidates.find((c) => spec.hint.test(c.parent?.name || ""))) || candidates[0];
    if (pick) out.channels[key] = pick.id;
    else out.missing.push(spec.label);
  }
  return out;
}

export async function apply(plan, actorId) {
  const current = await config();
  await db.transaction(async (q) => {
    await q("DELETE FROM iaa_ranks");
    for (const r of plan.ranks)
      await q("INSERT INTO iaa_ranks(role_id,name,level,tier,tier_role_id) VALUES(?,?,?,?,?)", [r.roleId, r.name, r.level, r.tier, r.tierRoleId]);
  });
  await setConfig("roles", plan.roles, actorId);
  // Keep manual channel overrides for keys detection could not find.
  await setConfig("channels", { ...current.channels, ...plan.channels }, actorId);
  await setConfig("tiers", plan.tiers, actorId);
  if (!(await db.one("SELECT 1 FROM iaa_config WHERE config_key='settings'"))) await setConfig("settings", {}, actorId);
  invalidateRanks();
}

/** Brings members who already hold a rank role onto the roster. */
export async function importMembers(guild, actorId) {
  const ladder = await db.query("SELECT * FROM iaa_ranks ORDER BY level DESC");
  const members = await allMembers(guild);
  let added = 0;
  for (const member of members.values()) {
    if (member.user.bot) continue;
    const rank = ladder.find((r) => member.roles.cache.has(r.role_id));
    if (!rank) continue;
    const result = await db.query(
      `INSERT INTO iaa_members(discord_id,username,callsign,rank_role_id,status,joined_at,rank_changed_at,updated_at)
       VALUES(?,?,NULL,?,'active',?,?,?)
       ON DUPLICATE KEY UPDATE rank_role_id=VALUES(rank_role_id),username=VALUES(username),status=IF(status='removed','active',status),updated_at=VALUES(updated_at)`,
      [member.id, member.user.username, rank.role_id, member.joinedTimestamp || Date.now(), Date.now(), Date.now()],
    );
    if (result.affectedRows === 1) added++;
  }
  const { resequence } = await import("./callsigns.js");
  const changes = await resequence(guild, { actorId, reason: "Roster import" });
  return { added, actorId, callsigns: changes.length };
}

export async function summary(plan) {
  const tierName = Object.fromEntries(plan.tiers.map((t) => [t.key, t.label]));
  const ladder = [...plan.ranks]
    .sort((a, b) => b.level - a.level)
    .map((r) => `\`${String(r.level).padStart(2, "0")}\` ${roleMention(r.roleId)} · *${tierName[r.tier] || r.tier}*`);
  const roleLine = (label, id) => `${label}: ${id ? roleMention(id) : "**not found**"}`;
  const r = plan.roles;
  const statusRoles = [
    roleLine("Agency member", r.base),
    roleLine("Under Investigation", r.underInvestigation),
    roleLine("Suspended", r.suspended),
    roleLine("First Strike", r.firstStrike),
    roleLine("Inactivity Warning", r.inactivity),
    roleLine("Leave of Absence", r.loa),
    roleLine("Needs Orientation", r.orientation),
    roleLine("Investigation Division", r.investigationDivision),
  ];
  const channelLines = Object.entries(plan.channels).map(([key, id]) => `${CHANNELS[key]?.label || key}: ${channelMention(id)}`);
  return [
    card("🦅 IAA rank ladder", {
      description: ladder.join("\n") || "No ranks found.",
      color: C.gold,
      fields: [["Command tiers", plan.tiers.map((t) => `${t.index}. ${t.roleId ? roleMention(t.roleId) : t.label}`).join("\n")]],
    }),
    card("🗂️ Roles & channels", {
      color: C.navy,
      fields: [
        ["Status roles", statusRoles.join("\n"), false],
        [
          "Divisions, positions & awards",
          [
            `Divisions: ${r.divisions.map(roleMention).join(" ") || "none"}`,
            `Positions: ${r.positions.map(roleMention).join(" ") || "none"}`,
            `Awards: ${[r.gold, r.silver, r.bronze, r.aotm].filter(Boolean).map(roleMention).join(" ") || "none"}`,
            `Retired: ${Object.values(r.retired).map(roleMention).join(" ") || "none"}`,
          ].join("\n"),
          false,
        ],
        ["Channels", channelLines.join("\n") || "none", false],
        plan.missing.length ? ["Not found", plan.missing.join(", "), false] : null,
      ],
    }),
  ];
}

export const CHANNEL_KEYS = Object.fromEntries(Object.entries(CHANNELS).map(([k, v]) => [k, v.label]));
export const ROLE_KEYS = Object.keys(SINGLE_ROLES);
