import { superuserIds } from "./database.js";
import { COLORS, who } from "./ui.js";
import { publicBase } from "./site-url.js";

/**
 * Ban appeals on the member portal.
 *
 * Members answer a structured form (with evidence links) once a punishment is at least
 * APPEAL_RULES.waitHours old. Staff claim appeals, request more information (answered on the
 * portal), leave internal notes and votes, and decide: approve (lift), reduce (shorten a timed
 * network ban) or deny. Every step is on a timeline the member can follow, and the person who
 * issued the punishment can never decide its appeal.
 */

export const APPEAL_RULES = { waitHours: 24, maxPerCase: 3, deniedCooldownDays: 14, maxEvidence: 5, maxReduceDays: 365 };

export const APPEAL_QUESTIONS = [
  { id: "account", label: "In your own words, what happened?", help: "Describe the events that led to the punishment, in order. Include times, people and locations where you can.", min: 150, max: 2500 },
  { id: "rules", label: "Which rule were you punished under, and how do you understand it now?", help: "Quote or summarise the rule, then explain it in your own words.", min: 80, max: 1200 },
  { id: "responsibility", type: "choice", label: "Do you accept responsibility for what happened?", options: [["full", "Yes - fully"], ["partial", "Partly - some of it was on me"], ["none", "No - I believe the punishment was a mistake"]] },
  { id: "reason", label: "Why should this punishment be reconsidered?", help: "Be specific. If you think staff made a mistake, explain exactly what it was.", min: 150, max: 2500 },
  { id: "learned", label: "What have you learned, and what will you do differently?", help: "What would stop this from happening again?", min: 100, max: 1500 },
  { id: "additional", label: "Anything else staff should know?", min: 0, max: 1000, optional: true },
];

const OPEN = ["submitted", "under_review", "info_requested"];
const DECIDED = ["approved", "reduced", "denied"];
const VOTES = ["approve", "reduce", "deny"];
const text = (value, max) => String(value ?? "").replace(/\r\n?/g, "\n").replace(/[\u0000-\u0009\u000b-\u001f]/g, " ").trim().slice(0, max);
const parse = (value, fallback) => {
  if (value && typeof value === "object") return value;
  try { return JSON.parse(String(value ?? "")); } catch { return fallback; }
};
const publicId = (c) => c.ban_id || `FB-${String(c.id).padStart(8, "0")}`;
const stamp = (ms) => `<t:${Math.floor(Number(ms) / 1000)}:R>`;
const isActive = (c) => Boolean(Number(c.active)) && (!c.expires_at || Number(c.expires_at) > Date.now());

export function createAppeals({ client, db, audit, log, hasPermission, liftAppealedCase, openTicket, ticketAction }) {
  const event = (appealId, actorId, kind, visibility, body = null, data = null) =>
    db.query(
      "INSERT INTO moderation_appeal_events(appeal_id,actor_id,kind,visibility,body,data,created_at) VALUES(?,?,?,?,?,?,?)",
      [appealId, String(actorId), kind, visibility, body, data ? JSON.stringify(data) : null, Date.now()],
    );

  const postLog = (entry) =>
    log(null, { ...entry, server: false, footer: "Florida Bay Roleplay · Appeals" }, "moderation").catch((error) => console.error("[FBRP appeals] log:", error.message || error));

  const dmMember = async (discordId, content) => {
    const user = await client.users.fetch(String(discordId)).catch(() => null);
    return user ? user.send({ content }).then(() => true, () => false) : false;
  };

  /** Whether a punishment can be appealed right now, and if not, why and from when. */
  async function eligibility(c, authorId) {
    if (!["ban", "blacklist"].includes(c.action)) return { can: false, reason: "Only bans and blacklists can be appealed." };
    if (!isActive(c)) return { can: false, reason: "This punishment is no longer active." };
    const opensAt = Number(c.created_at) + APPEAL_RULES.waitHours * 3600000;
    if (opensAt > Date.now()) return { can: false, reason: `Appeals open ${APPEAL_RULES.waitHours} hours after a punishment is issued.`, opensAt };
    const history = await db.query("SELECT status,updated_at,decided_at FROM moderation_appeals WHERE case_id=? AND author_id=? ORDER BY id DESC", [c.id, String(authorId)]);
    if (history.some((row) => OPEN.includes(row.status))) return { can: false, reason: "An appeal for this punishment is already open." };
    const counted = history.filter((row) => row.status !== "withdrawn").length;
    if (counted >= APPEAL_RULES.maxPerCase) return { can: false, reason: `This punishment has reached the limit of ${APPEAL_RULES.maxPerCase} appeals.` };
    const lastDenied = history.find((row) => row.status === "denied");
    if (lastDenied) {
      const until = Number(lastDenied.decided_at || lastDenied.updated_at) + APPEAL_RULES.deniedCooldownDays * 86400000;
      if (until > Date.now()) return { can: false, reason: `You can appeal again ${APPEAL_RULES.deniedCooldownDays} days after a denial.`, opensAt: until };
    }
    return { can: true, remaining: APPEAL_RULES.maxPerCase - counted };
  }

  async function memberData(discordId, punishments) {
    const appeals = await db.query(
      `SELECT a.id,a.case_id,a.ticket_id,a.status,a.statement,a.answers,a.evidence,a.response,a.reduced_until,a.created_at,a.updated_at,a.decided_at,
              c.ban_id,c.action,c.reason case_reason
         FROM moderation_appeals a JOIN moderation_cases c ON c.id=a.case_id WHERE a.author_id=? ORDER BY a.id DESC`,
      [String(discordId)],
    );
    const events = appeals.length
      ? await db.query(`SELECT id,appeal_id,actor_id,kind,body,data,created_at FROM moderation_appeal_events WHERE visibility='member' AND appeal_id IN (${appeals.map(() => "?").join(",")}) ORDER BY id`, appeals.map((row) => row.id))
      : [];
    const rules = {};
    for (const c of punishments || []) {
      if (["ban", "blacklist"].includes(c.action)) rules[publicId(c)] = await eligibility(c, discordId);
    }
    return {
      appeals: appeals.map((row) => ({
        ...row,
        answers: parse(row.answers, null),
        evidence: parse(row.evidence, []),
        events: events.filter((e) => Number(e.appeal_id) === Number(row.id)).map((e) => ({ ...e, data: parse(e.data, null), actor_id: e.kind === "member_reply" || e.kind === "submitted" || e.kind === "withdrawn" ? e.actor_id : null })),
      })),
      rules,
      questions: APPEAL_QUESTIONS,
      limits: APPEAL_RULES,
    };
  }

  async function submit(session, input) {
    const banId = text(input.banId, 24).toUpperCase();
    const c = await db.one("SELECT * FROM moderation_cases WHERE ban_id=? AND target_id=? AND action IN ('ban','blacklist') LIMIT 1", [banId, session.id]);
    if (!c) throw new Error("That case ID is not attached to your verified Discord account.");
    const state = await eligibility(c, session.id);
    if (!state.can) throw new Error(state.reason);
    const given = input.answers && typeof input.answers === "object" ? input.answers : {};
    const answers = {};
    for (const q of APPEAL_QUESTIONS) {
      if (q.type === "choice") {
        const value = String(given[q.id] || "");
        if (!q.options.some(([key]) => key === value)) throw new Error(`Answer: "${q.label}"`);
        answers[q.id] = value;
      } else {
        const value = text(given[q.id], q.max);
        if (!q.optional && value.length < q.min) throw new Error(`Write at least ${q.min} characters for "${q.label}" (you have ${value.length}).`);
        answers[q.id] = value;
      }
    }
    const evidence = [...new Set((Array.isArray(input.evidence) ? input.evidence : []).map((link) => text(link, 400)).filter(Boolean))];
    if (evidence.length > APPEAL_RULES.maxEvidence) throw new Error(`Add at most ${APPEAL_RULES.maxEvidence} evidence links.`);
    for (const link of evidence) {
      let url;
      try { url = new URL(link); } catch { throw new Error(`"${link.slice(0, 60)}" is not a valid link.`); }
      if (!["http:", "https:"].includes(url.protocol)) throw new Error("Evidence links must start with http:// or https://");
    }
    if (input.acknowledge !== true) throw new Error("Confirm that your appeal is truthful and that you have read the rules.");
    const responsibility = APPEAL_QUESTIONS.find((q) => q.id === "responsibility").options.find(([key]) => key === answers.responsibility)[1];
    const statement = [
      `What happened:\n${answers.account}`,
      `Rule and understanding:\n${answers.rules}`,
      `Accepts responsibility: ${responsibility}`,
      `Why reconsider:\n${answers.reason}`,
      `What I learned:\n${answers.learned}`,
      answers.additional ? `Additional:\n${answers.additional}` : "",
      evidence.length ? `Evidence:\n${evidence.join("\n")}` : "",
    ].filter(Boolean).join("\n\n");
    const summary = text(`${answers.reason}\n\nResponsibility: ${responsibility}${evidence.length ? `\nEvidence: ${evidence.join(" ")}` : ""}\n\nFull appeal: ${publicBase()}/portal#appeals`, 1000);
    // Ban appeals are handled through the dedicated portal workflow. Their
    // private staff ticket is routed through management rather than exposing a
    // second Ban Appeal option in the public ticket panel.
    const ticket = await openTicket(session, {
      type: "management",
      form: {
        subject: `Ban appeal ${banId}`,
        description: summary,
        area: "Moderation appeal",
        outcome: "Review the linked appeal in the staff portal.",
      },
    });
    const now = Date.now();
    const inserted = await db.query(
      "INSERT INTO moderation_appeals(case_id,author_id,ticket_id,status,statement,answers,evidence,created_at,updated_at) VALUES(?,?,?,'submitted',?,?,?,?,?)",
      [c.id, session.id, ticket.id, statement, JSON.stringify(answers), JSON.stringify(evidence), now, now],
    );
    await event(inserted.insertId, session.id, "submitted", "member", null, { evidence: evidence.length });
    await audit(session.id, "appeal.submit", c.id, { appealId: inserted.insertId, banId, ticketId: ticket.id });
    await postLog({
      title: `Appeal submitted · ${banId}`,
      color: COLORS.warning,
      description: `Review it on the staff portal: ${publicBase()}/portal#appeals`,
      fields: [
        ["Member", who(session.id)],
        ["Punishment", `${c.action} · ${text(c.reason, 200)}`],
        ["Accepts responsibility", responsibility],
        ["Evidence links", String(evidence.length)],
        ["Why reconsider", text(answers.reason, 900), false],
      ],
    });
    return { id: inserted.insertId, ticket };
  }

  async function ownAppeal(session, appealId) {
    const appeal = await db.one("SELECT a.*,c.ban_id FROM moderation_appeals a JOIN moderation_cases c ON c.id=a.case_id WHERE a.id=? AND a.author_id=?", [Number(appealId), session.id]);
    if (!appeal) throw new Error("Appeal not found.");
    return appeal;
  }

  async function reply(session, input) {
    const appeal = await ownAppeal(session, input.appealId);
    if (appeal.status !== "info_requested") throw new Error("Staff have not asked you for anything on this appeal.");
    const body = text(input.body, 3000);
    if (body.length < 20) throw new Error("Write at least 20 characters.");
    await db.query("UPDATE moderation_appeals SET status='under_review',updated_at=? WHERE id=?", [Date.now(), appeal.id]);
    await event(appeal.id, session.id, "member_reply", "member", body);
    await audit(session.id, "appeal.reply", appeal.case_id, { appealId: appeal.id });
    await postLog({ title: `Appeal reply · ${appeal.ban_id}`, color: COLORS.primary, fields: [["Member", who(session.id)], ...(appeal.assigned_to ? [["Assigned to", who(appeal.assigned_to)]] : []), ["Reply", text(body, 1000), false]] });
    return { ok: true };
  }

  async function withdraw(session, input) {
    const appeal = await ownAppeal(session, input.appealId);
    if (!OPEN.includes(appeal.status)) throw new Error("That appeal is already closed.");
    await db.query("UPDATE moderation_appeals SET status='withdrawn',updated_at=?,decided_at=? WHERE id=?", [Date.now(), Date.now(), appeal.id]);
    await event(appeal.id, session.id, "withdrawn", "member");
    await audit(session.id, "appeal.withdraw", appeal.case_id, { appealId: appeal.id });
    if (appeal.ticket_id) await ticketAction(appeal.ticket_id, session.id, "close", { reason: "Appeal withdrawn by the member." }).catch(() => {});
    return { ok: true };
  }

  async function staffQueue() {
    const rows = await db.query(
      `SELECT a.*,c.ban_id,c.action,c.reason case_reason,c.target_id,c.actor_id case_actor,c.guild_id case_guild,c.created_at case_created,c.expires_at case_expires,c.active case_active
         FROM moderation_appeals a JOIN moderation_cases c ON c.id=a.case_id
        WHERE a.status IN ('submitted','under_review','info_requested') OR a.decided_at>?
        ORDER BY FIELD(a.status,'submitted','under_review','info_requested','approved','reduced','denied','withdrawn'),a.created_at LIMIT 150`,
      [Date.now() - 14 * 86400000],
    );
    if (!rows.length) return [];
    const ids = rows.map((row) => row.id);
    const targets = [...new Set(rows.map((row) => String(row.author_id)))];
    const [events, history] = await Promise.all([
      db.query(`SELECT id,appeal_id,actor_id,kind,visibility,body,data,created_at FROM moderation_appeal_events WHERE appeal_id IN (${ids.map(() => "?").join(",")}) ORDER BY id`, ids),
      db.query(`SELECT target_id,COUNT(*) cases,SUM(action IN ('ban','blacklist')) bans FROM moderation_cases WHERE target_id IN (${targets.map(() => "?").join(",")}) GROUP BY target_id`, targets),
    ]);
    return Promise.all(rows.map(async (row) => {
      const own = events.filter((e) => Number(e.appeal_id) === Number(row.id)).map((e) => ({ ...e, data: parse(e.data, null) }));
      const latestVote = new Map();
      for (const e of own) if (e.kind === "vote") latestVote.set(String(e.actor_id), e.data?.vote);
      const tally = { approve: 0, reduce: 0, deny: 0 };
      for (const vote of latestVote.values()) if (tally[vote] !== undefined) tally[vote] += 1;
      const prior = await db.one("SELECT COUNT(*) n FROM moderation_appeals WHERE case_id=? AND author_id=? AND id<>?", [row.case_id, row.author_id, row.id]);
      const record = history.find((h) => String(h.target_id) === String(row.author_id));
      return {
        ...row,
        answers: parse(row.answers, null),
        evidence: parse(row.evidence, []),
        events: own,
        votes: tally,
        voters: Object.fromEntries(latestVote),
        canReduce: row.case_guild === "global" && row.action === "ban",
        priorAppeals: Number(prior?.n || 0),
        record: { cases: Number(record?.cases || 0), bans: Number(record?.bans || 0) },
      };
    }));
  }

  async function staffAppeal(appealId) {
    const appeal = await db.one(
      `SELECT a.*,c.ban_id,c.action,c.target_id,c.actor_id case_actor,c.guild_id case_guild,c.expires_at case_expires
         FROM moderation_appeals a JOIN moderation_cases c ON c.id=a.case_id WHERE a.id=?`,
      [Number(appealId)],
    );
    if (!appeal) throw new Error("Appeal not found.");
    return appeal;
  }

  /** Staff actions: claim, note, vote, info, decide. */
  async function staffAction(session, input) {
    const appeal = await staffAppeal(input.appealId);
    const action = String(input.action || "");
    const open = OPEN.includes(appeal.status);
    if (!open) throw new Error("That appeal is already closed.");
    if (String(appeal.author_id) === session.id) throw new Error("You cannot act on your own appeal.");
    const now = Date.now();

    if (action === "claim") {
      await db.query("UPDATE moderation_appeals SET assigned_to=?,status=IF(status='submitted','under_review',status),updated_at=? WHERE id=?", [session.id, now, appeal.id]);
      await event(appeal.id, session.id, "claimed", "staff");
      if (appeal.status === "submitted") await event(appeal.id, session.id, "status", "member", null, { status: "under_review" });
      return { ok: true };
    }
    if (action === "note") {
      const body = text(input.body, 2000);
      if (body.length < 3) throw new Error("Write a note.");
      await event(appeal.id, session.id, "staff_note", "staff", body);
      return { ok: true };
    }
    if (action === "vote") {
      const vote = String(input.vote || "");
      if (!VOTES.includes(vote)) throw new Error("Choose approve, reduce or deny.");
      await event(appeal.id, session.id, "vote", "staff", text(input.body, 1000) || null, { vote });
      return { ok: true };
    }
    if (action === "info") {
      const message = text(input.message, 2000);
      if (message.length < 15) throw new Error("Tell the member what you need (at least 15 characters).");
      await db.query("UPDATE moderation_appeals SET status='info_requested',assigned_to=COALESCE(assigned_to,?),updated_at=? WHERE id=?", [session.id, now, appeal.id]);
      await event(appeal.id, session.id, "info_request", "member", message);
      const dmSent = await dmMember(appeal.author_id, `**Staff need more information about your appeal for \`${appeal.ban_id}\`.**\n> ${message.slice(0, 1500).replace(/\n/g, "\n> ")}\nReply on the member portal: ${publicBase()}/portal#punishments`);
      await postLog({ title: `More information requested · ${appeal.ban_id}`, color: COLORS.primary, fields: [["Member", who(appeal.author_id)], ["Requested by", who(session.id)], ["DM delivered", dmSent ? "Yes" : "No"], ["Request", message, false]] });
      return { ok: true, dmSent };
    }
    if (action !== "decide") throw new Error("Unknown appeal action.");

    const decision = String(input.decision || "");
    if (!DECIDED.includes(decision)) throw new Error("Choose approve, reduce or deny.");
    if (String(appeal.case_actor) === session.id && !superuserIds().has(session.id))
      throw new Error("You issued this punishment, so another staff member has to decide the appeal. You can still leave notes and a vote.");
    const response = text(input.response, 4000);
    if (decision !== "approved" && response.length < 20) throw new Error("Explain the decision to the member (at least 20 characters).");
    let lifted = null;
    let reducedUntil = null;
    if (decision === "approved") {
      lifted = await liftAppealedCase(appeal.case_id, session.id, response);
    } else if (decision === "reduced") {
      if (!(appeal.case_guild === "global" && appeal.action === "ban")) throw new Error("Only timed or permanent network bans can be reduced. Approve or deny this one instead.");
      if (!superuserIds().has(session.id) && !(await hasPermission(session.id, "fbrp.global.unban"))) throw new Error("Reducing a network ban needs the `fbrp.global.unban` permission.");
      const days = Math.round(Number(input.days));
      if (!Number.isFinite(days) || days < 1 || days > APPEAL_RULES.maxReduceDays) throw new Error(`Choose a new length between 1 and ${APPEAL_RULES.maxReduceDays} days from now.`);
      reducedUntil = now + days * 86400000;
      if (appeal.case_expires && Number(appeal.case_expires) <= reducedUntil) throw new Error("That is not shorter than the current ban. Pick fewer days.");
      await db.query("UPDATE moderation_cases SET expires_at=?,duration_ms=? WHERE id=?", [reducedUntil, reducedUntil - now, appeal.case_id]);
    }
    await db.query(
      "UPDATE moderation_appeals SET status=?,response=?,reviewed_by=?,reduced_until=?,updated_at=?,decided_at=? WHERE id=?",
      [decision, response || null, session.id, reducedUntil, now, now, appeal.id],
    );
    await event(appeal.id, session.id, "decision", "member", response || null, { decision, reducedUntil });
    await audit(session.id, "appeal.review", appeal.id, { status: decision, reducedUntil, lifted: lifted?.results });
    if (decision === "reduced")
      await dmMember(appeal.author_id, `Your appeal for \`${appeal.ban_id}\` was **partly approved**: the ban now ends ${stamp(reducedUntil)}.\n> ${response.slice(0, 1500).replace(/\n/g, "\n> ")}`);
    if (decision === "denied")
      await dmMember(appeal.author_id, `Your appeal for \`${appeal.ban_id}\` was **denied**.\n> ${response.slice(0, 1500).replace(/\n/g, "\n> ")}\nYou can appeal again in ${APPEAL_RULES.deniedCooldownDays} days if you have appeals left.`);
    if (appeal.ticket_id) {
      const verdict = `Appeal ${decision}${response ? `: ${response}` : "."}`.slice(0, 900);
      const ticket = await db.one("SELECT status FROM support_tickets WHERE id=?", [appeal.ticket_id]);
      if (ticket && ticket.status !== "closed") await ticketAction(appeal.ticket_id, session.id, "close", { reason: verdict }).catch((error) => console.error("[FBRP appeals] ticket close:", error.message));
    }
    const tone = { approved: COLORS.success, reduced: COLORS.warning, denied: COLORS.danger }[decision];
    await postLog({
      title: `Appeal ${decision} · ${appeal.ban_id}`,
      color: tone,
      fields: [
        ["Member", who(appeal.author_id)],
        ["Decided by", who(session.id)],
        ...(reducedUntil ? [["Ban now ends", stamp(reducedUntil)]] : []),
        ...(response ? [["Response", response.slice(0, 1000), false]] : []),
        ...(lifted?.results?.length ? [["Result", lifted.results.join("\n").slice(0, 1000), false]] : []),
      ],
    });
    return { ok: true, decision, lifted, reducedUntil };
  }

  return { submit, reply, withdraw, memberData, staffQueue, staffAction, eligibility };
}
