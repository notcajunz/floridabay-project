/**
 * Organization membership and duty history for one Discord account. Past organizations remain
 * visible when the member has clocked shifts there, even if they are no longer on the roster.
 */
export async function organizationActivity(db, discordId, stamp = Date.now()) {
  const duration = "CASE WHEN s.ended_at IS NULL THEN GREATEST(0,FLOOR((s.heartbeat_at-s.started_at)/1000)) ELSE s.seconds END";
  const rows = await db.query(
    `SELECT o.id,o.slug,o.name,o.type,o.active,m.rank_name,m.manager,
            COUNT(s.id) shift_count,
            COALESCE(SUM(CASE WHEN s.started_at>=? THEN ${duration} ELSE 0 END),0) week_seconds,
            COALESCE(SUM(CASE WHEN s.started_at>=? THEN ${duration} ELSE 0 END),0) month_seconds,
            COALESCE(SUM(${duration}),0) total_seconds,
            MAX(s.started_at) last_shift
       FROM organizations o
       LEFT JOIN organization_members m ON m.org_id=o.id AND m.discord_id=?
       LEFT JOIN organization_shifts s ON s.org_id=o.id AND s.discord_id=?
      WHERE m.discord_id IS NOT NULL OR s.discord_id IS NOT NULL
      GROUP BY o.id,o.slug,o.name,o.type,o.active,m.rank_name,m.manager
      ORDER BY o.active DESC,o.name`,
    [stamp - 7 * 86400000, stamp - 30 * 86400000, String(discordId), String(discordId)],
  );
  return rows.map((row) => ({
    id: Number(row.id),
    slug: row.slug,
    name: row.name,
    type: row.type,
    active: Boolean(Number(row.active)),
    member: row.rank_name !== null && row.rank_name !== undefined,
    rank: row.rank_name || null,
    manager: Boolean(Number(row.manager)),
    shifts: Number(row.shift_count || 0),
    weekSeconds: Number(row.week_seconds || 0),
    monthSeconds: Number(row.month_seconds || 0),
    totalSeconds: Number(row.total_seconds || 0),
    lastShift: row.last_shift ? Number(row.last_shift) : null,
  }));
}

const AUDIT_PUNISHMENTS = {
  "global.rolestrip": "Role strip",
  "global.unrolestrip": "Role strip lifted",
  "global.restore": "Restoration",
  "global.restore.applied": "Restoration applied",
};

/**
 * Every punishment-type record for one Discord account across all systems (moderation cases such
 * as bans, blacklists, mutes and kicks; staff, IAA and DevOps discipline; IAA investigations and
 * blacklist; role strips and restorations), newest first. A source that fails is skipped and named
 * in `failed` so one missing table never hides the rest.
 */
export async function punishmentHistory(db, discordId, { limit = 200 } = {}) {
  const id = String(discordId);
  const failed = [];
  const safe = async (name, run) => {
    try {
      return await run();
    } catch (error) {
      console.error(`[FBRP punishments] ${name}:`, error?.message || error);
      failed.push(name);
      return [];
    }
  };
  const num = (value) => (value === null || value === undefined ? null : Number(value));
  const [cases, staff, iaa, iaaCases, iaaBlacklist, devops, strips, audits] = await Promise.all([
    safe("moderation cases", () => db.query(
      "SELECT id,ban_id,guild_id,actor_id,action,reason,active,expires_at,created_at FROM moderation_cases WHERE target_id=? ORDER BY id DESC LIMIT 500", [id])),
    safe("staff discipline", () => db.query(
      "SELECT id,kind,reason,actor_id,created_at,revoked_at,revoke_reason FROM staff_roster_discipline WHERE discord_id=? ORDER BY id DESC LIMIT 200", [id])),
    safe("IAA discipline", () => db.query(
      "SELECT id,kind,reason,actor_id,case_id,created_at,expires_at,active,revoked_at,revoke_reason FROM iaa_discipline WHERE discord_id=? ORDER BY id DESC LIMIT 200", [id])),
    safe("IAA investigations", () => db.query(
      "SELECT id,reference,type,status,summary,opened_by,opened_at,closed_at,verdict,outcome FROM iaa_cases WHERE subject_id=? ORDER BY id DESC LIMIT 200", [id])),
    safe("IAA blacklist", () => db.query(
      "SELECT reason,actor_id,case_id,active,created_at,lifted_at,lift_reason FROM iaa_blacklist WHERE discord_id=?", [id])),
    safe("DevOps discipline", () => db.query(
      "SELECT id,kind,reason,actor_id,created_at,expires_at,active,revoked_at,revoke_reason FROM devops_discipline WHERE discord_id=? ORDER BY id DESC LIMIT 200", [id])),
    safe("role strips", () => db.query(
      "SELECT reason,stripped_by,stripped_at FROM global_role_strips WHERE discord_id=?", [id])),
    safe("audit trail", () => db.query(
      `SELECT id,actor_id,action,payload,created_at FROM audit_log WHERE target_id=? AND action IN (${Object.keys(AUDIT_PUNISHMENTS).map(() => "?").join(",")}) ORDER BY id DESC LIMIT 200`,
      [id, ...Object.keys(AUDIT_PUNISHMENTS)])),
  ]);

  const entries = [];
  const now = Date.now();
  for (const row of cases) {
    const lifting = /^un/.test(row.action);
    const expires = num(row.expires_at);
    entries.push({
      source: "moderation", ref: row.ban_id || `#${row.id}`, kind: row.action, scope: row.guild_id === "global" ? "network" : "server",
      reason: row.reason, actorId: row.actor_id, at: Number(row.created_at), expiresAt: expires,
      status: lifting ? "lifted" : !/^(ban|blacklist|timeout|mute)/.test(row.action) ? "recorded" : Number(row.active) ? (expires && expires < now ? "expired" : "active") : "ended",
    });
  }
  for (const row of staff) {
    entries.push({ source: "staff", ref: `#${row.id}`, kind: `staff ${row.kind}`, reason: row.reason, actorId: row.actor_id, at: Number(row.created_at), status: row.revoked_at ? "revoked" : "active", endedAt: num(row.revoked_at), endReason: row.revoke_reason });
  }
  for (const [source, rows, label] of [["iaa", iaa, "IAA"], ["devops", devops, "DevOps"]]) {
    for (const row of rows) {
      entries.push({ source, ref: `#${row.id}`, kind: `${label} ${row.kind}`, reason: row.reason, actorId: row.actor_id, at: Number(row.created_at), expiresAt: num(row.expires_at), status: row.revoked_at ? "revoked" : Number(row.active) ? "active" : "ended", endedAt: num(row.revoked_at), endReason: row.revoke_reason });
    }
  }
  for (const row of iaaCases) {
    entries.push({ source: "iaa", ref: row.reference || `#${row.id}`, kind: `IAA investigation (${row.type})`, reason: row.summary, actorId: row.opened_by, at: Number(row.opened_at), status: row.status === "closed" ? `closed${row.verdict ? ` · ${row.verdict}` : ""}${row.outcome ? ` · ${row.outcome}` : ""}` : row.status, endedAt: num(row.closed_at) });
  }
  for (const row of iaaBlacklist) {
    entries.push({ source: "iaa", ref: row.case_id ? `IAA case #${row.case_id}` : "IAA", kind: "IAA blacklist", reason: row.reason, actorId: row.actor_id, at: Number(row.created_at), status: Number(row.active) ? "active" : "lifted", endedAt: num(row.lifted_at), endReason: row.lift_reason });
  }
  let stripMarked = 0;
  for (const row of audits) {
    let payload = row.payload;
    if (typeof payload === "string") try { payload = JSON.parse(payload); } catch { payload = {}; }
    entries.push({ source: "audit", ref: `audit ${row.id}`, kind: AUDIT_PUNISHMENTS[row.action].toLowerCase(), reason: payload?.reason || "", actorId: row.actor_id, at: Number(row.created_at), status: row.action === "global.rolestrip" && strips.length && !stripMarked++ ? "active" : "recorded" });
  }
  if (strips.length && !stripMarked) {
    entries.push({ source: "moderation", ref: "global", kind: "role strip", reason: strips[0].reason, actorId: strips[0].stripped_by, at: Number(strips[0].stripped_at), status: "active" });
  }
  entries.sort((a, b) => b.at - a.at);
  return { entries: entries.slice(0, limit), total: entries.length, failed };
}

/**
 * Everything a Discord account owns or has been given in the game: personal vehicles (owned, and
 * ones they are trusted on), the liveries on those vehicles, liveries they installed, custom EUP
 * packs they added, and head/gang tags. A source that fails is skipped and named in `failed`.
 */
export async function ownedAssets(db, discordId) {
  const id = String(discordId);
  const failed = [];
  const safe = async (name, run) => {
    try {
      return await run();
    } catch (error) {
      console.error(`[FBRP owned assets] ${name}:`, error?.message || error);
      failed.push(name);
      return [];
    }
  };
  const [owned, trusted, liveries, installed, eup, tags] = await Promise.all([
    safe("personal vehicles", () => db.query(
      "SELECT id,model,label,plate,enabled FROM personal_vehicles WHERE owner_id=? ORDER BY label,id LIMIT 200", [id])),
    safe("trusted vehicles", () => db.query(
      `SELECT v.id,v.model,v.label,v.plate,v.owner_id FROM personal_vehicle_trust t
         JOIN personal_vehicles v ON v.id=t.personal_id WHERE t.discord_id=? ORDER BY v.label,v.id LIMIT 200`, [id])),
    safe("liveries", () => db.query(
      `SELECT l.id,l.label,l.personal_id,v.label vehicle FROM personal_liveries l
         JOIN personal_vehicles v ON v.id=l.personal_id WHERE v.owner_id=? ORDER BY v.label,l.label LIMIT 300`, [id])),
    safe("installed liveries", () => db.query(
      `SELECT l.id,l.label,l.personal_id,v.label vehicle FROM personal_liveries l
         JOIN personal_vehicles v ON v.id=l.personal_id WHERE l.added_by=? AND v.owner_id<>? ORDER BY v.label,l.label LIMIT 300`, [id, id])),
    safe("EUP packs", () => db.query(
      "SELECT id,name,label,file_count FROM custom_eup WHERE created_by=? ORDER BY label,id LIMIT 200", [id])),
    safe("tags", () => db.query(
      `SELECT DISTINCT h.id,h.kind,h.label FROM headtag_grants g JOIN headtags h ON h.id=g.tag_id
        WHERE g.discord_id=? ORDER BY h.kind,h.label LIMIT 100`, [id])),
  ]);
  const num = (row) => ({ ...row, id: Number(row.id) });
  return {
    personals: owned.map((row) => ({ ...num(row), enabled: Boolean(Number(row.enabled)) })),
    trusted: trusted.map(num),
    liveries: liveries.map((row) => ({ ...num(row), personal_id: Number(row.personal_id) })),
    installedLiveries: installed.map((row) => ({ ...num(row), personal_id: Number(row.personal_id) })),
    eup: eup.map((row) => ({ ...num(row), file_count: Number(row.file_count || 0) })),
    tags: tags.map(num),
    failed,
  };
}

/**
 * Invite tracker data for one Discord account: who invited them (newest join per server), the
 * members they brought in (newest first) and how many of those are still in the server. A failed
 * read is named in `failed` instead of failing the report.
 */
export async function inviteHistory(db, discordId, { limit = 100 } = {}) {
  const id = String(discordId);
  const failed = [];
  const safe = async (name, run, fallback) => {
    try {
      return await run();
    } catch (error) {
      console.error(`[FBRP invite history] ${name}:`, error?.message || error);
      failed.push(name);
      return fallback;
    }
  };
  const [joins, invited, totals] = await Promise.all([
    safe("joins", () => db.query(
      "SELECT guild_id,inviter_id,invite_code,method,joined_at,left_at FROM invite_tracker_joins WHERE member_id=? ORDER BY joined_at DESC LIMIT 50", [id]), []),
    safe("invited members", () => db.query(
      "SELECT guild_id,member_id,joined_at,left_at FROM invite_tracker_joins WHERE inviter_id=? ORDER BY joined_at DESC LIMIT ?", [id, limit]), []),
    safe("invite totals", () => db.one(
      "SELECT COUNT(*) total, COALESCE(SUM(left_at IS NULL),0) active FROM invite_tracker_joins WHERE inviter_id=?", [id]), null),
  ]);
  const seen = new Set();
  const invitedBy = [];
  for (const row of joins) {
    if (seen.has(String(row.guild_id))) continue;
    seen.add(String(row.guild_id));
    invitedBy.push({
      guildId: String(row.guild_id),
      inviterId: row.inviter_id ? String(row.inviter_id) : null,
      code: row.invite_code || null,
      method: row.method,
      joinedAt: Number(row.joined_at),
      leftAt: row.left_at ? Number(row.left_at) : null,
    });
  }
  const total = Number(totals?.total ?? 0);
  const active = Number(totals?.active ?? 0);
  return {
    invitedBy,
    invited: invited.map((row) => ({
      guildId: String(row.guild_id),
      memberId: String(row.member_id),
      joinedAt: Number(row.joined_at),
      leftAt: row.left_at ? Number(row.left_at) : null,
    })),
    totals: { total, active, left: total - active },
    failed,
  };
}
