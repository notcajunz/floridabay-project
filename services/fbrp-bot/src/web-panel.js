import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { NETWORK_KINDS, callGame } from "./sync.js";
import { PERMISSION_BUNDLES, PERMISSION_CATALOG, VMENU_BUNDLES } from "./permission-catalog.js";
import { connectUrl } from "./site-url.js";
import { createAppeals } from "./appeals.js";
import { OWNER_DISCORD_ID } from "./access-control.js";

/** Objects the checkbox editor offers: real permissions only (templates like `<model>` are excluded). */
const EDITOR_CATALOG = PERMISSION_CATALOG.filter((entry) => !entry.object.includes("<"));
const ACE_OBJECT = /^[A-Za-z0-9_.*:-]{1,120}$/;

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../web");
const logoFile = path.resolve(webRoot, "../../../server-data/resources/[fbrp]/fbrp_loading/web/assets/fbrp-logo.png");
const commandReferenceFile = path.resolve(webRoot, "../../../BOT_COMMANDS.md");
const ACTOR = OWNER_DISCORD_ID;
const now = () => Date.now();

const MODAL_STYLES = new Set(["short", "paragraph"]);
const memberOf = async (client, guildId, discordId) => {
  const guild = guildId && client.guilds.cache.get(String(guildId));
  return guild ? guild.members.fetch(String(discordId)).catch(() => null) : null;
};
/** Adds or removes one Discord role, ignoring members/roles the bot cannot reach. */
async function setRole(client, guildId, roleId, discordId, add, reason) {
  if (!guildId || !roleId) return;
  const member = await memberOf(client, guildId, discordId);
  if (!member) return;
  await (add ? member.roles.add(String(roleId), reason) : member.roles.remove(String(roleId), reason)).catch(() => {});
}

const field = (name, label, type = "text", extra = {}) => ({
  name,
  label,
  type,
  ...extra,
});

export const PANEL_RESOURCES = {
  "ace-groups": {
    label: "ACE groups",
    group: "Access",
    description: "Permission groups used by Discord and FiveM.",
    table: "ace_groups",
    pk: ["name"],
    order: "rank_order DESC,name",
    effect: "permissions",
    protect: (key) => key.name === "owner",
    fields: [
      field("name", "Machine name", "slug", { required: true }),
      field("label", "Display label", "text", { required: true }),
      field("rank_order", "Rank order", "number", { default: 0 }),
      field("staff_only", "Only active while clocked in", "boolean", { default: false }),
      field("created_by", "Created by", "text", { default: ACTOR, advanced: true }),
    ],
  },
  "ace-entries": {
    label: "ACE permissions",
    group: "Access",
    description: "Allow and deny objects assigned to ACE groups.",
    table: "ace_entries",
    pk: ["group_name", "object"],
    order: "group_name,object",
    effect: "permissions",
    fields: [
      field("group_name", "ACE group", "relation", { source: "ace-groups", value: "name", display: "label", required: true }),
      field("object", "Permission object", "text", { required: true, suggestions: PERMISSION_CATALOG.map((item) => ({ value: item.object, label: `${item.category} · ${item.label}` })) }),
      field("mode", "Mode", "select", { options: ["allow", "deny"], default: "allow" }),
    ],
  },
  "ace-memberships": {
    label: "ACE members",
    group: "Access",
    description: "Direct ACE membership. Global roles follow these records.",
    table: "ace_memberships",
    pk: ["discord_id", "group_name", "origin"],
    order: "group_name,discord_id",
    effect: "permissions",
    fields: [
      field("discord_id", "Discord user ID", "snowflake", { required: true }),
      field("group_name", "ACE group", "relation", { source: "ace-groups", value: "name", display: "label", required: true }),
      field("origin", "Origin", "text", { default: "manual", required: true, suggestions: [{ value: "manual", label: "Direct membership (drives global roles)" }] }),
      field("added_by", "Added by", "text", { default: ACTOR, advanced: true }),
      field("added_at", "Added at", "timestamp", { default: "now", advanced: true }),
    ],
  },
  "role-bindings": {
    label: "ACE role gates",
    group: "Access",
    description: "A role follows direct ACE membership; unauthorized grants are removed.",
    table: "discord_role_bindings",
    pk: ["guild_id", "role_id", "group_name"],
    order: "guild_id,group_name,role_id",
    effect: "permissions",
    fields: [
      field("guild_id", "Discord server", "guild", { required: true }),
      field("role_id", "Discord role", "role", { guildField: "guild_id", required: true }),
      field("group_name", "ACE group", "relation", { source: "ace-groups", value: "name", display: "label", required: true }),
    ],
  },
  "network-guilds": {
    label: "Network servers",
    group: "Network",
    description: "Discord servers managed by the shared control plane.",
    table: "network_guilds",
    pk: ["guild_id"],
    order: `FIELD(kind,${NETWORK_KINDS.map((kind) => `'${kind}'`).join(",")}),name`,
    effect: "network",
    fields: [
      field("guild_id", "Discord server", "guild", { required: true }),
      field("name", "Server name", "text", { required: true }),
      field("kind", "Server type (global roles can target a type)", "select", { options: NETWORK_KINDS, default: "other" }),
      field("added_by", "Added by", "text", { default: ACTOR, advanced: true }),
      field("added_at", "Added at", "timestamp", { default: "now", advanced: true }),
    ],
  },
  "channel-bindings": {
    label: "Log & panel channels",
    group: "Discord",
    description: "Purpose-bound channels used by tickets, audits and security boards.",
    table: "discord_channel_bindings",
    pk: ["purpose"],
    order: "purpose",
    effect: "panels",
    fields: [
      field("purpose", "Purpose", "text", { required: true, suggestions: ["ticket_panel", "tickets", "verification", "security", "moderation", "bans", "unbans", "blacklists", "staff_audit", "staff_exams", "staff_exams_head_admin", "staff_exams_management", "staff_duty", "roster", "role_sync", "protected_roles", "game", "organizations"].map((value) => ({ value })) }),
      field("guild_id", "Discord server", "guild", { required: true }),
      field("channel_id", "Channel", "channel", { guildField: "guild_id", required: true }),
      field("updated_by", "Updated by", "text", { default: ACTOR, advanced: true }),
      field("updated_at", "Updated at", "timestamp", { default: "now", advanced: true }),
    ],
  },
  "ticket-settings": {
    label: "Ticket settings",
    group: "Tickets",
    description: "Per-server limits, Discord categories and the ticket panel text. Pick a key from the suggestions; values are JSON (numbers, \"quoted text\" or a category ID in quotes).",
    table: "ticket_settings",
    pk: ["guild_id", "key"],
    order: "guild_id,`key`",
    effect: "tickets",
    fields: [
      field("guild_id", "Discord server", "guild", { required: true }),
      field("key", "Setting key", "text", { required: true, suggest: "ticketSettingKeys" }),
      field("value", "JSON value", "json", { required: true }),
    ],
  },
  "ticket-types": {
    label: "Ticket types",
    group: "Tickets",
    description: "Categories in the ticket panel and their pop-up forms (1–5 questions). Changes re-post the panel instantly.",
    table: "ticket_types",
    pk: ["type_key"],
    order: "sort_order,label",
    effect: "tickets",
    fields: [
      field("type_key", "Type key", "slug", { required: true }),
      field("label", "Name (max 45)", "text", { required: true }),
      field("description", "Panel description (max 100)", "text", { default: "" }),
      field("priority", "Default priority", "relation", { source: "ticket-priorities", value: "level", display: "label", default: 3 }),
      field("enabled", "Shown in the panel", "boolean", { default: true }),
      field("sort_order", "Display order", "number", { default: 0 }),
      field("fields", "Form questions (JSON)", "json", {
        required: true,
        default: [{ id: "subject", label: "Subject", style: "short", required: true, max: 100 }, { id: "description", label: "Describe what you need", style: "paragraph", required: true, max: 1000 }],
        help: 'Up to 5 questions: [{"id":"subject","label":"Subject","style":"short|paragraph","required":true,"max":100}]',
      }),
    ],
    validate: async (values) => {
      if (String(values.label).length > 45) throw new Error("Ticket type names are limited to 45 characters (Discord modal titles).");
      if (String(values.description || "").length > 100) throw new Error("Descriptions are limited to 100 characters.");
      if (String(values.type_key).length > 24) throw new Error("Type keys are limited to 24 characters.");
      const questions = JSON.parse(values.fields);
      if (!Array.isArray(questions) || questions.length < 1 || questions.length > 5)
        throw new Error("A ticket form needs between 1 and 5 questions.");
      const ids = new Set();
      for (const q of questions) {
        if (!q || !/^[a-z0-9_]{1,40}$/.test(String(q.id || "")) || ids.has(q.id))
          throw new Error("Every question needs a unique id using lowercase letters, numbers or underscores.");
        ids.add(q.id);
        if (!q.label || String(q.label).length > 45) throw new Error(`Question "${q.id}" needs a label of at most 45 characters.`);
        if (!MODAL_STYLES.has(q.style)) throw new Error(`Question "${q.id}" style must be "short" or "paragraph".`);
        const max = Number(q.max ?? 1000);
        if (!Number.isInteger(max) || max < 1 || max > 4000) throw new Error(`Question "${q.id}" max must be 1–4000.`);
      }
      values.fields = JSON.stringify(questions.map((q) => ({ id: q.id, label: String(q.label), style: q.style, required: Boolean(q.required), max: Number(q.max ?? 1000) })));
    },
  },
  "ticket-priorities": {
    label: "Ticket priorities",
    group: "Tickets",
    description: "Priority levels and their response-time targets. Level 0 is the most urgent.",
    table: "ticket_priorities",
    pk: ["level"],
    order: "level",
    effect: "tickets",
    fields: [
      field("level", "Level (0 = most urgent)", "number", { required: true }),
      field("label", "Label", "text", { required: true }),
      field("sla_minutes", "Response target (minutes)", "number", { default: 240 }),
    ],
  },
  "ticket-support-roles": {
    label: "Ticket support roles",
    group: "Tickets",
    description: "Support and manager access by ticket type.",
    table: "ticket_support_roles",
    pk: ["guild_id", "ticket_type", "role_id"],
    order: "guild_id,ticket_type,level,role_id",
    effect: "tickets",
    fields: [
      field("guild_id", "Discord server", "guild", { required: true }),
      field("ticket_type", "Ticket type or all", "text", { required: true }),
      field("role_id", "Support role", "role", { guildField: "guild_id", required: true }),
      field("level", "Access level", "select", { options: ["support", "manager"], default: "support" }),
    ],
  },
  headtags: {
    label: "Headtags",
    group: "Community",
    description: "Top headtags and bottom gang tags available in game.",
    table: "headtags",
    pk: ["id"],
    order: "kind,priority DESC,label",
    effect: "game",
    fields: [
      field("id", "ID", "number", { readonly: true, auto: true }),
      field("kind", "Tag slot", "select", { options: ["head", "gang"], default: "head" }),
      field("label", "Label", "text", { required: true }),
      field("color", "Color", "color", { default: "#43E8D8" }),
      field("guild_id", "Discord server", "guild"),
      field("role_id", "Required role", "role", { guildField: "guild_id" }),
      field("priority", "Priority", "number", { default: 0 }),
      field("enabled", "Enabled", "boolean", { default: true }),
      field("created_by", "Created by", "text", { default: ACTOR, advanced: true }),
    ],
  },
  "headtag-grants": {
    label: "Headtag grants",
    group: "Community",
    description: "Direct tag grants. Role-based grants (origin discord:…) are rebuilt automatically from Discord roles.",
    table: "headtag_grants",
    pk: ["discord_id", "tag_id", "origin"],
    order: "tag_id,discord_id",
    effect: "game",
    fields: [
      field("discord_id", "Discord user ID", "snowflake", { required: true }),
      field("tag_id", "Tag", "relation", { source: "headtags", value: "id", display: "label", required: true }),
      field("origin", "Origin", "text", { default: "manual", required: true }),
      field("added_by", "Added by", "text", { default: ACTOR, advanced: true }),
      field("added_at", "Added at", "timestamp", { default: "now", advanced: true }),
    ],
    afterSave: async ({ client, db }, values, original) => {
      const tag = await db.one("SELECT guild_id,role_id FROM headtags WHERE id=?", [values.tag_id]);
      if (original && (original.discord_id !== values.discord_id || Number(original.tag_id) !== Number(values.tag_id))) {
        const old = await db.one("SELECT guild_id,role_id FROM headtags WHERE id=?", [original.tag_id]);
        await setRole(client, old?.guild_id, old?.role_id, original.discord_id, false, "Headtag revoke (control panel)");
      }
      await setRole(client, tag?.guild_id, tag?.role_id, values.discord_id, true, "Headtag grant (control panel)");
    },
    afterDelete: async ({ client, db }, key) => {
      const tag = await db.one("SELECT guild_id,role_id FROM headtags WHERE id=?", [key.tag_id]);
      await setRole(client, tag?.guild_id, tag?.role_id, key.discord_id, false, "Headtag revoke (control panel)");
    },
  },
  organizations: {
    label: "Organizations",
    group: "Community",
    description: "Gangs, businesses and departments with in-game duty access.",
    table: "organizations",
    pk: ["id"],
    order: "active DESC,type,name",
    effect: "game",
    fields: [
      field("id", "ID", "number", { readonly: true, auto: true }),
      field("slug", "Slug", "slug", { required: true }),
      field("name", "Display name", "text", { required: true }),
      field("type", "Type", "select", { options: ["gang", "business", "leo", "fire", "government", "other"], default: "other" }),
      field("color", "Color", "color", { default: "#43E8D8" }),
      field("tag_id", "Headtag ID", "relation", { source: "headtags", value: "id", display: "label", required: true }),
      field("ace_group", "Duty ACE group", "relation", { source: "ace-groups", value: "name", display: "label" }),
      field("guild_id", "Home server", "guild"),
      field("role_id", "Home role", "role", { guildField: "guild_id" }),
      field("active", "Active", "boolean", { default: true }),
      field("created_by", "Created by", "text", { default: ACTOR, advanced: true }),
    ],
  },
  "organization-requirements": {
    label: "Organization role requirements",
    group: "Community",
    description: "Network roles that make a member eligible for an organization.",
    table: "organization_role_requirements",
    pk: ["org_id", "guild_id", "role_id"],
    order: "org_id,guild_id,role_id",
    effect: "game",
    fields: [
      field("org_id", "Organization", "relation", { source: "organizations", value: "id", display: "name", required: true }),
      field("guild_id", "Discord server", "guild", { required: true }),
      field("role_id", "Required role", "role", { guildField: "guild_id", required: true }),
      field("added_by", "Added by", "text", { default: ACTOR, advanced: true }),
      field("added_at", "Added at", "timestamp", { default: "now", advanced: true }),
    ],
  },
  "radio-channels": {
    label: "Radio channels",
    group: "Community",
    description: "Managed pma-voice frequencies. Selecting an organization makes active duty mandatory.",
    table: "radio_channels",
    pk: ["id"],
    order: "sort_order,channel",
    effect: "game",
    fields: [
      field("id", "ID", "number", { readonly: true, auto: true }),
      field("channel", "Frequency", "number", { required: true }),
      field("name", "Display name", "text", { required: true }),
      field("description", "Description", "text"),
      field("color", "Color", "color", { default: "#43E8D8" }),
      field("org_id", "Duty organization", "relation", { source: "organizations", value: "id", display: "name" }),
      field("sort_order", "Display order", "number", { default: 0 }),
      field("enabled", "Enabled", "boolean", { default: true }),
      field("created_by", "Created by", "text", { default: ACTOR, advanced: true }),
      field("created_at", "Created at", "timestamp", { default: "now", advanced: true }),
    ],
  },
  "roster-categories": {
    label: "Roster categories",
    group: "Staff roster",
    description: "Callsign ranges for each group of staff ranks.",
    table: "staff_roster_categories",
    pk: ["id"],
    order: "sort_order,name",
    effect: "none",
    fields: [
      field("id", "ID", "number", { readonly: true, auto: true }),
      field("name", "Name", "text", { required: true }),
      field("callsign_start", "First callsign", "number", { required: true }),
      field("callsign_end", "Last callsign", "number", { required: true }),
      field("sort_order", "Display order", "number", { default: 0 }),
      field("created_at", "Created at", "timestamp", { default: "now", advanced: true }),
    ],
  },
  "roster-ranks": {
    label: "Roster ranks",
    group: "Staff roster",
    description: "Rank roles, the ACE group /staff add puts each rank in, and activity requirements.",
    table: "staff_roster_ranks",
    pk: ["id"],
    order: "category_id,sort_order,name",
    effect: "none",
    fields: [
      field("id", "ID", "number", { readonly: true, auto: true }),
      field("category_id", "Category", "relation", { source: "roster-categories", value: "id", display: "name", required: true }),
      field("name", "Rank name", "text", { required: true }),
      field("discord_guild_id", "Discord server", "guild"),
      field("discord_role_id", "Rank role", "role", { guildField: "discord_guild_id" }),
      field("ace_group", "ACE group (/staff add)", "relation", { source: "ace-groups", value: "name", display: "label" }),
      field("sort_order", "Display order", "number", { default: 0 }),
      field("weekly_seconds", "Weekly requirement (seconds)", "number", { default: 0 }),
      field("minimum_days", "Minimum days", "number", { default: 0 }),
      field("created_at", "Created at", "timestamp", { default: "now", advanced: true }),
    ],
  },
  "roster-jobs": {
    label: "Roster secondary jobs",
    group: "Staff roster",
    description: "Secondary staff assignments and their Discord roles.",
    table: "staff_roster_jobs",
    pk: ["id"],
    order: "sort_order,name",
    effect: "none",
    fields: [
      field("id", "ID", "number", { readonly: true, auto: true }),
      field("name", "Job name", "text", { required: true }),
      field("description", "Description", "textarea", { default: "" }),
      field("discord_guild_id", "Discord server", "guild"),
      field("discord_role_id", "Job role", "role", { guildField: "discord_guild_id" }),
      field("sort_order", "Display order", "number", { default: 0 }),
      field("created_at", "Created at", "timestamp", { default: "now", advanced: true }),
    ],
  },
  "roster-members": {
    label: "Roster members",
    group: "Staff roster",
    description: "Staff on the roster. Saving applies the rank role; new or changed callsigns are posted to the callsign channel. Use /staff add to also set ACE groups.",
    table: "staff_roster_members",
    pk: ["discord_id"],
    order: "status,callsign,display_name",
    effect: "none",
    fields: [
      field("discord_id", "Discord user ID", "snowflake", { required: true }),
      field("display_name", "Display name", "text", { required: true }),
      field("rank_id", "Rank", "relation", { source: "roster-ranks", value: "id", display: "name", required: true }),
      field("callsign", "Callsign", "number"),
      field("status", "Status", "select", { options: ["active", "inactive", "loa", "removed"], default: "active" }),
      field("activity_note", "Activity note", "textarea", { default: "" }),
      field("tickets_handled", "Tickets handled", "number", { default: 0 }),
      field("username", "Discord username", "text", { default: "", advanced: true }),
      field("rank_name", "Rank name (filled from rank)", "text", { advanced: true }),
      field("joined_at", "Joined at", "timestamp", { default: "now", advanced: true }),
      field("rank_changed_at", "Rank changed at", "timestamp", { default: "now", advanced: true }),
      field("updated_at", "Updated at", "timestamp", { default: "now", advanced: true, alwaysNow: true }),
      field("added_by", "Added by", "text", { default: ACTOR, advanced: true }),
    ],
    validate: async (values, { db }) => {
      const rank = await db.one(
        "SELECT r.name,c.callsign_start,c.callsign_end FROM staff_roster_ranks r JOIN staff_roster_categories c ON c.id=r.category_id WHERE r.id=?",
        [values.rank_id],
      );
      if (!rank) throw new Error("Choose a roster rank.");
      values.rank_name = rank.name;
      if (values.callsign !== null && values.callsign !== undefined && (values.callsign < rank.callsign_start || values.callsign > rank.callsign_end))
        throw new Error(`Callsigns for this rank's category run ${rank.callsign_start}–${rank.callsign_end}.`);
    },
    afterSave: async ({ client, db, announceCallsign }, values, original) => {
      const rank = await db.one(
        "SELECT discord_role_id,discord_guild_id FROM staff_roster_ranks WHERE id=?",
        [values.rank_id],
      );
      if (original?.rank_id && Number(original.rank_id) !== Number(values.rank_id)) {
        const old = await db.one("SELECT discord_role_id,discord_guild_id FROM staff_roster_ranks WHERE id=?", [original.rank_id]);
        await setRole(client, old?.discord_guild_id, old?.discord_role_id, values.discord_id, false, "FBRP staff roster rank (control panel)");
      }
      await setRole(client, rank?.discord_guild_id, rank?.discord_role_id, values.discord_id, values.status !== "removed", "FBRP staff roster rank (control panel)");
      const changed = !original || original.status === "removed" || Number(original.callsign) !== Number(values.callsign);
      if (values.callsign !== null && values.callsign !== undefined && values.status !== "removed" && changed)
        await announceCallsign?.(values.discord_id, values.callsign);
    },
  },
  "roster-member-jobs": {
    label: "Roster job assignments",
    group: "Staff roster",
    description: "Secondary jobs held by roster members. Job roles are applied in Discord.",
    table: "staff_roster_member_jobs",
    pk: ["discord_id", "job_id"],
    order: "job_id,discord_id",
    effect: "none",
    fields: [
      field("discord_id", "Roster member", "relation", { source: "roster-members", value: "discord_id", display: "display_name", required: true }),
      field("job_id", "Job", "relation", { source: "roster-jobs", value: "id", display: "name", required: true }),
      field("assigned_by", "Assigned by", "text", { default: ACTOR, advanced: true }),
      field("assigned_at", "Assigned at", "timestamp", { default: "now", advanced: true }),
    ],
    afterSave: async ({ client, db }, values) => {
      const job = await db.one("SELECT discord_role_id,discord_guild_id FROM staff_roster_jobs WHERE id=?", [values.job_id]);
      await setRole(client, job?.discord_guild_id, job?.discord_role_id, values.discord_id, true, "FBRP roster job (control panel)");
    },
    afterDelete: async ({ client, db }, key) => {
      const job = await db.one("SELECT discord_role_id,discord_guild_id FROM staff_roster_jobs WHERE id=?", [key.job_id]);
      await setRole(client, job?.discord_guild_id, job?.discord_role_id, key.discord_id, false, "FBRP roster job (control panel)");
    },
  },
  "roster-discipline": {
    label: "Roster discipline",
    group: "Staff roster",
    description: "Warnings and strikes. Set a revoke time to revoke one.",
    table: "staff_roster_discipline",
    pk: ["id"],
    order: "created_at DESC",
    effect: "none",
    fields: [
      field("id", "ID", "number", { readonly: true, auto: true }),
      field("discord_id", "Roster member", "relation", { source: "roster-members", value: "discord_id", display: "display_name", required: true }),
      field("kind", "Kind", "select", { options: ["warning", "strike"], default: "warning" }),
      field("reason", "Reason", "textarea", { required: true }),
      field("revoked_at", "Revoked at (blank = active)", "timestamp"),
      field("revoke_reason", "Revoke reason", "text"),
      field("actor_id", "Issued by", "text", { default: ACTOR, advanced: true }),
      field("created_at", "Created at", "timestamp", { default: "now", advanced: true }),
      field("revoked_by", "Revoked by", "text", { advanced: true }),
    ],
  },
  "protected-roles": {
    label: "Protected roles",
    group: "Security",
    description: "Roles whose edits and assignments are actively enforced.",
    table: "protected_roles",
    pk: ["guild_id", "role_id"],
    order: "guild_id,role_id",
    effect: "security",
    fields: [
      field("guild_id", "Discord server", "guild", { required: true }),
      field("role_id", "Protected role", "role", { guildField: "guild_id", required: true }),
      field("added_by", "Added by", "text", { default: ACTOR, advanced: true }),
      field("added_at", "Added at", "timestamp", { default: "now", advanced: true }),
    ],
  },
  "protected-role-access": {
    label: "Protected-role managers",
    group: "Security",
    description: "Users and roles allowed to manage protected roles.",
    table: "protected_role_access",
    pk: ["guild_id", "role_id", "subject_type", "subject_id"],
    order: "guild_id,role_id,subject_type,subject_id",
    effect: "security",
    fields: [
      field("guild_id", "Discord server", "guild", { required: true }),
      field("role_id", "Protected role", "role", { guildField: "guild_id", required: true }),
      field("subject_type", "Manager type", "select", { options: ["user", "role"], required: true }),
      field("subject_id", "User or role ID", "snowflake", { required: true }),
      field("added_by", "Added by", "text", { default: ACTOR, advanced: true }),
    ],
  },
  "allowed-bots": {
    label: "Allowed bots",
    group: "Security",
    description: "First key in Bot Guard's two-key admission policy.",
    table: "network_allowed_bots",
    pk: ["bot_id"],
    order: "label,bot_id",
    effect: "security",
    fields: [
      field("bot_id", "Bot user ID", "snowflake", { required: true }),
      field("label", "Label", "text"),
      field("added_by", "Added by", "text", { default: ACTOR, advanced: true }),
      field("added_at", "Added at", "timestamp", { default: "now", advanced: true }),
    ],
  },
  "trusted-bot-adders": {
    label: "Trusted bot adders",
    group: "Security",
    description: "Second key in Bot Guard's two-key admission policy.",
    table: "network_bot_adder_allowlist",
    pk: ["guild_id", "subject_type", "subject_id"],
    order: "guild_id,subject_type,subject_id",
    effect: "security",
    fields: [
      field("guild_id", "Server ID or *", "text", { required: true }),
      field("subject_type", "Subject type", "select", { options: ["user", "role"], required: true }),
      field("subject_id", "User or role ID", "snowflake", { required: true }),
      field("added_by", "Added by", "text", { default: ACTOR, advanced: true }),
      field("added_at", "Added at", "timestamp", { default: "now", advanced: true }),
    ],
  },
  "security-exemptions": {
    label: "Security exemptions",
    group: "Security",
    description: "Owner-approved automated-security bypasses. Use * for the whole network or one Discord server ID for an individual scope.",
    table: "discord_security_exemption_scopes",
    pk: ["discord_id", "guild_id"],
    order: "discord_id,guild_id",
    effect: "security",
    fields: [
      field("discord_id", "Discord user ID", "snowflake", { required: true }),
      field("guild_id", "Server ID or * (global)", "text", { required: true, default: "*" }),
      field("reason", "Reason", "textarea", { required: true }),
      field("added_by", "Added by", "text", { default: ACTOR, advanced: true }),
      field("added_at", "Added at", "timestamp", { default: "now", advanced: true }),
    ],
  },
  offices: {
    label: "Voice offices",
    group: "Discord",
    description: "Managed voice offices and their owners.",
    table: "offices",
    pk: ["guild_id", "channel_id"],
    order: "guild_id,channel_id",
    effect: "none",
    fields: [
      field("guild_id", "Discord server", "guild", { required: true }),
      field("channel_id", "Voice channel", "channel", { guildField: "guild_id", required: true }),
      field("owner_id", "Owner user ID", "snowflake", { required: true }),
      field("set_by", "Set by", "text", { default: ACTOR, advanced: true }),
      field("set_at", "Set at", "timestamp", { default: "now", advanced: true }),
    ],
    afterSave: async ({ client }, values, original) => {
      const channel = client.guilds.cache.get(String(values.guild_id))?.channels.cache.get(String(values.channel_id));
      if (!channel?.permissionOverwrites) return;
      if (original?.owner_id && String(original.owner_id) !== String(values.owner_id))
        await channel.permissionOverwrites.delete(String(original.owner_id), "Office owner replaced").catch(() => {});
      await channel.permissionOverwrites.edit(String(values.owner_id), { ViewChannel: true, Connect: true, ManageChannels: true, MoveMembers: true }, "Florida Bay office owner");
    },
    afterDelete: async ({ client, db }, key, row) => {
      const channel = client.guilds.cache.get(String(key.guild_id))?.channels.cache.get(String(key.channel_id));
      if (row?.owner_id) await channel?.permissionOverwrites?.delete(String(row.owner_id), "Office assignment cleared").catch(() => {});
    },
  },
  "server-state": {
    label: "Live server state",
    group: "FiveM",
    description: "AOP, peacetime, priority and other database-backed live state. Saving pushes it to the FiveM server.",
    table: "server_state",
    pk: ["key"],
    order: "`key`",
    effect: "game",
    fields: [
      field("key", "State key", "text", { required: true }),
      field("value", "JSON value", "json", { required: true }),
      field("updated_by", "Updated by", "text", { default: ACTOR, advanced: true }),
      field("updated_at", "Updated at", "timestamp", { default: "now", advanced: true, alwaysNow: true }),
    ],
  },
  "staff-exams": {
    label: "Staff exams",
    group: "Staff",
    description: "Promotion exams on the member portal. Choice questions use {\"id\",\"type\":\"choice\",\"prompt\",\"options\":[...],\"answer\":index}; written ones {\"id\",\"type\":\"text\",\"prompt\",\"min\",\"max\"}.",
    table: "staff_exams",
    pk: ["exam_key"],
    order: "exam_key",
    effect: "none",
    fields: [
      field("exam_key", "Exam key", "slug", { required: true }),
      field("title", "Title", "text", { required: true }),
      field("target_rank", "Rank it leads to", "text", { required: true }),
      field("eligible_group", "Only this current rank may sit it", "relation", { source: "ace-groups", value: "name", display: "label", required: true }),
      field("description", "Description", "text", { default: "" }),
      field("pass_role_name", "Passed role name (staff Discord)", "text", { required: true }),
      field("pass_role_id", "Passed role ID (auto-created when empty)", "text", { advanced: true }),
      field("questions", "Questions (JSON)", "json", { required: true }),
      field("pass_mark", "Pass mark (%)", "number", { default: 70 }),
      field("cooldown_days", "Retake cooldown (days)", "number", { default: 14 }),
      field("enabled", "Open for applications", "boolean", { default: true }),
      field("updated_at", "Updated at", "timestamp", { default: "now", advanced: true, alwaysNow: true }),
    ],
  },
  "org-shop": {
    label: "Organization shop",
    group: "Economy",
    description: "What gangs and businesses can buy with organization money. Properties need business, x, y, z (the terminal / MLO entrance); vehicles a model; weapon permits a weapons list; outfits male/female components; perks perk + value.",
    table: "org_shop_items",
    pk: ["item_key"],
    order: "FIELD(kind,'property','vehicle','weapon','outfit','perk'),sort_order,label",
    effect: "economy",
    fields: [
      field("item_key", "Item key", "slug", { required: true }),
      field("kind", "Kind", "select", { options: ["property", "vehicle", "weapon", "outfit", "perk"], default: "property" }),
      field("label", "Name", "text", { required: true }),
      field("description", "Description", "text", { default: "" }),
      field("price", "Price ($)", "number", { required: true }),
      field("org_types", "Organization types (comma separated)", "text", { default: "gang,business" }),
      field("data", "Item data (JSON)", "json", { required: true, default: {} }),
      field("enabled", "For sale", "boolean", { default: true }),
      field("sort_order", "Display order", "number", { default: 0 }),
    ],
  },
  "org-wallets": {
    label: "Organization wallets",
    group: "Economy",
    description: "Raw balances. Prefer /orgbank adjust or the portal so every change lands in the ledger.",
    table: "org_wallets",
    pk: ["org_id"],
    order: "balance DESC",
    effect: "none",
    fields: [
      field("org_id", "Organization", "relation", { source: "organizations", value: "id", display: "name", required: true }),
      field("balance", "Balance", "number", { default: 0 }),
      field("lifetime_earned", "Lifetime earned", "number", { default: 0, advanced: true }),
      field("lifetime_spent", "Lifetime spent", "number", { default: 0, advanced: true }),
      field("updated_at", "Updated at", "timestamp", { default: "now", advanced: true, alwaysNow: true }),
    ],
  },
  "bot-config": {
    label: "Bot internals",
    group: "Advanced",
    description: "Database-backed bot configuration and message cursors. Edit carefully.",
    table: "bot_config",
    pk: ["key"],
    order: "`key`",
    effect: "panels",
    fields: [
      field("key", "Config key", "text", { required: true }),
      field("value", "JSON value", "json", { required: true }),
      field("updated_by", "Updated by", "text", { default: ACTOR, advanced: true }),
      field("updated_at", "Updated at", "timestamp", { default: "now", advanced: true }),
    ],
  },
};

const publicDefinition = ([id, resource], suggestions) => ({
  id,
  label: resource.label,
  group: resource.group,
  description: resource.description,
  pk: resource.pk,
  fields: resource.fields.map(({ suggest, ...meta }) =>
    suggest ? { ...meta, suggestions: suggestions[suggest] || [] } : meta,
  ),
});

function normalizedValue(meta, value) {
  // Optional text with an empty default stays "" (those columns are NOT NULL).
  if (value === "" && meta.default === "") return "";
  if (value === "" || value === undefined) return null;
  if (meta.type === "boolean") return value ? 1 : 0;
  if (meta.type === "number" || meta.type === "timestamp") {
    if (value === "now") return now();
    const number = Number(value);
    if (!Number.isFinite(number)) throw new Error(`${meta.label} must be a number.`);
    return number;
  }
  if (meta.type === "json") {
    if (typeof value === "string") {
      try {
        return JSON.stringify(JSON.parse(value));
      } catch {
        throw new Error(`${meta.label} must be valid JSON.`);
      }
    }
    return JSON.stringify(value);
  }
  const text = String(value).trim();
  if (meta.type === "snowflake" && !/^\d{15,24}$/.test(text))
    throw new Error(`${meta.label} must be a Discord ID.`);
  if (meta.type === "slug" && !/^[a-z0-9_-]{1,64}$/.test(text))
    throw new Error(`${meta.label} must use lowercase letters, numbers, underscores or hyphens.`);
  return text;
}

function parseJsonColumns(rows, resource) {
  const jsonFields = new Set(resource.fields.filter((item) => item.type === "json").map((item) => item.name));
  return rows.map((row) => {
    const next = { ...row };
    for (const name of jsonFields) {
      if (typeof next[name] === "string") {
        try {
          next[name] = JSON.parse(next[name]);
        } catch {}
      }
    }
    return next;
  });
}

// Authentication attempts are rate-limited by address. OAuth is preferred; a
// one-time Discord DM code remains available when an OAuth redirect is not yet allow-listed.
const failedLogins = new Map();
const dmStarts = new Map();
const LOCKOUT_FAILURES = 10;
const LOCKOUT_MS = 15 * 60 * 1000;
const DM_START_LIMIT = 5;
// The public site normally makes only a handful of requests per page load. This
// generous ceiling sheds abusive clients before they can create database or
// Discord API work, while allowing ordinary browsers and shared connections.
const HTTP_RATE_WINDOW_MS = 10_000;
const HTTP_RATE_LIMIT = 120;
const HTTP_RATE_MAX_CLIENTS = 10_000;
const requestWindows = new Map();
// X-Forwarded-For is only believed when it arrives from the reverse proxy on a private address;
// otherwise anyone could pick the address that is recorded for them.
const trustedProxy = (request) => /^(::ffff:)?(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)|^::1$/.test(String(request.socket.remoteAddress || ""));
const clientAddress = (request) =>
  String((trustedProxy(request) && request.headers["x-forwarded-for"]) || request.socket.remoteAddress || "unknown").split(",")[0].trim();
function allowHttpRequest(request) {
  const stamp = Date.now();
  const address = clientAddress(request);
  let entry = requestWindows.get(address);
  if (!entry || stamp - entry.since >= HTTP_RATE_WINDOW_MS) {
    requestWindows.set(address, { count: 1, since: stamp });
    if (requestWindows.size > HTTP_RATE_MAX_CLIENTS) {
      for (const [key, value] of requestWindows) {
        if (stamp - value.since >= HTTP_RATE_WINDOW_MS) requestWindows.delete(key);
      }
      while (requestWindows.size > HTTP_RATE_MAX_CLIENTS)
        requestWindows.delete(requestWindows.keys().next().value);
    }
    return true;
  }
  entry.count += 1;
  return entry.count <= HTTP_RATE_LIMIT;
}
function lockedOut(request) {
  const entry = failedLogins.get(clientAddress(request));
  if (!entry) return false;
  if (Date.now() - entry.since > LOCKOUT_MS) {
    failedLogins.delete(clientAddress(request));
    return false;
  }
  return entry.count >= LOCKOUT_FAILURES;
}
function recordFailure(request) {
  const address = clientAddress(request);
  const entry = failedLogins.get(address);
  if (!entry || Date.now() - entry.since > LOCKOUT_MS) failedLogins.set(address, { count: 1, since: Date.now() });
  else entry.count += 1;
  if (failedLogins.get(address).count === LOCKOUT_FAILURES)
    console.warn(`[FBRP panel] ${address} locked out for 15 minutes after ${LOCKOUT_FAILURES} wrong tokens.`);
}

function allowDmStart(request) {
  const address = clientAddress(request);
  const entry = dmStarts.get(address);
  if (!entry || Date.now() - entry.since > LOCKOUT_MS) {
    dmStarts.set(address, { count: 1, since: Date.now() });
    return true;
  }
  if (entry.count >= DM_START_LIMIT) return false;
  entry.count += 1;
  return true;
}

const sha256 = (value) => createHash("sha256").update(String(value)).digest("hex");
const parseCookies = (request) => Object.fromEntries(
  String(request.headers.cookie || "")
    .split(";")
    .map((part) => part.trim().split("="))
    .filter(([name]) => name)
    .map(([name, ...value]) => [name, decodeURIComponent(value.join("="))]),
);

function sendJson(response, status, body, extraHeaders = {}) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...extraHeaders,
  });
  response.end(JSON.stringify(body));
}

async function bodyJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1024 * 1024) throw new Error("Request body is too large.");
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function serveStatic(request, response) {
  const url = new URL(request.url, "http://localhost");
  const aliases = {
    "/": "index.html",
    "/portal": "portal.html",
    "/verify": "verify.html",
    "/transcript": "transcript.html",
    "/control": "control.html",
    "/auth/callback": "callback.html",
    "/auth/callback.html": "callback.html",
    "/assets/fbrp-logo.png": "@logo",
  };
  const requested = aliases[url.pathname] || url.pathname.slice(1);
  const filename = requested === "@logo" ? logoFile : path.resolve(webRoot, requested);
  if (!filename.startsWith(`${webRoot}${path.sep}`) && filename !== path.join(webRoot, "index.html")) {
    if (filename !== logoFile) {
      response.writeHead(404).end();
      return;
    }
  }
  const info = await stat(filename).catch(() => null);
  if (!info?.isFile()) {
    response.writeHead(404).end("Not found");
    return;
  }
  const types = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".woff2": "font/woff2" };
  response.writeHead(200, {
    "Content-Type": types[path.extname(filename)] || "application/octet-stream",
    "Cache-Control": filename.endsWith(".html") ? "no-cache" : /\.(woff2|webp)$/.test(filename) ? "public, max-age=604800, immutable" : "public, max-age=300",
    "Content-Security-Policy": "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; img-src 'self' data: https://cdn.discordapp.com https://media.discordapp.net; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
  });
  createReadStream(filename).pipe(response);
}

export function startWebPanel(context) {
  const host = String(process.env.FBRP_PANEL_HOST || "127.0.0.1");
  const port = Number(process.env.FBRP_PANEL_PORT || 8080);
  const publicUrl = String(process.env.FBRP_PUBLIC_URL || `http://${host}:${port}`).replace(/\/$/, "");
  const publicLocation = new URL(publicUrl);
  // The old address (for example https://cixnservices.xyz/fbrp) keeps working beside the main one.
  const legacyLocation = process.env.FBRP_LEGACY_URL ? new URL(String(process.env.FBRP_LEGACY_URL).replace(/\/$/, "")) : null;
  const baseFor = (request) => {
    const host = String((trustedProxy(request) && request.headers["x-forwarded-host"]) || request.headers.host || "").split(",")[0].trim().toLowerCase();
    return legacyLocation && host === legacyLocation.host.toLowerCase() ? legacyLocation : publicLocation;
  };
  const baseUrl = (request) => baseFor(request).href.replace(/\/$/, "");
  const ownerDiscordId = String(context.ownerDiscordId || OWNER_DISCORD_ID);
  const oauthStates = new Map();
  const dmChallenges = new Map();
  const {
    client, db, audit, refreshGame, syncAll, saveGlobalSync, deleteGlobalSync,
    bindSyncRole, setGlobalSyncOrder, pushGlobalSyncs, ensureTicketPanel,
    createWebsiteTicket, websiteTicketAction, websiteTicketTypes,
    websiteTicketPriorities, websiteTicketTranscript, ensureProtectedRoleBoard, announceCallsign,
    hasPermission, liftAppealedCase, recordVerification, staffExams, economy, log,
  } = context;

  const cookieFor = (request, name, value, maxAge) => {
    const base = baseFor(request);
    return `${name}=${encodeURIComponent(value)}; Path=${base.pathname === "/" ? "/" : base.pathname.replace(/\/$/, "")}; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${base.protocol === "https:" ? "; Secure" : ""}`;
  };
  const sessionCookie = (request, value, maxAge = 7 * 86400) => cookieFor(request, "fbrp_session", value, maxAge);
  const stateCookie = (request, value, maxAge = 600) => cookieFor(request, "fbrp_oauth_state", value, maxAge);

  async function sessionFor(request) {
    const raw = parseCookies(request).fbrp_session;
    if (!raw) return null;
    const row = await db.one("SELECT * FROM portal_sessions WHERE session_hash=?", [sha256(raw)]).catch(() => null);
    if (!row || Number(row.expires_at) <= Date.now()) {
      if (row) await db.query("DELETE FROM portal_sessions WHERE session_hash=?", [row.session_hash]).catch(() => {});
      return null;
    }
    if (Date.now() - Number(row.last_seen) > 300000)
      await db.query("UPDATE portal_sessions SET last_seen=? WHERE session_hash=?", [Date.now(), row.session_hash]).catch(() => {});
    return { id: String(row.discord_id), username: row.username, avatar: row.avatar };
  }

  async function createSession(user) {
    const raw = randomBytes(32).toString("base64url");
    const stamp = Date.now();
    const username = String(user.global_name || user.globalName || user.username || user.id).slice(0, 100);
    const avatar = user.avatar
      ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`
      : typeof user.displayAvatarURL === "function" ? user.displayAvatarURL({ size: 128 }) : null;
    await db.query(
      "INSERT INTO portal_sessions(session_hash,discord_id,username,avatar,created_at,last_seen,expires_at) VALUES(?,?,?,?,?,?,?)",
      [sha256(raw), String(user.id), username, avatar, stamp, stamp, stamp + 7 * 86400000],
    );
    await db.query("DELETE FROM portal_sessions WHERE expires_at<?", [stamp]).catch(() => {});
    return raw;
  }

  async function accessFor(discordId) {
    const owner = String(discordId) === ownerDiscordId;
    const roster = await db.one("SELECT status FROM staff_roster_members WHERE discord_id=?", [String(discordId)]);
    const staff = owner || Boolean(roster && roster.status !== "removed");
    const [opsControl, sceneModerate, staffRank, communityManager] = await Promise.all([
      owner ? true : hasPermission?.(discordId, "fbrp.announce"),
      owner ? true : hasPermission?.(discordId, "fbrp.staff.manage"),
      db.one(
        `SELECT MAX(g.rank_order) level
           FROM ace_memberships m JOIN ace_groups g ON g.name=m.group_name
          WHERE m.discord_id=?
            AND (m.origin NOT LIKE 'discord:%' OR m.group_name='ban_blacklist_moderator')`,
        [String(discordId)],
      ),
      db.one("SELECT rank_order FROM ace_groups WHERE name='community_manager'"),
    ]);
    const commandReference = owner || Number(staffRank?.level ?? -1) >= Number(communityManager?.rank_order ?? 850);
    return {
      owner,
      staff,
      support: owner || staff || Boolean(await hasPermission?.(discordId, "fbrp.tickets.support")),
      opsControl: Boolean(opsControl),
      sceneModerate: Boolean(sceneModerate),
      commandReference,
    };
  }

  function sameOrigin(request) {
    const origin = String(request.headers.origin || "");
    return !origin || origin === publicLocation.origin || origin === legacyLocation?.origin || origin === `http://${request.headers.host}` || origin === `https://${request.headers.host}`;
  }

  async function effects(resource) {
    if (["permissions", "network"].includes(resource.effect)) {
      await syncAll(client);
      await refreshGame();
    } else if (resource.effect === "game") await refreshGame();
    else if (resource.effect === "tickets") await ensureTicketPanel();
    else if (resource.effect === "economy") await callGame("/economy/refresh", {}).catch(() => null);
    else if (resource.effect === "security") await ensureProtectedRoleBoard();
    else if (resource.effect === "panels") {
      await ensureTicketPanel().catch(() => {});
      await ensureProtectedRoleBoard().catch(() => {});
    }
  }

  async function bootstrap() {
    const records = {};
    const types = await db.query("SELECT type_key,label FROM ticket_types ORDER BY sort_order,label").catch(() => []);
    const suggestions = {
      ticketSettingKeys: [
        { value: "max_open", label: "Max open tickets per user (number)" },
        { value: "cooldown_seconds", label: "Seconds between new tickets (number)" },
        { value: "panel_title", label: "Panel embed title (\"text\")" },
        { value: "panel_description", label: "Panel embed text (\"text\")" },
        { value: "panel_placeholder", label: "Panel dropdown placeholder (\"text\")" },
        { value: "category_all", label: "Default Discord category for every ticket (\"category id\")" },
        ...types.map((type) => ({ value: `category_${type.type_key}`, label: `Discord category for ${type.label} (\"category id\")` })),
      ],
    };
    for (const [id, resource] of Object.entries(PANEL_RESOURCES)) {
      const rows = await db.query(`SELECT * FROM \`${resource.table}\` ORDER BY ${resource.order} LIMIT 1000`);
      records[id] = parseJsonColumns(rows, resource);
    }
    const [syncs, syncGuilds, syncRoles, auditRows] = await Promise.all([
      db.query("SELECT * FROM network_syncs ORDER BY sort_order,id"),
      db.query("SELECT * FROM network_sync_guilds ORDER BY sync_id,guild_id"),
      db.query("SELECT * FROM network_sync_roles ORDER BY sync_id,guild_id"),
      db.query("SELECT id,actor_id,action,target_id,payload,created_at FROM audit_log ORDER BY id DESC LIMIT 80"),
    ]);
    const guilds = [...client.guilds.cache.values()].map((guild) => ({
      id: guild.id,
      name: guild.name,
      memberCount: guild.memberCount,
      roles: guild.roles.cache
        .filter((role) => role.id !== guild.id)
        .sort((a, b) => b.position - a.position)
        .map((role) => ({ id: role.id, name: role.name, color: role.hexColor, editable: role.editable, managed: role.managed })),
      channels: guild.channels.cache
        .filter((channel) => !channel.isThread())
        .sort((a, b) => a.rawPosition - b.rawPosition)
        .map((channel) => ({ id: channel.id, name: channel.name, type: channel.type })),
    }));
    return {
      online: client.isReady(),
      bot: client.user ? { id: client.user.id, tag: client.user.tag } : null,
      generatedAt: now(),
      resources: Object.entries(PANEL_RESOURCES).map((entry) => publicDefinition(entry, suggestions)),
      catalog: EDITOR_CATALOG,
      bundles: [
        ...Object.entries(PERMISSION_BUNDLES).map(([name, objects]) => ({ name, objects })),
        ...Object.entries(VMENU_BUNDLES).map(([name, objects]) => ({ name: `vmenu.${name}`, objects })),
      ],
      records,
      globalSyncs: syncs.map((row) => ({
        ...row,
        guild_ids: syncGuilds.filter((item) => Number(item.sync_id) === Number(row.id)).map((item) => String(item.guild_id)),
        roles: syncRoles.filter((item) => Number(item.sync_id) === Number(row.id)),
      })),
      guilds,
      audit: auditRows.map((row) => {
        let payload = row.payload;
        if (typeof payload === "string") try { payload = JSON.parse(payload); } catch {}
        return { ...row, payload };
      }),
    };
  }

  async function saveRecord(id, record, original = null) {
    const resource = PANEL_RESOURCES[id];
    if (!resource) throw new Error("Unknown configuration resource.");
    const values = {};
    for (const meta of resource.fields) {
      if (meta.readonly && meta.auto && !record[meta.name]) continue;
      let value = meta.alwaysNow ? now() : record[meta.name];
      if ((value === undefined || value === "") && meta.default !== undefined)
        value = meta.default === "now" ? now() : meta.default;
      if (meta.required && (value === undefined || value === "" || value === null))
        throw new Error(`${meta.label} is required.`);
      if (value !== undefined) values[meta.name] = normalizedValue(meta, value);
    }
    await resource.validate?.(values, context);
    const oldKey = original && Object.fromEntries(resource.pk.map((key) => [key, original[key]]));
    const exists = oldKey && resource.pk.every((key) => oldKey[key] !== undefined && oldKey[key] !== null && oldKey[key] !== "");
    if (exists) {
      const set = Object.keys(values).map((name) => `\`${name}\`=?`).join(",");
      const where = resource.pk.map((name) => `\`${name}\`=?`).join(" AND ");
      await db.query(`UPDATE \`${resource.table}\` SET ${set} WHERE ${where}`, [
        ...Object.values(values),
        ...resource.pk.map((name) => oldKey[name]),
      ]);
    } else {
      const names = Object.keys(values);
      await db.query(
        `INSERT INTO \`${resource.table}\` (${names.map((name) => `\`${name}\``).join(",")}) VALUES (${names.map(() => "?").join(",")})`,
        Object.values(values),
      );
    }
    await audit(ACTOR, `panel.${id}.${exists ? "edit" : "create"}`, resource.pk.map((key) => values[key]).join(":"), values);
    await resource.afterSave?.(context, values, exists ? original : null);
    await effects(resource);
  }

  /** Checkbox editor: writes a group's settings and its complete allowed-object set in one transaction. */
  async function saveAceGroup(input) {
    const creating = input.mode === "create";
    const name = String(input.name || "").trim().toLowerCase();
    if (!/^[a-z0-9_-]{1,40}$/.test(name)) throw new Error("Group names use 1–40 lowercase letters, numbers, underscores or hyphens.");
    const label = String(input.label || "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, 80);
    if (!label) throw new Error("Give the group a display label.");
    const rank = Number(input.rank_order);
    if (!Number.isInteger(rank) || rank < 0 || rank > 10000) throw new Error("Rank order must be a whole number from 0 to 10000.");
    const objects = [...new Set((Array.isArray(input.objects) ? input.objects : []).map((item) => String(item).trim()))];
    for (const object of objects) if (!ACE_OBJECT.test(object)) throw new Error(`\`${object}\` is not a valid ACE object.`);
    const existing = await db.one("SELECT * FROM ace_groups WHERE name=?", [name]);
    if (creating && existing) throw new Error(`The group \`${name}\` already exists. Switch to Edit existing.`);
    if (!creating && !existing) throw new Error("That group no longer exists. Refresh the panel.");
    const change = await db.transaction(async (query) => {
      if (creating)
        await query("INSERT INTO ace_groups(name,label,rank_order,staff_only,created_by) VALUES(?,?,?,?,?)", [name, label, rank, Boolean(input.staff_only), ACTOR]);
      else
        await query("UPDATE ace_groups SET label=?,rank_order=?,staff_only=? WHERE name=?", [label, rank, Boolean(input.staff_only), name]);
      const current = await query("SELECT object,mode FROM ace_entries WHERE group_name=?", [name]);
      const allowed = new Set(current.filter((row) => row.mode === "allow").map((row) => String(row.object)));
      const wanted = new Set(objects);
      const removed = [...allowed].filter((object) => !wanted.has(object));
      const added = objects.filter((object) => !allowed.has(object));
      for (const object of removed) await query("DELETE FROM ace_entries WHERE group_name=? AND object=? AND mode='allow'", [name, object]);
      for (const object of added)
        await query("INSERT INTO ace_entries(group_name,object,mode) VALUES(?,?,'allow') ON DUPLICATE KEY UPDATE mode='allow'", [name, object]);
      return { added, removed };
    });
    await audit(ACTOR, `panel.ace-group.${creating ? "create" : "edit"}`, name, {
      label,
      rank_order: rank,
      staff_only: Boolean(input.staff_only),
      added: change.added,
      removed: change.removed,
      total: objects.length,
    });
    await syncAll(client);
    await refreshGame();
    return { group: name, ...change, lines: [`${creating ? "Created" : "Saved"} ${name}: ${objects.length} allowed objects (+${change.added.length} / -${change.removed.length}).`] };
  }

  async function deleteRecord(id, key) {
    const resource = PANEL_RESOURCES[id];
    if (!resource) throw new Error("Unknown configuration resource.");
    if (resource.protect?.(key)) throw new Error("That protected record cannot be deleted.");
    const where = resource.pk.map((name) => `\`${name}\`=?`).join(" AND ");
    const params = resource.pk.map((name) => key[name]);
    const row = await db.one(`SELECT * FROM \`${resource.table}\` WHERE ${where}`, params);
    if (!row) throw new Error("That record no longer exists. Refresh the panel.");
    await db.query(`DELETE FROM \`${resource.table}\` WHERE ${where}`, params);
    await audit(ACTOR, `panel.${id}.delete`, params.join(":"), key);
    await resource.afterDelete?.(context, key, row);
    await effects(resource);
  }

  const textValue = (value, max = 1000) => String(value ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);
  const parseJson = (value, fallback = {}) => {
    if (value && typeof value === "object") return value;
    try { return JSON.parse(String(value || "")); } catch { return fallback; }
  };

  // Discord profiles for every ID the portal shows, cached so roster pages do not hit the API each load.
  const people = new Map();
  async function resolvePeople(ids, { fetchLimit = 40 } = {}) {
    const out = {};
    let fetched = 0;
    for (const raw of new Set(ids.map(String))) {
      if (!/^\d{15,24}$/.test(raw)) continue;
      const known = people.get(raw);
      if (known && known.expires > Date.now()) { out[raw] = known.value; continue; }
      let user = client.users.cache.get(raw);
      if (!user && fetched < fetchLimit) { fetched++; user = await client.users.fetch(raw).catch(() => null); }
      if (!user) continue;
      const value = { name: user.globalName || user.username, username: user.username, avatar: user.displayAvatarURL({ size: 128, extension: "webp" }) };
      people.set(raw, { value, expires: Date.now() + 15 * 60000 });
      out[raw] = value;
    }
    return out;
  }

  async function rosterDirectory() {
    const week = Date.now() - 7 * 86400000;
    return db.query(
      `SELECT m.discord_id,m.display_name,m.username,m.rank_name,m.callsign,m.status,m.joined_at,m.rank_changed_at,m.tickets_handled,m.activity_note,
              r.id rank_id,r.sort_order rank_sort,c.name category_name,c.sort_order category_sort,
              COALESCE(h.total_seconds,0) total_seconds,COALESCE(h.week_seconds,0) week_seconds,COALESCE(h.shift_count,0) shift_count
         FROM staff_roster_members m
         LEFT JOIN staff_roster_ranks r ON r.id=m.rank_id
         LEFT JOIN staff_roster_categories c ON c.id=r.category_id
         LEFT JOIN (
           SELECT discord_id,SUM(seconds) total_seconds,SUM(IF(started_at>=?,seconds,0)) week_seconds,COUNT(*) shift_count
             FROM staff_shifts GROUP BY discord_id
         ) h ON h.discord_id=m.discord_id
        WHERE m.status<>'removed'
        ORDER BY COALESCE(c.sort_order,9999),COALESCE(r.sort_order,9999),m.callsign,m.display_name`,
      [week],
    ).then(async (rows) => {
      const profiles = await resolvePeople(rows.map((row) => row.discord_id), { fetchLimit: 200 });
      return rows.map((row) => ({ ...row, avatar: profiles[row.discord_id]?.avatar || null, discord_name: profiles[row.discord_id]?.username || null }));
    });
  }

  async function staffProfile(discordId, viewer) {
    const roster = await db.one(
      `SELECT m.*,r.name configured_rank,r.weekly_seconds,r.minimum_days,c.name category_name,
              COALESCE(h.total_seconds,0) total_seconds,COALESCE(h.week_seconds,0) week_seconds,COALESCE(h.shift_count,0) shift_count
         FROM staff_roster_members m
         LEFT JOIN staff_roster_ranks r ON r.id=m.rank_id
         LEFT JOIN staff_roster_categories c ON c.id=r.category_id
         LEFT JOIN (
           SELECT discord_id,SUM(seconds) total_seconds,SUM(IF(started_at>=?,seconds,0)) week_seconds,COUNT(*) shift_count
             FROM staff_shifts GROUP BY discord_id
         ) h ON h.discord_id=m.discord_id
        WHERE m.discord_id=?`,
      [Date.now() - 7 * 86400000, String(discordId)],
    );
    if (!roster) return null;
    const [jobs, recentShifts, discipline, history] = await Promise.all([
      db.query(`SELECT j.id,j.name,j.description FROM staff_roster_member_jobs mj JOIN staff_roster_jobs j ON j.id=mj.job_id WHERE mj.discord_id=? ORDER BY j.sort_order,j.name`, [discordId]),
      db.query("SELECT id,name,started_at,ended_at,seconds,end_reason FROM staff_shifts WHERE discord_id=? ORDER BY id DESC LIMIT 20", [discordId]),
      viewer.staff || String(viewer.id) === String(discordId)
        ? db.query("SELECT id,kind,reason,actor_id,created_at,revoked_at,revoke_reason FROM staff_roster_discipline WHERE discord_id=? ORDER BY id DESC LIMIT 30", [discordId])
        : [],
      viewer.staff || String(viewer.id) === String(discordId)
        ? db.query("SELECT id,action,actor_id,details,created_at FROM staff_roster_history WHERE discord_id=? ORDER BY id DESC LIMIT 30", [discordId])
        : [],
    ]);
    const profiles = await resolvePeople([discordId, ...history.map((row) => row.actor_id), ...discipline.map((row) => row.actor_id)]);
    return {
      ...roster,
      avatar: profiles[discordId]?.avatar || null,
      discord_name: profiles[discordId]?.username || null,
      jobs,
      recentShifts,
      discipline: discipline.map((row) => ({ ...row, actor: profiles[row.actor_id] || null })),
      history: history.map((row) => ({ ...row, details: parseJson(row.details), actor: profiles[row.actor_id] || null })),
    };
  }

  async function portalBootstrap(session) {
    const access = await accessFor(session.id);
    const viewer = { id: session.id, ...access };
    const discordUser = await client.users.fetch(session.id).catch(() => null);
    const user = {
      id: session.id,
      username: discordUser?.username || session.username,
      displayName: discordUser?.globalName || session.username,
      avatar: discordUser?.displayAvatarURL({ size: 128 }) || session.avatar,
    };
    const [roster, profile, punishments, , tickets, player, ticketTypeMap, priorities] = await Promise.all([
      rosterDirectory(),
      staffProfile(session.id, viewer),
      db.query(
        `SELECT c.*, (SELECT a.status FROM moderation_appeals a WHERE a.case_id=c.id AND a.author_id=? ORDER BY a.id DESC LIMIT 1) appeal_status
           FROM moderation_cases c WHERE c.target_id=? ORDER BY c.id DESC LIMIT 100`,
        [session.id, session.id],
      ),
      Promise.resolve(null),
      db.query("SELECT id,guild_id,channel_id,type,subject,status,priority,claimed_by,created_at,closed_at,close_reason FROM support_tickets WHERE author_id=? ORDER BY id DESC LIMIT 50", [session.id]),
      db.one("SELECT id,name,last_seen FROM players WHERE discord_id=? ORDER BY last_seen DESC LIMIT 1", [session.id]),
      websiteTicketTypes(),
      websiteTicketPriorities(),
    ]);
    const appealData = await appeals.memberData(session.id, punishments);
    const [exams, orgEconomy] = await Promise.all([
      staffExams ? staffExams.portalData(session.id).catch((error) => { console.error("[FBRP panel] exams:", error); return null; }) : null,
      economy ? economy.portalData(session.id).catch((error) => { console.error("[FBRP panel] economy:", error); return null; }) : null,
    ]);
    const data = {
      user,
      access,
      exams,
      economy: orgEconomy,
      verified: { discord: true, game: Boolean(player), gameName: player?.name || null, lastSeen: player?.last_seen || null },
      roster,
      profile,
      punishments,
      appeals: appealData.appeals,
      appealRules: appealData.rules,
      appealQuestions: appealData.questions,
      appealLimits: appealData.limits,
      tickets,
      ticketTypes: Object.entries(ticketTypeMap).map(([key, spec]) => ({ key, ...spec })),
      priorities,
      generatedAt: Date.now(),
    };
    if (access.staff) {
      const [banLog, ticketQueue, appealQueue, handoffNotes, liveOps] = await Promise.all([
        db.query(`SELECT c.*,COUNT(a.id) appeal_count FROM moderation_cases c LEFT JOIN moderation_appeals a ON a.case_id=c.id
                   WHERE c.action IN ('ban','blacklist') GROUP BY c.id ORDER BY c.id DESC LIMIT 300`),
        db.query("SELECT id,guild_id,channel_id,author_id,type,subject,status,priority,due_at,claimed_by,created_at,last_activity,close_requested_by FROM support_tickets ORDER BY status='closed',priority,due_at,id DESC LIMIT 200"),
        appeals.staffQueue(),
        db.query("SELECT id,author_id,body,pinned,resolved_at,resolved_by,created_at FROM staff_handoff_notes ORDER BY resolved_at IS NULL DESC,pinned DESC,created_at DESC LIMIT 100"),
        callGame("/ops", {}, "GET").catch(() => ({ online: false, players: [], scenes: [], calls: [], event: null })),
      ]);
      Object.assign(data, { banLog, ticketQueue, appealQueue, handoffNotes, liveOps });
    }
    data.people = await resolvePeople([
      ...(data.banLog || []).flatMap((row) => [row.target_id, row.actor_id]),
      ...(data.ticketQueue || []).flatMap((row) => [row.author_id, row.claimed_by]),
      ...(data.appealQueue || []).flatMap((row) => [row.author_id, row.reviewed_by, row.assigned_to, row.case_actor, ...row.events.map((e) => e.actor_id)]),
      ...(data.handoffNotes || []).flatMap((row) => [row.author_id, row.resolved_by]),
      ...appealData.appeals.map((row) => row.reviewed_by),
      ...(exams?.reviewQueue || []).flatMap((row) => [row.discord_id, row.reviewer_id]),
      ...(orgEconomy?.organizations || []).flatMap((org) => [...org.leaders, ...org.transactions.map((row) => row.actor_id), ...org.purchases.map((row) => row.purchased_by)]),
    ]);
    return data;
  }

  async function mainGuild() {
    const row = await db.one("SELECT guild_id FROM network_guilds WHERE kind='main' ORDER BY added_at LIMIT 1");
    return row ? client.guilds.cache.get(String(row.guild_id)) || null : null;
  }

  async function openWebsiteTicket(session, input) {
    const types = await websiteTicketTypes();
    const type = String(input.type || "support");
    const spec = types[type];
    if (!spec) throw new Error("That ticket type is not available.");
    const form = {};
    for (const [id, label, _style, required, max] of spec.fields.slice(0, 5)) {
      const value = textValue(input.form?.[id], Number(max) || 1000);
      if (required && !value) throw new Error(`${label} is required.`);
      form[id] = value;
    }
    const guild = await mainGuild();
    const user = await client.users.fetch(session.id).catch(() => null);
    if (!guild || !user) throw new Error("The Discord ticket service is temporarily unavailable.");
    const channel = await createWebsiteTicket(guild, user, type, form);
    const ticket = await db.one("SELECT * FROM support_tickets WHERE channel_id=?", [channel.id]);
    return { id: ticket.id, channelId: channel.id, url: `https://discord.com/channels/${guild.id}/${channel.id}` };
  }

  const appeals = createAppeals({
    client, db, audit, log: log || (async () => {}), hasPermission, liftAppealedCase,
    openTicket: openWebsiteTicket, ticketAction: websiteTicketAction,
  });

  const server = createServer(async (request, response) => {
    try {
      if (!allowHttpRequest(request)) {
        response.setHeader("Connection", "close");
        return sendJson(response, 429, { error: "Too many requests. Try again shortly." }, { "Retry-After": "10" });
      }
      const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
      if (!url.pathname.startsWith("/api/")) {
        if (["/control", "/control.html"].includes(url.pathname)) {
          const session = await sessionFor(request);
          if (!session || session.id !== ownerDiscordId) {
            response.writeHead(302, { Location: `${baseUrl(request)}/portal.html?next=control`, "Cache-Control": "no-store" });
            return response.end();
          }
        }
        return serveStatic(request, response);
      }

      if (request.method === "POST" && !sameOrigin(request))
        return sendJson(response, 403, { error: "Cross-site request blocked." });

      if (request.method === "GET" && url.pathname === "/api/public/status") {
        const [staff, cases, health, operations] = await Promise.all([
          db.one("SELECT COUNT(*) count FROM staff_roster_members WHERE status<>'removed'"),
          db.one("SELECT COUNT(*) count FROM support_tickets WHERE status='closed'"),
          fetch(`${String(process.env.FBRP_FIVEM_ORIGIN || "http://127.0.0.1:30120/fbrp_core").replace(/\/$/, "")}/health`)
            .then((result) => result.ok ? result.json() : null)
            .catch(() => null),
          callGame("/ops", {}, "GET").catch(() => null),
        ]);
        return sendJson(response, 200, {
          online: Boolean(health?.ok),
          players: Number(health?.players || 0),
          aop: health?.aop || "Statewide",
          peacetime: Boolean(health?.peacetime),
          priority: Object.fromEntries(Object.entries(health?.priority && typeof health.priority === "object" ? health.priority : {}).map(([zone, item]) => [zone, {
            status: String(item?.status || "available"),
            remaining: Math.max(0, Number(item?.remaining) || 0),
          }])),
          bot: client.isReady(),
          staff: Number(staff?.count || 0),
          ticketsResolved: Number(cases?.count || 0),
          passportLandmarks: 10,
          activeScenes: Number(operations?.scenes?.length || 0),
          communityEvent: operations?.event ? {
            title: String(operations.event.title || "Community event"),
            location: String(operations.event.location || "Florida Bay"),
            expiresAt: Number(operations.event.expiresAt || 0),
          } : null,
          connectUrl: connectUrl() || "fivem://connect/join.floridabay.net",
        });
      }

      if (request.method === "GET" && url.pathname === "/api/auth/start") {
        if (oauthStates.size > 1000)
          for (const [key, value] of oauthStates) if (value.expires < Date.now()) oauthStates.delete(key);
        const state = randomBytes(24).toString("base64url");
        const requestedNext = String(url.searchParams.get("next") || "");
        const next = requestedNext === "verify" ? "verify" : /^transcript:\d{1,20}$/.test(requestedNext) ? requestedNext : "portal";
        oauthStates.set(state, { expires: Date.now() + 10 * 60000, address: clientAddress(request), next });
        const authorize = new URL("https://discord.com/oauth2/authorize");
        authorize.searchParams.set("client_id", String(process.env.DISCORD_APPLICATION_ID || client.application?.id || client.user.id));
        authorize.searchParams.set("redirect_uri", `${baseUrl(request)}/auth/callback.html`);
        authorize.searchParams.set("response_type", "token");
        authorize.searchParams.set("scope", "identify connections");
        authorize.searchParams.set("state", state);
        authorize.searchParams.set("prompt", "consent");
        return sendJson(response, 200, { url: authorize.toString() }, { "Set-Cookie": stateCookie(request, state) });
      }

      if (request.method === "POST" && url.pathname === "/api/auth/discord") {
        if (lockedOut(request)) return sendJson(response, 429, { error: "Too many sign-in attempts. Try again in 15 minutes." });
        const input = await bodyJson(request);
        const state = String(input.state || "");
        const expected = parseCookies(request).fbrp_oauth_state || "";
        const pending = oauthStates.get(state);
        const stateOk = state.length === expected.length && state.length > 20 && timingSafeEqual(Buffer.from(state), Buffer.from(expected));
        if (!pending || pending.expires < Date.now() || !stateOk) {
          recordFailure(request);
          return sendJson(response, 401, { error: "This Discord sign-in expired. Please start again." });
        }
        oauthStates.delete(state);
        const profile = await fetch("https://discord.com/api/v10/users/@me", { headers: { Authorization: `Bearer ${String(input.accessToken || "")}` } })
          .then(async (result) => result.ok ? result.json() : null)
          .catch(() => null);
        if (!profile?.id) {
          recordFailure(request);
          return sendJson(response, 401, { error: "Discord could not verify that sign-in." });
        }
        const connections = await fetch("https://discord.com/api/v10/users/@me/connections", { headers: { Authorization: `Bearer ${String(input.accessToken || "")}` } })
          .then(async (result) => (result.ok ? result.json() : []))
          .catch(() => []);
        const raw = await createSession(profile);
        failedLogins.delete(clientAddress(request));
        await audit(profile.id, "portal.login", profile.id, { method: "discord_oauth" });
        const verification = await recordVerification?.({ discordId: profile.id, address: clientAddress(request), connections: Array.isArray(connections) ? connections : [], method: "discord_oauth" })
          .catch((error) => { console.error("[FBRP panel] verification:", error); return null; });
        return sendJson(response, 200, { ok: true, next: pending.next, verified: Boolean(verification), role: verification?.role || null }, { "Set-Cookie": [sessionCookie(request, raw), stateCookie(request, "", 0)] });
      }

      if (request.method === "POST" && url.pathname === "/api/auth/dm/start") {
        if (lockedOut(request)) return sendJson(response, 429, { error: "Too many sign-in attempts. Try again in 15 minutes." });
        if (!allowDmStart(request)) return sendJson(response, 429, { error: "Too many verification messages. Try again in 15 minutes." });
        const input = await bodyJson(request);
        const discordId = String(input.discordId || "").trim();
        if (!/^\d{15,24}$/.test(discordId)) throw new Error("Enter your Discord user ID.");
        const user = await client.users.fetch(discordId).catch(() => null);
        if (!user || user.bot) throw new Error("That Discord account could not be verified.");
        const existing = dmChallenges.get(discordId);
        if (existing && Date.now() - existing.created < 60000) throw new Error("Please wait a minute before requesting another code.");
        const code = String(randomInt(100000, 1000000));
        dmChallenges.set(discordId, { hash: sha256(`${discordId}:${code}`), expires: Date.now() + 10 * 60000, attempts: 0, created: Date.now() });
        const sent = await user.send({ content: `**Florida Bay Portal verification**\nYour one-time code is **${code}**. It expires in 10 minutes. If you did not request this, ignore this message.` }).then(() => true, () => false);
        if (!sent) {
          dmChallenges.delete(discordId);
          throw new Error("I could not DM that account. Allow direct messages from the Florida Bay server and try again.");
        }
        return sendJson(response, 200, { ok: true });
      }

      if (request.method === "POST" && url.pathname === "/api/auth/dm/verify") {
        if (lockedOut(request)) return sendJson(response, 429, { error: "Too many sign-in attempts. Try again in 15 minutes." });
        const input = await bodyJson(request);
        const discordId = String(input.discordId || "").trim();
        const code = String(input.code || "").replace(/\D/g, "");
        const pending = dmChallenges.get(discordId);
        const actual = sha256(`${discordId}:${code}`);
        const valid = pending && pending.expires > Date.now() && actual.length === pending.hash.length && timingSafeEqual(Buffer.from(actual), Buffer.from(pending.hash));
        if (!valid) {
          if (pending) pending.attempts += 1;
          if (pending?.attempts >= 5) dmChallenges.delete(discordId);
          recordFailure(request);
          return sendJson(response, 401, { error: "That code is incorrect or expired." });
        }
        dmChallenges.delete(discordId);
        const user = await client.users.fetch(discordId).catch(() => null);
        if (!user) throw new Error("Discord account unavailable.");
        const raw = await createSession(user);
        failedLogins.delete(clientAddress(request));
        await audit(discordId, "portal.login", discordId, { method: "discord_dm" });
        const verification = await recordVerification?.({ discordId, address: clientAddress(request), connections: [], method: "discord_dm" })
          .catch((error) => { console.error("[FBRP panel] verification:", error); return null; });
        return sendJson(response, 200, { ok: true, verified: Boolean(verification), role: verification?.role || null }, { "Set-Cookie": sessionCookie(request, raw) });
      }

      if (request.method === "POST" && url.pathname === "/api/auth/logout") {
        const raw = parseCookies(request).fbrp_session;
        if (raw) await db.query("DELETE FROM portal_sessions WHERE session_hash=?", [sha256(raw)]).catch(() => {});
        return sendJson(response, 200, { ok: true }, { "Set-Cookie": sessionCookie(request, "", 0) });
      }

      const session = await sessionFor(request);
      if (request.method === "GET" && url.pathname === "/api/auth/session")
        return sendJson(response, 200, { authenticated: Boolean(session), user: session });
      if (!session) return sendJson(response, 401, { error: "Sign in with Discord to continue." });

      if (request.method === "GET" && url.pathname === "/api/transcript") {
        const ticketId = Number(url.searchParams.get("id"));
        if (!Number.isSafeInteger(ticketId) || ticketId < 1) throw new Error("Choose a valid ticket transcript.");
        const [access, ticket, participant] = await Promise.all([
          accessFor(session.id),
          db.one("SELECT id,author_id,status FROM support_tickets WHERE id=?", [ticketId]),
          db.one("SELECT 1 allowed FROM ticket_participants WHERE ticket_id=? AND user_id=?", [ticketId, session.id]),
        ]);
        if (!ticket) return sendJson(response, 404, { error: "Transcript not found." });
        if (String(ticket.author_id) !== session.id && !participant && !access.support)
          return sendJson(response, 403, { error: "You do not have access to this private transcript." });
        const transcript = await websiteTicketTranscript(ticketId, session.id, { refresh: url.searchParams.get("refresh") === "1" });
        await audit(session.id, "transcript.view", ticketId, { source: "website" });
        return sendJson(response, 200, { transcript, viewer: { id: session.id, staff: access.staff, canRefresh: access.support || ticket.status !== "closed" } });
      }

      if (request.method === "GET" && url.pathname === "/api/portal/bootstrap")
        return sendJson(response, 200, await portalBootstrap(session));
      if (request.method === "GET" && url.pathname === "/api/portal/command-reference") {
        const access = await accessFor(session.id);
        if (!access.commandReference)
          return sendJson(response, 403, { error: "Community Manager rank or higher is required." });
        const [markdown, info] = await Promise.all([
          readFile(commandReferenceFile, "utf8"),
          stat(commandReferenceFile),
        ]);
        return sendJson(response, 200, { markdown, updatedAt: info.mtimeMs });
      }
      if (request.method === "GET" && url.pathname === "/api/portal/staff-profile") {
        const access = await accessFor(session.id);
        const id = String(url.searchParams.get("id") || session.id);
        const profile = await staffProfile(id, { id: session.id, ...access });
        if (!profile) return sendJson(response, 404, { error: "Staff profile not found." });
        return sendJson(response, 200, profile);
      }

      if (request.method !== "POST" && url.pathname !== "/api/bootstrap")
        return sendJson(response, 405, { error: "Method not allowed." });

      if (url.pathname.startsWith("/api/portal/")) {
        const input = await bodyJson(request);
        const access = await accessFor(session.id);
        let result;
        if (url.pathname === "/api/portal/ticket/open") result = await openWebsiteTicket(session, input);
        else if (url.pathname === "/api/portal/appeal") result = await appeals.submit(session, input);
        else if (url.pathname === "/api/portal/appeal/reply") result = await appeals.reply(session, input);
        else if (url.pathname === "/api/portal/appeal/withdraw") result = await appeals.withdraw(session, input);
        else if (url.pathname === "/api/portal/exam/submit") result = await staffExams.submit(session, input);
        else if (url.pathname === "/api/portal/exam/review") result = await staffExams.review(session, input);
        else if (url.pathname === "/api/portal/exam/withdraw") result = await staffExams.withdraw(session, input);
        else if (url.pathname === "/api/portal/org/purchase") result = await economy.purchase(session, input);
        else if (url.pathname === "/api/portal/org/sell") result = await economy.sellProperty(session, input);
        else if (url.pathname === "/api/portal/org/adjust") result = await economy.adjust(session.id, input);
        else if (url.pathname === "/api/portal/org/leader") result = await economy.setLeader(session.id, input);
        else if (url.pathname === "/api/portal/ticket/request-close") {
          const ticket = await db.one("SELECT * FROM support_tickets WHERE id=? AND author_id=?", [Number(input.ticketId), session.id]);
          if (!ticket || ticket.status === "closed") throw new Error("That open ticket was not found.");
          await db.query("UPDATE support_tickets SET close_requested_by=?,close_requested_at=? WHERE id=?", [session.id, Date.now(), ticket.id]);
          await audit(session.id, "ticket.request_close", ticket.id, { source: "website" });
          result = { ok: true };
        } else if (url.pathname === "/api/portal/ticket/action") {
          if (!access.support) return sendJson(response, 403, { error: "Staff ticket access is required." });
          result = await websiteTicketAction(input.ticketId, session.id, String(input.action || ""), input);
        } else if (url.pathname === "/api/portal/appeal/review") {
          if (!access.staff) return sendJson(response, 403, { error: "Staff access is required." });
          result = await appeals.staffAction(session, input);
        } else if (url.pathname === "/api/portal/liveops/action") {
          if (!access.staff) return sendJson(response, 403, { error: "Staff access is required." });
          const action = String(input.action || "");
          if (action === "handoff_add") {
            const body = textValue(input.body, 1000);
            if (body.length < 4) throw new Error("Handoff notes need at least 4 characters.");
            const inserted = await db.query("INSERT INTO staff_handoff_notes(author_id,body,pinned,created_at) VALUES(?,?,?,?)", [session.id, body, input.pinned ? 1 : 0, Date.now()]);
            await audit(session.id, "handoff.add", inserted.insertId, { pinned: Boolean(input.pinned) });
            result = { id: inserted.insertId };
          } else if (action === "handoff_resolve") {
            const note = await db.one("SELECT id,resolved_at FROM staff_handoff_notes WHERE id=?", [Number(input.noteId)]);
            if (!note || note.resolved_at) throw new Error("That handoff note is no longer open.");
            await db.query("UPDATE staff_handoff_notes SET resolved_at=?,resolved_by=? WHERE id=?", [Date.now(), session.id, note.id]);
            await audit(session.id, "handoff.resolve", note.id, {});
            result = { id: note.id };
          } else if (action === "handoff_pin") {
            const note = await db.one("SELECT id,pinned FROM staff_handoff_notes WHERE id=?", [Number(input.noteId)]);
            if (!note) throw new Error("Handoff note not found.");
            await db.query("UPDATE staff_handoff_notes SET pinned=? WHERE id=?", [input.pinned ? 1 : 0, note.id]);
            await audit(session.id, "handoff.pin", note.id, { pinned: Boolean(input.pinned) });
            result = { id: note.id };
          } else if (["announce", "event_start", "event_end"].includes(action)) {
            if (!access.opsControl) return sendJson(response, 403, { error: "The fbrp.announce permission is required." });
            const payload = { action, actor: session.id, actorName: session.username || `Staff ${session.id.slice(-4)}` };
            if (action === "announce") payload.message = textValue(input.message, 300);
            if (action === "event_start") Object.assign(payload, {
              title: textValue(input.title, 80), description: textValue(input.description, 300),
              location: textValue(input.location, 80), duration: Math.max(10, Math.min(180, Number(input.duration) || 60)),
              x: input.x === "" || input.x == null ? null : Number(input.x),
              y: input.y === "" || input.y == null ? null : Number(input.y),
              z: input.z === "" || input.z == null ? null : Number(input.z),
            });
            result = await callGame("/ops/action", payload);
          } else if (action === "scene_end") {
            if (!access.sceneModerate) return sendJson(response, 403, { error: "The fbrp.staff.manage permission is required." });
            result = await callGame("/ops/action", { action, sceneId: Number(input.sceneId), actor: session.id });
          } else throw new Error("Unknown live operations action.");
        } else throw new Error("Unknown portal action.");
        return sendJson(response, 200, { ok: true, result, data: await portalBootstrap(session) });
      }

      // The complete live configuration plane is intentionally owner-only.
      if (session.id !== ownerDiscordId) return sendJson(response, 403, { error: "Only the configured Florida Bay owner can access live configuration." });
      if (request.method === "GET" && url.pathname === "/api/bootstrap")
        return sendJson(response, 200, await bootstrap());
      if (request.method !== "POST") return sendJson(response, 405, { error: "Method not allowed." });
      const input = await bodyJson(request);
      let result = null;
      if (url.pathname === "/api/record/save") {
        await saveRecord(input.resource, input.record || {}, input.original || null);
      } else if (url.pathname === "/api/record/delete") {
        await deleteRecord(input.resource, input.key || {});
      } else if (url.pathname === "/api/globalsync/save") {
        const saved = await saveGlobalSync(client, ACTOR, input.group, input);
        result = { lines: saved.lines, swept: saved.swept };
      } else if (url.pathname === "/api/globalsync/delete") {
        result = { lines: await deleteGlobalSync(client, String(input.group), input.delete_roles !== false, ACTOR) };
      } else if (url.pathname === "/api/globalsync/order") {
        result = { lines: (await setGlobalSyncOrder(client, ACTOR, Array.isArray(input.groups) ? input.groups : [])).lines };
      } else if (url.pathname === "/api/globalsync/push") {
        result = await pushGlobalSyncs(client);
      } else if (url.pathname === "/api/globalsync/bind") {
        const guild = client.guilds.cache.get(String(input.guild_id));
        const role = guild?.roles.cache.get(String(input.role_id));
        if (!guild || !role) throw new Error("The selected server or role is unavailable.");
        const bound = await bindSyncRole(client, ACTOR, String(input.group), guild, role);
        result = { lines: bound.lines, swept: bound.swept, created: bound.created };
      } else if (url.pathname === "/api/ace/bundle") {
        const bundle = String(input.bundle || "");
        const objects = bundle.startsWith("vmenu.") ? VMENU_BUNDLES[bundle.slice(6)] : PERMISSION_BUNDLES[bundle];
        if (!objects) throw new Error("Unknown permission bundle.");
        const groupName = String(input.group || "");
        if (!(await db.one("SELECT name FROM ace_groups WHERE name=?", [groupName]))) throw new Error("Choose an ACE group.");
        const grant = input.mode !== "revoke";
        await db.transaction(async (query) => {
          for (const object of objects)
            if (grant) await query("INSERT INTO ace_entries(group_name,object,mode) VALUES(?,?,'allow') ON DUPLICATE KEY UPDATE mode='allow'", [groupName, object]);
            else await query("DELETE FROM ace_entries WHERE group_name=? AND object=?", [groupName, object]);
        });
        await audit(ACTOR, "ace.bundle", groupName, { bundle, mode: grant ? "grant" : "revoke" });
        await syncAll(client);
        await refreshGame();
      } else if (url.pathname === "/api/ace/group/save") {
        result = await saveAceGroup(input);
      } else if (url.pathname === "/api/reconcile") {
        await syncAll(client);
        await refreshGame();
      } else throw new Error("Unknown panel action.");
      return sendJson(response, 200, { ok: true, result, data: await bootstrap() });
    } catch (error) {
      console.error("[FBRP panel]", error);
      return sendJson(response, 400, { error: error.message || String(error) });
    }
  });
  server.headersTimeout = 10_000;
  server.requestTimeout = 30_000;
  server.keepAliveTimeout = 5_000;
  server.maxHeadersCount = 100;
  server.maxRequestsPerSocket = 100;
  server.maxConnections = 256;
  server.on("clientError", (_error, socket) => socket.destroy());
  server.listen(port, host, () =>
    console.log(`[FBRP panel] Community portal listening on http://${host}:${port} (${publicUrl})`),
  );
  return server;
}
