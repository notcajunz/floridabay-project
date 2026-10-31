import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from "discord.js";
import { reviewUrl } from "./config.js";

const clip = (value, max) => {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};
// Model and developer text is shown literally: no mentions, links or markdown from untrusted input.
const plain = (value, max) => clip(value, max).replace(/[`*_~|>@#\[\]()]/g, "\u200b$&");

/** DM sent when an dev server transfer has been integrated or has failed. */
export function runEmbed(item) {
  const done = item.status === "implemented";
  return new EmbedBuilder()
    .setColor(done ? 0x2ecc71 : 0xe74c3c)
    .setTitle(`${done ? "✅ Implemented" : "⛔ Implementation failed"} · transfer #${item.id}`)
    .setDescription(`**${plain(item.title, 200)}**\n\n${String(item.resultSummary || "No summary was written.").slice(0, 3200)}`)
    .addFields({ name: "Agent", value: item.agent || "—", inline: true }, { name: "Exit code", value: String(item.runExit ?? "—"), inline: true })
    .setTimestamp(item.runFinishedAt || Date.now())
    .setFooter({ text: "Details and the full log are in the website portal (Dev Review)." });
}

export function runComponents(item) {
  const portal = reviewUrl(item.id);
  return /^https?:\/\//.test(portal)
    ? [new ActionRowBuilder().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("Open in portal").setURL(portal))]
    : [];
}
