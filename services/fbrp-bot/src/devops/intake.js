import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType } from "discord.js";
import { db } from "./store.js";
import { C, card, clip } from "./util.js";

/**
 * Direct-message intake for the FBRP | DevOps bot. Anyone can DM the bot to file a bug report or
 * a development suggestion. The bot asks for the details one question at a time, shows a summary
 * to confirm, then logs the finished submission to the development log channel.
 */

export const INTAKE_LOG_CHANNEL_ID = "1561220286555099236";
const ANSWER_TIMEOUT_MS = 10 * 60_000;
const COOLDOWN_MS = 2 * 60_000;
const DAILY_LIMIT = 10;
const PREFIX = "dv:intake";

const AREAS = ["Game server", "Website", "Discord bots", "Other"];

/** Each step: key, prompt, and how it is answered. `choice` steps use buttons, the rest use a typed reply. */
export const KINDS = {
  bug: {
    label: "Bug report",
    emoji: "🐛",
    color: C.red,
    steps: [
      { key: "area", prompt: "**Where did the bug happen?**", choice: AREAS },
      { key: "title", prompt: "**Give the bug a short title.** (one line)", max: 100 },
      { key: "what", prompt: "**What went wrong?** Describe what happened and what you expected to happen instead.", max: 1000 },
      { key: "steps", prompt: "**How can we make it happen again?** List the steps you took. If you are not sure, say so.", max: 1000 },
      { key: "when", prompt: "**When did it happen, and what was your in-game name or server ID?** (or reply `skip`)", max: 200, optional: true },
      { key: "evidence", prompt: "**Any screenshots, video, or error text?** Attach files or paste links here. (or reply `skip`)", max: 1000, optional: true, attachments: true },
    ],
  },
  suggestion: {
    label: "Development suggestion",
    emoji: "💡",
    color: C.teal,
    steps: [
      { key: "area", prompt: "**What is your suggestion about?**", choice: AREAS },
      { key: "title", prompt: "**Give your suggestion a short title.** (one line)", max: 100 },
      { key: "what", prompt: "**Describe your idea.** Explain how it should work.", max: 1000 },
      { key: "why", prompt: "**Why would it make the server better?**", max: 1000 },
      { key: "examples", prompt: "**Any examples, references, or screenshots?** Attach files or paste links. (or reply `skip`)", max: 1000, optional: true, attachments: true },
    ],
  },
};

const FIELD_LABELS = {
  area: "Area",
  what: "What happened",
  steps: "Steps to reproduce",
  when: "When / who",
  evidence: "Evidence",
  why: "Why it helps",
  examples: "Examples",
};

/** userId -> in-progress submission. Held in memory only; unfinished drafts expire. */
const sessions = new Map();

const row = (...buttons) => new ActionRowBuilder().addComponents(buttons);
const button = (id, label, style = ButtonStyle.Secondary) => new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style);

const startRow = () =>
  row(button(`${PREFIX}:start:bug`, "🐛 Report a bug", ButtonStyle.Danger), button(`${PREFIX}:start:suggestion`, "💡 Suggest something", ButtonStyle.Primary));
const cancelRow = () => row(button(`${PREFIX}:cancel`, "Cancel"));
const choiceRow = (step) =>
  row(...step.choice.map((label, index) => button(`${PREFIX}:pick:${index}`, label, ButtonStyle.Primary)), button(`${PREFIX}:cancel`, "Cancel"));
const confirmRow = () => row(button(`${PREFIX}:send`, "Submit", ButtonStyle.Success), button(`${PREFIX}:cancel`, "Discard", ButtonStyle.Danger));

/** True when a typed reply means "no answer" for an optional step. */
export const isSkip = (text) => /^(skip|none|n\/a|na|no|nothing|-)$/i.test(String(text || "").trim());

/** Collapses a one-line answer and clamps it. */
const oneLine = (text, max) => clip(String(text || "").replace(/\s*\n\s*/g, " ").trim(), max);

/** Turns a typed reply into the stored answer for `step`, or returns null when it must be asked again. */
export function readAnswer(step, text, attachmentUrls = []) {
  const typed = String(text || "").trim();
  if (step.optional && isSkip(typed) && !attachmentUrls.length) return "";
  const body = step.optional && isSkip(typed) ? "" : typed;
  const parts = [step.key === "title" ? oneLine(body, step.max) : clip(body, step.max)];
  if (step.attachments && attachmentUrls.length) parts.push(...attachmentUrls);
  const joined = parts.filter(Boolean).join("\n");
  if (!joined) return null;
  return clip(joined, step.max + (attachmentUrls.join("\n").length || 0));
}

const stepEmbed = (session) => {
  const kind = KINDS[session.kind];
  const step = kind.steps[session.index];
  return card(`${kind.emoji} ${kind.label} · question ${session.index + 1} of ${kind.steps.length}`, {
    color: kind.color,
    description: step.choice ? step.prompt : `${step.prompt}\n\n*Reply in this chat. You have 10 minutes.*`,
  });
};

const summaryFields = (session) => {
  const kind = KINDS[session.kind];
  return kind.steps.filter((step) => step.key !== "title" && session.answers[step.key]).map((step) => [FIELD_LABELS[step.key] || step.key, session.answers[step.key], step.key === "area"]);
};

function summaryEmbed(session, footer) {
  const kind = KINDS[session.kind];
  return card(`${kind.emoji} ${session.answers.title || kind.label}`, { color: kind.color, fields: summaryFields(session), footer });
}

const dayStart = () => Date.now() - 24 * 3600_000;

async function limitMessage(userId) {
  const last = await db.one("SELECT MAX(created_at) AS at, COUNT(*) AS n FROM devops_intake WHERE discord_id=? AND created_at>?", [userId, dayStart()]).catch(() => null);
  if (!last) return null;
  if (Number(last.n) >= DAILY_LIMIT) return `You have reached the limit of ${DAILY_LIMIT} submissions per day. Please try again tomorrow.`;
  if (last.at && Date.now() - Number(last.at) < COOLDOWN_MS) return "Please wait a couple of minutes between submissions.";
  return null;
}

function expire(userId) {
  const session = sessions.get(userId);
  if (session?.timer) clearTimeout(session.timer);
  sessions.delete(userId);
}

function arm(client, userId) {
  const session = sessions.get(userId);
  if (!session) return;
  clearTimeout(session.timer);
  session.timer = setTimeout(() => {
    sessions.delete(userId);
    client.users.fetch(userId).then((user) => user.send({ embeds: [card("⌛ Timed out", { color: C.grey, description: "That draft expired because it sat idle for 10 minutes. Send me a message any time to start again." })] })).catch(() => null);
  }, ANSWER_TIMEOUT_MS);
  session.timer.unref?.();
}

/** The greeting with the two choices. */
export const welcome = () => ({
  embeds: [card("🛠️ FBRP Development", { description: "Found a bug, or have an idea for the server? Tell the development team here.\n\nPick one below. I will ask a few questions, show you a summary, and pass it on once you confirm.", color: C.teal })],
  components: [startRow()],
});

/** Handles a plain DM. Returns true when the message was consumed. */
export async function onDirectMessage(client, message) {
  if (message.author.bot || message.channel.type !== ChannelType.DM) return false;
  const session = sessions.get(message.author.id);
  if (!session || session.stage !== "asking") {
    if (session) return reply(message, { embeds: [card("Almost there", { color: C.amber, description: "Use the **Submit** or **Discard** buttons on your summary above." })] });
    return reply(message, welcome());
  }
  const kind = KINDS[session.kind];
  const step = kind.steps[session.index];
  if (step.choice) return reply(message, { embeds: [card("Use the buttons", { color: C.amber, description: "Please pick one of the options with the buttons on the question above." })] });
  const urls = [...message.attachments.values()].map((file) => file.url).slice(0, 5);
  const answer = readAnswer(step, message.content, urls);
  if (answer === null) return reply(message, { embeds: [card("I need an answer", { color: C.amber, description: step.optional ? "Type your answer, or reply `skip`." : "Please type your answer." })] });
  session.answers[step.key] = answer;
  session.index += 1;
  await advance(client, message.author, session, (payload) => message.channel.send(payload));
  return true;
}

const reply = async (message, payload) => {
  await message.channel.send(payload).catch(() => null);
  return true;
};

async function advance(client, user, session, send) {
  const kind = KINDS[session.kind];
  if (session.index >= kind.steps.length) {
    session.stage = "confirm";
    arm(client, user.id);
    await send({ content: "Here is what I will send to the development team. Check it over:", embeds: [summaryEmbed(session, "Not sent yet")], components: [confirmRow()] });
    return;
  }
  arm(client, user.id);
  const step = kind.steps[session.index];
  await send({ embeds: [stepEmbed(session)], components: [step.choice ? choiceRow(step) : cancelRow()] });
}

/** Handles the intake buttons. Returns true when the interaction belonged to the intake flow. */
export async function onButton(client, i) {
  if (!i.isButton() || !i.customId.startsWith(`${PREFIX}:`)) return false;
  const [, , action, arg] = i.customId.split(":");
  const userId = i.user.id;
  const session = sessions.get(userId);
  const channel = i.channel ?? (await i.user.createDM());

  if (action === "start") {
    if (!KINDS[arg]) return true;
    const blocked = await limitMessage(userId);
    if (blocked) {
      await i.reply({ embeds: [card("Slow down", { color: C.amber, description: blocked })] });
      return true;
    }
    expire(userId);
    const fresh = { kind: arg, index: 0, answers: {}, stage: "asking", timer: null };
    sessions.set(userId, fresh);
    await i.update({ components: [] }).catch(() => null);
    await advance(client, i.user, fresh, (payload) => channel.send(payload));
    return true;
  }

  if (action === "cancel") {
    expire(userId);
    await i.update({ components: [] }).catch(() => null);
    await channel.send({ embeds: [card("Cancelled", { color: C.grey, description: "Nothing was sent. Message me any time to start again." })] }).catch(() => null);
    return true;
  }

  if (!session) {
    await i.update({ components: [] }).catch(() => null);
    await channel.send(welcome()).catch(() => null);
    return true;
  }

  if (action === "pick" && session.stage === "asking") {
    const step = KINDS[session.kind].steps[session.index];
    const choice = step?.choice?.[Number(arg)];
    if (!choice) return true;
    session.answers[step.key] = choice;
    session.index += 1;
    await i.update({ components: [] }).catch(() => null);
    await advance(client, i.user, session, (payload) => channel.send(payload));
    return true;
  }

  if (action === "send" && session.stage === "confirm") {
    await i.update({ components: [] }).catch(() => null);
    expire(userId);
    const blocked = await limitMessage(userId);
    if (blocked) {
      await channel.send({ embeds: [card("Not sent", { color: C.amber, description: blocked })] }).catch(() => null);
      return true;
    }
    const sent = await log(client, i.user, session);
    await channel.send({
      embeds: [sent
        ? card("✅ Sent to the development team", { color: C.green, description: `Thank you! Your ${KINDS[session.kind].label.toLowerCase()} was logged as **#${sent.id}**. The team may message you if they need more detail.` })
        : card("⚠️ Could not send", { color: C.red, description: "I could not reach the development log. Please try again in a few minutes." })],
    }).catch(() => null);
    return true;
  }

  return true;
}

/** Saves the submission and posts it to the development log channel. */
async function log(client, user, session) {
  const kind = KINDS[session.kind];
  const channel = client.channels.cache.get(INTAKE_LOG_CHANNEL_ID) || (await client.channels.fetch(INTAKE_LOG_CHANNEL_ID).catch(() => null));
  if (!channel?.isTextBased()) {
    console.warn(`[DevOps] intake log channel ${INTAKE_LOG_CHANNEL_ID} is not reachable.`);
    return null;
  }
  const result = await db.query("INSERT INTO devops_intake(kind,discord_id,username,answers,created_at) VALUES(?,?,?,?,?)", [session.kind, user.id, String(user.username).slice(0, 80), JSON.stringify(session.answers), Date.now()]).catch((error) => {
    console.warn(`[DevOps] intake save failed: ${error.message}`);
    return null;
  });
  const id = result?.insertId ?? null;
  const embed = summaryEmbed(session, `${kind.label}${id ? ` #${id}` : ""}`)
    .setAuthor({ name: `${user.username} (${user.id})`, iconURL: user.displayAvatarURL() });
  embed.addFields({ name: "Submitted by", value: `<@${user.id}>`, inline: true });
  const message = await channel.send({ allowedMentions: { parse: [] }, content: `${kind.emoji} New ${kind.label.toLowerCase()}`, embeds: [embed] }).catch((error) => {
    console.warn(`[DevOps] intake log failed: ${error.message}`);
    return null;
  });
  if (!message) return null;
  if (id) await db.query("UPDATE devops_intake SET log_message_id=? WHERE id=?", [message.id, id]).catch(() => null);
  return { id: id ?? "—" };
}
