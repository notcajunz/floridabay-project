import { card, COLORS, who } from "./ui.js";

const SCHEMA = `CREATE TABLE IF NOT EXISTS invite_tracker_joins (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  guild_id VARCHAR(32) NOT NULL,
  member_id VARCHAR(32) NOT NULL,
  inviter_id VARCHAR(32) NULL,
  invite_code VARCHAR(64) NULL,
  method ENUM('invite','vanity','unknown') NOT NULL DEFAULT 'unknown',
  joined_at BIGINT NOT NULL,
  left_at BIGINT NULL,
  KEY idx_invite_tracker_inviter (guild_id, inviter_id),
  KEY idx_invite_tracker_member (guild_id, member_id, left_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;

const LEADERBOARD_SIZE = 10;

/**
 * Works out which invite a new member used by comparing the invite use counts from before and after
 * they joined. Returns `{ method, code, inviterId }`; `method` is `unknown` when it cannot be told
 * apart (several invites moved at once, or Discord gave no signal).
 */
export function attributeJoin(before, after, vanity = null) {
  const candidates = [];
  for (const [code, now] of after) {
    const prior = before.get(code);
    if (now.uses > (prior?.uses ?? 0)) candidates.push({ code, inviterId: now.inviterId });
  }
  // A single-use or capped invite disappears the moment its last use is spent.
  for (const [code, prior] of before) {
    if (after.has(code)) continue;
    if (prior.maxUses > 0 && prior.uses + 1 >= prior.maxUses) candidates.push({ code, inviterId: prior.inviterId });
  }
  if (candidates.length === 1) return { method: "invite", ...candidates[0] };
  if (!candidates.length && vanity?.rose) return { method: "vanity", code: vanity.code, inviterId: null };
  return { method: "unknown", code: null, inviterId: null };
}

const snapshot = (invites) =>
  new Map(
    [...invites.values()].map((invite) => [
      invite.code,
      { uses: Number(invite.uses ?? 0), maxUses: Number(invite.maxUses ?? 0), inviterId: invite.inviter?.id ?? invite.inviterId ?? null },
    ]),
  );

export function createInviteTracker({ client, db, log, now = () => Date.now() }) {
  const cache = new Map();
  const vanityUses = new Map();
  const queues = new Map();
  let ready = false;

  /** Join events for one guild are handled strictly in order so each one diffs against the previous snapshot. */
  const serialize = (guildId, work) => {
    const run = (queues.get(guildId) || Promise.resolve()).catch(() => {}).then(work);
    queues.set(guildId, run);
    return run;
  };

  async function fetchInvites(guild) {
    const invites = await guild.invites.fetch().catch(() => null);
    return invites ? snapshot(invites) : null;
  }

  async function fetchVanity(guild) {
    if (!guild.vanityURLCode) return null;
    const data = await guild.fetchVanityData?.().catch(() => null);
    return data ? { code: data.code, uses: Number(data.uses ?? 0) } : null;
  }

  async function prime(guild) {
    const invites = await fetchInvites(guild);
    if (invites) cache.set(guild.id, invites);
    const vanity = await fetchVanity(guild);
    if (vanity) vanityUses.set(guild.id, vanity.uses);
  }

  async function start() {
    await db.query(SCHEMA);
    ready = true;
    for (const guild of client.guilds.cache.values()) await prime(guild);
  }

  const track = (guild, work) => serialize(guild.id, work);

  function inviteCreated(invite) {
    if (!invite.guild) return;
    return track(invite.guild, async () => {
      const known = cache.get(invite.guild.id) || new Map();
      known.set(invite.code, { uses: Number(invite.uses ?? 0), maxUses: Number(invite.maxUses ?? 0), inviterId: invite.inviter?.id ?? null });
      cache.set(invite.guild.id, known);
    });
  }

  function inviteDeleted(invite) {
    if (!invite.guild) return;
    // Kept on purpose: a join that consumed the final use of a capped invite is attributed from the stale entry.
    return track(invite.guild, async () => {
      const known = cache.get(invite.guild.id);
      const entry = known?.get(invite.code);
      if (entry && !(entry.maxUses > 0 && entry.uses + 1 >= entry.maxUses)) known.delete(invite.code);
    });
  }

  async function memberAdded(member) {
    if (!ready || member.user.bot) return null;
    return track(member.guild, async () => {
      const before = cache.get(member.guild.id) || new Map();
      const after = await fetchInvites(member.guild);
      const priorVanity = vanityUses.get(member.guild.id);
      const vanityNow = await fetchVanity(member.guild);
      const vanity = vanityNow ? { code: vanityNow.code, rose: priorVanity !== undefined && vanityNow.uses > priorVanity } : null;
      if (after) cache.set(member.guild.id, after);
      if (vanityNow) vanityUses.set(member.guild.id, vanityNow.uses);
      const result = after ? attributeJoin(before, after, vanity) : { method: "unknown", code: null, inviterId: null };

      const stamp = now();
      // A rejoin after the bot missed the leave event must not leave two open rows for one member.
      await db.query(
        "UPDATE invite_tracker_joins SET left_at=? WHERE guild_id=? AND member_id=? AND left_at IS NULL",
        [stamp, member.guild.id, member.id],
      );
      await db.query(
        "INSERT INTO invite_tracker_joins(guild_id,member_id,inviter_id,invite_code,method,joined_at) VALUES(?,?,?,?,?,?)",
        [member.guild.id, member.id, result.inviterId, result.code, result.method, stamp],
      );

      const fields = [
        ["Member", who(member.id)],
        ["Invited by", result.inviterId ? who(result.inviterId) : result.method === "vanity" ? "Vanity URL" : "Unknown"],
      ];
      if (result.code) fields.push(["Invite", `\`${result.code}\``]);
      if (result.inviterId) {
        const stats = await inviterStats(member.guild.id, result.inviterId);
        fields.push(["Inviter total", `${stats.total} joined · ${stats.active} still here`]);
      }
      await log(member.guild, { title: "Member joined", color: COLORS.success, fields }, "invites").catch(() => {});
      return result;
    });
  }

  async function memberRemoved(member) {
    if (!ready || member.user?.bot) return;
    await db.query(
      "UPDATE invite_tracker_joins SET left_at=? WHERE guild_id=? AND member_id=? AND left_at IS NULL",
      [now(), member.guild.id, member.id],
    );
  }

  async function inviterStats(guildId, inviterId) {
    const row = await db.one(
      `SELECT COUNT(*) total, COALESCE(SUM(left_at IS NULL),0) active
         FROM invite_tracker_joins WHERE guild_id=? AND inviter_id=?`,
      [guildId, inviterId],
    );
    const total = Number(row?.total ?? 0);
    const active = Number(row?.active ?? 0);
    return { total, active, left: total - active };
  }

  async function command(interaction, sub, { requireStaff }) {
    if (!interaction.guild) throw new Error("Invite tracking only works inside a server.");
    if (sub === "stats") {
      const target = interaction.options.getUser("member") ?? interaction.user;
      if (target.id !== interaction.user.id) await requireStaff(interaction, "view another member's invite stats");
      const stats = await inviterStats(interaction.guildId, target.id);
      return card("Invite stats", {
        description: `${who(target.id)}`,
        color: COLORS.primary,
        rows: [
          ["Joined through them", String(stats.total)],
          ["Still in the server", String(stats.active)],
          ["Left", String(stats.left)],
        ],
      });
    }
    if (sub === "leaderboard") {
      const rows = await db.query(
        `SELECT inviter_id, COUNT(*) total, COALESCE(SUM(left_at IS NULL),0) active
           FROM invite_tracker_joins WHERE guild_id=? AND inviter_id IS NOT NULL
          GROUP BY inviter_id ORDER BY active DESC, total DESC LIMIT ${LEADERBOARD_SIZE}`,
        [interaction.guildId],
      );
      const description = rows.length
        ? rows.map((row, index) => `**${index + 1}.** <@${row.inviter_id}> — ${Number(row.active)} here · ${Number(row.total)} total`).join("\n")
        : "No tracked invites yet.";
      return card("Invite leaderboard", { description, color: COLORS.primary });
    }
    if (sub === "who") {
      await requireStaff(interaction, "see who invited a member");
      const target = interaction.options.getUser("member", true);
      const row = await db.one(
        `SELECT inviter_id,invite_code,method,joined_at FROM invite_tracker_joins
          WHERE guild_id=? AND member_id=? ORDER BY joined_at DESC LIMIT 1`,
        [interaction.guildId, target.id],
      );
      if (!row) return card("Invited by", { description: `${who(target.id)} joined before invite tracking started, or was not seen joining.`, color: COLORS.primary });
      const by = row.inviter_id ? who(row.inviter_id) : row.method === "vanity" ? "The server's vanity URL" : "Unknown";
      const fields = [["Invited by", by], ["Joined", `<t:${Math.floor(Number(row.joined_at) / 1000)}:R>`]];
      if (row.invite_code) fields.push(["Invite", `\`${row.invite_code}\``]);
      return card("Invited by", { description: who(target.id), color: COLORS.primary, rows: fields });
    }
    throw new Error("Unknown invite tracker action.");
  }

  return { start, inviteCreated, inviteDeleted, memberAdded, memberRemoved, inviterStats, command, prime };
}
