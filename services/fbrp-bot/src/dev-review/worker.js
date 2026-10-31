import { REVIEW_APPROVER_ID, STATUS } from "./config.js";
import { runComponents, runEmbed } from "./embed.js";
import { launchRunner, reconcileRun, runnerReady } from "./implement.js";
import { commitBaseline, SFTP_REPO, stageTransfer } from "./sftp-transfer.js";
import { createStore } from "./store.js";

/**
 * Runs inside the FBRP | DevOps bot. It drives accepted dev server transfers through the runner script and DMs the owner
 * the result. It never starts or decides anything: transfers are only started from the portal.
 */
export function startDevReviewWorker(client, { db, intervalMs = 20_000, log = console } = {}) {
  const store = createStore(db);
  let busy = false;

  async function dm(payload) {
    const user = await client.users.fetch(REVIEW_APPROVER_ID);
    return user.send(payload);
  }

  async function drive() {
    const running = (await store.list(50)).filter((item) => item.status === STATUS.implementing);
    await store.abandonTransfers();
    await store.retireGithubRows();
    for (const item of running) {
      if (!(await reconcileRun(item, store)) || item.repo !== SFTP_REPO) continue;
      const finished = await store.get(item.id);
      if (finished.status === STATUS.implemented) await commitBaseline(item.id).catch((error) => log.warn?.(`[DevReview] baseline update for #${item.id} failed: ${error.message}`));
    }
    const stillRunning = (await store.list(50)).some((item) => item.status === STATUS.implementing);
    if (stillRunning || !(await runnerReady())) return;
    const next = (await store.list(50)).filter((item) => item.status === STATUS.accepted && item.repo === SFTP_REPO).sort((a, b) => a.id - b.id)[0];
    if (!next) return;
    const detail = await store.get(next.id, { detail: true });
    try {
      await stageTransfer(detail);
      if (!(await store.startRun(next.id, `run.log`))) return;
      await launchRunner(detail);
    } catch (error) {
      log.warn?.(`[DevReview] could not start #${next.id}: ${error.message}`);
      await store.startRun(next.id, "run.log").catch(() => null);
      await store.finishRun(next.id, { exitCode: -1, summary: `Could not start the runner: ${error.message}` });
    }
  }

  async function reportRuns() {
    for (const { id } of await store.unreportedRuns()) {
      const item = await store.get(id);
      try {
        await dm({ embeds: [runEmbed(item)], components: runComponents(item) });
        await store.markRunReported(id);
      } catch (error) {
        log.warn?.(`[DevReview] could not DM the run result of #${id}: ${error.message}`);
        return;
      }
    }
  }

  async function tick() {
    if (busy) return;
    busy = true;
    try {
      await drive();
      await reportRuns();
    } catch (error) {
      log.warn?.(`[DevReview] tick failed: ${error.message}`);
    } finally {
      busy = false;
    }
  }

  const timer = setInterval(tick, intervalMs);
  timer.unref?.();
  setTimeout(tick, 5_000).unref?.();
  return { tick, stop: () => clearInterval(timer), store };
}
