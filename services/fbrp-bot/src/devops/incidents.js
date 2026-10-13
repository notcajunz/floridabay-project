import { config, db, demand, post } from "./store.js";
import { C, EPHEMERAL, UserError, card, clip, line, mention, respond, ts, humanDuration } from "./util.js";
import { SEVERITY } from "./status.js";
import { refreshPanels, renderPanel } from "./panels.js";

export const COMPONENTS = ["Game server", "Website & portal", "Discord bots", "Database", "Network", "Other"];
const STATE = {
  investigating: { label: "Investigating", icon: "🔎" },
  identified: { label: "Identified", icon: "🎯" },
  monitoring: { label: "Monitoring", icon: "👀" },
  resolved: { label: "Resolved", icon: "✅" },
};

const incidentById = async (id) => {
  const row = await db.one("SELECT * FROM devops_incidents WHERE id=?", [id]);
  if (!row) throw new UserError(`Incident #${id} does not exist.`);
  return row;
};

/** The same card is used publicly and on the team side, with the commander only shown to the team. */
async function incidentEmbed(row, { team = false } = {}) {
  const updates = await db.query("SELECT * FROM devops_incident_updates WHERE incident_id=? ORDER BY id DESC LIMIT 8", [row.id]);
  const sev = SEVERITY[row.severity] || SEVERITY[3];
  const state = STATE[row.status];
  const resolved = row.status === "resolved";
  return card(`${resolved ? "✅" : sev.icon} Incident #${row.id} · ${clip(row.title, 200)}`, {
    color: resolved ? C.green : sev.color,
    description: updates
      .map((u) => `**${STATE[u.status]?.icon || "•"} ${STATE[u.status]?.label || u.status}** · ${ts(u.created_at, "t")}\n${clip(u.body, 400)}`)
      .join("\n\n"),
    fields: [
      ["Status", `${state.icon} ${state.label}`],
      ["Severity", sev.label],
      row.component ? ["Affected", row.component] : null,
      team ? ["Commander", row.commander_id ? mention(row.commander_id) : "None yet"] : null,
      ["Opened", ts(row.opened_at, "R")],
      resolved ? ["Duration", humanDuration(Number(row.resolved_at) - Number(row.opened_at))] : null,
    ],
    footer: `FBRP · DevOps · Incident #${row.id}`,
    timestamp: false,
  });
}

async function sync(guild, row, { ping = false } = {}) {
  const cfg = await config();
  const edit = async (channelKey, idCol, msgCol, team) => {
    const payload = { embeds: [await incidentEmbed(row, { team })], allowedMentions: { roles: ping && cfg.roles["notify:outages"] ? [cfg.roles["notify:outages"]] : [] } };
    const channelId = row[idCol] || cfg.channels[channelKey];
    const channel = channelId ? await guild.channels.fetch(channelId).catch(() => null) : null;
    if (!channel?.isTextBased()) return;
    const message = row[msgCol] ? await channel.messages.fetch(row[msgCol]).catch(() => null) : null;
    if (message) return message.edit(payload);
    const content = ping && cfg.roles["notify:outages"] && !team ? `<@&${cfg.roles["notify:outages"]}>` : undefined;
    const sent = await channel.send({ ...payload, content });
    await db.query(`UPDATE devops_incidents SET ${idCol}=?,${msgCol}=? WHERE id=?`, [channel.id, sent.id, row.id]);
    row[idCol] = channel.id;
    row[msgCol] = sent.id;
  };
  await edit("status", "public_channel_id", "public_message_id", false);
  await edit("incidents", "team_channel_id", "team_message_id", true);
  await renderPanel(guild, "status").catch(() => null);
}

export async function command(i, actor, sub) {
  if (sub === "list") {
    const rows = await db.query("SELECT * FROM devops_incidents ORDER BY (status='resolved'), opened_at DESC LIMIT 15");
    const lines = rows.map((r) => `${r.status === "resolved" ? "✅" : SEVERITY[r.severity]?.icon} **#${r.id}** ${clip(r.title, 70)} · *${r.status}* · ${ts(r.opened_at, "R")}`);
    return respond(i, { embeds: [card("🚨 Incidents", { color: C.red, description: lines.join("\n") || "No incidents on record. 🎉" })] });
  }
  if (sub === "view") {
    const row = await incidentById(i.options.getInteger("id", true));
    return respond(i, { embeds: [await incidentEmbed(row, { team: true })] });
  }

  await demand(actor, "incident.manage");

  if (sub === "open") {
    const title = line(i.options.getString("title", true), 120);
    const severity = Number(i.options.getString("severity") || 3);
    const component = i.options.getString("component") || null;
    const summary = clip(i.options.getString("summary") || "We are looking into this and will post updates here.", 1500);
    await i.deferReply(EPHEMERAL);
    const now = Date.now();
    const result = await db.query(
      "INSERT INTO devops_incidents(title,severity,status,component,commander_id,opened_by,opened_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",
      [title, severity, "investigating", component, i.user.id, i.user.id, now, now],
    );
    const id = result.insertId;
    await db.query("INSERT INTO devops_incident_updates(incident_id,status,body,author_id,created_at) VALUES(?,?,?,?,?)", [id, "investigating", summary, i.user.id, now]);
    const row = await incidentById(id);
    await sync(i.guild, row, { ping: severity <= 2 });
    return respond(i, `Incident **#${id}** opened and posted${severity <= 2 ? " (outage role pinged)" : ""}. Post updates with \`/incident update\`.`);
  }

  const id = i.options.getInteger("id", true);
  const row = await incidentById(id);

  if (sub === "commander") {
    const user = i.options.getUser("user", true);
    await db.query("UPDATE devops_incidents SET commander_id=?,updated_at=? WHERE id=?", [user.id, Date.now(), id]);
    row.commander_id = user.id;
    await i.deferReply(EPHEMERAL);
    await sync(i.guild, row);
    return respond(i, `${user} is now commander of incident **#${id}**.`);
  }

  if (sub === "update" || sub === "resolve") {
    if (row.status === "resolved") throw new UserError(`Incident #${id} is already resolved.`);
    const status = sub === "resolve" ? "resolved" : i.options.getString("status", true);
    if (!STATE[status]) throw new UserError("Unknown status.");
    const message = clip(i.options.getString("message", true), 1500);
    await i.deferReply(EPHEMERAL);
    const now = Date.now();
    await db.query("INSERT INTO devops_incident_updates(incident_id,status,body,author_id,created_at) VALUES(?,?,?,?,?)", [id, status, message, i.user.id, now]);
    await db.query("UPDATE devops_incidents SET status=?,updated_at=?,resolved_at=?,resolved_by=? WHERE id=?", [status, now, status === "resolved" ? now : null, status === "resolved" ? i.user.id : null, id]);
    const fresh = await incidentById(id);
    await sync(i.guild, fresh);
    if (status === "resolved") {
      await post(i.guild, "incidents", { content: `✅ Incident **#${id}** resolved by ${mention(i.user.id)} after ${humanDuration(now - Number(row.opened_at))}.` });
      refreshPanels(i.guild, "status");
    }
    return respond(i, `Incident **#${id}** is now **${STATE[status].label}**.`);
  }

  throw new UserError("Unknown action.");
}

export async function autocomplete(i) {
  const query = String(i.options.getFocused() || "").toLowerCase();
  const sub = i.options.getSubcommand(false);
  const rows = await db.query(`SELECT id,title,status FROM devops_incidents ${sub === "view" ? "" : "WHERE status<>'resolved'"} ORDER BY id DESC LIMIT 50`);
  return i.respond(
    rows
      .filter((r) => !query || `#${r.id} ${r.title}`.toLowerCase().includes(query))
      .slice(0, 25)
      .map((r) => ({ name: `#${r.id} · ${r.status} · ${r.title}`.slice(0, 100), value: r.id })),
  );
}
