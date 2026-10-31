import { card, COLORS, roleRef, who } from "./ui.js";

const MIN_DURATION_MS = 60_000;
const MAX_DURATION_MS = 30 * 24 * 60 * 60 * 1000;
const WORKER_INTERVAL_MS = 30_000;

export function parseTemporaryRoleDuration(value) {
  const match = String(value || "").trim().toLowerCase().match(/^(\d{1,5})\s*(m|h|d|w)$/);
  if (!match) throw new Error("Duration must look like `30m`, `12h`, `7d`, or `2w`.");
  const duration = Number(match[1]) * { m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 }[match[2]];
  if (duration < MIN_DURATION_MS || duration > MAX_DURATION_MS)
    throw new Error("Temporary roles must last between 1 minute and 30 days.");
  return duration;
}

export function createTemporaryRoles({ client, db, audit, log, now = () => Date.now() }) {
  let worker = null;
  let running = false;

  async function configuredMainGuildId() {
    const row = await db.one("SELECT guild_id FROM network_guilds WHERE kind='main' ORDER BY added_at LIMIT 1");
    if (!row) throw new Error("The main Discord is not configured.");
    return String(row.guild_id);
  }

  async function command(interaction) {
    const mainGuildId = await configuredMainGuildId();
    if (String(interaction.guildId) !== mainGuildId)
      throw new Error("`/temp role` can only be used in the main Florida Bay Discord.");

    const role = interaction.options.getRole("role", true);
    const user = interaction.options.getUser("member", true);
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (!member) throw new Error("That member is no longer in the main Discord.");
    if (member.user.bot) throw new Error("Temporary roles cannot be assigned to bots.");
    if (role.id === interaction.guildId) throw new Error("The @everyone role cannot be temporary.");
    if (role.managed) throw new Error("Discord-managed and integration roles cannot be temporary.");
    if (!role.editable)
      throw new Error(`I cannot manage ${role.name}. Move the bot's role above it and try again.`);

    const bound = await db.one(
      "SELECT group_name FROM discord_role_bindings WHERE guild_id=? AND role_id=? LIMIT 1",
      [interaction.guildId, role.id],
    );
    if (bound)
      throw new Error(`${role.name} is ACE-bound to \`${bound.group_name}\` and cannot be granted temporarily.`);
    const protectedRole = await db.one(
      "SELECT 1 FROM protected_roles WHERE guild_id=? AND role_id=? LIMIT 1",
      [interaction.guildId, role.id],
    );
    if (protectedRole)
      throw new Error(`${role.name} is protected and cannot be granted temporarily.`);

    const existing = await db.one(
      "SELECT status,expires_at FROM temporary_discord_roles WHERE guild_id=? AND member_id=? AND role_id=?",
      [interaction.guildId, member.id, role.id],
    );
    if (existing?.status === "expiring")
      throw new Error("That temporary role is expiring right now. Wait a moment and try again.");
    if (member.roles.cache.has(role.id) && existing?.status !== "active")
      throw new Error(`${member.user.username} already has ${role.name}; I will not schedule removal of a role that was not granted temporarily.`);

    const duration = parseTemporaryRoleDuration(interaction.options.getString("duration", true));
    const reason = String(interaction.options.getString("reason", true)).trim().slice(0, 300);
    if (!reason) throw new Error("A non-blank reason is required.");
    const stamp = now();
    const expiresAt = stamp + duration;
    const added = !member.roles.cache.has(role.id);
    if (added)
      await member.roles.add(role, `/temp role by ${interaction.user.tag} (${interaction.user.id}): ${reason}`);
    try {
      await db.query(
        `INSERT INTO temporary_discord_roles
           (guild_id,member_id,role_id,granted_by,reason,granted_at,expires_at,status,removed_at,removal_error)
         VALUES(?,?,?,?,?,?,?,'active',NULL,NULL)
         ON DUPLICATE KEY UPDATE granted_by=VALUES(granted_by),reason=VALUES(reason),granted_at=VALUES(granted_at),
           expires_at=VALUES(expires_at),status='active',removed_at=NULL,removal_error=NULL`,
        [interaction.guildId, member.id, role.id, interaction.user.id, reason, stamp, expiresAt],
      );
    } catch (error) {
      if (added)
        await member.roles.remove(role, "Temporary-role record could not be saved; reverting grant").catch(() => {});
      throw error;
    }
    await audit(interaction.user.id, existing?.status === "active" ? "temp_role.extend" : "temp_role.grant", member.id, {
      guildId: interaction.guildId,
      roleId: role.id,
      expiresAt,
      reason,
    });
    await log(interaction.guild, {
      title: existing?.status === "active" ? "Temporary role extended" : "Temporary role granted",
      color: COLORS.success,
      actor: interaction.user.id,
      target: member.id,
      fields: [["Role", roleRef(role.id)], ["Expires", `<t:${Math.floor(expiresAt / 1000)}:F> (<t:${Math.floor(expiresAt / 1000)}:R>)`], ["Reason", reason]],
    }, "staff_audit");
    return card(existing?.status === "active" ? "Temporary role extended" : "Temporary role granted", {
      color: COLORS.success,
      rows: [["Member", who(member.id)], ["Role", roleRef(role.id)], ["Expires", `<t:${Math.floor(expiresAt / 1000)}:F> (<t:${Math.floor(expiresAt / 1000)}:R>)`], ["Reason", reason]],
    });
  }

  async function expireRow(row) {
    const claimed = await db.query(
      "UPDATE temporary_discord_roles SET status='expiring' WHERE guild_id=? AND member_id=? AND role_id=? AND status='active' AND expires_at<=?",
      [row.guild_id, row.member_id, row.role_id, now()],
    );
    if (!Number(claimed.affectedRows)) return false;
    try {
      const guild = client.guilds.cache.get(String(row.guild_id));
      if (!guild) throw new Error("The configured Discord is unavailable to the bot.");
      const member = guild ? await guild.members.fetch(String(row.member_id)).catch(() => null) : null;
      const role = guild?.roles.cache.get(String(row.role_id)) || null;
      if (member && role && member.roles.cache.has(role.id))
        await member.roles.remove(role, `Temporary role expired (granted by ${row.granted_by})`);
      await db.query(
        "UPDATE temporary_discord_roles SET status='expired',removed_at=?,removal_error=NULL WHERE guild_id=? AND member_id=? AND role_id=? AND status='expiring'",
        [now(), row.guild_id, row.member_id, row.role_id],
      );
      await audit(client.user?.id || "system", "temp_role.expire", row.member_id, {
        guildId: String(row.guild_id), roleId: String(row.role_id), grantedBy: String(row.granted_by), reason: row.reason,
      }).catch((error) => console.error("[FBRP temp role] Expiry audit failed:", error.message || error));
      if (guild) await log(guild, {
        title: "Temporary role expired",
        color: COLORS.warning,
        target: String(row.member_id),
        fields: [["Role", roleRef(row.role_id)], ["Originally granted by", who(row.granted_by)], ["Reason", String(row.reason || "No reason recorded")]],
      }, "staff_audit").catch((error) => console.error("[FBRP temp role] Expiry log failed:", error.message || error));
      return true;
    } catch (error) {
      await db.query(
        "UPDATE temporary_discord_roles SET status='active',removal_error=? WHERE guild_id=? AND member_id=? AND role_id=? AND status='expiring'",
        [String(error?.message || error).slice(0, 500), row.guild_id, row.member_id, row.role_id],
      );
      throw error;
    }
  }

  async function sweep() {
    if (running) return 0;
    running = true;
    try {
      const rows = await db.query(
        "SELECT guild_id,member_id,role_id,granted_by,reason FROM temporary_discord_roles WHERE status='active' AND expires_at<=? ORDER BY expires_at LIMIT 100",
        [now()],
      );
      let expired = 0;
      for (const row of rows)
        if (await expireRow(row).catch((error) => {
          console.error(`[FBRP temp role] Could not expire ${row.guild_id}/${row.member_id}/${row.role_id}:`, error.message || error);
          return false;
        })) expired += 1;
      return expired;
    } finally {
      running = false;
    }
  }

  function start() {
    if (worker) return;
    void sweep();
    worker = setInterval(() => void sweep(), WORKER_INTERVAL_MS);
    worker.unref?.();
  }

  function stop() {
    if (worker) clearInterval(worker);
    worker = null;
  }

  return { command, sweep, start, stop };
}
