import { collectMembers } from "./altscan-members.js";

/**
 * The main bot's side of /intel alt-scan. The IAA bot is only in the IAA and main servers, so it
 * writes a job naming the other network servers to iaa_altscan_jobs and this bot, which is in every
 * network server, reads their members and writes them to iaa_altscan_members for the IAA bot to score.
 */
const STALE_MS = 20 * 60000;
const INSERT_BATCH = 500;

export function createAltScanQueue({ client, db }) {
  let running = false;
  let timer = null;

  async function run(job) {
    const ids = JSON.parse(job.guild_ids);
    const guilds = ids.map((id) => client.guilds.cache.get(String(id))).filter(Boolean);
    const missing = ids.filter((id) => !client.guilds.cache.has(String(id)));
    let done = 0;
    const { members, problems } = await collectMembers(guilds, {
      onGuild: async (guild, size) => {
        done++;
        await db.query("UPDATE iaa_altscan_jobs SET progress=? WHERE id=?", [`${done}/${guilds.length} servers read (${guild.name}: ${size})`.slice(0, 255), job.id]);
      },
    });
    for (const id of missing) problems.push(`${id}: the main bot is not in this server`);
    const rows = [...members.values()].map((m) => [job.id, m.id, m.username?.slice(0, 64) ?? null, m.display?.slice(0, 64) ?? null, m.defaultAvatar ? 1 : 0, m.servers]);
    for (let i = 0; i < rows.length; i += INSERT_BATCH)
      await db.query("INSERT INTO iaa_altscan_members(job_id,discord_id,username,display,default_avatar,servers) VALUES ?", [rows.slice(i, i + INSERT_BATCH)]);
    await db.query("UPDATE iaa_altscan_jobs SET status='done', progress=?, problems=?, finished_at=? WHERE id=?", [
      `${rows.length} members from ${guilds.length} servers`,
      problems.length ? problems.join("\n").slice(0, 4000) : null,
      Date.now(),
      job.id,
    ]);
  }

  async function tick() {
    if (running) return;
    running = true;
    try {
      const now = Date.now();
      await db.query("UPDATE iaa_altscan_jobs SET status='failed', problems='The main bot stopped before finishing.', finished_at=? WHERE status='running' AND started_at<?", [now, now - STALE_MS]);
      await db.query("DELETE FROM iaa_altscan_members WHERE job_id IN (SELECT id FROM iaa_altscan_jobs WHERE finished_at IS NOT NULL AND finished_at<?)", [now - 86400000]);
      const job = await db.one("SELECT * FROM iaa_altscan_jobs WHERE status='queued' ORDER BY requested_at LIMIT 1");
      if (!job) return;
      const claimed = await db.query("UPDATE iaa_altscan_jobs SET status='running', started_at=? WHERE id=? AND status='queued'", [now, job.id]);
      if (!claimed.affectedRows) return;
      try {
        await run(job);
      } catch (error) {
        console.error("[FBRP alt-scan queue]", error);
        await db.query("UPDATE iaa_altscan_jobs SET status='failed', problems=?, finished_at=? WHERE id=?", [String(error.message || error).slice(0, 1000), Date.now(), job.id]);
      }
    } catch (error) {
      console.error("[FBRP alt-scan queue]", error.message || error);
    } finally {
      running = false;
    }
  }

  function start() {
    if (timer) return;
    timer = setInterval(() => void tick(), 5000);
    timer.unref?.();
  }

  return { start, tick };
}
