import { Colors } from "discord.js";

export const ASSET_CHANGE_RECIPIENT_ID = "1090083387638812755";

const ACTIONS = new Set([
  "headtag.create", "headtag.delete", "headtag.grant", "headtag.revoke",
  "personal.create", "personal.update", "personal.delete", "personal.lock", "personal.unlock",
  "personal.owner", "personal.trust", "personal.untrust", "personal.tag", "personal.untag",
  "personal.replace_pack", "personal.import.rename", "personal.retune",
]);

const PANEL_RESOURCES = new Set([
  "headtags", "headtag-grants", "personals", "personal-trust", "personal-tags",
]);

const clean = (value, max = 1000) =>
  String(value ?? "")
    .replace(/[\u0000-\u001f]/g, " ")
    .replace(/`/g, "ˋ")
    .trim()
    .slice(0, max);

export function assetChangeType(action) {
  const value = String(action || "");
  if (ACTIONS.has(value)) return value.startsWith("headtag.") ? "Headtag" : "Personal";
  const match = /^panel\.([a-z-]+)\.(create|edit|delete)$/.exec(value);
  if (!match || !PANEL_RESOURCES.has(match[1])) return null;
  return match[1].startsWith("headtag") ? "Headtag" : "Personal";
}

const titleFor = (type, action) => {
  const operation = String(action).split(".").at(-1);
  const words = {
    create: "created", delete: "deleted", edit: "edited", update: "edited",
    grant: "access granted", revoke: "access revoked", owner: "owner changed",
    trust: "trusted member added", untrust: "trusted member removed",
    tag: "tag lock added", untag: "tag lock removed", lock: "locked", unlock: "unlocked",
    replace_pack: "vehicle pack replaced", rename: "model renamed", retune: "handling retuned",
  };
  return `${type} ${words[operation] || operation.replaceAll("_", " ")}`;
};

function detailText(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return clean(payload, 3000) || "No details recorded.";
  const lines = Object.entries(payload).map(([key, value]) => {
    const shown = value && typeof value === "object" ? JSON.stringify(value, null, 2) : String(value ?? "None");
    return `${key}: ${shown}`;
  });
  return clean(lines.join("\n"), 3000) || "No details recorded.";
}

export function assetChangeMessage(row, parsedPayload = undefined) {
  const type = assetChangeType(row?.action);
  if (!type) return null;
  let payload = parsedPayload ?? row.payload ?? {};
  if (typeof payload === "string") {
    try { payload = JSON.parse(payload); } catch { payload = { value: payload }; }
  }
  const operation = String(row.action).split(".").at(-1);
  const color = operation === "delete" ? Colors.Orange : operation === "create" ? Colors.Green : Colors.Blurple;
  const actor = /^\d{15,24}$/.test(String(row.actor_id)) ? `<@${row.actor_id}> (\`${row.actor_id}\`)` : `\`${clean(row.actor_id || "system", 80)}\``;
  return {
    embeds: [{
      title: titleFor(type, row.action),
      color,
      description: `\`\`\`text\n${detailText(payload)}\n\`\`\``,
      fields: [
        { name: "Actor", value: actor },
        { name: "Target", value: row.target_id ? `\`${clean(row.target_id, 100)}\`` : "Not recorded" },
      ],
      footer: { text: `Florida Bay Roleplay · ${clean(row.action, 100)} · audit #${Number(row.id) || "pending"}` },
      timestamp: new Date(Number(row.created_at) || Date.now()).toISOString(),
    }],
    allowedMentions: { parse: [] },
  };
}

export function createAssetChangeNotifier({ client, recipientId = ASSET_CHANGE_RECIPIENT_ID }) {
  return {
    async notify(row, parsedPayload = undefined) {
      const message = assetChangeMessage(row, parsedPayload);
      if (!message) return false;
      const recipient = await client.users.fetch(String(recipientId));
      await recipient.send(message);
      return true;
    },
  };
}
