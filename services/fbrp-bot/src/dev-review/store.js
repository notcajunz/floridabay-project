import { createHash, randomBytes } from "node:crypto";
import { SFTP_BRANCH, SFTP_REPO, STATUS } from "./config.js";

const now = () => Date.now();
const parse = (value, fallback) => {
  if (value == null || value === "") return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

/** Row shape the portal and the Discord DM both use. The large diff text is only returned for one row. */
export function present(row, { detail = false } = {}) {
  if (!row) return null;
  const out = {
    id: row.id,
    repo: row.repo,
    branch: row.branch,
    beforeSha: row.before_sha,
    headSha: row.head_sha,
    pusher: row.pusher,
    commitCount: Number(row.commit_count),
    title: row.title,
    compareUrl: row.compare_url,
    status: row.status,
    risk: row.risk,
    staticRisk: row.static_risk,
    aiModel: row.ai_model,
    analysisError: row.analysis_error,
    notifiedAt: row.notified_at ? Number(row.notified_at) : null,
    decidedBy: row.decided_by,
    decidedAt: row.decided_at ? Number(row.decided_at) : null,
    decisionNote: row.decision_note,
    agent: row.agent,
    runStartedAt: row.run_started_at ? Number(row.run_started_at) : null,
    runFinishedAt: row.run_finished_at ? Number(row.run_finished_at) : null,
    runExit: row.run_exit == null ? null : Number(row.run_exit),
    resultSummary: row.result_summary,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    analysis: parse(row.analysis, null),
    flags: parse(row.flags, []),
    files: parse(row.files, []),
  };
  if (detail) out.diffExcerpt = row.diff_excerpt || "";
  return out;
}

export function createStore(db) {
  return {

    /** A transfer from the dev server. The owner pressed the button, so it is decided from the start. */
    async createTransfer({ actorId, agent, model = "", note = "" }) {
      const stamp = now();
      const head = createHash("sha1").update(randomBytes(16)).digest("hex");
      const result = await db.query(
        `INSERT INTO dev_submissions(repo,branch,before_sha,head_sha,pusher,commit_count,title,compare_url,status,agent,ai_model,decision_note,decided_by,decided_at,created_at,updated_at)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [SFTP_REPO, SFTP_BRANCH, "0".repeat(40), head, "dev-server", 1, "Dev server transfer", "", STATUS.transferring, agent, model || null, String(note).slice(0, 1000), String(actorId), stamp, stamp, stamp],
      );
      return result.insertId;
    },
    activeTransfer() {
      return db.one("SELECT id FROM dev_submissions WHERE repo=? AND status IN (?,?,?) LIMIT 1", [SFTP_REPO, STATUS.transferring, STATUS.accepted, STATUS.implementing]);
    },
    async finishTransfer(id, { files, summary }) {
      const empty = files.length === 0;
      const title = empty ? "Dev server transfer (no changes)" : `Dev server transfer (${files.length} file${files.length === 1 ? "" : "s"})`;
      await db.query(
        `UPDATE dev_submissions SET status=?,title=?,files=?,run_finished_at=?,result_summary=?,result_notified_at=?,updated_at=? WHERE id=? AND status=?`,
        [empty ? STATUS.implemented : STATUS.accepted, title, JSON.stringify(files), empty ? now() : null, empty ? summary : null, empty ? now() : null, now(), id, STATUS.transferring],
      );
    },
    failTransfer(id, message) {
      return db.query(
        "UPDATE dev_submissions SET status=?,run_finished_at=?,run_exit=-1,result_summary=?,updated_at=? WHERE id=? AND status=?",
        [STATUS.failed, now(), String(message).slice(0, 2000), now(), id, STATUS.transferring],
      );
    },
    /** Rows from the removed GitHub review that were still waiting for a decision can never be integrated. */
    retireGithubRows() {
      return db.query(
        "UPDATE dev_submissions SET status='declined',decision_note=?,updated_at=? WHERE repo<>? AND status IN ('queued','analyzing','awaiting_review','analysis_failed','accepted')",
        ["The GitHub review was removed, so this submission was closed.", now(), SFTP_REPO],
      );
    },
    /** A transfer the bot lost track of (restart while it was running) is marked failed. */
    abandonTransfers(olderThanMs = 15 * 60_000) {
      return db.query(
        "UPDATE dev_submissions SET status=?,run_finished_at=?,run_exit=-1,result_summary=?,updated_at=? WHERE repo=? AND status=? AND updated_at<?",
        [STATUS.failed, now(), "The transfer did not finish. Start it again.", now(), SFTP_REPO, STATUS.transferring, now() - olderThanMs],
      );
    },





    async get(id, { detail = false, raw = false } = {}) {
      const row = await db.one("SELECT * FROM dev_submissions WHERE id=?", [id]);
      return raw ? row : present(row, { detail });
    },

    async list(limit = 60) {
      const rows = await db.query(
        `SELECT id,repo,branch,before_sha,head_sha,pusher,commit_count,title,compare_url,status,risk,static_risk,ai_model,analysis_error,notified_at,decided_by,decided_at,decision_note,agent,run_started_at,run_finished_at,run_exit,result_summary,created_at,updated_at,
                NULL AS analysis,NULL AS flags,NULL AS files
           FROM dev_submissions ORDER BY id DESC LIMIT ?`,
        [Math.min(200, Math.max(1, Number(limit) || 60))],
      );
      return rows.map((row) => present(row));
    },

    /** Finished implementations the owner has not been messaged about yet. */
    unreportedRuns() {
      return db.query("SELECT id FROM dev_submissions WHERE result_notified_at IS NULL AND status IN (?,?) ORDER BY id LIMIT 10", [STATUS.implemented, STATUS.failed]);
    },
    markRunReported: (id) => db.query("UPDATE dev_submissions SET result_notified_at=? WHERE id=?", [now(), id]),

    async startRun(id, logPath) {
      const result = await db.query(
        "UPDATE dev_submissions SET status=?,run_started_at=?,run_finished_at=NULL,run_exit=NULL,run_log_path=?,result_summary=NULL,result_notified_at=NULL,updated_at=? WHERE id=? AND status IN (?,?)",
        [STATUS.implementing, now(), logPath, now(), id, STATUS.accepted, STATUS.failed],
      );
      return result.affectedRows === 1;
    },
    finishRun(id, { exitCode, summary }) {
      return db.query(
        "UPDATE dev_submissions SET status=?,run_finished_at=?,run_exit=?,result_summary=?,updated_at=? WHERE id=?",
        [exitCode === 0 ? STATUS.implemented : STATUS.failed, now(), exitCode, String(summary || "").slice(0, 8000), now(), id],
      );
    },
    /** A run the bot lost track of (restart while it was running) is marked failed. */
    abandonRuns() {
      return db.query(
        "UPDATE dev_submissions SET status=?,run_finished_at=?,run_exit=-1,result_summary=?,updated_at=? WHERE status=?",
        [STATUS.failed, now(), "The bot restarted while this implementation was running. Check the log and the repository before retrying.", now(), STATUS.implementing],
      );
    },
    runLogPath: async (id) => (await db.one("SELECT run_log_path FROM dev_submissions WHERE id=?", [id]))?.run_log_path || null,
  };
}
