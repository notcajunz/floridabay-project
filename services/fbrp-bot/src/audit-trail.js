/**
 * Writes one audit_log row for every Discord interaction a bot receives (slash commands, buttons,
 * select menus and modal submits; autocomplete is skipped as noise). The main bot's audit
 * forwarder turns each row into a message in the audit category, so commands run in any Node bot
 * (main, IAA, DevOps, staff, personals, role manager) end up in one place. Action names look like
 * `cmd.main.global.ban`, which the mirror routes to `global-commands` or `commands-<bot>`.
 */

const text = (value, max = 300) => String(value ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);

function optionText(option) {
  if (option.user) return `${option.user.id}`;
  if (option.role) return `role ${option.role.id}`;
  if (option.channel) return `channel ${option.channel.id}`;
  if (option.attachment) return `file ${text(option.attachment.name, 80)}`;
  return text(option.value);
}

export function describeInteraction(bot, i, error = null) {
  let kind = "command";
  let name = "";
  const payload = { bot, kind };
  if (i.isChatInputCommand?.()) {
    const sub = i.options.getSubcommand(false);
    const subGroup = i.options.getSubcommandGroup?.(false);
    name = [i.commandName, subGroup, sub].filter(Boolean).join(".");
    const data = i.options.data[0]?.type === 1 || i.options.data[0]?.type === 2 ? flatten(i.options.data) : i.options.data;
    for (const option of data.slice(0, 18)) payload[`opt_${option.name}`] = optionText(option);
  } else if (i.isModalSubmit?.()) {
    kind = "modal";
    name = `modal.${text(i.customId, 60).replace(/[^\w:.-]/g, "_")}`;
  } else if (i.isMessageComponent?.()) {
    kind = i.isButton?.() ? "button" : "select";
    name = `${kind}.${text(i.customId, 60).replace(/[^\w:.-]/g, "_")}`;
    if (i.isAnySelectMenu?.() && i.values?.length) payload.values = text(i.values.join(","), 200);
  } else {
    return null;
  }
  payload.kind = kind;
  payload.server = text(i.guild?.name || "DM", 80);
  payload.guild_id = i.guildId || "dm";
  payload.channel = i.channelId ? `<#${i.channelId}>` : "none";
  payload.result = error ? "failed" : "ok";
  if (error) payload.error = text(error.message || error, 400);
  return { action: `cmd.${bot}.${name}`.slice(0, 60), actor: i.user?.id, payload };
}

function flatten(options) {
  const out = [];
  for (const option of options) {
    if (option.options && (option.type === 1 || option.type === 2)) out.push(...flatten(option.options));
    else out.push(option);
  }
  return out;
}

/** `query(sql, params)` is any function that runs SQL (a db wrapper or a mysql2 pool). */
export async function recordInteraction(query, bot, i, error = null) {
  const entry = describeInteraction(bot, i, error);
  if (!entry) return;
  await query(
    "INSERT INTO audit_log(actor_id,action,target_id,payload,created_at) VALUES(?,?,?,?,?)",
    [String(entry.actor || "unknown"), entry.action, null, JSON.stringify(entry.payload), Date.now()],
  );
}
