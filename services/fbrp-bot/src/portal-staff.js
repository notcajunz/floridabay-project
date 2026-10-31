import { EmbedBuilder } from "discord.js";
import { callGame } from "./sync.js";

const KINDS = new Set(["warning", "strike"]);
const STATUSES = new Set(["active", "inactive", "loa"]);
const clean = (value, max = 500) => String(value ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);
const label = (value) => String(value || "").replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

/**
 * Portal counterpart of /roster note, /roster status, /roster discipline, /roster discipline-revoke and
 * /staff forceout. Callers decide who may manage or discipline; this applies the change, writes the same
 * roster history the Discord commands write, and posts to the roster audit channel.
 */
export function createPortalStaff({ client, db, audit }) {
  const history = (discordId, action, actorId, details) =>
    db.query(
      "INSERT INTO staff_roster_history(discord_id,action,actor_id,details,created_at) VALUES(?,?,?,?,?)",
      [discordId, action, actorId, JSON.stringify(details || {}), Date.now()],
    );

  async function announce(title, actorId, targetId, fields, color = 0x3ddc97) {
    try {
      const binding = await db.one("SELECT channel_id FROM discord_channel_bindings WHERE purpose='roster'").catch(() => null)
        || await db.one("SELECT channel_id FROM discord_channel_bindings WHERE purpose='staff_audit'").catch(() => null);
      const channel = binding ? await client.channels.fetch(String(binding.channel_id)).catch(() => null) : null;
      if (!channel?.isTextBased()) return;
      const embed = new EmbedBuilder().setTitle(title).setColor(color).setTimestamp()
        .setDescription(`<@${actorId}> via the portal · <@${targetId}>`)
        .addFields(fields.map(([name, value]) => ({ name, value: String(value).slice(0, 1000) || "-" })));
      await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
    } catch (error) {
      console.error("[FBRP portal staff] audit post:", error.message || error);
    }
  }

  async function member(discordId) {
    const id = String(discordId || "");
    if (!/^\d{15,25}$/.test(id)) throw new Error("Choose a staff member.");
    const row = await db.one("SELECT discord_id,status FROM staff_roster_members WHERE discord_id=?", [id]);
    if (!row) throw new Error("That member has no roster record.");
    return row;
  }

  return {
    async act(session, access, input) {
      const actorId = String(session.id);
      const action = String(input.action || "");
      const needsDiscipline = action === "discipline" || action === "discipline_revoke";
      if (needsDiscipline ? !access.rosterDiscipline : !access.rosterManage)
        throw Object.assign(new Error(needsDiscipline
          ? "Staff Coordination Team, management, or the fbrp.roster.discipline permission is required."
          : "Staff Coordination Team, management, or the fbrp.roster.manage permission is required."), { status: 403 });

      if (action === "discipline_revoke") {
        const id = Number(input.id);
        const reason = clean(input.reason, 300);
        if (!reason) throw new Error("Give a reason for revoking this record.");
        const row = await db.one("SELECT * FROM staff_roster_discipline WHERE id=? AND revoked_at IS NULL", [id]);
        if (!row) throw new Error("Active discipline record not found.");
        await db.query("UPDATE staff_roster_discipline SET revoked_at=?,revoked_by=?,revoke_reason=? WHERE id=?", [Date.now(), actorId, reason, id]);
        await history(row.discord_id, "discipline_revoke", actorId, { id, reason });
        await audit(actorId, "roster.discipline_revoke", row.discord_id, { id, reason });
        await announce("Discipline revoked", actorId, row.discord_id, [["Record", `${label(row.kind)} #${id}`], ["Reason", reason]]);
        return { id };
      }

      const target = await member(input.discordId);

      if (action === "note") {
        const note = clean(input.note, 500);
        await db.query("UPDATE staff_roster_members SET activity_note=?,updated_at=? WHERE discord_id=?", [note || null, Date.now(), target.discord_id]);
        await history(target.discord_id, "note", actorId, { note });
        await audit(actorId, "roster.note", target.discord_id, { note });
        await announce("Roster note updated", actorId, target.discord_id, [["Note", note || "(cleared)"]], 0x5b8def);
        return { note };
      }
      if (action === "status") {
        const status = String(input.status || "");
        if (!STATUSES.has(status)) throw new Error("Choose Active, Inactive or LOA.");
        if (target.status === "removed") throw new Error("That member was removed from the roster.");
        await db.query("UPDATE staff_roster_members SET status=?,updated_at=? WHERE discord_id=?", [status, Date.now(), target.discord_id]);
        await history(target.discord_id, "status", actorId, { status });
        await audit(actorId, "roster.status", target.discord_id, { status });
        await announce("Roster status changed", actorId, target.discord_id, [["Status", label(status)]], 0x5b8def);
        return { status };
      }
      if (action === "forceout") {
        const reason = clean(input.reason, 300);
        if (!reason) throw new Error("Give a reason for ending the shift.");
        const result = await db.query(
          "UPDATE staff_shifts SET ended_at=heartbeat_at,seconds=GREATEST(0,FLOOR((heartbeat_at-started_at)/1000)),end_reason='forceout',actor_id=?,note=? WHERE discord_id=? AND ended_at IS NULL",
          [actorId, reason, target.discord_id],
        );
        await callGame("/forceout", { discord: target.discord_id, actor: actorId, reason }).catch(() => {});
        await audit(actorId, "staff.forceout", target.discord_id, { reason, rows: result.affectedRows, via: "portal" });
        await announce("Staff clock-out enforced", actorId, target.discord_id, [["Shifts closed", String(result.affectedRows)], ["Reason", reason]], 0xf0a030);
        return { closed: Number(result.affectedRows || 0) };
      }
      if (action === "discipline") {
        const kind = String(input.kind || "");
        const reason = clean(input.reason, 500);
        if (!KINDS.has(kind)) throw new Error("Choose a warning or a strike.");
        if (!reason) throw new Error("Give a reason for this record.");
        if (target.discord_id === actorId) throw new Error("You cannot discipline yourself.");
        const result = await db.query("INSERT INTO staff_roster_discipline(discord_id,kind,reason,actor_id,created_at) VALUES(?,?,?,?,?)", [target.discord_id, kind, reason, actorId, Date.now()]);
        await history(target.discord_id, "discipline", actorId, { id: result.insertId, kind, reason });
        await audit(actorId, "roster.discipline", target.discord_id, { id: result.insertId, kind, reason });
        let dmSent = true;
        try {
          const user = await client.users.fetch(target.discord_id);
          await user.send({ embeds: [new EmbedBuilder().setTitle(`Staff ${kind} in Florida Bay`).setColor(0xf0a030)
            .addFields({ name: "Record", value: `${label(kind)} #${result.insertId}` }, { name: "Reason", value: reason })] });
        } catch { dmSent = false; }
        await announce("Staff discipline issued", actorId, target.discord_id, [["Record", `${label(kind)} #${result.insertId}`], ["Reason", reason]], 0xf0a030);
        return { id: result.insertId, dmSent };
      }
      throw new Error("Unknown staff action.");
    },
  };
}
