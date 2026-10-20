/**
 * Organization roster system and public organization pages (orgs website).
 *
 * The roster board groups members by division and rank. Every member can have a callsign, a division
 * and a status (active, leave of absence, probation, inactive, suspended), and a member file with their
 * promotion history, commendations, strikes and leadership notes. Organizations also get a public
 * profile (tagline, about, Discord invite, recruitment with their own application questions and an
 * optional public roster), an announcement board and an application queue. Permissions come from the
 * economy access model: owners, command and leaders can do everything, ranks follow their flags, and
 * rank-limited editors only act on members ranked below them.
 */

import { decodeDataUrl } from "./org-logos.js";

export const MEMBER_STATUSES = Object.freeze({
  active: "Active",
  loa: "Leave of absence",
  probation: "Probation",
  inactive: "Inactive",
  suspended: "Suspended",
});
export const RECORD_KINDS = Object.freeze({ promotion: "Promotion", demotion: "Demotion", commendation: "Commendation", strike: "Strike", note: "Note" });
/** Record kinds only leadership (member files permission) and, for strikes, the member themself see. */
const PRIVATE_KINDS = new Set(["strike", "note"]);
export const MAX_DIVISIONS = 20;
export const MAX_QUESTIONS = 8;
const HEX = /^#[0-9a-f]{6}$/i;
const SNOWFLAKE = /^\d{15,24}$/;
const WEEK = 7 * 86400000;
const DAY = 86400000;
export const EVENT_RESPONSES = Object.freeze({ going: "Going", maybe: "Maybe", no: "Can't make it" });
export const MAX_UPCOMING_EVENTS = 40;

const text = (value, max) => String(value ?? "").replace(/[\u0000-\u0008\u000b-\u001f]/g, " ").trim().slice(0, max);
const line = (value, max) => text(value, max).replace(/\s+/g, " ");
const flag = (value) => value === true || value === 1 || value === "1" || value === "on" || value === "true";
const parse = (value, fallback) => {
  if (value && typeof value === "object") return value;
  try { return JSON.parse(String(value ?? "")); } catch { return fallback; }
};

/** Normalize application questions: 1-8 non-empty prompts of up to 200 characters. Exported for tests. */
export function cleanQuestions(input) {
  const list = (Array.isArray(input) ? input : String(input || "").split("\n")).map((q) => line(q, 200)).filter(Boolean);
  if (list.length > MAX_QUESTIONS) throw new Error(`Use up to ${MAX_QUESTIONS} application questions.`);
  return list;
}

/** A Discord invite link or code, normalized to https://discord.gg/<code>. Exported for tests. */
export function cleanInvite(value) {
  const raw = line(value, 120);
  if (!raw) return null;
  const match = /^(?:https?:\/\/)?(?:www\.)?(?:discord\.gg|discord(?:app)?\.com\/invite)\/([A-Za-z0-9-]{2,32})\/?$/.exec(raw) || /^([A-Za-z0-9-]{2,32})$/.exec(raw);
  if (!match) throw new Error("Enter a Discord invite like https://discord.gg/floridabay.");
  return `https://discord.gg/${match[1]}`;
}

/** Callsigns: 1-16 letters, digits, spaces, dashes or dots. Exported for tests. */
export function cleanCallsign(value) {
  const raw = line(value, 16).toUpperCase();
  if (!raw) return null;
  if (!/^[A-Z0-9][A-Z0-9 .-]{0,15}$/.test(raw)) throw new Error("Callsigns use letters, numbers, spaces, dots and dashes (up to 16).");
  return raw;
}

/** Validate an event start time (ms): a real number within the next year, or the last hour when editing. Exported for tests. */
export function cleanEventTime(value, now = Date.now(), editing = false) {
  const at = Math.floor(Number(value));
  if (!Number.isFinite(at) || at <= 0) throw new Error("Pick a date and time for the event.");
  if (at < now - (editing ? 30 * DAY : 3600000)) throw new Error("That time has already passed.");
  if (at > now + 365 * DAY) throw new Error("Events can be planned up to a year ahead.");
  return at;
}

/** Quote one CSV field. Exported for tests. */
export function csvField(value) {
  const textValue = String(value ?? "");
  const safe = /^[=+\-@\t\r]/.test(textValue) ? `'${textValue}` : textValue;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function createOrgRoster({ client, db, economy, audit, resolvePeople, logos }) {
  async function log(orgId, actorId, action, targetId = null, detail = {}) {
    await db.query("INSERT INTO org_roster_log(org_id,actor_id,action,target_id,detail,created_at) VALUES(?,?,?,?,?,?)",
      [Number(orgId), String(actorId), action, targetId == null ? null : String(targetId), JSON.stringify(detail), Date.now()]).catch(() => {});
  }

  async function activeOrg(ref) {
    const org = await db.one("SELECT id,slug,name,type,color,active FROM organizations WHERE (id=? OR slug=?) AND active=TRUE", [Number(ref) || 0, String(ref || "").toLowerCase()]);
    if (!org) throw new Error("Organization not found.");
    return org;
  }

  async function profileOf(orgId) {
    const row = await db.one("SELECT tagline,about,discord_invite,recruiting,questions,public_roster,updated_by,updated_at FROM org_profiles WHERE org_id=?", [Number(orgId)]).catch(() => null);
    return {
      tagline: row?.tagline || "", about: row?.about || "", discordInvite: row?.discord_invite || null,
      recruiting: Boolean(Number(row?.recruiting || 0)), questions: parse(row?.questions, []) || [],
      publicRoster: row ? Boolean(Number(row.public_roster)) : true,
      updatedBy: row?.updated_by || null, updatedAt: row?.updated_at ? Number(row.updated_at) : null,
    };
  }

  async function divisionsOf(orgId) {
    return (await db.query("SELECT id,name,color,description,sort_order FROM org_divisions WHERE org_id=? ORDER BY sort_order,name", [Number(orgId)]).catch(() => []))
      .map((row) => ({ id: Number(row.id), name: row.name, color: row.color || null, description: row.description || "", sort: Number(row.sort_order) }));
  }

  async function memberProfiles(orgId) {
    return db.query("SELECT discord_id,callsign,division_id,status,status_note,status_until FROM org_member_profiles WHERE org_id=?", [Number(orgId)]).catch(() => []);
  }

  /** The level of a roster member (leaders count as 100), for rank-limited editors. */
  async function memberLevel(orgId, discordId) {
    const row = await db.one("SELECT m.manager,r.level FROM organization_members m LEFT JOIN org_ranks r ON r.id=m.rank_id AND r.org_id=m.org_id WHERE m.org_id=? AND m.discord_id=?", [Number(orgId), String(discordId)]);
    if (!row) return null;
    return flag(row.manager) ? 100 : Number(row.level || 0);
  }

  async function assertReach(org, perms, actorId, target, verb) {
    if (!SNOWFLAKE.test(String(target || ""))) throw new Error("Choose a member.");
    const level = await memberLevel(org.id, target);
    if (level == null) throw new Error("That member is not on the roster.");
    if (perms.full) return level;
    if (String(target) === String(actorId)) throw new Error(`You cannot ${verb} yourself.`);
    if (level >= perms.level) throw new Error(`You can only ${verb} members ranked below you.`);
    return level;
  }

  /** Duty hours per member over the last 30 days (7-day figure alongside), busiest first. */
  async function hoursOf(orgId) {
    const now = Date.now();
    const rows = await db.query(
      `SELECT discord_id,COUNT(*) shifts,SUM(secs) month,SUM(IF(started_at>=?,secs,0)) week
         FROM (SELECT discord_id,started_at,COALESCE(NULLIF(seconds,0),GREATEST(0,FLOOR((heartbeat_at-started_at)/1000))) secs
                 FROM organization_shifts WHERE org_id=? AND started_at>=?) t
        GROUP BY discord_id ORDER BY month DESC LIMIT 100`,
      [now - WEEK, Number(orgId), now - 30 * DAY],
    ).catch(() => []);
    return { days: 30, rows: rows.map((row) => ({ discord_id: String(row.discord_id), shifts: Number(row.shifts || 0), week: Number(row.week || 0), month: Number(row.month || 0) })) };
  }

  /** Upcoming events (and the last two days) with RSVP counts, who is going and the viewer's answer. */
  async function eventsOf(orgId, actorId) {
    const rows = await db.query(
      "SELECT id,title,description,location,starts_at,created_by,created_at,cancelled_at FROM org_events WHERE org_id=? AND starts_at>=? ORDER BY starts_at LIMIT 60",
      [Number(orgId), Date.now() - 2 * DAY],
    ).catch(() => []);
    if (!rows.length) return [];
    const ids = rows.map((row) => Number(row.id));
    const rsvps = await db.query(`SELECT event_id,discord_id,response FROM org_event_rsvps WHERE event_id IN (${ids.map(() => "?").join(",")}) ORDER BY updated_at`, ids).catch(() => []);
    return rows.map((row) => {
      const mine = rsvps.filter((r) => Number(r.event_id) === Number(row.id));
      const count = (response) => mine.filter((r) => r.response === response).length;
      return {
        id: Number(row.id), title: row.title, description: row.description || "", location: row.location || "",
        starts_at: Number(row.starts_at), created_by: String(row.created_by), created_at: Number(row.created_at),
        cancelled: Boolean(row.cancelled_at),
        going: mine.filter((r) => r.response === "going").slice(0, 24).map((r) => String(r.discord_id)),
        counts: { going: count("going"), maybe: count("maybe"), no: count("no") },
        mine: actorId == null ? null : mine.find((r) => String(r.discord_id) === String(actorId))?.response || null,
      };
    });
  }

  /** Roster details, divisions, profile, announcements and (for reviewers) applications for one org detail. */
  async function enrich(detail, actorId = null) {
    const perms = detail.perms || {};
    const [profile, divisions, profiles, records, announcements, applications, hours, events] = await Promise.all([
      profileOf(detail.id),
      divisionsOf(detail.id),
      memberProfiles(detail.id),
      db.query("SELECT discord_id,kind,COUNT(*) n FROM org_member_records WHERE org_id=? AND revoked_at IS NULL AND kind IN ('commendation','strike') GROUP BY discord_id,kind", [detail.id]).catch(() => []),
      db.query("SELECT id,title,body,pinned,author_id,created_at FROM org_announcements WHERE org_id=? ORDER BY pinned DESC,id DESC LIMIT 25", [detail.id]).catch(() => []),
      perms.applications
        ? db.query("SELECT id,discord_id,answers,status,reviewer_id,review_note,created_at,reviewed_at FROM org_applications WHERE org_id=? AND (status='pending' OR reviewed_at>=?) ORDER BY status='pending' DESC,id DESC LIMIT 60", [detail.id, Date.now() - 30 * 86400000]).catch(() => [])
        : Promise.resolve([]),
      hoursOf(detail.id),
      eventsOf(detail.id, actorId),
    ]);
    const byMember = new Map(profiles.map((row) => [String(row.discord_id), row]));
    const counts = (id, kind) => Number(records.find((row) => String(row.discord_id) === id && row.kind === kind)?.n || 0);
    for (const row of detail.roster || []) {
      const extra = byMember.get(row.discord_id);
      row.callsign = extra?.callsign || null;
      row.division_id = extra?.division_id == null ? null : Number(extra.division_id);
      row.status = extra?.status || "active";
      row.status_note = extra?.status_note || "";
      row.status_until = extra?.status_until ? Number(extra.status_until) : null;
      row.commendations = counts(row.discord_id, "commendation");
      row.strikes = perms.discipline ? counts(row.discord_id, "strike") : null;
    }
    detail.logo = (await logos.version(detail.id)) || null;
    detail.profile = profile;
    detail.divisions = divisions.map((division) => ({ ...division, members: (detail.roster || []).filter((row) => row.division_id === division.id).length }));
    detail.announcements = announcements.map((row) => ({ id: Number(row.id), title: row.title, body: row.body, pinned: flag(row.pinned), author_id: String(row.author_id), created_at: Number(row.created_at) }));
    detail.applications = applications.map((row) => ({ id: Number(row.id), discord_id: String(row.discord_id), answers: parse(row.answers, []), status: row.status, reviewer_id: row.reviewer_id, review_note: row.review_note || "", created_at: Number(row.created_at), reviewed_at: row.reviewed_at ? Number(row.reviewed_at) : null }));
    detail.pendingApplications = detail.applications.filter((row) => row.status === "pending").length;
    detail.hours = hours;
    detail.events = events;
    return detail;
  }

  /** Everyone shown by enrich(), for display names. */
  function peopleIn(detail) {
    return [
      ...(detail.announcements || []).map((row) => row.author_id),
      ...(detail.applications || []).flatMap((row) => [row.discord_id, row.reviewer_id]),
      ...(detail.hours?.rows || []).map((row) => row.discord_id),
      ...(detail.events || []).flatMap((row) => [row.created_by, ...row.going]),
    ];
  }

  async function myApplications(discordId) {
    const versions = await logos.versions();
    return (await db.query(
      "SELECT a.id,a.org_id,o.name org_name,o.slug,o.color,a.status,a.review_note,a.created_at,a.reviewed_at FROM org_applications a JOIN organizations o ON o.id=a.org_id WHERE a.discord_id=? ORDER BY a.id DESC LIMIT 20",
      [String(discordId)],
    ).catch(() => [])).map((row) => ({ ...row, id: Number(row.id), org_id: Number(row.org_id), logo: versions.get(Number(row.org_id)) || null, created_at: Number(row.created_at), reviewed_at: row.reviewed_at ? Number(row.reviewed_at) : null }));
  }

  /** One member file: roster details, record history and six weeks of duty hours. */
  async function memberFile(actorId, orgRef, discordId) {
    const { org, perms } = await economy.accessTo(actorId, orgRef);
    const target = String(discordId || "");
    if (!SNOWFLAKE.test(target)) throw new Error("Choose a member.");
    const self = target === String(actorId);
    const since = Date.now() - 6 * WEEK;
    const [member, profile, records, shifts] = await Promise.all([
      db.one("SELECT m.discord_id,m.manager,m.rank_id,r.name rank_name,r.level,r.min_weekly_minutes,m.added_at FROM organization_members m LEFT JOIN org_ranks r ON r.id=m.rank_id AND r.org_id=m.org_id WHERE m.org_id=? AND m.discord_id=?", [org.id, target]),
      db.one("SELECT callsign,division_id,status,status_note,status_until,updated_by,updated_at FROM org_member_profiles WHERE org_id=? AND discord_id=?", [org.id, target]),
      db.query("SELECT id,kind,body,actor_id,created_at,revoked_by,revoked_at FROM org_member_records WHERE org_id=? AND discord_id=? ORDER BY id DESC LIMIT 100", [org.id, target]),
      db.query("SELECT started_at,COALESCE(NULLIF(seconds,0),GREATEST(0,FLOOR((heartbeat_at-started_at)/1000))) seconds FROM organization_shifts WHERE org_id=? AND discord_id=? AND started_at>=?", [org.id, target, since]),
    ]);
    if (!member && !profile && !records.length) throw new Error("That member is not on the roster.");
    const visible = records.filter((row) => !PRIVATE_KINDS.has(row.kind) || perms.discipline || (self && row.kind === "strike"));
    const weeks = Array.from({ length: 6 }, (_, index) => {
      const end = Date.now() - index * WEEK;
      const start = end - WEEK;
      return { start, seconds: shifts.filter((row) => Number(row.started_at) >= start && Number(row.started_at) < end).reduce((sum, row) => sum + Number(row.seconds || 0), 0) };
    }).reverse();
    const ids = [target, ...visible.flatMap((row) => [row.actor_id, row.revoked_by]), profile?.updated_by];
    return {
      discordId: target,
      member: member ? { leader: flag(member.manager), rankId: member.rank_id == null ? null : Number(member.rank_id), rank: flag(member.manager) ? "Leader" : member.rank_name || "Member", level: flag(member.manager) ? 100 : Number(member.level || 0), minWeeklyMinutes: member.min_weekly_minutes == null ? null : Number(member.min_weekly_minutes), joinedAt: Number(member.added_at || 0) } : null,
      profile: { callsign: profile?.callsign || null, divisionId: profile?.division_id == null ? null : Number(profile.division_id), status: profile?.status || "active", statusNote: profile?.status_note || "", statusUntil: profile?.status_until ? Number(profile.status_until) : null },
      records: visible.map((row) => ({ id: Number(row.id), kind: row.kind, body: row.body, actor_id: String(row.actor_id), created_at: Number(row.created_at), revoked: Boolean(row.revoked_at), revoked_by: row.revoked_by || null })),
      weeks,
      canEdit: Boolean(perms.discipline && (perms.full || (!self && member && (flag(member.manager) ? 100 : Number(member.level || 0)) < perms.level))),
      people: await resolvePeople(ids.filter(Boolean)),
    };
  }

  async function saveProfile(actorId, input) {
    const { org, perms } = await economy.accessTo(actorId, input.orgId);
    if (!perms.profile) throw new Error("Your rank cannot edit the organization profile.");
    const questions = cleanQuestions(input.questions);
    const recruiting = flag(input.recruiting);
    if (recruiting && !questions.length) throw new Error("Add at least one application question before opening recruitment.");
    const values = [line(input.tagline, 120) || null, text(input.about, 2000) || null, cleanInvite(input.discordInvite), recruiting, JSON.stringify(questions), flag(input.publicRoster), String(actorId), Date.now()];
    await db.query(
      `INSERT INTO org_profiles(org_id,tagline,about,discord_invite,recruiting,questions,public_roster,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE tagline=VALUES(tagline),about=VALUES(about),discord_invite=VALUES(discord_invite),recruiting=VALUES(recruiting),
         questions=VALUES(questions),public_roster=VALUES(public_roster),updated_by=VALUES(updated_by),updated_at=VALUES(updated_at)`,
      [org.id, ...values],
    );
    await audit(actorId, "organization.profile", org.id, { recruiting, questions: questions.length, publicRoster: flag(input.publicRoster) });
    await log(org.id, actorId, "profile", null, { recruiting });
    return { recruiting };
  }

  async function saveDivision(actorId, input) {
    const { org, perms } = await economy.accessTo(actorId, input.orgId);
    if (!perms.ranks && !perms.discipline) throw new Error("Your rank cannot manage divisions.");
    const name = line(input.name, 40);
    if (name.length < 2) throw new Error("Give the division a name (2-40 characters).");
    const color = line(input.color, 7);
    if (color && !HEX.test(color)) throw new Error("Division colour must be a hex colour like #55c4ff.");
    const description = line(input.description, 160) || null;
    const id = Number(input.divisionId) || 0;
    try {
      if (id) {
        const result = await db.query("UPDATE org_divisions SET name=?,color=?,description=? WHERE id=? AND org_id=?", [name, color || null, description, id, org.id]);
        if (!result.affectedRows) throw new Error("That division no longer exists.");
      } else {
        const [count] = await db.query("SELECT COUNT(*) n,COALESCE(MAX(sort_order),0) top FROM org_divisions WHERE org_id=?", [org.id]);
        if (Number(count?.n || 0) >= MAX_DIVISIONS) throw new Error(`An organization can have up to ${MAX_DIVISIONS} divisions.`);
        await db.query("INSERT INTO org_divisions(org_id,name,color,description,sort_order,created_by,created_at) VALUES(?,?,?,?,?,?,?)", [org.id, name, color || null, description, Number(count?.top || 0) + 10, String(actorId), Date.now()]);
      }
    } catch (error) {
      if (error?.code === "ER_DUP_ENTRY") throw new Error(`${org.name} already has a division called ${name}.`);
      throw error;
    }
    await log(org.id, actorId, id ? "division_update" : "division_create", null, { name });
    return { name };
  }

  async function deleteDivision(actorId, input) {
    const { org, perms } = await economy.accessTo(actorId, input.orgId);
    if (!perms.ranks && !perms.discipline) throw new Error("Your rank cannot manage divisions.");
    const division = await db.one("SELECT id,name FROM org_divisions WHERE id=? AND org_id=?", [Number(input.divisionId), org.id]);
    if (!division) throw new Error("That division no longer exists.");
    await db.query("DELETE FROM org_divisions WHERE id=? AND org_id=?", [division.id, org.id]);
    await log(org.id, actorId, "division_delete", null, { name: division.name });
    return { name: division.name };
  }

  /** Callsign, division and status of one member. */
  async function setMemberProfile(actorId, input) {
    const { org, perms } = await economy.accessTo(actorId, input.orgId);
    if (!perms.discipline) throw new Error("Your rank cannot edit member files.");
    const target = String(input.discordId || "");
    await assertReach(org, perms, actorId, target, "edit");
    const callsign = cleanCallsign(input.callsign);
    const divisionId = input.divisionId === "" || input.divisionId == null ? null : Number(input.divisionId);
    if (divisionId && !(await db.one("SELECT 1 ok FROM org_divisions WHERE id=? AND org_id=?", [divisionId, org.id]))) throw new Error("That division no longer exists.");
    const status = String(input.status || "active");
    if (!MEMBER_STATUSES[status]) throw new Error("Pick a member status.");
    const untilRaw = String(input.statusUntil || "").trim();
    const statusUntil = untilRaw ? Date.parse(untilRaw) : null;
    if (untilRaw && !Number.isFinite(statusUntil)) throw new Error("Enter a valid end date.");
    try {
      await db.query(
        `INSERT INTO org_member_profiles(org_id,discord_id,callsign,division_id,status,status_note,status_until,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE callsign=VALUES(callsign),division_id=VALUES(division_id),status=VALUES(status),status_note=VALUES(status_note),
           status_until=VALUES(status_until),updated_by=VALUES(updated_by),updated_at=VALUES(updated_at)`,
        [org.id, target, callsign, divisionId, status, line(input.statusNote, 160) || null, status === "active" ? null : statusUntil, String(actorId), Date.now()],
      );
    } catch (error) {
      if (error?.code === "ER_DUP_ENTRY") throw new Error(`Callsign ${callsign} is already taken in ${org.name}.`);
      throw error;
    }
    await audit(actorId, "organization.member_profile", org.id, { member: target, callsign, divisionId, status });
    await log(org.id, actorId, "member_profile", target, { callsign, status });
    return { callsign, status };
  }

  async function addRecord(actorId, input) {
    const { org, perms } = await economy.accessTo(actorId, input.orgId);
    if (!perms.discipline) throw new Error("Your rank cannot edit member files.");
    const target = String(input.discordId || "");
    const kind = String(input.kind || "");
    if (!["commendation", "strike", "note"].includes(kind)) throw new Error("Choose a commendation, strike or note.");
    await assertReach(org, perms, actorId, target, kind === "commendation" ? "commend" : "discipline");
    const body = text(input.body, 500);
    if (body.length < 3) throw new Error("Write a short reason.");
    await db.query("INSERT INTO org_member_records(org_id,discord_id,kind,body,actor_id,created_at) VALUES(?,?,?,?,?,?)", [org.id, target, kind, body, String(actorId), Date.now()]);
    await audit(actorId, `organization.member_${kind}`, org.id, { member: target, body });
    await log(org.id, actorId, `member_${kind}`, target, kind === "note" ? {} : { body: body.slice(0, 80) });
    if (kind !== "note")
      await client.users.fetch(target).then((user) => user.send(`${kind === "strike" ? "⚠️ You received a strike" : "🏅 You received a commendation"} in **${org.name}**: ${body}`)).catch(() => {});
    return { kind };
  }

  async function revokeRecord(actorId, input) {
    const { org, perms } = await economy.accessTo(actorId, input.orgId);
    if (!perms.discipline) throw new Error("Your rank cannot edit member files.");
    const record = await db.one("SELECT id,discord_id,kind FROM org_member_records WHERE id=? AND org_id=? AND revoked_at IS NULL", [Number(input.recordId), org.id]);
    if (!record) throw new Error("That record no longer exists.");
    if (["promotion", "demotion"].includes(record.kind)) throw new Error("Rank history cannot be revoked.");
    await assertReach(org, perms, actorId, record.discord_id, "edit the file of");
    await db.query("UPDATE org_member_records SET revoked_by=?,revoked_at=? WHERE id=?", [String(actorId), Date.now(), record.id]);
    await log(org.id, actorId, "record_revoke", record.discord_id, { kind: record.kind });
    return { kind: record.kind };
  }

  async function postAnnouncement(actorId, input) {
    const { org, perms } = await economy.accessTo(actorId, input.orgId);
    if (!perms.announce) throw new Error("Your rank cannot post announcements.");
    const title = line(input.title, 120);
    const body = text(input.body, 2000);
    if (title.length < 3 || body.length < 3) throw new Error("Give the announcement a title and a message.");
    const id = Number(input.announcementId) || 0;
    if (id) {
      const result = await db.query("UPDATE org_announcements SET title=?,body=?,pinned=? WHERE id=? AND org_id=?", [title, body, flag(input.pinned), id, org.id]);
      if (!result.affectedRows) throw new Error("That announcement no longer exists.");
    } else {
      const [count] = await db.query("SELECT COUNT(*) n FROM org_announcements WHERE org_id=?", [org.id]);
      if (Number(count?.n || 0) >= 200) await db.query("DELETE FROM org_announcements WHERE org_id=? AND pinned=FALSE ORDER BY id LIMIT 1", [org.id]);
      await db.query("INSERT INTO org_announcements(org_id,title,body,pinned,author_id,created_at) VALUES(?,?,?,?,?,?)", [org.id, title, body, flag(input.pinned), String(actorId), Date.now()]);
    }
    await log(org.id, actorId, id ? "announcement_edit" : "announcement", null, { title });
    return { title };
  }

  async function deleteAnnouncement(actorId, input) {
    const { org, perms } = await economy.accessTo(actorId, input.orgId);
    if (!perms.announce) throw new Error("Your rank cannot remove announcements.");
    const result = await db.query("DELETE FROM org_announcements WHERE id=? AND org_id=?", [Number(input.announcementId), org.id]);
    if (!result.affectedRows) throw new Error("That announcement no longer exists.");
    return { removed: true };
  }

  /** Leadership with the announce permission plans events; members answer them. */
  async function saveEvent(actorId, input) {
    const { org, perms } = await economy.accessTo(actorId, input.orgId);
    if (!perms.announce) throw new Error("Your rank cannot plan events.");
    const title = line(input.title, 80);
    if (title.length < 3) throw new Error("Give the event a title.");
    const description = text(input.description, 1000);
    const location = line(input.location, 80);
    const id = Number(input.eventId) || 0;
    const startsAt = cleanEventTime(input.startsAt, Date.now(), Boolean(id));
    if (id) {
      const result = await db.query("UPDATE org_events SET title=?,description=?,location=?,starts_at=? WHERE id=? AND org_id=? AND cancelled_at IS NULL", [title, description || null, location || null, startsAt, id, org.id]);
      if (!result.affectedRows) throw new Error("That event no longer exists.");
    } else {
      const [count] = await db.query("SELECT COUNT(*) n FROM org_events WHERE org_id=? AND cancelled_at IS NULL AND starts_at>=?", [org.id, Date.now()]);
      if (Number(count?.n || 0) >= MAX_UPCOMING_EVENTS) throw new Error(`Cancel an event first: up to ${MAX_UPCOMING_EVENTS} can be upcoming.`);
      await db.query("INSERT INTO org_events(org_id,title,description,location,starts_at,created_by,created_at) VALUES(?,?,?,?,?,?,?)", [org.id, title, description || null, location || null, startsAt, String(actorId), Date.now()]);
    }
    await log(org.id, actorId, id ? "event_edit" : "event", null, { title, startsAt });
    return { title };
  }

  async function cancelEvent(actorId, input) {
    const { org, perms } = await economy.accessTo(actorId, input.orgId);
    if (!perms.announce) throw new Error("Your rank cannot cancel events.");
    const row = await db.one("SELECT title FROM org_events WHERE id=? AND org_id=? AND cancelled_at IS NULL", [Number(input.eventId), org.id]);
    if (!row) throw new Error("That event no longer exists.");
    await db.query("UPDATE org_events SET cancelled_at=? WHERE id=? AND org_id=?", [Date.now(), Number(input.eventId), org.id]);
    await log(org.id, actorId, "event_cancel", null, { title: row.title });
    return { title: row.title };
  }

  async function rsvpEvent(actorId, input) {
    const { org, perms } = await economy.accessTo(actorId, input.orgId);
    if (!perms.member && !perms.full) throw new Error("Only members can answer event invitations.");
    const response = String(input.response || "");
    if (response !== "clear" && !EVENT_RESPONSES[response]) throw new Error("Choose going, maybe or can't make it.");
    const event = await db.one("SELECT id,starts_at FROM org_events WHERE id=? AND org_id=? AND cancelled_at IS NULL", [Number(input.eventId), org.id]);
    if (!event) throw new Error("That event no longer exists.");
    if (Number(event.starts_at) < Date.now() - 12 * 3600000) throw new Error("That event is over.");
    if (response === "clear") await db.query("DELETE FROM org_event_rsvps WHERE event_id=? AND discord_id=?", [event.id, String(actorId)]);
    else await db.query("INSERT INTO org_event_rsvps(event_id,org_id,discord_id,response,updated_at) VALUES(?,?,?,?,?) ON DUPLICATE KEY UPDATE response=VALUES(response),updated_at=VALUES(updated_at)", [event.id, org.id, String(actorId), response, Date.now()]);
    return { response };
  }

  /** Anyone signed in may apply to an organization that is recruiting. */
  async function apply(actorId, input) {
    const org = await activeOrg(input.orgId);
    const profile = await profileOf(org.id);
    if (!profile.recruiting) throw new Error(`${org.name} is not recruiting right now.`);
    if (await db.one("SELECT 1 ok FROM organization_members WHERE org_id=? AND discord_id=?", [org.id, String(actorId)])) throw new Error(`You are already in ${org.name}.`);
    if (await db.one("SELECT 1 ok FROM org_applications WHERE org_id=? AND discord_id=? AND status='pending'", [org.id, String(actorId)])) throw new Error(`You already have a pending application to ${org.name}.`);
    const recent = await db.one("SELECT reviewed_at FROM org_applications WHERE org_id=? AND discord_id=? AND status='denied' ORDER BY id DESC LIMIT 1", [org.id, String(actorId)]);
    if (recent?.reviewed_at && Date.now() - Number(recent.reviewed_at) < 3 * 86400000) throw new Error("You can apply again 3 days after a denied application.");
    const raw = Array.isArray(input.answers) ? input.answers : [];
    const answers = profile.questions.map((question, index) => ({ question, answer: text(raw[index], 1000) }));
    if (answers.some((row) => row.answer.length < 2)) throw new Error("Answer every question.");
    await db.query("INSERT INTO org_applications(org_id,discord_id,answers,status,created_at) VALUES(?,?,?,'pending',?)", [org.id, String(actorId), JSON.stringify(answers), Date.now()]);
    await audit(actorId, "organization.apply", org.id, {});
    await log(org.id, actorId, "application", actorId, {});
    return { org: org.name };
  }

  async function withdrawApplication(actorId, input) {
    const result = await db.query("UPDATE org_applications SET status='withdrawn',reviewed_at=? WHERE id=? AND discord_id=? AND status='pending'", [Date.now(), Number(input.applicationId), String(actorId)]);
    if (!result.affectedRows) throw new Error("That application is no longer pending.");
    return { withdrawn: true };
  }

  async function reviewApplication(actorId, input) {
    const { org, perms } = await economy.accessTo(actorId, input.orgId);
    if (!perms.applications) throw new Error("Your rank cannot review applications.");
    const decision = String(input.decision || "");
    if (!["accepted", "denied"].includes(decision)) throw new Error("Accept or deny the application.");
    const application = await db.one("SELECT id,discord_id FROM org_applications WHERE id=? AND org_id=? AND status='pending'", [Number(input.applicationId), org.id]);
    if (!application) throw new Error("That application is no longer pending.");
    const note = text(input.note, 500);
    await db.query("UPDATE org_applications SET status=?,reviewer_id=?,review_note=?,reviewed_at=? WHERE id=?", [decision, String(actorId), note || null, Date.now(), application.id]);
    await audit(actorId, "organization.application_review", org.id, { applicant: application.discord_id, decision });
    await log(org.id, actorId, `application_${decision}`, application.discord_id, {});
    const profile = await profileOf(org.id);
    const message = decision === "accepted"
      ? `✅ Your application to **${org.name}** was accepted!${note ? `\n> ${note}` : ""}${profile.discordInvite ? `\nJoin their Discord: ${profile.discordInvite}` : ""}\nLeadership will give you the organization's role.`
      : `Your application to **${org.name}** was not accepted this time.${note ? `\n> ${note}` : ""}`;
    const dm = await client.users.fetch(String(application.discord_id)).then((user) => user.send(message)).then(() => true).catch(() => false);
    return { decision, dm };
  }

  /** What anyone can see about an organization: profile, divisions and (if public) the roster. */
  async function publicOrg(ref) {
    const org = await activeOrg(ref);
    const profile = await profileOf(org.id);
    const [divisions, ranks] = await Promise.all([
      divisionsOf(org.id),
      db.query("SELECT id,name,level,color FROM org_ranks WHERE org_id=? ORDER BY level DESC,name", [org.id]),
    ]);
    let roster = [];
    if (profile.publicRoster) {
      const rows = await db.query(
        `SELECT m.discord_id,m.manager,m.rank_id,p.callsign,p.division_id,p.status,
                COALESCE(MAX(s.ended_at IS NULL AND s.heartbeat_at>=?),0) on_duty
           FROM organization_members m
           LEFT JOIN org_member_profiles p ON p.org_id=m.org_id AND p.discord_id=m.discord_id
           LEFT JOIN organization_shifts s ON s.org_id=m.org_id AND s.discord_id=m.discord_id AND s.ended_at IS NULL
          WHERE m.org_id=? GROUP BY m.discord_id,m.manager,m.rank_id,p.callsign,p.division_id,p.status LIMIT 300`,
        [Date.now() - 180000, org.id],
      );
      const people = await resolvePeople(rows.map((row) => row.discord_id), { fetchLimit: 30 });
      roster = rows.map((row) => ({
        name: people[row.discord_id]?.name || "Member", avatar: people[row.discord_id]?.avatar || null,
        leader: flag(row.manager), rankId: row.rank_id == null ? null : Number(row.rank_id),
        callsign: row.callsign || null, divisionId: row.division_id == null ? null : Number(row.division_id),
        status: row.status || "active", onDuty: flag(row.on_duty),
      }));
    }
    return {
      org: { id: Number(org.id), slug: org.slug, name: org.name, type: org.type, color: org.color, logo: (await logos.version(org.id)) || null },
      profile: { tagline: profile.tagline, about: profile.about, discordInvite: profile.discordInvite, recruiting: profile.recruiting, questions: profile.recruiting ? profile.questions : [], publicRoster: profile.publicRoster },
      divisions, ranks: ranks.map((row) => ({ id: Number(row.id), name: row.name, level: Number(row.level), color: row.color || null })), roster,
    };
  }

  /** Recruiting and tagline per organization for the public directory. */
  async function directoryExtras() {
    const rows = await db.query("SELECT org_id,tagline,recruiting FROM org_profiles").catch(() => []);
    return new Map(rows.map((row) => [Number(row.org_id), { tagline: row.tagline || "", recruiting: Boolean(Number(row.recruiting)) }]));
  }

  /** Roster as CSV for members of the organization. */
  async function rosterCsv(actorId, orgRef) {
    const data = await economy.portalData(actorId);
    const found = await activeOrg(orgRef);
    const detail = (data.organizations || []).find((row) => Number(row.id) === Number(found.id));
    if (!detail) throw new Error("You are not a member of that organization.");
    await enrich(detail);
    const people = await resolvePeople((detail.roster || []).map((row) => row.discord_id), { fetchLimit: 60 });
    const division = new Map((detail.divisions || []).map((row) => [row.id, row.name]));
    const header = ["Name", "Username", "Discord ID", "Rank", "Callsign", "Division", "Status", "Hours (7d)", "On duty", "Last shift", "Joined"];
    const lines = (detail.roster || []).map((row) => [
      people[row.discord_id]?.name || "", people[row.discord_id]?.username || "", row.discord_id,
      row.owner ? "Owner" : row.command ? "Command" : row.rank, row.callsign || "", division.get(row.division_id) || "",
      MEMBER_STATUSES[row.status] || row.status, (Number(row.week_seconds || 0) / 3600).toFixed(1), row.on_duty ? "yes" : "no",
      row.last_shift ? new Date(row.last_shift).toISOString() : "", row.added_at ? new Date(row.added_at).toISOString() : "",
    ]);
    await audit(actorId, "organization.roster_export", found.id, { rows: lines.length });
    return { filename: `${found.slug || "roster"}-roster.csv`, body: [header, ...lines].map((row) => row.map(csvField).join(",")).join("\r\n") };
  }

  /** Upload a logo (a data: URL the website already scaled down) or remove it. */
  async function setLogo(actorId, input) {
    const { org, perms } = await economy.accessTo(actorId, input.orgId);
    if (!perms.profile) throw new Error("Your rank cannot change the organization logo.");
    const version = await logos.save(org.id, decodeDataUrl(input.image), actorId);
    await log(org.id, actorId, "logo", null, {});
    return { logo: version };
  }

  async function removeLogo(actorId, input) {
    const { org, perms } = await economy.accessTo(actorId, input.orgId);
    if (!perms.profile) throw new Error("Your rank cannot change the organization logo.");
    await logos.remove(org.id, actorId);
    await log(org.id, actorId, "logo_remove", null, {});
    return { logo: null };
  }

  return {
    setLogo, removeLogo, enrich, peopleIn, myApplications, memberFile, publicOrg, directoryExtras, rosterCsv,
    saveProfile, saveDivision, deleteDivision, setMemberProfile, addRecord, revokeRecord,
    postAnnouncement, deleteAnnouncement, apply, withdrawApplication, reviewApplication,
    saveEvent, cancelEvent, rsvpEvent,
  };
}
