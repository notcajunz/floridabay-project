import { can, config, db, demand, dm } from "./store.js";
import { C, EPHEMERAL, UserError, card, clip, line, mention, pages, respond, ts } from "./util.js";
import { refreshPanels } from "./panels.js";

export const STATUSES = {
  todo: { label: "To do", icon: "🔵" },
  doing: { label: "In progress", icon: "🟡" },
  review: { label: "In review", icon: "🟣" },
  done: { label: "Done", icon: "✅" },
};
export const PRIORITIES = {
  low: { label: "Low", icon: "🟢", weight: 3 },
  normal: { label: "Normal", icon: "🔵", weight: 2 },
  high: { label: "High", icon: "🟠", weight: 1 },
  urgent: { label: "Urgent", icon: "🔴", weight: 0 },
};
export const AREAS = {
  general: "General",
  scripting: "Scripting",
  backend: "Bot & Backend",
  web: "Web & Portal",
  vehicles: "Vehicles & Mapping",
  qa: "QA & Testing",
};

const taskLine = (t) =>
  `${PRIORITIES[t.priority]?.icon || "⚪"} **#${t.id}** ${clip(t.title, 60)}${t.assignee_id ? ` · ${mention(t.assignee_id)}` : " · *unassigned*"}${t.due_at && t.status !== "done" ? ` · due ${ts(t.due_at, "R")}` : ""}`;

/* ------------------------------------------------------------------ board panel */

export async function boardPayload() {
  const rows = await db.query(
    `SELECT * FROM devops_tasks WHERE status<>'done' OR completed_at>=? ORDER BY FIELD(priority,'urgent','high','normal','low'), id`,
    [Date.now() - 7 * 86400000],
  );
  const fields = [];
  for (const [key, meta] of Object.entries(STATUSES)) {
    const list = rows.filter((r) => r.status === key);
    const shown = list.slice(0, 8).map(taskLine);
    if (list.length > 8) shown.push(`…and ${list.length - 8} more`);
    fields.push([`${meta.icon} ${meta.label} · ${list.length}${key === "done" ? " (7d)" : ""}`, shown.join("\n") || "*Nothing here.*", false]);
  }
  const overdue = rows.filter((r) => r.status !== "done" && r.due_at && Number(r.due_at) < Date.now()).length;
  return {
    embeds: [
      card("📋 Task board", {
        color: C.blue,
        description: `**${rows.filter((r) => r.status !== "done").length}** open${overdue ? ` · ⏰ **${overdue}** overdue` : ""}. Manage work with \`/task\`.`,
        fields,
        footer: "FBRP · DevOps · updates automatically",
      }),
    ],
    components: [],
  };
}

/* ------------------------------------------------------------------ helpers */

const taskById = async (id) => {
  const row = await db.one("SELECT * FROM devops_tasks WHERE id=?", [id]);
  if (!row) throw new UserError(`Task #${id} does not exist.`);
  return row;
};

const detail = (t) =>
  card(`${PRIORITIES[t.priority]?.icon || ""} Task #${t.id} · ${clip(t.title, 200)}`, {
    color: t.status === "done" ? C.green : C.blue,
    description: t.details || "*No details.*",
    fields: [
      ["Status", `${STATUSES[t.status]?.icon} ${STATUSES[t.status]?.label}`],
      ["Priority", `${PRIORITIES[t.priority]?.icon} ${PRIORITIES[t.priority]?.label}`],
      ["Area", AREAS[t.area] || t.area],
      ["Assignee", t.assignee_id ? mention(t.assignee_id) : "Unassigned"],
      ["Created by", mention(t.creator_id)],
      ["Created", ts(t.created_at, "R")],
      t.due_at ? ["Due", ts(t.due_at, "f")] : null,
      t.completed_at ? ["Completed", `${ts(t.completed_at, "R")}${t.completed_by ? ` by ${mention(t.completed_by)}` : ""}`] : null,
    ],
  });

async function demandTeam(i, actor) {
  if (actor.admin || actor.rank) return;
  throw new UserError("Only members of the development team can use the task board.");
}

/** The assignee or a task manager may change a task. */
async function demandOwnerOrManager(actor, task) {
  if (task.assignee_id === actor.id || task.creator_id === actor.id) return;
  if (await can(actor, "task.manage")) return;
  throw new UserError("Only the assignee, the creator or a Senior Developer+ can change this task.");
}

export async function autocomplete(i) {
  const query = String(i.options.getFocused() || "").toLowerCase();
  const sub = i.options.getSubcommand(false);
  const rows = await db.query(
    `SELECT id,title,status FROM devops_tasks ${["view", "delete"].includes(sub) ? "" : "WHERE status<>'done'"} ORDER BY id DESC LIMIT 100`,
  );
  return i.respond(
    rows
      .filter((r) => !query || `#${r.id} ${r.title}`.toLowerCase().includes(query))
      .slice(0, 25)
      .map((r) => ({ name: `#${r.id} · ${STATUSES[r.status]?.label} · ${r.title}`.slice(0, 100), value: r.id })),
  );
}

/* ------------------------------------------------------------------ commands */

export async function command(i, actor, sub) {
  await demandTeam(i, actor);

  if (sub === "add") {
    const assignee = i.options.getUser("assignee");
    if (assignee && assignee.id !== actor.id) await demand(actor, "task.manage");
    if (assignee?.bot) throw new UserError("Bots cannot be assigned tasks.");
    const days = i.options.getInteger("due_in_days");
    const now = Date.now();
    const result = await db.query(
      "INSERT INTO devops_tasks(title,details,area,priority,status,assignee_id,creator_id,due_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
      [
        line(i.options.getString("title", true), 120),
        clip(i.options.getString("details") || "", 2000) || null,
        i.options.getString("area") || "general",
        i.options.getString("priority") || "normal",
        "todo",
        assignee?.id || null,
        i.user.id,
        days ? now + days * 86400000 : null,
        now,
        now,
      ],
    );
    const task = await taskById(result.insertId);
    if (assignee && assignee.id !== i.user.id)
      await dm(assignee, { embeds: [card("📋 New task assigned", { color: C.blue, description: `${i.user} assigned you **#${task.id} ${task.title}**.${task.due_at ? `\nDue ${ts(task.due_at, "f")}.` : ""}` })] });
    refreshPanels(i.guild, "tasks");
    return respond(i, { embeds: [detail(task)] });
  }

  if (sub === "list") {
    const filter = i.options.getString("filter") || "mine";
    const user = i.options.getUser("user");
    const where = { mine: "assignee_id=? AND status<>'done'", open: "status<>'done'", unassigned: "assignee_id IS NULL AND status<>'done'", review: "status='review'", done: "status='done'" };
    const clause = user ? "assignee_id=? AND status<>'done'" : where[filter] || where.mine;
    const params = user ? [user.id] : clause.includes("?") ? [i.user.id] : [];
    const rows = await db.query(`SELECT * FROM devops_tasks WHERE ${clause} ORDER BY FIELD(priority,'urgent','high','normal','low'), id DESC LIMIT 40`, params);
    const title = user ? `Tasks · ${user.username}` : `Tasks · ${filter}`;
    return respond(i, { embeds: [card(`📋 ${title}`, { color: C.blue, description: pages(rows.map((t) => `${STATUSES[t.status].icon} ${taskLine(t)}`))[0] || "No tasks here. 🎉" })] });
  }

  const id = i.options.getInteger("id", true);
  const task = await taskById(id);

  if (sub === "view") return respond(i, { embeds: [detail(task)] });

  if (sub === "claim") {
    if (task.assignee_id && task.assignee_id !== i.user.id) throw new UserError(`Task #${id} is already assigned to ${mention(task.assignee_id)}.`);
    await db.query("UPDATE devops_tasks SET assignee_id=?,status=IF(status='todo','doing',status),updated_at=? WHERE id=?", [i.user.id, Date.now(), id]);
    refreshPanels(i.guild, "tasks");
    return respond(i, `You claimed task **#${id}** and moved it to *In progress*.`);
  }

  if (sub === "assign") {
    await demand(actor, "task.manage");
    const user = i.options.getUser("user", true);
    if (user.bot) throw new UserError("Bots cannot be assigned tasks.");
    await db.query("UPDATE devops_tasks SET assignee_id=?,updated_at=? WHERE id=?", [user.id, Date.now(), id]);
    if (user.id !== i.user.id) await dm(user, { embeds: [card("📋 Task assigned", { color: C.blue, description: `${i.user} assigned you **#${id} ${task.title}**.` })] });
    refreshPanels(i.guild, "tasks");
    return respond(i, `Task **#${id}** is now assigned to ${user}.`);
  }

  if (sub === "status" || sub === "done") {
    await demandOwnerOrManager(actor, task);
    const status = sub === "done" ? "done" : i.options.getString("status", true);
    if (!STATUSES[status]) throw new UserError("Unknown status.");
    const finishing = status === "done";
    await db.query("UPDATE devops_tasks SET status=?,updated_at=?,completed_at=?,completed_by=?,assignee_id=COALESCE(assignee_id,?) WHERE id=?", [
      status,
      Date.now(),
      finishing ? Date.now() : null,
      finishing ? i.user.id : null,
      finishing ? i.user.id : null,
      id,
    ]);
    if (finishing && task.creator_id !== i.user.id)
      await dm(await i.client.users.fetch(task.creator_id).catch(() => i.user), { embeds: [card("✅ Task completed", { color: C.green, description: `${i.user} completed **#${id} ${task.title}**.` })] }).catch(() => null);
    refreshPanels(i.guild, "tasks");
    return respond(i, `Task **#${id}** is now **${STATUSES[status].label}**.`);
  }

  if (sub === "delete") {
    await demand(actor, "task.manage");
    await db.query("DELETE FROM devops_tasks WHERE id=?", [id]);
    refreshPanels(i.guild, "tasks");
    return respond(i, `Task **#${id}** was deleted.`);
  }

  throw new UserError("Unknown action.");
}

/** Reminder for tasks that are overdue or stuck in review. Called hourly. */
export async function remind(guild) {
  const cfg = await config();
  const rows = await db.query("SELECT * FROM devops_tasks WHERE status<>'done' AND assignee_id IS NOT NULL AND due_at IS NOT NULL AND due_at<=? AND due_at>?", [Date.now() + 3600000, Date.now() - 3600000]);
  for (const t of rows) {
    const member = await guild.members.fetch(t.assignee_id).catch(() => null);
    if (!member || (cfg.roles.loa && member.roles.cache.has(cfg.roles.loa))) continue;
    await dm(member.user, { embeds: [card("⏰ Task due", { color: C.amber, description: `**#${t.id} ${t.title}** is due ${ts(t.due_at, "R")}.` })] });
  }
}

