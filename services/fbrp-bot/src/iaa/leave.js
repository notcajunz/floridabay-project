import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } from "discord.js";
import { authority, config, db, demand, dm, post, rankOf } from "./store.js";
import { C, UserError, card, clip, humanDuration, mention, respond, ts } from "./util.js";
import { setRoles } from "./roster.js";

const DAY = 86400000;

function requestEmbed(row, member, state = null) {
  const color = { approved: C.green, denied: C.red, cancelled: C.grey, ended: C.grey }[row.status] || C.amber;
  return card(`🌴 Leave of absence · ${member?.displayName || row.discord_id}`, {
    color,
    thumbnail: member?.displayAvatarURL(),
    fields: [
      ["Agent", mention(row.discord_id)],
      ["From", ts(row.starts_at, "D")],
      ["Until", ts(row.ends_at, "D")],
      ["Length", humanDuration(Number(row.ends_at) - Number(row.starts_at))],
      ["Status", state || row.status.toUpperCase()],
      row.decided_by ? ["Decided by", mention(row.decided_by)] : null,
      ["Reason", row.reason, false],
      row.decision_note ? ["Note", row.decision_note, false] : null,
    ],
    footer: `Leave #${row.id}`,
  });
}

const decisionRow = (id) =>
  new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`iaa:loa:approve:${id}`).setLabel("Approve").setEmoji("✅").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`iaa:loa:deny:${id}`).setLabel("Deny").setEmoji("✖️").setStyle(ButtonStyle.Danger),
  );

async function request(i) {
  const member = await i.guild.members.fetch(i.user.id);
  if (!(await rankOf(member))) throw new UserError("Only ranked IAA agents can request leave.");
  const days = i.options.getInteger("days", true);
  const startsIn = i.options.getInteger("starts_in") ?? 0;
  const reason = i.options.getString("reason", true);
  const pending = await db.one("SELECT id FROM iaa_leaves WHERE discord_id=? AND (status='pending' OR (status='approved' AND ends_at>?))", [member.id, Date.now()]);
  if (pending) throw new UserError(`You already have an open or upcoming leave (#${pending.id}). End it with \`/loa end\` first.`);
  const start = Date.now() + startsIn * DAY;
  const result = await db.query("INSERT INTO iaa_leaves(discord_id,starts_at,ends_at,reason,status,created_at) VALUES(?,?,?,?, 'pending',?)", [
    member.id,
    start,
    start + days * DAY,
    clip(reason, 1000),
    Date.now(),
  ]);
  const row = await db.one("SELECT * FROM iaa_leaves WHERE id=?", [result.insertId]);
  const message = await post(i.guild, "leaveRequests", { embeds: [requestEmbed(row, member)], components: [decisionRow(row.id)] }, "botLogs");
  if (message) await db.query("UPDATE iaa_leaves SET channel_id=?,message_id=? WHERE id=?", [message.channelId, message.id, row.id]);
  return respond(i, `Leave request #${row.id} submitted for **${days} day(s)**. A supervisor will review it.`);
}

/** Applies the LOA role, updates the request card and DMs the agent. */
async function decide(i, id, approve, note = null) {
  const actor = await authority(await i.guild.members.fetch(i.user.id));
  await demand(actor, "leave.decide");
  const row = await db.one("SELECT * FROM iaa_leaves WHERE id=?", [id]);
  if (!row || row.status !== "pending") throw new UserError("That request was already handled.");
  if (row.discord_id === i.user.id && !actor.admin) throw new UserError("You cannot decide your own leave.");
  const now = Date.now();
  await db.query("UPDATE iaa_leaves SET status=?,decided_by=?,decided_at=?,decision_note=? WHERE id=?", [approve ? "approved" : "denied", i.user.id, now, note, id]);
  const fresh = await db.one("SELECT * FROM iaa_leaves WHERE id=?", [id]);
  const member = await i.guild.members.fetch(row.discord_id).catch(() => null);
  if (approve && member && Number(row.starts_at) <= now) await startLeave(i.guild, fresh, member);
  if (row.message_id) {
    const channel = await i.guild.channels.fetch(row.channel_id).catch(() => null);
    const message = await channel?.messages.fetch(row.message_id).catch(() => null);
    await message?.edit({ embeds: [requestEmbed(fresh, member)], components: [] }).catch(() => null);
  }
  await post(i.guild, "leaveLogs", { embeds: [requestEmbed(fresh, member)] }, "botLogs");
  if (member)
    await dm(member.user, {
      embeds: [
        card(approve ? "🌴 Leave approved" : "Leave denied", {
          color: approve ? C.green : C.red,
          description: approve ? `Enjoy your time off. Your leave runs until ${ts(row.ends_at, "D")}.` : `Your leave request was denied.${note ? `\n\n${note}` : ""}`,
        }),
      ],
    });
}

async function startLeave(guild, row, member) {
  const cfg = await config();
  if (cfg.roles.loa) await setRoles(member, { add: [cfg.roles.loa] }, `Leave #${row.id} started`);
  await db.query("UPDATE iaa_leaves SET role_applied=1 WHERE id=?", [row.id]);
}

async function finishLeave(guild, row, status = "ended") {
  await db.query("UPDATE iaa_leaves SET status=? WHERE id=?", [status, row.id]);
  const cfg = await config();
  const member = await guild.members.fetch(row.discord_id).catch(() => null);
  if (member && cfg.roles.loa && member.roles.cache.has(cfg.roles.loa)) await setRoles(member, { remove: [cfg.roles.loa] }, `Leave #${row.id} ${status}`);
  await post(
    guild,
    "leaveLogs",
    { embeds: [card(`🏁 Leave #${row.id} ${status}`, { color: C.grey, description: `${mention(row.discord_id)} is back on the active roster.` })] },
    "botLogs",
  );
  if (member && status === "ended") await dm(member.user, { embeds: [card("👋 Welcome back", { color: C.blue, description: "Your leave of absence has ended. Remember to clock in when you are active." })] });
}

/** Starts approved leaves whose start date has come and ends the ones that are over. */
export async function tick(guild) {
  const now = Date.now();
  for (const row of await db.query("SELECT * FROM iaa_leaves WHERE status='approved' AND role_applied=0 AND starts_at<=? AND ends_at>?", [now, now])) {
    const member = await guild.members.fetch(row.discord_id).catch(() => null);
    if (member) await startLeave(guild, row, member);
  }
  for (const row of await db.query("SELECT * FROM iaa_leaves WHERE status='approved' AND ends_at<=?", [now])) await finishLeave(guild, row);
}

export async function command(i, actor, sub) {
  if (sub === "request") return request(i);
  if (sub === "end") {
    const row = await db.one("SELECT * FROM iaa_leaves WHERE discord_id=? AND status IN ('pending','approved') ORDER BY id DESC LIMIT 1", [i.user.id]);
    if (!row) throw new UserError("You have no open leave.");
    await finishLeave(i.guild, row, row.status === "pending" ? "cancelled" : "ended");
    return respond(i, row.status === "pending" ? "Leave request withdrawn." : "Leave ended early. Welcome back!");
  }
  if (sub === "list") {
    await demand(actor, "leave.decide");
    const rows = await db.query("SELECT * FROM iaa_leaves WHERE status='pending' OR (status='approved' AND ends_at>?) ORDER BY starts_at", [Date.now()]);
    const lines = rows.map((r) => `${r.status === "pending" ? "⏳" : Number(r.starts_at) > Date.now() ? "📅" : "🌴"} **#${r.id}** ${mention(r.discord_id)} · ${ts(r.starts_at, "d")} → ${ts(r.ends_at, "d")} · ${clip(r.reason, 60)}`);
    return respond(i, { embeds: [card("🌴 Leave board", { color: C.blue, description: lines.join("\n") || "Nobody is on leave." })] });
  }
}

export async function button(i, action, id) {
  if (action === "approve") {
    await i.deferReply({ flags: 64 });
    await decide(i, Number(id), true);
    return respond(i, `Leave #${id} approved.`);
  }
  if (action === "deny")
    return i.showModal(
      new ModalBuilder()
        .setCustomId(`iaa:loa:denymodal:${id}`)
        .setTitle(`Deny leave #${id}`)
        .addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("note").setLabel("Reason (sent to the agent)").setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(500)),
        ),
    );
}

export async function modal(i, id) {
  await i.deferReply({ flags: 64 });
  await decide(i, Number(id), false, i.fields.getTextInputValue("note") || null);
  return respond(i, `Leave #${id} denied.`);
}
