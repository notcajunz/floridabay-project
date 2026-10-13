import { superuserIds, staffLevel } from "./database.js";
import { COLORS, who } from "./ui.js";
import { publicBase } from "./site-url.js";

/**
 * Promotion exams sat on the member portal.
 *
 *   Head Administrator exam  - only members whose highest staff group is Trial Head Administrator
 *   Management exam          - only members whose highest staff group is Head Administrator
 *
 * Applications land in a review queue that only Assistant Community Director and above can open. Passing
 * gives the exam's "passed" role in the staff Discord and every submission/decision is logged
 * there; the review itself always happens on the website.
 */

const choice = (id, prompt, options, answer) => ({ id, type: "choice", prompt, options, answer });
const written = (id, prompt, min = 120, max = 3000) => ({ id, type: "text", prompt, min, max });

export const DEFAULT_EXAMS = [
  {
    exam_key: "head_admin",
    title: "Head Administrator Examination",
    target_rank: "Head Administrator",
    eligible_group: "trial_head_administrator",
    description:
      "For Trial Head Administrators who are ready to lead the administration team. Scenario questions are marked automatically and every option is plausible - pick the best one. Written answers are read by Assistant Community Director and above.",
    pass_role_name: "Head Admin Exam · Passed",
    pass_mark: 75,
    cooldown_days: 14,
    questions: [
      choice("q1", "A Senior Administrator permanently banned a player for a first-offence FailRP. The player's appeal includes clips showing the administrator also broke rules during the same scene. What is the best course of action?", [
        "Uphold the ban - staff decisions must look consistent to the community",
        "Reduce the ban yourself straight away, then raise the administrator's conduct in staff chat",
        "Review the evidence independently, correct the punishment to policy, and deal with the administrator's conduct separately and privately",
        "Forward the appeal to management unread - it involves a staff member, so it is not yours to handle",
      ], 2),
      choice("q2", "During a live scene two administrators give a player contradicting instructions. You are the most senior staff member present. What do you do first?", [
        "Back whichever administrator reached the scene first",
        "Take ownership of the scene, give the player one clear ruling, and debrief both administrators privately afterwards",
        "Step away so you do not undermine either administrator in front of the player",
        "Let the player choose which instruction to follow and sort it out later",
      ], 1),
      choice("q3", "A player is clearly mass-RDMing during an active priority and you are the only staff member online. The evidence is unambiguous. What is the correct order?", [
        "Spectate for several more minutes to build a stronger case before acting",
        "Stop the harm first (kick/ban per policy), then attach the evidence to the case and update the affected players",
        "Announce the RDM in OOC chat so players know staff are aware, then ban",
        "Wait for a second staff member to confirm before taking any action",
      ], 1),
      choice("q4", "An Administrator under you has a pattern of short, undocumented bans. None of them have been appealed. What is the right response?", [
        "Nothing - no appeals means the bans were accepted",
        "Remove their ban permissions immediately until further notice",
        "Audit a sample of their cases, coach them on documentation standards, and record the conversation on their profile",
        "Post a general reminder about documentation in the public staff channel and leave it there",
      ], 2),
      choice("q5", "A content creator with a large audience is caught using a vehicle duplication exploit. What is the correct approach?", [
        "The same evidence standard and the same punishment scale as any other player",
        "A private warning to avoid bad publicity for the server",
        "A permanent ban to make an example of them",
        "Ask management whether they want to make an exception before doing anything",
      ], 0),
      choice("q6", "You find out a staff member has been sending screenshots of the staff Discord to a friend outside the team. What do you do?", [
        "Confront them in the staff channel so everyone sees the consequence",
        "Secure the evidence, restrict their access if needed, and escalate to management before any disciplinary action",
        "Demote them yourself on the spot",
        "Take no action unless something genuinely sensitive was leaked",
      ], 1),
      choice("q7", "Which of these is the strongest evidence to support a ban?", [
        "Three separate players reporting the same person in tickets",
        "A clip of the incident including the context before and after it",
        "The player's previous punishment history",
        "A staff member's recollection of what they saw",
      ], 1),
      choice("q8", "A Trial Moderator asks you whether they should ban one of your close friends for a rule break they witnessed. How do you respond?", [
        "Tell them to drop it - you will have a word with your friend",
        "Take the case over yourself to make sure it is handled fairly",
        "Declare your conflict of interest and have another senior staff member supervise the case",
        "Approve the ban without looking at it so you cannot be accused of bias",
      ], 2),
      written("w1", "A Trial Moderator has made three poor punishment decisions this week. Write out exactly how you would run the conversation with them and what follow-up you would put in place.", 200),
      written("w2", "Two staff members start arguing in a support ticket in front of the player. Walk through what you do in the next ten minutes, and what you do afterwards.", 200),
      written("w3", "Describe the hardest moderation decision you have made as a Trial Head Administrator: the situation, what you decided, and what you would do differently now.", 200),
      written("w4", "Name three changes you would make to the administration team in your first month as Head Administrator, and how you would measure whether each one worked.", 250),
    ],
  },
  {
    exam_key: "management",
    title: "Management Examination",
    target_rank: "Management",
    eligible_group: "head_administrator",
    description:
      "For Head Administrators applying to join management. Covers policy, staff leadership, escalation, crisis handling and community communication. Every option is plausible - pick the best one. Reviewed by Assistant Community Director and above.",
    pass_role_name: "Management Exam · Passed",
    pass_mark: 80,
    cooldown_days: 21,
    questions: [
      choice("q1", "A department asks for a rule exception for a large event that would temporarily allow behaviour that is normally bannable. What should management do?", [
        "Approve it - events drive activity and the department knows its event best",
        "Refuse - rules must never bend, whatever the context",
        "Assess the risk, agree a written scope and time limit with the department, brief staff, and review after the event",
        "Let the department head decide alone, since it is their event",
      ], 2),
      choice("q2", "Internal staff channels have been leaked to a rival community. What is the first priority?", [
        "Identify the leaker and remove them publicly",
        "Contain it: revoke compromised access, preserve evidence and inform ownership - then investigate",
        "Rebuild the staff Discord from scratch",
        "Post a community announcement before rumours spread",
      ], 1),
      choice("q3", "A Head Administrator and a Community Manager disagree about the punishment for a well-known player. What is the correct path?", [
        "The higher-ranked staff member decides",
        "Escalate to management or ownership with both sides' evidence and decide on policy, not on who the player is",
        "Reverse the punishment to avoid community drama",
        "Put it to a vote of the whole staff team",
      ], 1),
      choice("q4", "Which promotion decision reflects best practice?", [
        "Promote the most active member on the hours leaderboard",
        "Promote on documented performance, conduct, peer feedback and readiness for the next role's responsibilities",
        "Promote whoever has been on staff the longest",
        "Promote whoever applies first when a slot opens",
      ], 1),
      choice("q5", "Staff activity has dropped 40% over a month. What do you do first?", [
        "Remove every inactive staff member to reset the team",
        "Look at the data and talk to staff to find the cause before changing anything",
        "Raise the weekly hour requirement",
        "Recruit a large batch of new trial staff",
      ], 1),
      choice("q6", "A senior staff member who is popular with the team repeatedly breaks the staff conduct rules. What is the right approach?", [
        "Overlook it - removing them would hurt morale more than the rule breaks do",
        "Apply the same documented discipline process you would use for anyone, with clear expectations and consequences",
        "Quietly demote them without explanation to avoid a fuss",
        "Let the team vote on whether they stay",
      ], 1),
      choice("q7", "What must a management announcement about a controversial server change always include?", [
        "A community poll so players feel heard",
        "The reasoning, who decided, when it takes effect, and how feedback will be handled",
        "Only the change itself, to keep arguments to a minimum",
        "Sign-off from every member of staff",
      ], 1),
      choice("q8", "An owner privately asks you to unban a friend whose ban was valid. What do you do?", [
        "Unban immediately - ownership outranks you",
        "Explain the case and the policy, and ask that it goes through the normal appeal process so the decision is documented",
        "Refuse and tell the staff team what was asked",
        "Unban them but leave it off the record",
      ], 1),
      written("w1", "Write a 30-day plan to improve staff retention and activity, including exactly what you would measure and what result would count as success.", 220),
      written("w2", "A well-liked senior staff member repeatedly breaks conduct rules. Describe how you handle it from the first conversation to the final outcome, including how you protect team morale.", 220),
      written("w3", "Pick a controversial server change. Write the announcement you would post for it, then explain why you worded it that way.", 220),
      written("w4", "Describe a time you disagreed with a decision made above you. How did you raise it, and what happened?", 200),
    ],
  },
];

// Bump when the default question banks change: the seed then overwrites the stored questions once.
const QUESTION_VERSION = 2;

const REVIEWER_GROUP = "assistant_community_director";
export const GRANT_MINUTES = 60;
const STATUS_OPEN = ["submitted", "under_review"];
const text = (value, max) => String(value ?? "").replace(/\r\n?/g, "\n").replace(/[\u0000-\u0009\u000b-\u001f]/g, " ").trim().slice(0, max);
const parse = (value, fallback) => {
  if (value && typeof value === "object") return value;
  try { return JSON.parse(String(value ?? "")); } catch { return fallback; }
};

const clipText = (value, max) => {
  const t = String(value ?? "").trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
};

/** Embed fields with every answer: choice results packed into ≤1024-char blocks, written answers one field each. */
function answerFields(marked) {
  const fields = [];
  let block = "";
  let part = 1;
  marked.forEach((q, index) => {
    if (q.type !== "choice") return;
    const line = `${q.correct ? "✅" : "❌"} **${index + 1}.** ${clipText(q.prompt, 90)}\n↳ ${clipText(q.givenText || "No answer", 110)}${q.correct ? "" : `\n↳ _Expected: ${clipText(q.options?.[q.answer] || "", 110)}_`}\n`;
    if (block.length + line.length > 1000) { fields.push([`Multiple choice answers (${part++})`, block, false]); block = ""; }
    block += line;
  });
  if (block) fields.push([part > 1 ? `Multiple choice answers (${part})` : "Multiple choice answers", block, false]);
  marked.forEach((q, index) => {
    if (q.type === "choice") return;
    fields.push([`${index + 1}. ${clipText(q.prompt, 150)}`, clipText(q.given || "(blank)", 600), false]);
  });
  return fields;
}

/** Plain-text copy of the whole application, attached to the log so nothing is cut off. */
function answerSheet(exam, marked, meta) {
  const lines = [
    exam.title, `Application #${meta.id} - ${meta.name} (${meta.rank || "unknown rank"})`,
    `Multiple choice: ${meta.autoScore === null ? "n/a" : `${meta.autoScore}% (${meta.right}/${meta.choices})`} - pass mark ${exam.pass_mark}%`,
    `Submitted ${new Date().toUTCString()}`, "",
  ];
  marked.forEach((q, index) => {
    lines.push(`${index + 1}. ${q.prompt}`);
    if (q.type === "choice") {
      (q.options || []).forEach((option, i) => lines.push(`   ${i === q.given ? ">" : " "} ${String.fromCharCode(65 + i)}. ${option}${i === Number(q.answer) ? "   [correct]" : ""}`));
      lines.push(`   Result: ${q.correct ? "CORRECT" : "INCORRECT"}`);
    } else lines.push("", q.given || "(blank)");
    lines.push("");
  });
  return lines.join("\n");
}

export function createStaffExams({ client, db, audit, log }) {
  async function seed() {
    for (const exam of DEFAULT_EXAMS)
      await db.query(
        `INSERT IGNORE INTO staff_exams(exam_key,title,target_rank,eligible_group,description,pass_role_name,questions,pass_mark,cooldown_days,enabled,updated_at)
         VALUES(?,?,?,?,?,?,?,?,?,TRUE,?)`,
        [exam.exam_key, exam.title, exam.target_rank, exam.eligible_group, exam.description, exam.pass_role_name, JSON.stringify(exam.questions), exam.pass_mark, exam.cooldown_days, Date.now()],
      );
    const stored = await db.one("SELECT value FROM bot_config WHERE `key`='staff_exam_questions_version'");
    const version = Number(typeof stored?.value === "string" ? JSON.parse(stored.value) : stored?.value) || 1;
    if (version < QUESTION_VERSION) {
      for (const exam of DEFAULT_EXAMS)
        await db.query("UPDATE staff_exams SET questions=?,description=?,pass_mark=?,updated_at=? WHERE exam_key=?", [JSON.stringify(exam.questions), exam.description, exam.pass_mark, Date.now(), exam.exam_key]);
      await db.query(
        "INSERT INTO bot_config(`key`,value,updated_by,updated_at) VALUES('staff_exam_questions_version',?,?,?) ON DUPLICATE KEY UPDATE value=VALUES(value),updated_at=VALUES(updated_at)",
        [JSON.stringify(QUESTION_VERSION), "system", Date.now()],
      );
    }
  }

  /** The member's unexpired, unused exam access (handed out with /exam give). */
  const activeGrant = (examKey, discordId) =>
    db.one(
      "SELECT * FROM staff_exam_grants WHERE exam_key=? AND discord_id=? AND used_at IS NULL AND revoked_at IS NULL AND expires_at>? ORDER BY id DESC LIMIT 1",
      [examKey, String(discordId), Date.now()],
    );

  const exams = async () =>
    (await db.query("SELECT * FROM staff_exams ORDER BY FIELD(exam_key,'head_admin','management'),title")).map((row) => ({
      ...row,
      questions: parse(row.questions, []),
      enabled: Boolean(Number(row.enabled)),
    }));

  /** Highest directly-held staff group. Role-mirrored memberships (origin discord:*) are ignored, as in staffLevel(). */
  async function topGroup(discordId) {
    return db.one(
      `SELECT g.name,g.label,g.rank_order FROM ace_memberships m JOIN ace_groups g ON g.name=m.group_name
        WHERE m.discord_id=? AND g.staff_only=TRUE AND m.origin NOT LIKE 'discord:%'
        ORDER BY g.rank_order DESC LIMIT 1`,
      [String(discordId)],
    );
  }

  async function reviewerThreshold() {
    const row = await db.one("SELECT rank_order FROM ace_groups WHERE name=?", [REVIEWER_GROUP]);
    return Number(row?.rank_order ?? 875);
  }

  async function isReviewer(discordId) {
    if (superuserIds().has(String(discordId))) return true;
    const [level, threshold] = await Promise.all([staffLevel(discordId), reviewerThreshold()]);
    return level >= threshold;
  }

  const publicQuestions = (questions) =>
    questions.map(({ answer, ...question }) => question);

  /** Applicants never receive the answer key; reviewers see each choice marked right or wrong. */
  function markAnswers(questions, answers) {
    return questions.map((question) => {
      const given = answers?.[question.id];
      if (question.type === "choice") {
        const index = Number.isInteger(Number(given)) ? Number(given) : null;
        return { ...question, given: index, givenText: index === null ? null : question.options?.[index] ?? null, correct: index !== null && index === Number(question.answer) };
      }
      return { ...question, given: typeof given === "string" ? given : "" };
    });
  }

  async function staffGuild() {
    const binding =
      (await db.one("SELECT guild_id,channel_id FROM discord_channel_bindings WHERE purpose='staff_exams'")) ||
      (await db.one("SELECT guild_id,channel_id FROM discord_channel_bindings WHERE purpose='staff_audit'"));
    const guildId = binding?.guild_id || (await db.one("SELECT guild_id FROM network_guilds WHERE kind='staff' ORDER BY added_at LIMIT 1"))?.guild_id;
    return guildId ? client.guilds.cache.get(String(guildId)) || null : null;
  }

  /** Each exam can log to its own channel (staff_exams_<exam_key>), else the shared staff_exams one, else staff_audit. */
  async function logPurpose(examKey) {
    for (const purpose of [`staff_exams_${examKey}`, "staff_exams"])
      if (await db.one("SELECT 1 ok FROM discord_channel_bindings WHERE purpose=?", [purpose])) return purpose;
    return "staff_audit";
  }

  async function postLog(examKey, entry) {
    const guild = await staffGuild();
    await log(guild, { ...entry, server: false, footer: "Florida Bay Roleplay · Staff exams" }, await logPurpose(examKey)).catch((error) =>
      console.error("[FBRP exams] log:", error.message || error),
    );
  }

  /** The exam's "passed" role in the staff Discord, created on first use and remembered on the exam row. */
  async function passRole(exam, guild) {
    if (!guild) return null;
    if (exam.pass_role_id) {
      const existing = await guild.roles.fetch(String(exam.pass_role_id)).catch(() => null);
      if (existing) return existing;
    }
    await guild.roles.fetch().catch(() => null);
    let role = guild.roles.cache.find((item) => item.name === exam.pass_role_name);
    if (!role)
      role = await guild.roles
        .create({
          name: exam.pass_role_name,
          color: exam.exam_key === "management" ? 0xffbe5c : 0x35e2cd,
          mentionable: false,
          hoist: false,
          reason: `Florida Bay staff exam: ${exam.title}`,
        })
        .catch((error) => {
          console.error("[FBRP exams] could not create pass role:", error.message || error);
          return null;
        });
    if (role) await db.query("UPDATE staff_exams SET pass_role_id=? WHERE exam_key=?", [role.id, exam.exam_key]);
    return role;
  }

  async function eligibility(exam, discordId, group) {
    if (!exam.enabled) return { eligible: false, reason: "This exam is closed right now." };
    if (!group || group.name !== exam.eligible_group) {
      const required = await db.one("SELECT label FROM ace_groups WHERE name=?", [exam.eligible_group]);
      return { eligible: false, reason: `Only members whose current rank is ${required?.label || exam.eligible_group} can sit this exam.` };
    }
    const latest = await db.one(
      "SELECT status,updated_at,reviewed_at FROM staff_exam_applications WHERE exam_key=? AND discord_id=? ORDER BY id DESC LIMIT 1",
      [exam.exam_key, String(discordId)],
    );
    if (latest && STATUS_OPEN.includes(latest.status)) return { eligible: false, reason: "Your application is waiting for review.", pending: true };
    if (latest?.status === "passed") return { eligible: false, reason: "You have already passed this exam.", passed: true };
    const grant = await activeGrant(exam.exam_key, discordId);
    // A grant from Assistant Community Director+ is a deliberate decision, so it also overrides a retake cooldown.
    if (latest?.status === "failed" && !grant) {
      const until = Number(latest.reviewed_at || latest.updated_at) + Number(exam.cooldown_days) * 86400000;
      if (until > Date.now()) return { eligible: false, reason: "You can retake this exam once the cooldown ends.", cooldownUntil: until };
    }
    if (!grant) return { eligible: false, needsGrant: true, reason: "Assistant Community Director or above has to give you this exam with /exam give. Access lasts 60 minutes." };
    return { eligible: true, grantId: grant.id, expiresAt: Number(grant.expires_at) };
  }

  async function portalData(discordId) {
    const [all, group, reviewer, mine] = await Promise.all([
      exams(),
      topGroup(discordId),
      isReviewer(discordId),
      db.query("SELECT * FROM staff_exam_applications WHERE discord_id=? ORDER BY id DESC LIMIT 20", [String(discordId)]),
    ]);
    const visible = [];
    for (const exam of all) {
      const state = await eligibility(exam, discordId, group);
      const applied = mine.some((row) => row.exam_key === exam.exam_key);
      // Only the rank an exam is for (or someone who already applied) may see it at all.
      if (!(group?.name === exam.eligible_group || applied)) continue;
      visible.push({
        exam_key: exam.exam_key,
        title: exam.title,
        target_rank: exam.target_rank,
        description: exam.description,
        pass_mark: exam.pass_mark,
        cooldown_days: exam.cooldown_days,
        questions: state.eligible ? publicQuestions(exam.questions) : [],
        questionCount: exam.questions.length,
        ...state,
      });
    }
    const data = {
      rank: group ? { name: group.name, label: group.label } : null,
      exams: visible,
      applications: mine.map((row) => ({
        id: row.id, exam_key: row.exam_key, status: row.status, auto_score: row.auto_score, score: row.score,
        review_notes: STATUS_OPEN.includes(row.status) ? null : row.review_notes, created_at: row.created_at, reviewed_at: row.reviewed_at,
        title: all.find((exam) => exam.exam_key === row.exam_key)?.title || row.exam_key,
      })),
      reviewer,
    };
    if (reviewer) {
      const rows = await db.query(
        `SELECT * FROM staff_exam_applications ORDER BY FIELD(status,'submitted','under_review','passed','failed','withdrawn'),created_at DESC LIMIT 200`,
      );
      data.reviewQueue = rows.map((row) => {
        const exam = all.find((item) => item.exam_key === row.exam_key);
        return {
          ...row,
          title: exam?.title || row.exam_key,
          target_rank: exam?.target_rank || "",
          pass_mark: exam?.pass_mark ?? 70,
          answers: exam ? markAnswers(exam.questions, parse(row.answers, {})) : [],
        };
      });
    }
    return data;
  }

  async function submit(session, input) {
    const examKey = String(input.examKey || "");
    const exam = (await exams()).find((row) => row.exam_key === examKey);
    if (!exam) throw new Error("That exam does not exist.");
    const group = await topGroup(session.id);
    const state = await eligibility(exam, session.id, group);
    if (!state.eligible) throw new Error(state.reason);
    const given = input.answers && typeof input.answers === "object" ? input.answers : {};
    const answers = {};
    let choices = 0;
    let right = 0;
    for (const question of exam.questions) {
      const raw = given[question.id];
      if (question.type === "choice") {
        const index = Number(raw);
        if (!Number.isInteger(index) || index < 0 || index >= (question.options || []).length)
          throw new Error(`Answer every multiple-choice question (missing: "${question.prompt.slice(0, 60)}…").`);
        answers[question.id] = index;
        choices += 1;
        if (index === Number(question.answer)) right += 1;
      } else {
        const value = text(raw, Number(question.max) || 3000);
        if (value.length < (Number(question.min) || 0))
          throw new Error(`Write at least ${question.min} characters for: "${question.prompt.slice(0, 70)}…"`);
        answers[question.id] = value;
      }
    }
    const autoScore = choices ? Math.round((right / choices) * 100) : null;
    const stamp = Date.now();
    const used = await db.query("UPDATE staff_exam_grants SET used_at=? WHERE id=? AND used_at IS NULL AND revoked_at IS NULL AND expires_at>?", [stamp, state.grantId, stamp]);
    if (!used.affectedRows) throw new Error("Your exam access expired before you submitted. Ask an Assistant Community Director or above to give you the exam again.");
    const discordUser = await client.users.fetch(session.id).catch(() => null);
    const displayName = text(discordUser?.globalName || discordUser?.username || session.username || session.id, 100);
    const inserted = await db.query(
      `INSERT INTO staff_exam_applications(exam_key,discord_id,display_name,rank_at_submit,answers,auto_score,status,created_at,updated_at)
       VALUES(?,?,?,?,?,?,'submitted',?,?)`,
      [exam.exam_key, session.id, displayName, group?.label || "", JSON.stringify(answers), autoScore, stamp, stamp],
    );
    await audit(session.id, "exam.submit", inserted.insertId, { exam: exam.exam_key, autoScore });
    const marked = markAnswers(exam.questions, answers);
    await postLog(exam.exam_key, {
      title: `${exam.title} submitted`,
      color: COLORS.primary,
      description: `A new application is waiting for review on the staff website.\n${publicBase()}/portal#examreviews\nFull answers are attached below.`,
      fields: [
        ["Applicant", who(session.id)],
        ["Current rank", group?.label || "Unknown"],
        ["Application", `#${inserted.insertId}`],
        ["Multiple choice", autoScore === null ? "None" : `${autoScore}% (${right}/${choices})`],
        ...answerFields(marked),
      ],
      files: [{ attachment: Buffer.from(answerSheet(exam, marked, { id: inserted.insertId, name: displayName, rank: group?.label, autoScore, right, choices })), name: `exam-${inserted.insertId}-${exam.exam_key}.txt` }],
    });
    return { id: inserted.insertId, autoScore };
  }

  async function review(session, input) {
    if (!(await isReviewer(session.id))) throw new Error("Only Assistant Community Director and above can review exams.");
    const decision = String(input.decision || "");
    if (!["under_review", "passed", "failed"].includes(decision)) throw new Error("Choose a valid decision.");
    const app = await db.one("SELECT * FROM staff_exam_applications WHERE id=?", [Number(input.applicationId)]);
    if (!app) throw new Error("Application not found.");
    if (!STATUS_OPEN.includes(app.status)) throw new Error("That application has already been decided.");
    if (String(app.discord_id) === session.id) throw new Error("You cannot review your own exam.");
    const exam = (await exams()).find((row) => row.exam_key === app.exam_key);
    if (!exam) throw new Error("The exam for this application no longer exists.");
    const notes = text(input.notes, 2000);
    const score = input.score === "" || input.score === null || input.score === undefined ? null : Math.max(0, Math.min(100, Math.round(Number(input.score))));
    if (decision !== "under_review" && score === null && app.auto_score === null) throw new Error("Give the application a final score.");
    if (decision === "failed" && !notes) throw new Error("Leave feedback so the applicant knows what to work on.");
    const stamp = Date.now();
    let roleGranted = false;
    let roleNote = null;
    if (decision === "passed") {
      const guild = await staffGuild();
      const role = await passRole(exam, guild);
      const member = guild ? await guild.members.fetch(String(app.discord_id)).catch(() => null) : null;
      if (role && member) {
        roleGranted = await member.roles
          .add(role, `Passed ${exam.title} (reviewed by ${session.id})`)
          .then(() => true)
          .catch((error) => {
            roleNote = `Could not add the role: ${error.message || error}`;
            return false;
          });
      } else roleNote = !guild ? "Staff Discord is not available." : !role ? "The passed role could not be created (check Manage Roles)." : "Applicant is not in the staff Discord.";
    }
    await db.query(
      `UPDATE staff_exam_applications SET status=?,score=?,reviewer_id=?,review_notes=?,role_granted=?,updated_at=?,reviewed_at=? WHERE id=?`,
      [decision, score ?? app.auto_score, session.id, notes || null, roleGranted, stamp, decision === "under_review" ? null : stamp, app.id],
    );
    await audit(session.id, `exam.${decision}`, app.discord_id, { application: app.id, exam: exam.exam_key, score: score ?? app.auto_score, roleGranted });
    if (decision !== "under_review") {
      const passed = decision === "passed";
      await postLog(exam.exam_key, {
        title: `${exam.title} ${passed ? "passed" : "failed"}`,
        color: passed ? COLORS.success : COLORS.danger,
        fields: [
          ["Applicant", who(app.discord_id)],
          ["Reviewed by", who(session.id)],
          ["Application", `#${app.id}`],
          ["Score", `${score ?? app.auto_score ?? "-"}% (pass mark ${exam.pass_mark}%)`],
          ...(passed ? [["Passed role", roleGranted ? `Granted: ${exam.pass_role_name}` : `Not granted - ${roleNote}`, false]] : []),
          ...(notes ? [["Notes", notes, false]] : []),
        ],
      });
      const user = await client.users.fetch(String(app.discord_id)).catch(() => null);
      await user
        ?.send({
          content: passed
            ? `**Congratulations - you passed the ${exam.title}.** ${roleGranted ? `You now hold the **${exam.pass_role_name}** role in the staff Discord. ` : ""}Management will be in touch about next steps.${notes ? `\n> ${notes.slice(0, 1500).replace(/\n/g, "\n> ")}` : ""}`
            : `Your **${exam.title}** was not successful this time.${notes ? `\n> ${notes.slice(0, 1500).replace(/\n/g, "\n> ")}` : ""}\nYou can retake it in ${exam.cooldown_days} days from the staff portal.`,
        })
        .catch(() => {});
    }
    return { status: decision, roleGranted, roleNote };
  }

  async function examByKey(key) {
    const exam = (await exams()).find((row) => row.exam_key === String(key || ""));
    if (!exam) throw new Error("Unknown exam.");
    return exam;
  }

  /** /exam give: opens one exam for one member for GRANT_MINUTES. Assistant Community Director and above only. */
  async function give(actorId, targetId, examKey) {
    if (!(await isReviewer(actorId))) throw new Error("Only Assistant Community Director and above can give out exams.");
    if (String(actorId) === String(targetId)) throw new Error("You cannot give yourself an exam.");
    const exam = await examByKey(examKey);
    if (!exam.enabled) throw new Error(`${exam.title} is closed. Re-open it in live configuration first.`);
    const group = await topGroup(targetId);
    if (group?.name !== exam.eligible_group) {
      const required = await db.one("SELECT label FROM ace_groups WHERE name=?", [exam.eligible_group]);
      throw new Error(`${exam.title} is only for members whose current rank is ${required?.label || exam.eligible_group} (theirs: ${group?.label || "none"}).`);
    }
    const latest = await db.one("SELECT status FROM staff_exam_applications WHERE exam_key=? AND discord_id=? ORDER BY id DESC LIMIT 1", [exam.exam_key, String(targetId)]);
    if (latest && STATUS_OPEN.includes(latest.status)) throw new Error("They already have an application waiting for review.");
    if (latest?.status === "passed") throw new Error("They have already passed this exam.");
    const stamp = Date.now();
    await db.query("UPDATE staff_exam_grants SET revoked_at=?,revoked_by=? WHERE exam_key=? AND discord_id=? AND used_at IS NULL AND revoked_at IS NULL", [stamp, String(actorId), exam.exam_key, String(targetId)]);
    const expiresAt = stamp + GRANT_MINUTES * 60000;
    const inserted = await db.query("INSERT INTO staff_exam_grants(exam_key,discord_id,granted_by,created_at,expires_at) VALUES(?,?,?,?,?)", [exam.exam_key, String(targetId), String(actorId), stamp, expiresAt]);
    await audit(actorId, "exam.give", targetId, { exam: exam.exam_key, grant: inserted.insertId, expiresAt });
    const link = `${publicBase()}/portal#exams`;
    const user = await client.users.fetch(String(targetId)).catch(() => null);
    const dmSent = await user
      ?.send({ content: `**You have been given the ${exam.title}.**
Open it here: ${link}
Your access expires <t:${Math.floor(expiresAt / 1000)}:R> (${GRANT_MINUTES} minutes) and must be submitted before then. ${exam.questions.length} questions · pass mark ${exam.pass_mark}%.` })
      .then(() => true, () => false);
    await postLog(exam.exam_key, {
      title: `${exam.title} given`,
      color: COLORS.primary,
      fields: [["Member", who(targetId)], ["Given by", who(actorId)], ["Expires", `<t:${Math.floor(expiresAt / 1000)}:R>`], ["DM delivered", dmSent ? "Yes" : "No - share the portal link manually"]],
    });
    return { exam, expiresAt, dmSent: Boolean(dmSent), link };
  }

  async function revoke(actorId, targetId, examKey) {
    if (!(await isReviewer(actorId))) throw new Error("Only Assistant Community Director and above can revoke exams.");
    const exam = await examByKey(examKey);
    const result = await db.query("UPDATE staff_exam_grants SET revoked_at=?,revoked_by=? WHERE exam_key=? AND discord_id=? AND used_at IS NULL AND revoked_at IS NULL AND expires_at>?", [Date.now(), String(actorId), exam.exam_key, String(targetId), Date.now()]);
    if (!result.affectedRows) throw new Error("They do not have active access to that exam.");
    await audit(actorId, "exam.revoke", targetId, { exam: exam.exam_key });
    await postLog(exam.exam_key, { title: `${exam.title} access revoked`, color: COLORS.warning, fields: [["Member", who(targetId)], ["Revoked by", who(actorId)]] });
    return { exam };
  }

  async function activeGrants(actorId) {
    if (!(await isReviewer(actorId))) throw new Error("Only Assistant Community Director and above can see exam access.");
    const all = await exams();
    const rows = await db.query("SELECT * FROM staff_exam_grants WHERE used_at IS NULL AND revoked_at IS NULL AND expires_at>? ORDER BY expires_at", [Date.now()]);
    return rows.map((row) => ({ ...row, title: all.find((exam) => exam.exam_key === row.exam_key)?.title || row.exam_key }));
  }

  async function withdraw(session, input) {
    const app = await db.one("SELECT * FROM staff_exam_applications WHERE id=? AND discord_id=?", [Number(input.applicationId), session.id]);
    if (!app || !STATUS_OPEN.includes(app.status)) throw new Error("That application can no longer be withdrawn.");
    await db.query("UPDATE staff_exam_applications SET status='withdrawn',updated_at=? WHERE id=?", [Date.now(), app.id]);
    await audit(session.id, "exam.withdraw", app.id, { exam: app.exam_key });
    return { ok: true };
  }

  return { seed, portalData, submit, review, withdraw, isReviewer, give, revoke, activeGrants, exams };
}
