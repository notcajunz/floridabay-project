import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { devopsManagerIds } from "./staff/roles.js";
import { callGame } from "./sync.js";
import { COLORS, card, clip, who } from "./ui.js";

/**
 * Property setup approval.
 *
 * A property an organization buys does nothing in game until DevOps has placed its spots and marked
 * it as set up. Every purchase is announced in the DevOps property channel with where it is and two
 * buttons: mark it set up, or mark it not set up. Only Dev Manager and above may press them. When a
 * property is marked set up the game starts honouring it within seconds and the organization owner
 * gets a DM. The website shows the property as pending from DevOps until then.
 */

export const SETUP_CHANNEL_ID = "1559610554430005398";
const PREFIX = "propsetup";
const RETRY_AFTER_MS = 45_000;
const RETRY_WINDOW_MS = 7 * 86_400_000;
export const DEV_MANAGER_LEVEL = 5;

const SPOT_ORDER = ["door", "door2", "door3", "terminal", "bar", "stash", "armory", "wardrobe"];

const parse = (value, fallback) => {
  if (value && typeof value === "object") return value;
  try {
    return JSON.parse(value) ?? fallback;
  } catch {
    return fallback;
  }
};

export function createPropertySetup({ client, db, audit, authority }) {
  let warnedUnreachable = false;

  async function channel() {
    return client.channels.cache.get(SETUP_CHANNEL_ID) || (await client.channels.fetch(SETUP_CHANNEL_ID).catch(() => null));
  }

  function buttons(itemKey, status) {
    const ready = status === "ready";
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`${PREFIX}:ready:${itemKey}`).setLabel("Mark as set up").setEmoji("✅").setStyle(ButtonStyle.Success).setDisabled(ready),
        new ButtonBuilder().setCustomId(`${PREFIX}:pending:${itemKey}`).setLabel("Not set up").setEmoji("⏳").setStyle(ButtonStyle.Secondary).setDisabled(!ready),
      ),
    ];
  }

  async function details(itemKey) {
    const [row] = await db.query(
      `SELECT p.item_key,p.org_id,p.purchased_by,p.purchased_at,p.setup_status,p.setup_by,p.setup_at,
              i.label,i.price,i.data,o.name org_name,o.type org_type
         FROM org_properties p
         LEFT JOIN org_shop_items i ON i.item_key=p.item_key
         LEFT JOIN organizations o ON o.id=p.org_id
        WHERE p.item_key=?`,
      [itemKey],
    );
    if (!row) return null;
    const spots = (await db.query("SELECT point FROM property_points WHERE property_key=?", [itemKey]).catch(() => [])).map((r) => r.point);
    return { ...row, data: parse(row.data, {}), spots };
  }

  function embedFor(row) {
    const data = row.data || {};
    const ready = row.setup_status === "ready";
    const placed = SPOT_ORDER.filter((name) => row.spots.includes(name));
    const where = [data.area, Number.isFinite(Number(data.x)) ? `${Number(data.x).toFixed(1)}, ${Number(data.y).toFixed(1)}, ${Number(data.z).toFixed(1)}` : null].filter(Boolean);
    const rows = [
      ["Organization", `**${row.org_name || "Unknown"}**\n${row.org_type || ""}`],
      ["Bought by", who(row.purchased_by)],
      ["Price", row.price == null ? "Unknown" : `$${Number(row.price).toLocaleString("en-US")}`],
      ["Location", where.length ? where.join("\n") : "Not listed", false],
      ["Spots placed", placed.length ? placed.map((name) => `\`${name}\``).join(" ") : "None yet"],
      ["Status", ready ? `✅ Set up by <@${row.setup_by}> <t:${Math.floor(Number(row.setup_at) / 1000)}:R>` : "⏳ Waiting for setup"],
    ];
    return card(`${ready ? "Property set up" : "New property to set up"}: ${row.label || row.item_key}`, {
      color: ready ? COLORS.success : COLORS.warning,
      description: ready
        ? "This property is live. The organization can use it in game."
        : "Place its spots in game with `/propmenu` (Dev Manager and above), then press **Mark as set up**. The organization cannot use this property until you do.",
      rows,
      footer: `Florida Bay Roleplay · Property ${row.item_key}`,
    });
  }

  /** Posts (or re-posts) the setup message for a property. Never throws: purchases must not fail on Discord. */
  async function announce(itemKey) {
    try {
      const row = await details(itemKey);
      if (!row || row.setup_status === "ready") return false;
      const target = await channel();
      if (!target?.isTextBased()) {
        if (!warnedUnreachable) console.warn(`[FBRP property setup] channel ${SETUP_CHANNEL_ID} is not reachable; will keep retrying.`);
        warnedUnreachable = true;
        return false;
      }
      warnedUnreachable = false;
      // Claim the post first so a retry sweep cannot send it twice.
      const claimed = await db.query("UPDATE org_properties SET setup_channel_id=? WHERE item_key=? AND setup_message_id IS NULL AND setup_channel_id IS NULL", [SETUP_CHANNEL_ID, itemKey]);
      if (!claimed.affectedRows) return false;
      const message = await target
        .send({ content: "🏠 A property is waiting for setup.", embeds: [embedFor(row)], components: buttons(itemKey, row.setup_status), allowedMentions: { parse: [] } })
        .catch((error) => {
          console.warn(`[FBRP property setup] could not post ${itemKey}: ${error.message}`);
          return null;
        });
      if (!message) {
        await db.query("UPDATE org_properties SET setup_channel_id=NULL WHERE item_key=? AND setup_message_id IS NULL", [itemKey]);
        return false;
      }
      await db.query("UPDATE org_properties SET setup_message_id=? WHERE item_key=?", [message.id, itemKey]);
      return true;
    } catch (error) {
      console.warn(`[FBRP property setup] announce ${itemKey}: ${error.message}`);
      return false;
    }
  }

  /** The property was sold back: the message can no longer be acted on. */
  async function retire(message) {
    if (!message?.channelId || !message?.messageId) return;
    try {
      const target = await client.channels.fetch(message.channelId).catch(() => null);
      const posted = target?.isTextBased() ? await target.messages.fetch(message.messageId).catch(() => null) : null;
      if (!posted) return;
      await posted.edit({
        content: "🏠 This property was sold back and no longer needs setup.",
        embeds: [card(`Property sold: ${message.label || message.itemKey}`, { color: COLORS.muted, description: "The organization sold this property.", footer: `Florida Bay Roleplay · Property ${message.itemKey}` })],
        components: [],
      });
    } catch (error) {
      console.warn(`[FBRP property setup] retire ${message.itemKey}: ${error.message}`);
    }
  }

  async function ownerIds(orgId) {
    const [org] = await db.query("SELECT id,slug,name,type,guild_id FROM organizations WHERE id=?", [orgId]);
    const ids = [];
    const leadership = org && authority ? await authority.leadership(org).catch(() => null) : null;
    if (leadership?.ownerId) ids.push(String(leadership.ownerId));
    if (!ids.length) {
      const leaders = await db.query("SELECT discord_id FROM organization_members WHERE org_id=? AND manager=TRUE", [orgId]).catch(() => []);
      for (const leader of leaders) ids.push(String(leader.discord_id));
    }
    return { org, ids: [...new Set(ids)].slice(0, 3) };
  }

  async function dmOwner(row) {
    const { org, ids } = await ownerIds(row.org_id);
    const note = card(`${row.label || row.item_key} is set up`, {
      color: COLORS.success,
      description: `**${org?.name || "Your organization"}**'s new property has been set up by DevOps and is ready to use in game. Its terminal, stash, armory and doors work now, and members can lock and unlock its doors by walking up to them and pressing **E**.`,
      rows: [["Property", row.label || row.item_key]],
    });
    for (const id of ids) {
      const user = await client.users.fetch(id).catch(() => null);
      await user?.send({ embeds: [note] }).catch((error) => console.warn(`[FBRP property setup] DM to ${id} failed: ${error.message}`));
    }
    return ids.length;
  }

  /** Setup status buttons. Returns true when the interaction was one of ours. */
  async function component(i) {
    if (!i.isButton() || !i.customId.startsWith(`${PREFIX}:`)) return false;
    const [, action, ...rest] = i.customId.split(":");
    const itemKey = rest.join(":");
    const deny = (text) => i.reply({ embeds: [card("Not allowed", { color: COLORS.danger, description: text })], ephemeral: true });
    if (!["ready", "pending"].includes(action) || !itemKey) {
      await deny("This button has expired.");
      return true;
    }
    const managers = await devopsManagerIds(DEV_MANAGER_LEVEL);
    if (!managers || !managers.has(String(i.user.id))) {
      await deny("Only Dev Manager and above can mark a property as set up.");
      return true;
    }
    const before = await details(itemKey);
    if (!before) {
      await i.update({ content: "🏠 This property is no longer owned by an organization.", components: [] });
      return true;
    }
    if (before.setup_status !== action) {
      const stamp = Date.now();
      await db.query(
        "UPDATE org_properties SET setup_status=?,setup_by=?,setup_at=? WHERE item_key=?",
        [action, action === "ready" ? i.user.id : null, action === "ready" ? stamp : null, itemKey],
      );
      await audit(i.user.id, `property.setup_${action}`, before.org_id, { item: itemKey, label: before.label });
      await callGame("/economy/refresh", {}).catch(() => null);
    }
    const row = (await details(itemKey)) || before;
    await i.update({
      content: row.setup_status === "ready" ? "🏠 This property is set up." : "🏠 A property is waiting for setup.",
      embeds: [embedFor(row)],
      components: buttons(itemKey, row.setup_status),
      allowedMentions: { parse: [] },
    });
    if (before.setup_status !== action && action === "ready") {
      const sent = await dmOwner(row).catch((error) => {
        console.warn(`[FBRP property setup] owner DM: ${error.message}`);
        return 0;
      });
      await i.followUp({ embeds: [card("Marked as set up", { color: COLORS.success, description: sent ? `The owner of **${clip(row.org_name, 80)}** was sent a DM.` : "No organization owner could be reached by DM." })], ephemeral: true }).catch(() => {});
    }
    return true;
  }

  /** Retries announcements that could not be posted (the channel was unreachable). */
  async function sweep() {
    const rows = await db.query(
      "SELECT item_key FROM org_properties WHERE setup_status='pending' AND setup_message_id IS NULL AND setup_channel_id IS NULL AND purchased_at>? AND purchased_at<?",
      [Date.now() - RETRY_WINDOW_MS, Date.now() - RETRY_AFTER_MS],
    );
    for (const { item_key } of rows) await announce(item_key);
  }

  function start() {
    setInterval(() => void sweep().catch((error) => console.warn("[FBRP property setup] sweep:", error.message)), 60_000).unref();
    void sweep().catch(() => {});
  }

  return { announce, retire, component, sweep, start, embedFor, buttons };
}
