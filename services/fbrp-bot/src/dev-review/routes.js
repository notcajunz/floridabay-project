import { AGENTS, canTransfer, INSTRUCTION_LIMIT, isApprover, STATUS, transferEfforts, transferModels } from "./config.js";
import { logTail, runnerReady } from "./implement.js";
import { runTransfer, sftpConfigured } from "./sftp-transfer.js";
import { createStore } from "./store.js";

/**
 * HTTP side of the dev server transfers. Every route belongs to the owner; starting a transfer is further limited to
 * the one account in TRANSFER_USER_ID. The Discord bot has no route here.
 */
export function createDevReviewRoutes({ db, audit, transfer = runTransfer }) {
  const store = createStore(db);

  async function overview(session) {
    return {
      approver: true,
      config: {
        runner: await runnerReady(),
        agents: AGENTS,
        sftp: sftpConfigured(),
        canTransfer: canTransfer(session.id),
        models: transferModels(),
        efforts: transferEfforts(),
        instructionLimit: INSTRUCTION_LIMIT,
      },
      submissions: await store.list(80),
    };
  }

  /** Returns true when the request was one of ours. */
  async function handle({ request, response, url, session, readJson, sendJson }) {
    if (!url.pathname.startsWith("/api/dev-review/")) return false;
    if (!session) {
      sendJson(response, 401, { error: "Sign in with Discord to continue." });
      return true;
    }
    if (!isApprover(session.id)) {
      await audit(session.id, "devreview.denied", url.pathname, {});
      sendJson(response, 403, { error: "Dev review is only available to the server owner." });
      return true;
    }

    if (request.method === "GET" && url.pathname === "/api/dev-review/list") {
      sendJson(response, 200, await overview(session));
      return true;
    }
    if (request.method === "GET" && url.pathname === "/api/dev-review/item") {
      const id = Number(url.searchParams.get("id"));
      if (!Number.isSafeInteger(id) || id < 1) return sendJson(response, 400, { error: "Choose a transfer." }), true;
      const item = await store.get(id, { detail: true });
      if (!item) return sendJson(response, 404, { error: "Transfer not found." }), true;
      const running = [STATUS.implementing, STATUS.implemented, STATUS.failed].includes(item.status);
      sendJson(response, 200, { submission: item, log: running ? await logTail(id) : "" });
      return true;
    }
    if (request.method !== "POST") {
      sendJson(response, 405, { error: "Method not allowed." });
      return true;
    }

    if (url.pathname === "/api/dev-review/transfer") {
      if (!canTransfer(session.id)) {
        await audit(session.id, "devreview.transfer.denied", 0, {});
        return sendJson(response, 403, { error: "Only the designated account can start a dev server transfer." }), true;
      }
      const body = await readJson();
      const agent = String(body.agent || "");
      if (!AGENTS.includes(agent)) return sendJson(response, 400, { error: "Choose Claude or Codex to integrate the changes." }), true;
      const model = String(body.model || "").trim();
      if (model && !transferModels()[agent].includes(model)) return sendJson(response, 400, { error: "That model is not available for the chosen agent." }), true;
      const effort = String(body.effort || "").trim();
      if (effort && !transferEfforts()[agent].includes(effort)) return sendJson(response, 400, { error: "That effort level is not available for the chosen agent." }), true;
      const instructions = String(body.instructions || "").trim();
      if (instructions.length > INSTRUCTION_LIMIT) return sendJson(response, 400, { error: `Instructions can be at most ${INSTRUCTION_LIMIT} characters.` }), true;
      if (!sftpConfigured()) return sendJson(response, 503, { error: "The dev server SFTP login is not configured on the control server." }), true;
      if (await store.activeTransfer()) return sendJson(response, 409, { error: "A dev server transfer is already running." }), true;
      const id = await store.createTransfer({ actorId: session.id, agent, model, note: instructions });
      await audit(session.id, "devreview.transfer", id, { agent, model: model || "default", effort: effort || "default", instructions: instructions.length });
      Promise.resolve()
        .then(() => transfer({ id, instructions, options: { model, effort } }))
        .then((result) => store.finishTransfer(id, { files: result.files, summary: "The dev server has no changes since the last transfer." }))
        .catch((error) => store.failTransfer(id, error.message));
      sendJson(response, 202, { ok: true, id });
      return true;
    }

    if (url.pathname === "/api/dev-review/retry") {
      const input = await readJson();
      const id = Number(input.id);
      const item = Number.isSafeInteger(id) && id > 0 ? await store.get(id) : null;
      if (!item) return sendJson(response, 404, { error: "Transfer not found." }), true;
      if (!canTransfer(session.id)) return sendJson(response, 403, { error: "Only the designated account can retry a transfer." }), true;
      if (item.status !== STATUS.failed || !item.files.length) return sendJson(response, 409, { error: "Only a failed integration can be retried. A failed pull needs a new transfer." }), true;
      const agent = AGENTS.includes(String(input.agent)) ? String(input.agent) : item.agent;
      await db.query("UPDATE dev_submissions SET status=?,agent=?,result_notified_at=NULL,updated_at=? WHERE id=? AND status=?", [STATUS.accepted, agent, Date.now(), id, STATUS.failed]);
      await audit(session.id, "devreview.retry", id, { agent });
      sendJson(response, 200, { ok: true });
      return true;
    }
    sendJson(response, 404, { error: "Unknown dev review action." });
    return true;
  }

  return { handle, store };
}
