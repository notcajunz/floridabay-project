/**
 * The main bot's side of the Staff Assistant bot (src/staff). The staff bot is only in the staff
 * server, so whatever it needs done in another server is written to two small tables and carried
 * out here, because this bot is in every network server:
 *
 *   network_role_queue  add or remove one role for one member in one server
 *   network_sync_queue  re-sync one member's ACE-driven roles in every server, or
 *                       (discord_id "coc-refresh") redraw the main chain-of-command board
 *   staff_welcome_queue the onboarding DM for a new staff member (rank, optional callsign, staff-server invite)
 *
 * A request is deleted only if nobody replaced it while it was being worked on.
 */
import { PermissionFlagsBits } from "discord.js";
import { createQueueLog } from "./queue-log.js";

const MAX_ATTEMPTS = 3;
const BATCH = 10;

export function createStaffQueue({ client, db, syncUserAcrossNetwork, refreshChainOfCommand = async () => {}, audit, log, publicBase, embed, COLORS }) {
  const queueLog = createQueueLog({ client, db });
  let running = false;
  let timer = null;

  async function processRole(row) {
    const guild = client.guilds.cache.get(String(row.guild_id));
    if (!guild) return "no such server";
    const member = await guild.members.fetch(String(row.discord_id)).catch(() => null);
    if (!member) return null;
    if (member.user.bot) return null;
    const roleId = String(row.role_id);
    const role = guild.roles.cache.get(roleId) || (await guild.roles.fetch(roleId).catch(() => null));
    if (!role) return "no such role";
    const has = member.roles.cache.has(roleId);
    const add = row.action === "add";
    if (has === add) return null;
    await (add ? member.roles.add(role, String(row.reason || "Staff bot request")) : member.roles.remove(role, String(row.reason || "Staff bot request")));
    return null;
  }

  const clean = (value, max = 100) => String(value ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);

  /** Sends one staff onboarding DM, with a single-use invite when they are not in the staff server yet. */
  async function sendWelcome(row) {
    const user = await client.users.fetch(String(row.discord_id)).catch(() => null);
    if (!user) return { sent: false, invited: false, problem: "no such Discord account" };
    const guildRow = await db.one("SELECT guild_id FROM network_guilds WHERE kind='staff' ORDER BY added_at LIMIT 1");
    const guild = guildRow ? client.guilds.cache.get(String(guildRow.guild_id)) : null;
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
      "Welcome to the **Florida Bay Roleplay staff team**. Your staff access is ready.",
      "",
      `**Rank:** ${clean(row.rank_name, 80)}`,
      ...(row.callsign ? [`**Callsign:** ${row.callsign}`] : []),
      `**In-game access:** ${Number(row.staff_only) ? "Clock in with `/clockin` before using staff permissions." : "Active immediately."}`,
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
    return { sent, invited: sent && Boolean(invite), guild, user };
  }

  async function tick() {
    if (running) return;
    running = true;
    const done = [];
    const failed = [];
    try {
      const syncs = await db.query("SELECT discord_id,requested_at FROM network_sync_queue ORDER BY requested_at LIMIT ?", [BATCH]);
      let cocRefresh = false;
      for (const row of syncs) {
        const id = String(row.discord_id);
        await db.query("DELETE FROM network_sync_queue WHERE discord_id=? AND requested_at=?", [id, row.requested_at]);
        if (id === "coc-refresh") {
          cocRefresh = true;
          continue;
        }
        const failure = await syncUserAcrossNetwork(client, id).then(() => null, (error) => {
          console.error(`[FBRP staff queue] sync ${id}:`, error.message || error);
          return error.message || String(error);
        });
        (failure ? failed : done).push(`🔄 network role re-sync · <@${id}>${failure ? ` · ${failure}` : ""}`);
      }
      if (cocRefresh) {
        await refreshChainOfCommand().catch(() => {});
        done.push("📋 chain-of-command board redraw requested");
      }

      const roles = await db.query("SELECT * FROM network_role_queue ORDER BY requested_at LIMIT ?", [BATCH]);
      for (const row of roles) {
        const key = [row.guild_id, row.discord_id, row.role_id];
        let problem = null;
        try {
          problem = await processRole(row);
          if (!problem) done.push(await queueLog.roleLine(row));
        } catch (error) {
          problem = error.message || String(error);
          const attempts = Number(row.attempts || 0) + 1;
          if (attempts < MAX_ATTEMPTS) {
            await db.query("UPDATE network_role_queue SET attempts=? WHERE guild_id=? AND discord_id=? AND role_id=? AND requested_at=?", [attempts, ...key, row.requested_at]);
            continue;
          }
        }
        await db.query("DELETE FROM network_role_queue WHERE guild_id=? AND discord_id=? AND role_id=? AND requested_at=?", [...key, row.requested_at]);
        if (problem) {
          failed.push(`${await queueLog.roleLine(row)} · ⚠️ ${problem}`);
          console.error(`[FBRP staff queue] role ${row.action} ${row.role_id} for ${row.discord_id} in ${row.guild_id} dropped: ${problem}`);
          await audit?.("system", "staff_queue.role_failed", String(row.discord_id), { guild: row.guild_id, role: row.role_id, action: row.action, problem }).catch(() => {});
        }
      }

      const welcomes = await db.query("SELECT * FROM staff_welcome_queue ORDER BY requested_at LIMIT 5");
      for (const row of welcomes) {
        let result;
        try {
          result = await sendWelcome(row);
        } catch (error) {
          const attempts = Number(row.attempts || 0) + 1;
          if (attempts < MAX_ATTEMPTS) {
            await db.query("UPDATE staff_welcome_queue SET attempts=? WHERE discord_id=? AND requested_at=?", [attempts, row.discord_id, row.requested_at]);
            continue;
          }
          result = { sent: false, invited: false, problem: error.message || String(error) };
        }
        await db.query("DELETE FROM staff_welcome_queue WHERE discord_id=? AND requested_at=?", [row.discord_id, row.requested_at]);
        await log?.(result.guild || null, {
          title: result.sent ? "Staff onboarding DM sent" : "Staff onboarding DM not delivered",
          color: result.sent ? COLORS.success : COLORS.warning,
          target: String(row.discord_id),
          fields: [
            ["Rank", clean(row.rank_name, 80)],
            ...(row.callsign ? [["Callsign", String(row.callsign)]] : []),
            ["Invite", result.invited ? "Single-use staff-server invite included" : "None"],
            ...(result.sent ? [] : [["Why", result.problem || "Their DMs are closed. Share the invite or access yourself.", false]]),
          ],
        }, "staff_audit").catch(() => {});
      }
    } catch (error) {
      console.error("[FBRP staff queue]", error.message || error);
    } finally {
      running = false;
      await queueLog.post("Main bot completed", done, 0x57f287).catch(() => {});
      await queueLog.post("Main bot could not complete", failed, 0xed4245).catch(() => {});
    }
  }

  function start() {
    if (timer) return;
    timer = setInterval(() => void tick(), 4000);
    timer.unref?.();
  }

  return { start, tick };
}
