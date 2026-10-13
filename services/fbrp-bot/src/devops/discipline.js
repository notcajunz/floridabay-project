import { config, db, demand, demandOutranks, dm, history, post, teamRoleIds } from "./store.js";
import { C, EPHEMERAL, UserError, card, clip, humanDuration, mention, parseDuration, respond, roleMention, ts } from "./util.js";
import { fetchMember, setRoles } from "./roster.js";
import { refreshPanels } from "./panels.js";

export const KINDS = {
  warning: { label: "Warning", icon: "❗", color: C.amber },
  strike: { label: "Strike", icon: "⚠️", color: C.red },
  suspension: { label: "Suspension", icon: "⛔", color: C.red },
};

/**
 * Records and enforces one disciplinary action.
 * @returns the new record id and any escalation note
 */
export async function issue(guild, member, { kind, reason, actorId, durationMs = null, quiet = false }) {
  const cfg = await config();
  const now = Date.now();
  let expires = null;
  let saved = null;
  let escalation = null;
  if (kind === "strike") expires = now + cfg.settings.strikeDays * 86400000;
  if (kind === "suspension") {
    if (!durationMs) throw new UserError("Suspensions need a duration such as `7d` or `48h`.");
    expires = now + durationMs;
    const active = await db.one("SELECT id FROM devops_discipline WHERE discord_id=? AND kind='suspension' AND active=1", [member.id]);
    if (active) throw new UserError(`${member} is already suspended (#${active.id}). Revoke it first to change the length.`);
    const strip = await teamRoleIds();
    saved = [...member.roles.cache.keys()].filter((id) => strip.has(id));
    await db.query("UPDATE devops_members SET status='suspended',updated_at=? WHERE discord_id=?", [now, member.id]);
    await setRoles(member, { remove: saved, add: [cfg.roles.suspended] }, clip(`DevOps suspension: ${reason}`, 400));
  }
  if (kind === "strike") {
    const prior = await db.one("SELECT COUNT(*) n FROM devops_discipline WHERE discord_id=? AND kind='strike' AND active=1", [member.id]);
    const count = Number(prior.n) + 1;
    if (count >= cfg.settings.strikesBeforeReview) escalation = `This is active strike **#${count}**. A suspension or removal review is recommended.`;
    if (cfg.roles.warned) await setRoles(member, { add: [cfg.roles.warned] }, clip(`DevOps strike: ${reason}`, 400));
  }

  const result = await db.query(
    "INSERT INTO devops_discipline(discord_id,kind,reason,actor_id,created_at,expires_at,active,saved_roles) VALUES(?,?,?,?,?,?,?,?)",
    [member.id, kind, clip(reason, 1000), String(actorId), now, expires, kind === "warning" ? 0 : 1, saved ? JSON.stringify(saved) : null],
  );
  const id = result.insertId;
  await history(member.id, kind, actorId, { reason });

  const meta = KINDS[kind];
  const embed = card(`${meta.icon} ${meta.label} · ${member.displayName}`, {
    color: meta.color,
    thumbnail: member.displayAvatarURL(),
    fields: [
      ["Developer", `${member}\n\`${member.id}\``],
      ["Issued by", mention(actorId)],
      ["Record", `#${id}`],
      expires ? ["Expires", `${ts(expires, "f")}\n(${humanDuration(expires - now)})`] : null,
      ["Reason", reason, false],
      escalation ? ["Escalation", escalation, false] : null,
    ],
  });
  await post(guild, "discipline", { embeds: [embed] }, "botLogs");
  if (kind !== "suspension") await post(guild, "warnings", { embeds: [embed] });
  if (escalation) await post(guild, "leadChat", { embeds: [card("🚨 Review recommended", { color: C.red, description: `${member} now has ${escalation}` })] });
  if (!quiet)
    await dm(member.user, {
      embeds: [
        card(`${meta.icon} ${meta.label}`, {
          color: meta.color,
          description: `${reason}${expires ? `\n\n**Ends:** ${ts(expires, "f")}` : ""}${kind === "suspension" ? "\nYour team roles will be restored automatically when it ends." : ""}`,
        }),
      ],
    });
  if (kind === "suspension") refreshPanels(guild, "chain");
  return { id, escalation, expires };
}

/** Ends an active record and undoes its roles. `actorId` null means it expired. */
export async function lift(guild, row, actorId = null, reason = null) {
  const cfg = await config();
  await db.query("UPDATE devops_discipline SET active=0,revoked_by=?,revoked_at=?,revoke_reason=? WHERE id=?", [
    actorId,
    actorId ? Date.now() : null,
    reason || (actorId ? null : "expired"),
    row.id,
  ]);
  const member = await guild.members.fetch(row.discord_id).catch(() => null);
  if (!member) return;
  if (row.kind === "suspension") {
    const saved = JSON.parse(row.saved_roles || "[]").filter((id) => guild.roles.cache.has(id));
    await setRoles(member, { add: saved, remove: [cfg.roles.suspended] }, actorId ? "DevOps suspension revoked" : "DevOps suspension ended");
    await db.query("UPDATE devops_members SET status='active',updated_at=? WHERE discord_id=? AND status='suspended'", [Date.now(), member.id]);
    await dm(member.user, { embeds: [card("✅ Suspension lifted", { color: C.green, description: "Your team roles have been restored. Welcome back." })] });
    refreshPanels(guild, "chain");
  }
  if (row.kind === "strike" && cfg.roles.warned) {
    const others = await db.one("SELECT COUNT(*) n FROM devops_discipline WHERE discord_id=? AND kind='strike' AND active=1", [member.id]);
    if (!Number(others.n)) await setRoles(member, { remove: [cfg.roles.warned] }, `DevOps strike ${actorId ? "revoked" : "expired"}`);
  }
  await post(
    guild,
    "discipline",
    {
      embeds: [
        card(`↩️ ${KINDS[row.kind]?.label || row.kind} #${row.id} ${actorId ? "revoked" : "expired"}`, {
          color: C.grey,
          fields: [["Developer", `${member}`], ["By", actorId ? mention(actorId) : "System"], reason ? ["Reason", reason, false] : null],
        }),
      ],
    },
    "botLogs",
  );
}

export async function expireDue(guild) {
  const rows = await db.query("SELECT * FROM devops_discipline WHERE active=1 AND expires_at IS NOT NULL AND expires_at<=?", [Date.now()]);
  for (const row of rows) await lift(guild, row).catch((e) => console.warn(`[DevOps] expire #${row.id}: ${e.message}`));
}

/* ------------------------------------------------------------------ commands */

export async function command(i, actor, sub) {
  if (sub === "record") return record(i, actor);
  if (sub === "revoke") {
    await demand(actor, "discipline.suspend");
    const id = i.options.getInteger("id", true);
    const row = await db.one("SELECT * FROM devops_discipline WHERE id=?", [id]);
    if (!row || !row.active) throw new UserError(`Record #${id} is not active.`);
    const member = await i.guild.members.fetch(row.discord_id).catch(() => null);
    if (member) await demandOutranks(actor, member);
    await i.deferReply(EPHEMERAL);
    await lift(i.guild, row, i.user.id, i.options.getString("reason", true));
    return respond(i, `${KINDS[row.kind].label} #${id} for ${mention(row.discord_id)} was revoked.`);
  }
  const kind = { warn: "warning", strike: "strike", suspend: "suspension" }[sub];
  if (!kind) throw new UserError("Unknown action.");
  await demand(actor, kind === "suspension" ? "discipline.suspend" : "discipline.warn");
  const member = await fetchMember(i.guild, i.options.getUser("user", true));
  await demandOutranks(actor, member);
  const reason = i.options.getString("reason", true);
  let durationMs = null;
  if (kind === "suspension") {
    durationMs = parseDuration(i.options.getString("duration", true));
    if (!durationMs || durationMs > 365 * 86400000) throw new UserError("Use a duration like `3d`, `48h` or `2w` (max one year).");
  }
  await i.deferReply(EPHEMERAL);
  const { id, escalation, expires } = await issue(i.guild, member, { kind, reason, actorId: i.user.id, durationMs });
  return respond(i, {
    embeds: [
      card(`Recorded #${id}`, {
        color: C.green,
        description: `${KINDS[kind].label} issued to ${member}.${expires ? ` Ends ${ts(expires, "R")}.` : ""}${escalation ? `\n\n⚠️ ${escalation}` : ""}`,
      }),
    ],
  });
}

async function record(i, actor) {
  const user = i.options.getUser("user", true);
  if (user.id !== i.user.id) await demand(actor, "discipline.warn");
  const rows = await db.query("SELECT * FROM devops_discipline WHERE discord_id=? ORDER BY id DESC LIMIT 25", [user.id]);
  const lines = rows.map((r) => {
    const meta = KINDS[r.kind] || { icon: "•", label: r.kind };
    const state = r.active ? (r.expires_at ? `active until ${ts(r.expires_at, "d")}` : "active") : r.revoked_by ? `revoked by ${mention(r.revoked_by)}` : r.kind === "warning" ? "on file" : "ended";
    return `${meta.icon} **#${r.id} ${meta.label}** · ${ts(r.created_at, "d")} · ${state}\n  ↳ ${clip(r.reason, 140)} — ${mention(r.actor_id)}`;
  });
  const cfg = await config();
  const member = await i.guild.members.fetch(user.id).catch(() => null);
  const roles = member ? [cfg.roles.warned, cfg.roles.suspended].filter((id) => id && member.roles.cache.has(id)).map(roleMention) : [];
  return respond(i, {
    embeds: [
      card(`📕 Disciplinary record · ${user.username}`, {
        color: rows.some((r) => r.active) ? C.red : C.blue,
        description: `${roles.length ? `Currently holds: ${roles.join(" ")}\n\n` : ""}${lines.join("\n") || "Clean record."}`.slice(0, 4000),
      }),
    ],
  });
}
