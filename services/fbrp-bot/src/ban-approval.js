import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from "discord.js";
import { COLORS } from "./ui.js";

/**
 * Approve / Deny buttons on ban and blacklist log entries. The punishment takes effect right away;
 * a higher-ranked staff member then approves it or denies it, and a denial reverts it. The embed
 * edits itself to show the outcome. State lives on moderation_cases, so buttons keep working
 * across restarts.
 */

export const REVIEW_PREFIX = "banreview:";
const REVIEW_FIELD = "Review";

const unix = (ms) => Math.floor(Number(ms) / 1000);

export const reviewId = (action, caseId) => `${REVIEW_PREFIX}${action}:${caseId}`;

export function reviewRow(caseId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(reviewId("approve", caseId)).setStyle(ButtonStyle.Success).setLabel("Approve").setEmoji("✅"),
    new ButtonBuilder().setCustomId(reviewId("deny", caseId)).setStyle(ButtonStyle.Danger).setLabel("Deny").setEmoji("❌"),
  );
}

export const pendingReviewField = () => [REVIEW_FIELD, "⏳ Awaiting approval from a higher rank. Denying reverts this punishment.", false];

/** The Review line for a finished decision. */
export function decisionText(status, byId, at, { auto = false } = {}) {
  const when = `<t:${unix(at)}:R>`;
  if (status === "approved") return `✅ ${auto ? "Auto-approved" : "Approved"} by <@${byId}> ${when}`;
  return `❌ Denied by <@${byId}> ${when} · punishment reverted`;
}

/** Copy of a log embed with its Review field set to the decision (or appended when missing). */
export function reviewedEmbed(source, status, byId, at, opts = {}) {
  const embed = EmbedBuilder.from(source);
  const fields = (embed.data.fields || []).filter((field) => field.name !== REVIEW_FIELD);
  if (status === "denied") {
    const state = fields.find((field) => field.name === "Status");
    if (state) state.value = "Reverted (denied)";
    embed.setColor(COLORS.muted);
  }
  fields.push({ name: REVIEW_FIELD, value: decisionText(status, byId, at, opts), inline: false });
  embed.setFields(fields);
  return embed;
}

/**
 * `rankOf(id)` returns a staff level (-1 for none, Infinity for bot owners). `revert(row, actorId, reason)`
 * undoes the punishment and returns result lines, or throws and leaves everything unchanged.
 */
export function createBanApproval({ db, audit, rankOf, revert, clean = (value) => String(value ?? "") }) {
  /** Sets the case to pending and remembers the log message the buttons live on. */
  async function track(caseId, message) {
    await db.query(
      "UPDATE moderation_cases SET approval_status='pending',log_channel_id=?,log_message_id=? WHERE id=?",
      [message?.channelId ? String(message.channelId) : null, message?.id ? String(message.id) : null, Number(caseId)],
    );
  }

  /**
   * Prepares a log entry for review. Bot owners outrank every approver, so their punishments are
   * recorded approved; everyone else's get the buttons and the entry is tracked once posted.
   */
  async function prepare(caseId, actorId, entry) {
    const level = await rankOf(actorId);
    if (level === Number.POSITIVE_INFINITY) {
      await db.query(
        "UPDATE moderation_cases SET approval_status='approved',approval_by=?,approval_at=? WHERE id=?",
        [String(actorId), Date.now(), Number(caseId)],
      );
      return { entry: { ...entry, fields: [...(entry.fields || []), [REVIEW_FIELD, decisionText("approved", actorId, Date.now(), { auto: true }), false]] }, after: async () => {} };
    }
    return {
      entry: { ...entry, fields: [...(entry.fields || []), pendingReviewField()], components: [reviewRow(caseId)] },
      after: (message) => track(caseId, message),
    };
  }

  /** The reviewer must outrank whoever issued the punishment. */
  async function mayReview(reviewerId, row) {
    const [reviewer, issuer] = await Promise.all([rankOf(reviewerId), rankOf(row.actor_id)]);
    if (reviewer < 0) return { ok: false, why: "Only staff can approve or deny punishments." };
    if (String(reviewerId) === String(row.actor_id)) return { ok: false, why: "You cannot review a punishment you issued." };
    if (reviewer <= issuer) return { ok: false, why: "Only someone of a higher rank than the staff member who issued this can approve or deny it." };
    return { ok: true };
  }

  async function component(i) {
    const [, action, rawId] = String(i.customId).split(":");
    const reply = (content) => i.reply({ content, ephemeral: true }).catch(() => {});
    if (!["approve", "deny"].includes(action)) return reply("Unknown action.");
    const row = await db.one("SELECT * FROM moderation_cases WHERE id=?", [Number(rawId)]);
    if (!row) return reply("That punishment no longer exists.");
    if (row.approval_status !== "pending") {
      if (row.approval_status === "approved" || row.approval_status === "denied")
        await i.message.edit({ embeds: [reviewedEmbed(i.message.embeds[0], row.approval_status, row.approval_by, row.approval_at)], components: [] }).catch(() => {});
      const done = row.approval_status === "approved" || row.approval_status === "denied";
      return reply(done ? `Already ${row.approval_status}${row.approval_by ? ` by <@${row.approval_by}>` : ""}.` : "Someone is reviewing this right now.");
    }
    const check = await mayReview(i.user.id, row);
    if (!check.ok) return reply(check.why);

    const banId = row.ban_id || `#${row.id}`;
    // Claim the case so two reviewers cannot act on it at once.
    const claimed = await db.query(
      "UPDATE moderation_cases SET approval_status=? WHERE id=? AND approval_status='pending'",
      [action === "approve" ? "approving" : "denying", row.id],
    );
    if (!Number(claimed?.affectedRows)) return reply("Someone else just reviewed this.");

    await i.deferUpdate().catch(() => {});
    const status = action === "approve" ? "approved" : "denied";
    let results = [];
    try {
      if (status === "denied") results = await revert(row, i.user.id, clean(`${banId} denied by ${i.user.tag || i.user.id}`, 300));
    } catch (error) {
      await db.query("UPDATE moderation_cases SET approval_status='pending' WHERE id=?", [row.id]);
      await i.followUp({ content: `Could not deny ${banId}; nothing was changed. ${clean(error?.message || error, 300)}`, ephemeral: true }).catch(() => {});
      return;
    }
    const at = Date.now();
    await db.query(
      `UPDATE moderation_cases SET approval_status=?,approval_by=?,approval_at=?${status === "denied" ? ",active=FALSE" : ""} WHERE id=?`,
      [status, i.user.id, at, row.id],
    );
    await audit(i.user.id, `moderation.ban_${status}`, row.target_id, { caseId: row.id, banId, issuer: row.actor_id, action: row.action, results });
    await i.message.edit({ embeds: [reviewedEmbed(i.message.embeds[0], status, i.user.id, at)], components: [] }).catch(() => {});
    if (results.length)
      await i.followUp({ content: `**${banId} reverted**\n${results.join("\n").slice(0, 1800)}`, ephemeral: true }).catch(() => {});
  }

  return { prepare, component, mayReview };
}
