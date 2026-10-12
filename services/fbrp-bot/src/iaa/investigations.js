import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { authority, can, config, db, demand, dm, post, rankOf } from "./store.js";
import { C, EPHEMERAL, UserError, card, clip, humanDuration, line, mention, parseDuration, rel, respond, ts } from "./util.js";
import { TYPES, dossierEmbed, gatherIntel } from "./intel.js";
import { refreshPanels } from "./panels.js";
import { setRoles } from "./roster.js";

export { TYPES };

export const STATUSES = {
  open: { label: "Open · unassigned", icon: "🆕", color: C.blue },
  active: { label: "Active", icon: "🔎", color: C.navy },
  review: { label: "Pending command review", icon: "⚖️", color: C.purple },
  hold: { label: "On hold", icon: "⏸️", color: C.grey },
  closed: { label: "Closed", icon: "🔒", color: C.grey },
};
export const PRIORITIES = {
  critical: { label: "Critical", icon: "🔴", order: 0 },
  high: { label: "High", icon: "🟠", order: 1 },
  normal: { label: "Normal", icon: "🔵", order: 2 },
  low: { label: "Low", icon: "⚪", order: 3 },
};
export const VERDICTS = {
  substantiated: { label: "Substantiated", icon: "✅", guilty: true },
  policy_violation: { label: "Policy violation (other)", icon: "⚠️", guilty: true },
  unsubstantiated: { label: "Unsubstantiated", icon: "❎" },
  insufficient_evidence: { label: "Insufficient evidence", icon: "❔" },
  exonerated: { label: "Exonerated", icon: "🕊️" },
};
export const OUTCOMES = {
  none: { label: "No action", perm: null },
  warning: { label: "Warning", perm: "discipline.warn" },
  strike: { label: "Strike", perm: "discipline.warn" },
  suspension: { label: "Suspension", perm: "discipline.suspend" },
  removal: { label: "Removal from the IAA", perm: "roster.remove" },
  blacklist: { label: "Removal + IAA blacklist", perm: "discipline.blacklist" },
};

/* ------------------------------------------------------------------ lookup */

export async function findCase(ref) {
  const raw = String(ref || "").trim();
  const row = /^\d+$/.test(raw)
    ? await db.one("SELECT * FROM iaa_cases WHERE id=?", [Number(raw)])
    : await db.one("SELECT * FROM iaa_cases WHERE reference=?", [raw.toUpperCase()]);
  if (!row) throw new UserError(`No case \`${clip(raw, 30)}\`.`);
  return row;
}

export async function caseAutocomplete(i, { openOnly = false } = {}) {
  const q = `%${String(i.options.getFocused() || "").trim()}%`;
  const rows = await db.query(
    `SELECT id,reference,subject_name,type,status FROM iaa_cases WHERE (reference LIKE ? OR subject_name LIKE ?) ${openOnly ? "AND status<>'closed'" : ""} ORDER BY status='closed',id DESC LIMIT 25`,
    [q, q],
  );
  return i.respond(rows.map((r) => ({ name: line(`${r.reference} · ${r.subject_name} · ${TYPES[r.type]?.label || r.type} · ${r.status}`, 100), value: String(r.id) })));
}

/** Every case action needs investigation access, and nobody may touch their own case. */
async function demandCaseAccess(actor, row) {
  await demand(actor, "case.open");
  if (row.subject_id === actor.id && !actor.admin) throw new UserError("You cannot work a case where you are the subject.");
}

/* ------------------------------------------------------------------ rendering */

export function caseFileEmbed(row, counts = {}) {
  const type = TYPES[row.type] || TYPES.other;
  const status = STATUSES[row.status] || STATUSES.open;
  const priority = PRIORITIES[row.priority] || PRIORITIES.normal;
  const intel = row.intel ? JSON.parse(row.intel) : null;
  return card(`${type.icon} ${row.reference} · ${type.label}`, {
    color: row.status === "closed" ? (VERDICTS[row.verdict]?.guilty ? C.red : C.green) : priority.order <= 1 ? C.red : status.color,
    author: { name: "INTERNAL AFFAIRS AGENCY · CASE FILE · CONFIDENTIAL" },
    fields: [
      ["Subject", `${mention(row.subject_id)}\n\`${row.subject_id}\``],
      ["Status", `${status.icon} ${status.label}`],
      ["Priority", `${priority.icon} ${priority.label}`],
      ["Lead investigator", row.lead_id ? mention(row.lead_id) : "*Unassigned*"],
      ["Opened by", `${mention(row.opened_by)}\n${ts(row.opened_at, "f")}`],
      ["Last activity", rel(row.last_activity_at)],
      ["Allegation", row.summary, false],
      intel ? ["Threat at intake", `${intel.dot} ${intel.level} · ${intel.score}/100${intel.reasons?.length ? `\n*${intel.reasons.join(" · ")}*` : ""}`, false] : null,
      ["File", `📎 ${counts.evidence || 0} evidence · 🗒️ ${counts.note || 0} notes`],
      row.flagged ? ["Flag", "🔎 Subject holds *Under Investigation*"] : null,
      row.status === "closed"
        ? ["Disposition", `${VERDICTS[row.verdict]?.icon || ""} **${VERDICTS[row.verdict]?.label || row.verdict}** · ${OUTCOMES[row.outcome]?.label || row.outcome}\nClosed by ${mention(row.closed_by)} ${ts(row.closed_at, "R")}`, false]
        : null,
      row.findings ? ["Findings", row.findings, false] : null,
    ],
    footer: `Case #${row.id} · handle per IAA confidentiality policy`,
  });
}

function caseControls(row) {
  if (row.status === "closed")
    return [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`iaa:case:reopen:${row.id}`).setLabel("Reopen").setEmoji("🔓").setStyle(ButtonStyle.Secondary))];
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`iaa:case:claim:${row.id}`).setLabel(row.lead_id ? "Take over lead" : "Claim lead").setEmoji("🕵️").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`iaa:case:evidence:${row.id}`).setLabel("Evidence").setEmoji("📎").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`iaa:case:note:${row.id}`).setLabel("Note").setEmoji("🗒️").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`iaa:case:intel:${row.id}`).setLabel("Re-run intel").setEmoji("🛰️").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`iaa:case:close:${row.id}`).setLabel("Close case").setEmoji("🔒").setStyle(ButtonStyle.Danger),
    ),
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`iaa:case:status:${row.id}`)
        .setPlaceholder("Change status or priority…")
        .addOptions(
          ...["open", "active", "review", "hold"].map((s) => ({ label: `Status: ${STATUSES[s].label}`, value: `status:${s}`, emoji: STATUSES[s].icon, default: false })),
          ...Object.entries(PRIORITIES).map(([k, p]) => ({ label: `Priority: ${p.label}`, value: `priority:${k}`, emoji: p.icon })),
        ),
    ),
  ];
}

async function counts(caseId) {
  const rows = await db.query("SELECT kind,COUNT(*) n FROM iaa_case_entries WHERE case_id=? GROUP BY kind", [caseId]);
  return Object.fromEntries(rows.map((r) => [r.kind, Number(r.n)]));
}

async function thread(guild, row) {
  if (!row.thread_id) return null;
  return guild.channels.fetch(row.thread_id).catch(() => null);
}

/** Re-renders the pinned case file. */
async function refreshFile(guild, id) {
  const row = await db.one("SELECT * FROM iaa_cases WHERE id=?", [id]);
  const t = await thread(guild, row);
  if (!t || !row.file_message_id) return row;
  if (t.archived) await t.setArchived(false).catch(() => null);
  const message = await t.messages.fetch(row.file_message_id).catch(() => null);
  await message?.edit({ embeds: [caseFileEmbed(row, await counts(id))], components: caseControls(row) }).catch(() => null);
  return row;
}

async function touch(id, patch = {}) {
  const keys = Object.keys(patch);
  await db.query(`UPDATE iaa_cases SET ${keys.map((k) => `${k}=?,`).join("")}updated_at=?,last_activity_at=?,reminded_at=NULL WHERE id=?`, [
    ...keys.map((k) => patch[k]),
    Date.now(),
    Date.now(),
    id,
  ]);
}

async function addToThread(guild, row, userId) {
  const t = await thread(guild, row);
  if (t?.type === ChannelType.PrivateThread) await t.members.add(userId).catch(() => null);
}

async function entry(guild, row, { kind, authorId, body, url = null, embed = null, files = [] }) {
  await db.query("INSERT INTO iaa_case_entries(case_id,kind,author_id,body,url,created_at) VALUES(?,?,?,?,?,?)", [row.id, kind, String(authorId), clip(body, 2000), url, Date.now()]);
  const t = await thread(guild, row);
  let message = null;
  if (t && embed) {
    if (t.archived) await t.setArchived(false).catch(() => null);
    message = await t.send({ embeds: [embed], files }).catch(() => null);
  }
  return message;
}

/* ------------------------------------------------------------------ open */

export async function openCase(guild, { subject, type, summary, priority = "normal", actor, flag = true, notify = false, evidence = null }) {
  const cfg = await config();
  if (!cfg.channels.investigations) throw new UserError("No case channel is configured. Run `/iaa-admin setup` first.");
  if (!TYPES[type]) throw new UserError("Unknown investigation type.");
  await demand(actor, "case.open");
  if (subject.id === actor.id) throw new UserError("You cannot investigate yourself.");
  if (subject.bot) throw new UserError("Bots cannot be investigated.");
  const member = await guild.members.fetch(subject.id).catch(() => null);
  const subjectRank = member ? await rankOf(member) : null;
  if (subjectRank && !actor.admin && subjectRank.level >= actor.level && !(await can(actor, "admin")))
    throw new UserError(`${subject} holds **${subjectRank.name}**. Investigations into your rank or above must be opened by High Command.`);
  const existing = await db.one("SELECT reference FROM iaa_cases WHERE subject_id=? AND type=? AND status<>'closed' LIMIT 1", [subject.id, type]);
  if (existing) throw new UserError(`${subject} already has an open ${TYPES[type].label} case: \`${existing.reference}\`.`);

  const intel = await gatherIntel(subject.id);
  const now = Date.now();
  const result = await db.query(
    "INSERT INTO iaa_cases(subject_id,subject_name,type,status,priority,summary,opened_by,flagged,notify_subject,intel,opened_at,updated_at,last_activity_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
    [subject.id, line(subject.username, 80), type, "open", priority, clip(summary, 1500), actor.id, 0, notify ? 1 : 0, JSON.stringify(intel), now, now, now],
  );
  const id = result.insertId;
  const reference = `IA-${new Date(now).getUTCFullYear()}-${String(id).padStart(4, "0")}`;
  await db.query("UPDATE iaa_cases SET reference=? WHERE id=?", [reference, id]);

  const channel = await guild.channels.fetch(cfg.channels.investigations).catch(() => null);
  let t = null;
  if (channel?.threads)
    t = await channel.threads
      .create({
        name: line(`${reference} · ${subject.username}`, 100),
        type: ChannelType.PrivateThread,
        invitable: false,
        autoArchiveDuration: 10080,
        reason: `IAA case ${reference}`,
      })
      .catch((error) => {
        console.warn(`[IAA] case thread: ${error.message}`);
        return null;
      });
  let flagged = false;
  if (flag && member && cfg.roles.underInvestigation) {
    await setRoles(member, { add: [cfg.roles.underInvestigation] }, `IAA case ${reference}`).catch(() => null);
    flagged = true;
  }
  await db.query("UPDATE iaa_cases SET thread_id=?,flagged=? WHERE id=?", [t?.id || null, flagged ? 1 : 0, id]);
  let row = await db.one("SELECT * FROM iaa_cases WHERE id=?", [id]);

  if (t) {
    await t.members.add(actor.id).catch(() => null);
    const file = await t.send({ embeds: [caseFileEmbed(row)], components: caseControls(row) });
    await file.pin().catch(() => null);
    await db.query("UPDATE iaa_cases SET file_message_id=? WHERE id=?", [file.id, id]);
    await t.send({ embeds: [dossierEmbed(intel, subject, { title: "Intake intel" })] });
    await t.send({
      content: [
        `${mention(actor.id)} case **${reference}** is open.`,
        "• **Claim lead** to take ownership · **Evidence**/**Note** to build the file · use the menu to move it through review.",
        "• Add collaborators with `/investigation add-agent`. This thread is private.",
      ].join("\n"),
    });
    row = await db.one("SELECT * FROM iaa_cases WHERE id=?", [id]);
  }
  await db.query("INSERT INTO iaa_case_entries(case_id,kind,author_id,body,created_at) VALUES(?,?,?,?,?)", [id, "system", actor.id, `Case opened: ${summary}`, now]);
  if (evidence) await addEvidence(guild, row, actor.id, evidence.description || "Initial evidence", evidence.url, evidence.attachment);

  if (notify)
    await dm(subject, {
      embeds: [
        card("📨 Notice of Internal Affairs investigation", {
          color: C.navy,
          description: `The FBRP Internal Affairs Agency has opened case **${reference}** (${TYPES[type].label}) concerning you.\n\nYou may be contacted by an investigator. Do not discuss this case with other members, and do not delete messages or leave servers relevant to it.`,
        }),
      ],
    });
  await post(
    guild,
    "botLogs",
    {
      embeds: [
        card(`📂 Case opened · ${reference}`, {
          color: C.navy,
          fields: [["Subject", `${subject} \`${subject.id}\``], ["Type", TYPES[type].label], ["Opened by", mention(actor.id)], ["Thread", t ? `<#${t.id}>` : "not created"]],
        }),
      ],
    },
  );
  refreshPanels(guild, "board");
  return { row, thread: t, intel };
}

/* ------------------------------------------------------------------ evidence & notes */

async function addEvidence(guild, row, authorId, description, url = null, attachment = null) {
  if (url && !/^https?:\/\/\S+$/i.test(url)) throw new UserError("Evidence links must start with http(s)://");
  const files = [];
  if (attachment) {
    if (attachment.size > 24 * 1024 * 1024) throw new UserError("Attachments must be under 24 MB.");
    files.push(new AttachmentBuilder(attachment.url, { name: attachment.name }));
  }
  const n = ((await counts(row.id)).evidence || 0) + 1;
  const embed = card(`📎 Exhibit ${String.fromCharCode(64 + Math.min(n, 26))}${n > 26 ? n : ""} · ${row.reference}`, {
    color: C.gold,
    description,
    fields: [["Submitted by", mention(authorId)], url ? ["Link", url] : null, attachment ? ["File", attachment.name] : null],
  });
  if (attachment?.contentType?.startsWith("image/")) embed.setImage(`attachment://${attachment.name}`);
  const message = await entry(guild, row, { kind: "evidence", authorId, body: description, url, embed, files });
  if (message && attachment) await db.query("UPDATE iaa_case_entries SET url=? WHERE case_id=? AND kind='evidence' ORDER BY id DESC LIMIT 1", [url || message.url, row.id]);
  await touch(row.id);
  await refreshFile(guild, row.id);
}

async function addNote(guild, row, authorId, text) {
  await entry(guild, row, { kind: "note", authorId, body: text, embed: card(`🗒️ Investigator note · ${row.reference}`, { color: C.navy, description: text, fields: [["By", mention(authorId)]] }) });
  await touch(row.id);
  await refreshFile(guild, row.id);
}

async function setLead(guild, row, leadId, actorId) {
  await touch(row.id, { lead_id: leadId, status: row.status === "open" ? "active" : row.status });
  await addToThread(guild, row, leadId);
  await entry(guild, row, {
    kind: "assign",
    authorId: actorId,
    body: `Lead set to ${leadId}`,
    embed: card("🕵️ Lead investigator assigned", { color: C.blue, description: `${mention(leadId)} now leads **${row.reference}**${leadId !== actorId ? ` (assigned by ${mention(actorId)})` : ""}.` }),
  });
  await refreshFile(guild, row.id);
  refreshPanels(guild, "board");
}

async function setStatus(guild, row, field, value, actorId) {
  if (field === "status" && !STATUSES[value]) throw new UserError("Unknown status.");
  if (field === "priority" && !PRIORITIES[value]) throw new UserError("Unknown priority.");
  if (row[field] === value) return;
  await touch(row.id, { [field]: value });
  const label = field === "status" ? `${STATUSES[value].icon} ${STATUSES[value].label}` : `${PRIORITIES[value].icon} ${PRIORITIES[value].label}`;
  await entry(guild, row, { kind: "status", authorId: actorId, body: `${field} → ${value}`, embed: card(`🔁 ${field === "status" ? "Status" : "Priority"} changed`, { color: C.grey, description: `${label} · by ${mention(actorId)}` }) });
  if (field === "status" && value === "review") {
    const cfg = await config();
    const hc = cfg.tiers.find((t) => t.key === "high_command")?.roleId;
    const t = await thread(guild, row);
    if (t && hc) await t.send({ content: `<@&${hc}> **${row.reference}** is ready for command review.`, allowedMentions: { roles: [hc] } }).catch(() => null);
  }
  await refreshFile(guild, row.id);
  refreshPanels(guild, "board");
}

/* ------------------------------------------------------------------ close */

export async function closeCase(guild, row, { verdict, outcome, findings, durationMs = null, actor }) {
  await demandCaseAccess(actor, row);
  await demand(actor, "case.close");
  if (row.status === "closed") throw new UserError(`${row.reference} is already closed.`);
  if (!VERDICTS[verdict]) throw new UserError("Pick a verdict.");
  if (!OUTCOMES[outcome]) throw new UserError("Pick an outcome.");
  if (!VERDICTS[verdict].guilty && outcome !== "none") throw new UserError(`A **${VERDICTS[verdict].label}** verdict cannot carry a punishment.`);
  if (OUTCOMES[outcome].perm) await demand(actor, OUTCOMES[outcome].perm);
  if (outcome === "suspension" && !durationMs) throw new UserError("Suspensions need a duration such as `7d`.");

  const member = await guild.members.fetch(row.subject_id).catch(() => null);
  const subjectRank = member ? await rankOf(member) : null;
  if (outcome !== "none" && subjectRank && !actor.admin && subjectRank.level >= actor.level)
    throw new UserError(`The subject holds **${subjectRank.name}**, which is not below your rank. Ask someone senior to close it.`);
  const reason = `${row.reference} (${TYPES[row.type].label}): ${findings}`;
  let applied = "No action taken.";
  if (outcome !== "none") {
    const { issue } = await import("./discipline.js");
    const { separate } = await import("./roster.js");
    const { blacklistUser } = await import("./blacklist.js");
    if (["warning", "strike", "suspension"].includes(outcome)) {
      if (!member) throw new UserError("The subject is no longer in the server, so that outcome cannot be applied. Use removal or blacklist.");
      const result = await issue(guild, member, { kind: outcome, reason, actorId: actor.id, durationMs, caseId: row.id });
      applied = `${OUTCOMES[outcome].label} #${result.id}${durationMs ? ` for ${humanDuration(durationMs)}` : ""}.`;
    } else if (outcome === "removal") {
      if (member) await separate(guild, member, { actorId: actor.id, reason });
      applied = member ? "Removed from the agency." : "Subject already left the server. Roster entry closed.";
      if (!member) await db.query("UPDATE iaa_members SET status='removed',callsign=NULL,rank_role_id=NULL,removed_at=? WHERE discord_id=?", [Date.now(), row.subject_id]);
    } else if (outcome === "blacklist") {
      await blacklistUser(guild, row.subject_id, { reason, actorId: actor.id, caseId: row.id });
      applied = "Removed, blacklisted and banned from the IAA server.";
    }
  }
  const now = Date.now();
  await db.query("UPDATE iaa_cases SET status='closed',verdict=?,outcome=?,findings=?,closed_at=?,closed_by=?,updated_at=?,last_activity_at=? WHERE id=?", [
    verdict,
    outcome,
    clip(findings, 2000),
    now,
    actor.id,
    now,
    now,
    row.id,
  ]);
  const cfg = await config();
  if (row.flagged && member && cfg.roles.underInvestigation) {
    const other = await db.one("SELECT 1 FROM iaa_cases WHERE subject_id=? AND flagged=1 AND status<>'closed' LIMIT 1", [row.subject_id]);
    if (!other && member.roles.cache.has(cfg.roles.underInvestigation)) await setRoles(member, { remove: [cfg.roles.underInvestigation] }, `IAA case ${row.reference} closed`).catch(() => null);
  }
  const closed = await db.one("SELECT * FROM iaa_cases WHERE id=?", [row.id]);
  const v = VERDICTS[verdict];
  const verdictEmbed = card(`${v.icon} Case closed · ${v.label}`, {
    color: v.guilty ? C.red : C.green,
    fields: [["Outcome", applied], ["Closed by", mention(actor.id)], ["Findings", findings, false]],
  });
  await entry(guild, closed, { kind: "verdict", authorId: actor.id, body: `${verdict} / ${outcome}: ${findings}`, embed: verdictEmbed });
  await refreshFile(guild, row.id);

  // Sealed report in the archive with a plain-text transcript of the whole file.
  const transcript = await transcriptText(closed);
  await post(
    guild,
    "archive",
    {
      embeds: [caseFileEmbed(closed, await counts(row.id))],
      files: [new AttachmentBuilder(Buffer.from(transcript, "utf8"), { name: `${closed.reference}.txt` })],
    },
    "botLogs",
  );
  const t = await thread(guild, closed);
  if (t) {
    await t.setLocked(true, "Case closed").catch(() => null);
    await t.setArchived(true, "Case closed").catch(() => null);
  }
  if (row.notify_subject) {
    const user = await guild.client.users.fetch(row.subject_id).catch(() => null);
    if (user)
      await dm(user, {
        embeds: [card(`IAA case ${closed.reference} closed`, { color: C.navy, description: `**Verdict:** ${v.label}\n**Outcome:** ${OUTCOMES[outcome].label}` })],
      });
  }
  refreshPanels(guild, "board", "leaderboard");
  return { row: closed, applied };
}

async function transcriptText(row) {
  const entries = await db.query("SELECT * FROM iaa_case_entries WHERE case_id=? ORDER BY id", [row.id]);
  const iso = (ms) => new Date(Number(ms)).toISOString().replace("T", " ").slice(0, 19);
  return [
    `FBRP INTERNAL AFFAIRS AGENCY · CASE ${row.reference}`,
    "CONFIDENTIAL",
    "=".repeat(60),
    `Subject:   ${row.subject_name} (${row.subject_id})`,
    `Type:      ${TYPES[row.type]?.label || row.type}`,
    `Priority:  ${row.priority}`,
    `Opened:    ${iso(row.opened_at)} UTC by ${row.opened_by}`,
    `Lead:      ${row.lead_id || "none"}`,
    `Closed:    ${row.closed_at ? `${iso(row.closed_at)} UTC by ${row.closed_by}` : "open"}`,
    `Verdict:   ${row.verdict || "-"}`,
    `Outcome:   ${row.outcome || "-"}`,
    "",
    "ALLEGATION",
    row.summary,
    "",
    "FINDINGS",
    row.findings || "-",
    "",
    "CASE LOG",
    "-".repeat(60),
    ...entries.map((e) => `[${iso(e.created_at)}] ${e.kind.toUpperCase()} by ${e.author_id}\n  ${e.body.replace(/\n/g, "\n  ")}${e.url ? `\n  ${e.url}` : ""}`),
  ].join("\n");
}

async function reopen(guild, row, actor, reason) {
  await demand(actor, "case.close");
  if (row.status !== "closed") throw new UserError(`${row.reference} is not closed.`);
  const t = await thread(guild, row);
  if (t) {
    await t.setArchived(false).catch(() => null);
    await t.setLocked(false).catch(() => null);
  }
  await touch(row.id, { status: "active", closed_at: null, closed_by: null, verdict: null, outcome: null });
  await entry(guild, row, { kind: "status", authorId: actor.id, body: `Reopened: ${reason}`, embed: card("🔓 Case reopened", { color: C.amber, description: `${mention(actor.id)}: ${reason}` }) });
  await refreshFile(guild, row.id);
  refreshPanels(guild, "board");
}

/* ------------------------------------------------------------------ reminders */

export async function remindStale(guild) {
  const { settings } = await config();
  const cutoff = Date.now() - settings.staleHours * 3600000;
  const rows = await db.query("SELECT * FROM iaa_cases WHERE status IN ('open','active') AND last_activity_at<? AND (reminded_at IS NULL OR reminded_at<?)", [cutoff, cutoff]);
  for (const row of rows) {
    const t = await thread(guild, row);
    if (t) {
      if (t.archived) await t.setArchived(false).catch(() => null);
      await t
        .send({
          content: `${row.lead_id ? mention(row.lead_id) : mention(row.opened_by)} ⏰ **${row.reference}** has had no activity for ${humanDuration(Date.now() - Number(row.last_activity_at))}. Add an update, put it on hold, or close it.`,
        })
        .catch(() => null);
    }
    await db.query("UPDATE iaa_cases SET reminded_at=? WHERE id=?", [Date.now(), row.id]);
  }
}

/* ------------------------------------------------------------------ board */

export async function boardEmbeds() {
  const open = await db.query("SELECT * FROM iaa_cases WHERE status<>'closed'");
  open.sort((a, b) => (PRIORITIES[a.priority]?.order ?? 9) - (PRIORITIES[b.priority]?.order ?? 9) || a.opened_at - b.opened_at);
  const month = Date.now() - 30 * 86400000;
  const stats = await db.one(
    "SELECT COUNT(*) closed,SUM(verdict IN ('substantiated','policy_violation')) guilty,AVG(closed_at-opened_at) avg_ms FROM iaa_cases WHERE status='closed' AND closed_at>=?",
    [month],
  );
  const byType = Object.fromEntries(Object.keys(TYPES).map((k) => [k, open.filter((c) => c.type === k).length]));
  const lines = open.map((c) => {
    const p = PRIORITIES[c.priority] || PRIORITIES.normal;
    const s = STATUSES[c.status] || STATUSES.open;
    const stale = Date.now() - Number(c.last_activity_at) > 72 * 3600000 ? " ⏰" : "";
    return `${p.icon} **\`${c.reference}\`** ${TYPES[c.type]?.icon} ${mention(c.subject_id)} · ${s.icon} ${c.status}${stale}\n　lead ${c.lead_id ? mention(c.lead_id) : "*unassigned*"} · opened ${rel(c.opened_at)}${c.thread_id ? ` · <#${c.thread_id}>` : ""}`;
  });
  const closed = Number(stats.closed || 0);
  return [
    card("🗄️ IAA Investigations Board", {
      color: open.some((c) => c.priority === "critical") ? C.red : C.navy,
      description: lines.slice(0, 25).join("\n") || "*No open investigations. The agency is quiet… for now.*",
      fields: [
        ["Open", String(open.length)],
        ["Unassigned", String(open.filter((c) => !c.lead_id).length)],
        ["In review", String(open.filter((c) => c.status === "review").length)],
        ["By type", Object.entries(byType).map(([k, n]) => `${TYPES[k].icon} ${TYPES[k].label}: ${n}`).join("\n"), false],
        ["Closed (30d)", String(closed)],
        ["Substantiated", closed ? `${Math.round((Number(stats.guilty || 0) / closed) * 100)}%` : "—"],
        ["Avg. time to close", stats.avg_ms ? humanDuration(Number(stats.avg_ms)) : "—"],
      ],
      footer: "Updates live · ⏰ = no activity for 72h",
    }),
  ];
}

/* ------------------------------------------------------------------ slash command */

const TYPE_FROM_OPTION = (v) => (TYPES[v] ? v : "other");

export async function command(i, actor, sub) {
  if (sub === "open") {
    const subject = i.options.getUser("user", true);
    const type = TYPE_FROM_OPTION(i.options.getString("type", true));
    const summary = i.options.getString("summary", true);
    await i.deferReply(EPHEMERAL);
    const attachment = i.options.getAttachment("evidence_file");
    const link = i.options.getString("evidence_link");
    const { row, thread: t, intel } = await openCase(i.guild, {
      subject,
      type,
      summary,
      priority: i.options.getString("priority") || "normal",
      actor,
      flag: i.options.getBoolean("flag") ?? true,
      notify: i.options.getBoolean("notify_subject") ?? false,
      evidence: attachment || link ? { description: "Submitted at intake", url: link, attachment } : null,
    });
    return respond(i, {
      embeds: [
        card(`📂 ${row.reference} opened`, {
          color: C.navy,
          description: `${TYPES[type].icon} **${TYPES[type].label}** investigation into ${subject}.\n${t ? `Case thread: <#${t.id}>` : "⚠️ Could not create a case thread. Check the bot's thread permissions in the case channel."}\n\nIntake threat: ${intel.dot} **${intel.level}** (${intel.score}/100)`,
        }),
      ],
    });
  }
  if (sub === "list") {
    await demand(actor, "case.open");
    const status = i.options.getString("status") || "open";
    const user = i.options.getUser("user");
    const where = [status === "open" ? "status<>'closed'" : status === "closed" ? "status='closed'" : "1=1"];
    const params = [];
    if (user) {
      where.push("(subject_id=? OR lead_id=?)");
      params.push(user.id, user.id);
    }
    const rows = await db.query(`SELECT * FROM iaa_cases WHERE ${where.join(" AND ")} ORDER BY id DESC LIMIT 25`, params);
    const lines = rows.map(
      (c) =>
        `${PRIORITIES[c.priority]?.icon || ""} \`${c.reference}\` ${TYPES[c.type]?.icon} ${mention(c.subject_id)} · ${c.status === "closed" ? `${VERDICTS[c.verdict]?.icon || ""} ${VERDICTS[c.verdict]?.label || ""}` : STATUSES[c.status]?.label} · ${ts(c.opened_at, "d")}`,
    );
    return respond(i, { embeds: [card(`🗂️ Cases · ${status}${user ? ` · ${user.username}` : ""}`, { description: lines.join("\n") || "No cases." })] });
  }

  const row = await findCase(i.options.getString("case", true));
  await demandCaseAccess(actor, row);
  if (sub === "view") {
    const entries = await db.query("SELECT * FROM iaa_case_entries WHERE case_id=? ORDER BY id DESC LIMIT 10", [row.id]);
    const log = entries.map((e) => `${ts(e.created_at, "d")} **${e.kind}** ${mention(e.author_id)} — ${clip(e.body, 120)}${e.url ? ` [link](${e.url})` : ""}`);
    await addToThread(i.guild, row, i.user.id);
    return respond(i, {
      embeds: [caseFileEmbed(row, await counts(row.id)), card("Recent case log", { color: C.grey, description: log.join("\n") || "Empty." })],
    });
  }
  if (sub === "assign") {
    const lead = i.options.getUser("agent", true);
    const leadMember = await i.guild.members.fetch(lead.id).catch(() => null);
    if (!leadMember) throw new UserError("That agent is not in the server.");
    if (lead.id === row.subject_id) throw new UserError("The subject cannot lead their own case.");
    if (!(await can(await authority(leadMember), "case.open"))) throw new UserError(`${lead} does not have investigation access.`);
    await setLead(i.guild, row, lead.id, i.user.id);
    return respond(i, `${lead} now leads **${row.reference}**.`);
  }
  if (sub === "add-agent") {
    const agent = i.options.getUser("agent", true);
    if (agent.id === row.subject_id) throw new UserError("The subject cannot be added to their own case.");
    await addToThread(i.guild, row, agent.id);
    await entry(i.guild, row, { kind: "system", authorId: i.user.id, body: `Added ${agent.id} to the case`, embed: card("👥 Agent added", { color: C.grey, description: `${agent} was read into **${row.reference}** by ${i.user}.` }) });
    return respond(i, `${agent} was added to the case thread.`);
  }
  if (sub === "evidence") {
    await i.deferReply(EPHEMERAL);
    await addEvidence(i.guild, row, i.user.id, i.options.getString("description", true), i.options.getString("link"), i.options.getAttachment("file"));
    return respond(i, `Evidence logged to **${row.reference}**.`);
  }
  if (sub === "note") {
    await addNote(i.guild, row, i.user.id, i.options.getString("text", true));
    return respond(i, `Note added to **${row.reference}**.`);
  }
  if (sub === "update") {
    const status = i.options.getString("status");
    const priority = i.options.getString("priority");
    if (!status && !priority) throw new UserError("Give a new status or priority.");
    if (status) await setStatus(i.guild, row, "status", status, i.user.id);
    if (priority) await setStatus(i.guild, await findCase(row.id), "priority", priority, i.user.id);
    return respond(i, `**${row.reference}** updated.`);
  }
  if (sub === "close") {
    const outcome = i.options.getString("outcome") || "none";
    const durationText = i.options.getString("suspension_length");
    const durationMs = durationText ? parseDuration(durationText) : null;
    if (durationText && !durationMs) throw new UserError("Use a duration like `7d` or `48h`.");
    await i.deferReply(EPHEMERAL);
    const { row: closed, applied } = await closeCase(i.guild, row, { verdict: i.options.getString("verdict", true), outcome, findings: i.options.getString("findings", true), durationMs, actor });
    return respond(i, `**${closed.reference}** closed as **${VERDICTS[closed.verdict].label}**. ${applied}`);
  }
  if (sub === "reopen") {
    await reopen(i.guild, row, actor, i.options.getString("reason", true));
    return respond(i, `**${row.reference}** reopened.`);
  }
}

/* ------------------------------------------------------------------ buttons, menus, modals */

const modal = (id, title, inputs) =>
  new ModalBuilder()
    .setCustomId(id)
    .setTitle(line(title, 45))
    .addComponents(...inputs.map((input) => new ActionRowBuilder().addComponents(input)));
const input = (id, label, { style = TextInputStyle.Short, required = true, max = 1000, placeholder } = {}) => {
  const b = new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setRequired(required).setMaxLength(max);
  if (placeholder) b.setPlaceholder(placeholder);
  return b;
};

export async function component(i, actor, action, args) {
  // New case from an intel alert or lookup: iaa:case:new:<userId>:<type>
  if (action === "new") {
    await demand(actor, "case.open");
    const [userId, type] = args;
    return i.showModal(
      modal(`iaa:case:newmodal:${userId}:${type}`, `Open ${TYPES[type]?.label || "case"} investigation`, [
        input("summary", "Allegation / summary", { style: TextInputStyle.Paragraph, max: 1500 }),
        input("priority", "Priority (low, normal, high, critical)", { required: false, max: 10, placeholder: "normal" }),
      ]),
    );
  }
  const row = await findCase(args[0]);
  if (action === "reopen")
    return i.showModal(modal(`iaa:case:reopenmodal:${row.id}`, `Reopen ${row.reference}`, [input("reason", "Why is this case being reopened?", { style: TextInputStyle.Paragraph, max: 500 })]));
  await demandCaseAccess(actor, row);
  if (row.status === "closed") throw new UserError(`${row.reference} is closed.`);
  if (action === "claim") {
    if (row.lead_id === i.user.id) throw new UserError("You already lead this case.");
    await i.deferReply(EPHEMERAL);
    await setLead(i.guild, row, i.user.id, i.user.id);
    return respond(i, `You now lead **${row.reference}**.`);
  }
  if (action === "evidence")
    return i.showModal(
      modal(`iaa:case:evidencemodal:${row.id}`, `Evidence · ${row.reference}`, [
        input("description", "What does this show?", { style: TextInputStyle.Paragraph, max: 1500 }),
        input("link", "Link (screenshot, message link, clip)", { required: false, max: 500, placeholder: "https://…" }),
      ]),
    );
  if (action === "note") return i.showModal(modal(`iaa:case:notemodal:${row.id}`, `Note · ${row.reference}`, [input("text", "Note", { style: TextInputStyle.Paragraph, max: 1800 })]));
  if (action === "intel") {
    await i.deferReply(EPHEMERAL);
    const user = await i.client.users.fetch(row.subject_id).catch(() => null);
    const intel = await gatherIntel(row.subject_id);
    await entry(i.guild, row, { kind: "intel", authorId: i.user.id, body: `Intel re-run: ${intel.level} ${intel.score}/100`, embed: dossierEmbed(intel, user, { title: "Updated intel" }) });
    await touch(row.id);
    return respond(i, `Fresh intel posted to the case thread (${intel.dot} ${intel.level}).`);
  }
  if (action === "status") {
    const [field, value] = i.values[0].split(":");
    await i.deferReply(EPHEMERAL);
    await setStatus(i.guild, row, field, value, i.user.id);
    return respond(i, `${field === "status" ? "Status" : "Priority"} set to **${value}**.`);
  }
  if (action === "close") {
    await demand(actor, "case.close");
    return respond(i, {
      embeds: [card(`🔒 Close ${row.reference}`, { color: C.red, description: "Step 1 of 3 · choose the verdict." })],
      components: [
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`iaa:case:verdict:${row.id}`)
            .setPlaceholder("Verdict…")
            .addOptions(Object.entries(VERDICTS).map(([k, v]) => ({ label: v.label, value: k, emoji: v.icon }))),
        ),
      ],
    });
  }
  if (action === "verdict") {
    const verdict = i.values[0];
    const options = VERDICTS[verdict].guilty ? Object.entries(OUTCOMES) : [["none", OUTCOMES.none]];
    return i.update({
      embeds: [card(`🔒 Close ${row.reference}`, { color: C.red, description: `Verdict: **${VERDICTS[verdict].label}**\nStep 2 of 3 · choose the outcome.` })],
      components: [
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`iaa:case:outcome:${row.id}:${verdict}`)
            .setPlaceholder("Outcome…")
            .addOptions(options.map(([k, o]) => ({ label: o.label, value: k }))),
        ),
      ],
    });
  }
  if (action === "outcome") {
    const [, verdict] = args;
    const outcome = i.values[0];
    const inputs = [input("findings", "Findings (goes in the sealed report)", { style: TextInputStyle.Paragraph, max: 1800 })];
    if (outcome === "suspension") inputs.push(input("length", "Suspension length (e.g. 7d, 48h)", { max: 10 }));
    return i.showModal(modal(`iaa:case:closemodal:${row.id}:${verdict}:${outcome}`, `Close ${row.reference} · step 3`, inputs));
  }
}

export async function modalSubmit(i, actor, action, args) {
  if (action === "newmodal") {
    const [userId, type] = args;
    const subject = await i.client.users.fetch(userId);
    const raw = (i.fields.getTextInputValue("priority") || "normal").toLowerCase().trim();
    await i.deferReply(EPHEMERAL);
    const { row, thread: t } = await openCase(i.guild, {
      subject,
      type: TYPE_FROM_OPTION(type),
      summary: i.fields.getTextInputValue("summary"),
      priority: PRIORITIES[raw] ? raw : "normal",
      actor,
    });
    // Disable the alert button so nobody opens a duplicate.
    if (i.message?.components?.length) await i.message.edit({ components: [] }).catch(() => null);
    return respond(i, `📂 **${row.reference}** opened${t ? ` · <#${t.id}>` : ""}.`);
  }
  const row = await findCase(args[0]);
  if (action === "reopenmodal") {
    await reopen(i.guild, row, actor, i.fields.getTextInputValue("reason"));
    return respond(i, `**${row.reference}** reopened.`);
  }
  await demandCaseAccess(actor, row);
  if (action === "evidencemodal") {
    await i.deferReply(EPHEMERAL);
    await addEvidence(i.guild, row, i.user.id, i.fields.getTextInputValue("description"), i.fields.getTextInputValue("link") || null);
    return respond(i, "Evidence logged.");
  }
  if (action === "notemodal") {
    await i.deferReply(EPHEMERAL);
    await addNote(i.guild, row, i.user.id, i.fields.getTextInputValue("text"));
    return respond(i, "Note added.");
  }
  if (action === "closemodal") {
    const [, verdict, outcome] = args;
    let durationMs = null;
    if (outcome === "suspension") {
      durationMs = parseDuration(i.fields.getTextInputValue("length"));
      if (!durationMs) throw new UserError("Use a duration like `7d` or `48h`.");
    }
    await i.deferReply(EPHEMERAL);
    const { row: closed, applied } = await closeCase(i.guild, row, { verdict, outcome, findings: i.fields.getTextInputValue("findings"), durationMs, actor });
    return respond(i, `**${closed.reference}** closed as **${VERDICTS[verdict].label}**. ${applied}`);
  }
}
