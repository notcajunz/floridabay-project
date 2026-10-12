import { config, db, post } from "./store.js";
import { ORG } from "./quota.js";
import { C, card, hours, mention, ts } from "./util.js";

/**
 * Logs in-game clock-ins and clock-outs of the IAA organization into the clock-in channel.
 * The game writes `organization_shifts` rows (see fbrp_core `/duty`); this only watches them.
 * The IAA organization is the one tied to the IAA server (guild or role requirement) or with slug `iaa`.
 */

const REASONS = { restart: "Server restart", switch: "Switched organization", auto: "Auto clock-out" };

let known = null; // open shift id -> true; null until the first poll has seeded it

export async function poll(guild) {
  const args = [guild.id, guild.id];
  const open = await db.query(
    `SELECT s.*,o.name org_name FROM organization_shifts s JOIN organizations o ON o.id=s.org_id WHERE s.ended_at IS NULL AND ${ORG}`,
    args,
  );
  const openIds = new Set(open.map((s) => String(s.id)));
  if (known === null) {
    known = openIds; // do not replay shifts that were already running before the bot started
    return;
  }

  for (const s of open) {
    if (known.has(String(s.id))) continue;
    known.add(String(s.id));
    await post(guild, "clockins", {
      embeds: [
        card("🟢 Clocked in", {
          color: C.green,
          description: `${s.discord_id ? mention(s.discord_id) : s.name} went on duty${s.name && s.discord_id ? ` as **${s.name}**` : ""}.`,
          fields: [["Since", ts(s.started_at, "t")]],
        }),
      ],
      allowedMentions: { parse: [] },
    });
  }

  const gone = [...known].filter((id) => !openIds.has(id));
  for (const id of gone) {
    known.delete(id);
    const s = await db.one("SELECT s.*,o.name org_name FROM organization_shifts s JOIN organizations o ON o.id=s.org_id WHERE s.id=?", [id]);
    if (!s?.ended_at) continue;
    await post(guild, "clockins", {
      embeds: [
        card("🔴 Clocked out", {
          color: C.navy,
          description: `${s.discord_id ? mention(s.discord_id) : s.name} went off duty${s.name && s.discord_id ? ` (**${s.name}**)` : ""}.`,
          fields: [
            ["Shift", hours(Number(s.seconds))],
            ["On duty", `${ts(s.started_at, "t")} to ${ts(s.ended_at, "t")}`],
            s.end_reason && s.end_reason !== "clockout" ? ["Ended by", REASONS[s.end_reason] || s.end_reason] : null,
          ],
        }),
      ],
      allowedMentions: { parse: [] },
    });
  }
}

/** Removes the retired duty terminal message (its buttons no longer exist) and forgets it. */
export async function retireTerminal(guild) {
  const cfg = await config();
  const panel = cfg.panels.clockins;
  if (!panel) return;
  const channel = await guild.channels.fetch(panel.channelId).catch(() => null);
  if (channel?.isTextBased()) await channel.messages.delete(panel.messageId).catch(() => null);
  await db.query("DELETE FROM iaa_config WHERE config_key='panel:clockins'");
}
