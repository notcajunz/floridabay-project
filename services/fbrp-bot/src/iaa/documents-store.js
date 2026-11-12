import { db } from "../database.js";

/** SQL storage behind the IAA documents service (see documents.js for the rules that use it). */
export function sqlDocumentRepo(database = db) {
  return {
    rosterMembers: () => database.query("SELECT discord_id,username,callsign,rank_role_id,status,joined_at,rank_changed_at FROM iaa_members WHERE status<>'removed'"),
    employeeStats: () =>
      database.query(
        `SELECT m.discord_id,m.username,m.callsign,m.rank_role_id,m.status,m.joined_at,m.rank_changed_at,
           (SELECT COUNT(*) FROM iaa_discipline d WHERE d.discord_id=m.discord_id AND d.kind='warning') warnings,
           (SELECT COUNT(*) FROM iaa_discipline d WHERE d.discord_id=m.discord_id AND d.kind='strike' AND d.active=1) strikes,
           (SELECT COUNT(*) FROM iaa_discipline d WHERE d.discord_id=m.discord_id AND d.kind='suspension') suspensions,
           (SELECT COUNT(*) FROM iaa_cases c WHERE c.lead_id=m.discord_id) cases_led,
           (SELECT COUNT(*) FROM iaa_awards a WHERE a.discord_id=m.discord_id) awards,
           (SELECT MAX(l.ends_at) FROM iaa_leaves l WHERE l.discord_id=m.discord_id AND l.status='approved' AND l.ends_at>?) leave_until
         FROM iaa_members m WHERE m.status<>'removed'`,
        [Date.now()],
      ),
    rosterMember: (discordId) => database.one("SELECT discord_id,status,rank_role_id FROM iaa_members WHERE discord_id=?", [String(discordId)]),

    getDocument: (key) => database.one("SELECT * FROM iaa_documents WHERE doc_key=?", [key]),
    saveDocument: (d) =>
      database.query(
        `INSERT INTO iaa_documents(doc_key,kind,title,google_id,created_by,created_at) VALUES(?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE kind=VALUES(kind),title=VALUES(title),google_id=VALUES(google_id),content_hash=NULL,synced_at=NULL`,
        [d.doc_key, d.kind, d.title, d.google_id, d.created_by, d.created_at],
      ),
    touchDocument: (key, hash, at) => database.query("UPDATE iaa_documents SET content_hash=?,synced_at=? WHERE doc_key=?", [hash, at, key]),

    activeGrants: ({ docKey = null, discordId = null }) =>
      database.query(
        `SELECT * FROM iaa_doc_access WHERE revoked_at IS NULL AND revoke_pending=0${docKey ? " AND doc_key=?" : ""}${discordId ? " AND discord_id=?" : ""} ORDER BY id`,
        [docKey, discordId].filter(Boolean).map(String),
      ),
    pendingRevocations: () => database.query("SELECT * FROM iaa_doc_access WHERE revoked_at IS NULL AND revoke_pending=1"),
    async addGrant(g) {
      const result = await database.query(
        "INSERT INTO iaa_doc_access(doc_key,discord_id,email,level,permission_id,granted_by,granted_at) VALUES(?,?,?,?,?,?,?)",
        [g.doc_key, g.discord_id, g.email, g.level, g.permission_id, g.granted_by, g.granted_at],
      );
      return { id: result.insertId, ...g };
    },
    markRevoked: (id, { by, reason, at }) =>
      database.query("UPDATE iaa_doc_access SET revoked_at=?,revoked_by=?,revoke_reason=?,revoke_pending=0 WHERE id=?", [at, String(by), String(reason).slice(0, 190), id]),
    markRevokePending: (id, { by, reason }) =>
      database.query("UPDATE iaa_doc_access SET revoke_pending=1,revoked_by=?,revoke_reason=? WHERE id=?", [String(by), String(reason).slice(0, 190), id]),

    altRecords: ({ main = null, alt = null } = {}) =>
      database.query(`SELECT * FROM iaa_alt_records WHERE status='active'${main ? " AND main_discord_id=?" : ""}${alt ? " AND alt_discord_id=?" : ""} ORDER BY id`, [main, alt].filter(Boolean).map(String)),
    async upsertAlt({ main, alt, username, evidence, source, actorId, at }) {
      await database.query(
        `INSERT INTO iaa_alt_records(main_discord_id,alt_discord_id,alt_username,source,evidence,status,added_by,created_at,updated_at) VALUES(?,?,?,?,?,'active',?,?,?)
         ON DUPLICATE KEY UPDATE alt_username=COALESCE(VALUES(alt_username),alt_username),evidence=COALESCE(VALUES(evidence),evidence),status='active',updated_at=VALUES(updated_at)`,
        [main, alt, username, source, evidence, String(actorId), at, at],
      );
      return database.one("SELECT * FROM iaa_alt_records WHERE main_discord_id=? AND alt_discord_id=?", [main, alt]);
    },
    async clearAlt({ main, alt, at }) {
      const result = await database.query("UPDATE iaa_alt_records SET status='cleared',updated_at=? WHERE main_discord_id=? AND alt_discord_id=? AND status='active'", [at, main, alt]);
      return result.affectedRows > 0;
    },
  };
}
