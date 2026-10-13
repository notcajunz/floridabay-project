import { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from "discord.js";
import { config, db, demand, post } from "./store.js";
import { C, EPHEMERAL, UserError, card, clip, line, respond, ts } from "./util.js";

/** /release, /announce and /standup. Each opens a modal so people can write multi-line text. */

const input = (id, label, { style = TextInputStyle.Short, required = true, max = 100, value, placeholder } = {}) => {
  const field = new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setRequired(required).setMaxLength(max);
  if (value) field.setValue(String(value).slice(0, max));
  if (placeholder) field.setPlaceholder(placeholder);
  return new ActionRowBuilder().addComponents(field);
};

/* ------------------------------------------------------------------ release notes */

export async function releaseCommand(i, actor, sub) {
  if (sub === "list") {
    const rows = await db.query("SELECT * FROM devops_releases ORDER BY id DESC LIMIT 10");
    return respond(i, {
      embeds: [card("🚀 Recent releases", { description: rows.map((r) => `**${clip(r.version, 30)}** · ${clip(r.title, 70)} · ${ts(r.created_at, "R")}`).join("\n") || "Nothing released yet." })],
    });
  }
  await demand(actor, "release.post");
  const ping = i.options.getBoolean("ping") ?? true;
  return i.showModal(
    new ModalBuilder()
      .setCustomId(`dv:release:${ping ? 1 : 0}`)
      .setTitle("Post release notes")
      .addComponents(
        input("version", "Version", { max: 40, placeholder: "v1.4.0" }),
        input("title", "Title", { max: 100, placeholder: "What is this release about?" }),
        input("notes", "Release notes", { style: TextInputStyle.Paragraph, max: 3500, placeholder: "**Added**\n- …\n**Fixed**\n- …" }),
      ),
  );
}

export async function releaseModal(i, ping) {
  await i.deferReply(EPHEMERAL);
  const version = line(i.fields.getTextInputValue("version"), 40);
  const title = line(i.fields.getTextInputValue("title"), 100);
  const notes = clip(i.fields.getTextInputValue("notes"), 3500);
  const cfg = await config();
  const role = ping ? cfg.roles["notify:releases"] : null;
  const message = await post(i.guild, "releases", {
    content: role ? `<@&${role}>` : undefined,
    allowedMentions: { roles: role ? [role] : [] },
    embeds: [
      card(`🚀 ${version} · ${title}`, {
        color: C.teal,
        description: notes,
        footer: `Released by ${i.member?.displayName || i.user.username}`,
      }),
    ],
  });
  if (!message) throw new UserError("The releases channel is not configured or I cannot post there.");
  await db.query("INSERT INTO devops_releases(version,title,notes,author_id,channel_id,message_id,created_at) VALUES(?,?,?,?,?,?,?)", [version, title, notes, i.user.id, message.channelId, message.id, Date.now()]);
  await post(i.guild, "deployments", { content: `🚀 **${version}** · ${title} — released by <@${i.user.id}>.` });
  return respond(i, `Release **${version}** posted in <#${message.channelId}>.`);
}

/* ------------------------------------------------------------------ announcements */

const AUDIENCES = {
  public: { channel: "announcements", role: "notify:announcements", label: "public" },
  team: { channel: "devChat", role: "base", label: "team" },
  leadership: { channel: "leadAnnouncements", role: "leadership", label: "leadership" },
};

export async function announceCommand(i, actor) {
  await demand(actor, "announce.post");
  const audience = i.options.getString("audience") || "public";
  const ping = i.options.getBoolean("ping") ?? false;
  return i.showModal(
    new ModalBuilder()
      .setCustomId(`dv:announce:${audience}:${ping ? 1 : 0}`)
      .setTitle("Post an announcement")
      .addComponents(
        input("title", "Title", { max: 100 }),
        input("body", "Message", { style: TextInputStyle.Paragraph, max: 3500 }),
      ),
  );
}

export async function announceModal(i, audience, ping) {
  const spec = AUDIENCES[audience];
  if (!spec) throw new UserError("Unknown audience.");
  await i.deferReply(EPHEMERAL);
  const cfg = await config();
  const role = ping ? cfg.roles[spec.role] : null;
  const message = await post(i.guild, spec.channel, {
    content: role ? `<@&${role}>` : undefined,
    allowedMentions: { roles: role ? [role] : [] },
    embeds: [
      card(`📣 ${line(i.fields.getTextInputValue("title"), 200)}`, {
        color: C.blue,
        description: clip(i.fields.getTextInputValue("body"), 3500),
        footer: `Posted by ${i.member?.displayName || i.user.username}`,
      }),
    ],
  });
  if (!message) throw new UserError(`The ${spec.label} announcement channel is not configured.`);
  return respond(i, `Announcement posted in <#${message.channelId}>.`);
}

/* ------------------------------------------------------------------ standups */

export async function standupCommand(i, actor) {
  if (!actor.admin && !actor.rank) throw new UserError("Only members of the development team post standups.");
  return i.showModal(
    new ModalBuilder()
      .setCustomId("dv:standup")
      .setTitle("Daily standup")
      .addComponents(
        input("yesterday", "What did you get done?", { style: TextInputStyle.Paragraph, max: 900 }),
        input("today", "What are you working on today?", { style: TextInputStyle.Paragraph, max: 900 }),
        input("blockers", "Anything blocking you?", { style: TextInputStyle.Paragraph, max: 900, required: false, placeholder: "Nothing" }),
      ),
  );
}

export async function standupModal(i) {
  await i.deferReply(EPHEMERAL);
  const yesterday = clip(i.fields.getTextInputValue("yesterday"), 900);
  const today = clip(i.fields.getTextInputValue("today"), 900);
  const blockers = clip(i.fields.getTextInputValue("blockers") || "", 900) || null;
  await db.query("INSERT INTO devops_standups(discord_id,yesterday,today,blockers,created_at) VALUES(?,?,?,?,?)", [i.user.id, yesterday, today, blockers, Date.now()]);
  const streak = await db.one("SELECT COUNT(*) n FROM devops_standups WHERE discord_id=? AND created_at>=?", [i.user.id, Date.now() - 7 * 86400000]);
  await post(i.guild, "standups", {
    embeds: [
      card(`📝 Standup · ${i.member?.displayName || i.user.username}`, {
        color: blockers ? C.amber : C.blue,
        thumbnail: i.user.displayAvatarURL(),
        fields: [
          ["✅ Done", yesterday, false],
          ["🎯 Today", today, false],
          ["🚧 Blockers", blockers || "None", false],
        ],
        footer: `${streak?.n || 1} standup${Number(streak?.n) === 1 ? "" : "s"} in the last 7 days`,
      }),
    ],
  });
  if (blockers) await post(i.guild, "leadChat", { embeds: [card("🚧 Blocker reported", { color: C.amber, description: `${i.user} is blocked:\n> ${blockers.replace(/\n/g, "\n> ")}` })] });
  return respond(i, "Standup posted. Have a good one!");
}
