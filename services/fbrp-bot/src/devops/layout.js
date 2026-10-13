import { PermissionFlagsBits as P } from "discord.js";
import { RANKS } from "./store.js";

/**
 * The FBRP | DevOps server, as data. `setup.js` applies it idempotently: anything found by name is kept
 * (and only its permissions are corrected), anything missing is created.
 *
 * Channel and category names follow `<emoji>┃<name>` (no spaces: Discord turns spaces in text channel
 * names into hyphens).
 */

export const SEP = "┃";
export const channelName = (emoji, name) => `${emoji}${SEP}${name}`;

/** Role blueprint, top to bottom. `key` is where the id is stored in the config. */
export const ROLES = [
  { key: "sepDev", name: "━━━━━ DEVELOPMENT ━━━━━", separator: true },
  ...[...RANKS].reverse().map((r) => ({ key: `rank:${r.level}`, name: `FBRP | ${r.name}`, color: r.color, hoist: true, rank: r })),
  { key: "sepGroups", name: "━━━━━ GROUPS ━━━━━", separator: true },
  {
    key: "leadership",
    name: "FBRP | Development Leadership",
    color: 0xe74c3c,
    permissions: [P.ManageMessages, P.ManageThreads, P.MuteMembers, P.MoveMembers, P.ModerateMembers],
  },
  { key: "base", name: "FBRP | Development Team", color: 0x5865f2 },
  { key: "sepTeams", name: "━━━━━ TEAMS ━━━━━", separator: true },
  { key: "support", name: "FBRP | Support Team", color: 0x2ecc71 },
  { key: "purchase", name: "FBRP | Purchase Support", color: 0xf39c12 },
  { key: "div:scripting", name: "FBRP | Scripting", color: 0x3498db, division: "Scripting" },
  { key: "div:backend", name: "FBRP | Bot & Backend", color: 0x1abc9c, division: "Bot & Backend" },
  { key: "div:web", name: "FBRP | Web & Portal", color: 0x9b59b6, division: "Web & Portal" },
  { key: "div:vehicles", name: "FBRP | Vehicles & Mapping", color: 0xe67e22, division: "Vehicles & Mapping" },
  { key: "div:qa", name: "FBRP | QA & Testing", color: 0xe91e63, division: "QA & Testing" },
  { key: "sepAwards", name: "━━━━━ AWARDS ━━━━━", separator: true },
  { key: "dotm", name: "FBRP | Developer of the Month", color: 0xf1c40f, hoist: true },
  { key: "sepStatus", name: "━━━━━ STATUS ━━━━━", separator: true },
  { key: "suspended", name: "FBRP | Suspended", color: 0x4f545c },
  { key: "warned", name: "FBRP | Warned", color: 0x992d22 },
  { key: "loa", name: "FBRP | Leave of Absence", color: 0x979c9f },
  { key: "sepNotify", name: "━━━━━ NOTIFICATIONS ━━━━━", separator: true },
  { key: "notify:releases", name: "FBRP | Release Notified", color: 0x43e8d8, mentionable: true },
  { key: "notify:outages", name: "FBRP | Outage Notified", color: 0xe74c3c, mentionable: true },
  { key: "notify:announcements", name: "FBRP | Announcement Notified", color: 0x5865f2, mentionable: true },
  { key: "sepMembers", name: "━━━━━ COMMUNITY ━━━━━", separator: true },
  { key: "client", name: "FBRP | Client", color: 0x43e8d8 },
];

/**
 * Who sees and writes in a channel. Roles are referenced by blueprint key.
 *  public     everyone reads, nobody (but the bot) writes
 *  open       everyone reads and writes
 *  team       Development Team reads and writes
 *  teamRead   Development Team reads, the bot writes
 *  lead       Leadership reads and writes
 *  leadRead   Leadership reads, the bot writes
 *  voice      Development Team connects
 *  leadVoice  Leadership connects
 */
export const CATEGORIES = [
  {
    key: "info",
    emoji: "📌",
    name: "INFORMATION",
    access: "public",
    channels: [
      { key: "welcome", emoji: "👋", name: "welcome", topic: "Start here. What FBRP DevOps is, how to get help and how to pick your notification roles.", access: "public" },
      { key: "rules", emoji: "📜", name: "rules", topic: "The rules of the FBRP DevOps server.", access: "public" },
      { key: "announcements", emoji: "📣", name: "announcements", topic: "Official announcements from the development team.", access: "public" },
      { key: "releases", emoji: "🚀", name: "releases", topic: "Release notes and changelogs for everything we ship.", access: "public" },
      { key: "status", emoji: "🟢", name: "status", topic: "Live service status and incident reports. Refreshes every minute.", access: "public" },
      { key: "chain", emoji: "⛓️", name: "chain-of-command", topic: "The development team, by rank. Updates automatically.", access: "public" },
    ],
  },
  {
    key: "support",
    emoji: "🎫",
    name: "SUPPORT",
    access: "public",
    channels: [{ key: "tickets", emoji: "🎫", name: "open-a-ticket", topic: "Need help or have a purchase question? Open a private ticket here.", access: "public" }],
  },
  { key: "ticketsGeneral", emoji: "🛠️", name: "GENERAL SUPPORT", access: "tickets:support", channels: [], ticketCategory: "general" },
  { key: "ticketsPurchase", emoji: "💳", name: "PURCHASE SUPPORT", access: "tickets:purchase", channels: [], ticketCategory: "purchase" },
  {
    key: "dev",
    emoji: "💻",
    name: "DEVELOPMENT",
    access: "team",
    channels: [
      { key: "devChat", emoji: "💬", name: "dev-chat", topic: "General development discussion.", access: "team" },
      { key: "tasks", emoji: "📋", name: "task-board", topic: "The live task board. Manage work with /task.", access: "teamRead" },
      { key: "standups", emoji: "📝", name: "standups", topic: "Daily standups. Post yours with /standup.", access: "teamRead" },
      { key: "ideas", emoji: "🧠", name: "ideas", topic: "Feature ideas and proposals.", access: "team" },
      { key: "bugs", emoji: "🐛", name: "bug-reports", topic: "Bugs found in anything we run.", access: "team" },
      { key: "review", emoji: "🔍", name: "code-review", topic: "Request and give reviews. Link the PR or paste the diff.", access: "team" },
      { key: "deployments", emoji: "📦", name: "deployments", topic: "Deploy notes: what went live, when, and by whom.", access: "team" },
      { key: "incidents", emoji: "🚨", name: "incidents", topic: "Internal incident timeline. Public updates go to the status channel.", access: "teamRead" },
      { key: "botCommands", emoji: "🤖", name: "bot-commands", topic: "Run bot commands here.", access: "team" },
    ],
  },
  {
    key: "records",
    emoji: "📚",
    name: "TEAM RECORDS",
    access: "teamRead",
    channels: [
      { key: "movements", emoji: "📜", name: "movements", topic: "Every rank movement: hires, promotions, demotions and removals.", access: "teamRead" },
      { key: "commendations", emoji: "🏅", name: "commendations", topic: "Commendations and Developer of the Month.", access: "teamRead" },
      { key: "leaveRequests", emoji: "🌴", name: "loa-requests", topic: "Leave of absence requests. Leadership decides with the buttons.", access: "leadRead" },
      { key: "warnings", emoji: "⚠️", name: "warnings", topic: "Warnings and strikes on file.", access: "leadRead" },
    ],
  },
  {
    key: "lead",
    emoji: "👑",
    name: "LEADERSHIP",
    access: "lead",
    channels: [
      { key: "leadAnnouncements", emoji: "📣", name: "leadership-announcements", topic: "Announcements for leadership only.", access: "lead" },
      { key: "leadChat", emoji: "💬", name: "leadership-chat", topic: "Leadership discussion.", access: "lead" },
      { key: "trialReviews", emoji: "🎓", name: "trial-reviews", topic: "Trial Developers whose trial period has ended. Decide with the buttons.", access: "leadRead" },
      { key: "discipline", emoji: "⚖️", name: "discipline-logs", topic: "Suspensions, strikes and revocations.", access: "leadRead" },
      { key: "leaveLogs", emoji: "🗂️", name: "leave-logs", topic: "Leave decisions and endings.", access: "leadRead" },
    ],
  },
  {
    key: "logs",
    emoji: "🧾",
    name: "LOGS",
    access: "leadRead",
    channels: [
      { key: "audit", emoji: "🧾", name: "audit-log", topic: "Everything the bot changes in this server.", access: "leadRead" },
      { key: "botLogs", emoji: "🤖", name: "bot-logs", topic: "Bot errors and notices.", access: "leadRead" },
      { key: "ticketLogs", emoji: "🎫", name: "ticket-logs", topic: "Ticket lifecycle log.", access: "leadRead" },
      { key: "transcripts", emoji: "📄", name: "ticket-transcripts", topic: "A transcript of every closed ticket.", access: "leadRead" },
      { key: "joinLeave", emoji: "📥", name: "join-leave", topic: "Members joining and leaving.", access: "leadRead" },
      { key: "security", emoji: "🛡️", name: "security-alerts", topic: "New bots, unusual joins and other things worth a look.", access: "leadRead" },
    ],
  },
  {
    key: "voice",
    emoji: "🔊",
    name: "VOICE",
    access: "voice",
    channels: [
      { key: "vcLounge", emoji: "🔊", name: "Dev Lounge", type: "voice", access: "voice" },
      { key: "vcPair", emoji: "💻", name: "Pair Programming", type: "voice", access: "voice" },
      { key: "vcStandup", emoji: "🎙️", name: "Stand-up", type: "voice", access: "voice" },
      { key: "vcLead", emoji: "🔒", name: "Leadership", type: "voice", access: "leadVoice" },
    ],
  },
];

/** Ticket types shipped with the server. */
export const TICKET_CATEGORY_KEYS = { general: "ticketsGeneral", purchase: "ticketsPurchase" };

const READ = [P.ViewChannel, P.ReadMessageHistory];
const WRITE = [P.SendMessages, P.SendMessagesInThreads, P.AddReactions, P.EmbedLinks, P.AttachFiles, P.UseExternalEmojis];
const THREADS = [P.CreatePublicThreads, P.CreatePrivateThreads];

/**
 * Permission overwrites for an access mode. `ids` maps blueprint keys to role ids plus `everyone` and `bot`.
 * Returns discord.js `permissionOverwrites` entries.
 */
export function overwritesFor(access, ids, { category = false } = {}) {
  const everyone = { id: ids.everyone };
  const allow = (id, list) => ({ id, allow: list });
  const out = [];
  const bot = ids.bot ? [allow(ids.bot, [...READ, ...WRITE, P.ManageChannels, P.ManageMessages, P.ManageThreads, P.PinMessages ?? P.ManageMessages])] : [];
  const leadership = ids.leadership;
  const team = ids.base;
  const lockEveryone = { ...everyone, deny: [P.ViewChannel] };
  const [kind, who] = String(access).split(":");

  if (kind === "public") {
    out.push({ ...everyone, allow: READ, deny: [...WRITE, ...THREADS] });
  } else if (kind === "open") {
    out.push({ ...everyone, allow: [...READ, P.SendMessages, P.AddReactions] });
  } else if (kind === "team") {
    out.push(lockEveryone, allow(team, [...READ, ...WRITE]));
    if (leadership) out.push(allow(leadership, [...READ, ...WRITE]));
  } else if (kind === "teamRead") {
    out.push(lockEveryone, { id: team, allow: READ, deny: [...WRITE, ...THREADS] });
    if (leadership) out.push({ id: leadership, allow: READ, deny: [...WRITE, ...THREADS] });
  } else if (kind === "lead") {
    out.push(lockEveryone);
    if (leadership) out.push(allow(leadership, [...READ, ...WRITE]));
  } else if (kind === "leadRead") {
    out.push(lockEveryone);
    if (leadership) out.push({ id: leadership, allow: READ, deny: [...WRITE, ...THREADS] });
  } else if (kind === "voice") {
    out.push(lockEveryone, allow(team, [P.ViewChannel, P.Connect, P.Speak, P.Stream, P.UseVAD]));
    if (leadership) out.push(allow(leadership, [P.ViewChannel, P.Connect, P.Speak, P.Stream, P.UseVAD, P.MuteMembers, P.MoveMembers]));
  } else if (kind === "leadVoice") {
    out.push(lockEveryone);
    if (leadership) out.push(allow(leadership, [P.ViewChannel, P.Connect, P.Speak, P.Stream, P.UseVAD, P.MuteMembers, P.MoveMembers]));
  } else if (kind === "tickets") {
    out.push(lockEveryone);
    for (const id of [ids[who], leadership]) if (id) out.push(allow(id, [...READ, ...WRITE]));
  }
  void category;
  return [...out.filter((o) => o.id), ...bot];
}
