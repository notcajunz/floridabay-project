import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Organization authority for the orgs website.
 *
 * The gang, business and department manager bots each keep their own SQLite registry. `/gang add`,
 * `/business add` and `/dept add` record the organization's owner (the department "head"), its
 * command role and the FBRP organization it is linked to (`fbrp_org_id`). Owners and holders of the
 * command role run their organization's roster on the website: ranks, the Discord roles bound to each
 * rank and every rank permission. The registries are only ever opened read-only.
 *
 * Rank roles are Discord roles bound to an organization rank. With role sync on (the default) the
 * website is authoritative: changing a member's rank gives them that rank's roles and removes the
 * roles of every other rank. With auto-rank on, Discord is authoritative instead: members are ranked
 * by the highest bound role they hold, so a role given in Discord ranks the member automatically.
 */

const servicesRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** Every rank permission the website can grant, in display order. */
export const RANK_PERMISSIONS = Object.freeze([
  { key: "spend", column: "can_spend", label: "Spend the wallet", hint: "Buy from the shop and send transfers, within the daily limit.", default: false },
  { key: "sell", column: "can_sell", label: "Sell assets", hint: "Sell owned properties, vehicles and permits back for half price.", default: false },
  { key: "roster", column: "can_roster", label: "Manage the roster", hint: "Promote and demote members ranked below this rank.", default: false },
  { key: "ranks", column: "can_ranks", label: "Edit ranks", hint: "Create and edit ranks below this rank, their roles and permissions.", default: false },
  { key: "motd", column: "can_motd", label: "Message of the day", hint: "Set the briefing members see when they clock in.", default: false },
  { key: "ledger", column: "can_ledger", label: "View the ledger", hint: "See every transaction in and out of the wallet.", default: true },
  { key: "armory", column: "can_armory", label: "Armory", hint: "Draw weapon loadouts in game.", default: true },
  { key: "garage", column: "can_garage", label: "Garage", hint: "Spawn the organization's vehicles from F7.", default: true },
]);

export const MAX_RANKS = 25;
export const MAX_ROLES_PER_RANK = 6;

const REGISTRIES = [
  { kind: "business", env: "FBRP_BUSINESS_DB", files: ["businessmanager/business_manager.db"], table: "businesses", owner: "owner_id", label: "/business add" },
  { kind: "gang", env: "FBRP_GANG_DB", files: ["gangsmanager/gang_manager.db"], table: "gangs", owner: "owner_id", label: "/gang add" },
  {
    kind: "department", env: "FBRP_DEPARTMENT_DBS",
    files: ["deptmanager/department_manager.db", "deptmanager/department_manager_armedforces.db"],
    table: "departments", owner: "head_id", label: "/dept add",
  },
];

const snowflake = (value) => {
  if (value == null || value === "") return null;
  const text = typeof value === "bigint" ? value.toString() : String(value).trim();
  return /^\d{15,24}$/.test(text) ? text : null;
};

/** Normalize one manager registry row. Exported for tests. */
export function registryRecord(kind, row, ownerColumn = "owner_id") {
  const orgRef = String(row?.fbrp_org_id ?? "").trim().toLowerCase();
  if (!orgRef) return null;
  return {
    kind,
    orgRef,
    name: String(row.name || ""),
    guildId: snowflake(row.guild_id),
    ownerId: snowflake(row[ownerColumn]),
    commandRoleId: snowflake(row.command_role_id),
    baseRoleId: snowflake(row.base_role_id),
    externalGuildId: snowflake(row.external_guild_id),
  };
}

/** The registry record that belongs to an FBRP organization (linked by id or slug). */
export function recordForOrg(records, org) {
  const id = String(org?.id ?? "");
  const slug = String(org?.slug ?? "").toLowerCase();
  return records.find((record) => record.orgRef === id || (slug && record.orgRef === slug)) || null;
}

/**
 * The rank a member should hold from the bound roles they have: the highest-level rank with at least
 * one held role, or null when none match. Exported for tests.
 */
export function rankFromRoles(ranks, bindings, heldRoleIds) {
  const held = new Set(Array.from(heldRoleIds || [], String));
  const ranked = [...ranks].sort((a, b) => Number(b.level) - Number(a.level));
  for (const rank of ranked)
    if (bindings.some((binding) => Number(binding.rank_id) === Number(rank.id) && held.has(String(binding.role_id)))) return rank;
  return null;
}

/** Which bound roles to add and remove when a member moves to `rankId` (null = no rank). Exported for tests. */
export function rolePlan(bindings, rankId, heldRoleIds) {
  const held = new Set(Array.from(heldRoleIds || [], String));
  const keep = new Set(bindings.filter((binding) => rankId != null && Number(binding.rank_id) === Number(rankId)).map((binding) => `${binding.guild_id}:${binding.role_id}`));
  const add = [];
  const remove = [];
  const seen = new Set();
  for (const binding of bindings) {
    const key = `${binding.guild_id}:${binding.role_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (keep.has(key)) { if (!held.has(String(binding.role_id))) add.push(binding); }
    else if (held.has(String(binding.role_id))) remove.push(binding);
  }
  return { add, remove };
}

export function createOrgAuthority({ client, db }) {
  let sqlite = null;
  let cache = { at: 0, records: [] };
  const memberCache = new Map();
  const CACHE_MS = 60000;
  const MEMBER_MS = 30000;

  async function openDatabase(file) {
    sqlite ??= await import("node:sqlite").catch(() => null);
    if (!sqlite?.DatabaseSync) return null;
    return new sqlite.DatabaseSync(file, { readOnly: true });
  }

  function registryFiles(registry) {
    const configured = String(process.env[registry.env] || "").split(",").map((value) => value.trim()).filter(Boolean);
    return (configured.length ? configured : registry.files.map((file) => path.join(servicesRoot, file))).filter((file) => existsSync(file));
  }

  /** Every linked gang, business and department from the manager registries. */
  async function records() {
    if (Date.now() - cache.at < CACHE_MS) return cache.records;
    const next = [];
    for (const registry of REGISTRIES) {
      for (const file of registryFiles(registry)) {
        let handle = null;
        try {
          handle = await openDatabase(file);
          if (!handle) continue;
          const statement = handle.prepare(
            `SELECT name,guild_id,${registry.owner} AS owner_ref,command_role_id,base_role_id,fbrp_org_id${registry.kind === "department" ? ",NULL AS external_guild_id" : ",external_guild_id"}
               FROM ${registry.table} WHERE fbrp_org_id IS NOT NULL AND fbrp_org_id<>''`,
          );
          // Discord IDs are stored as SQLite integers and do not fit in a JavaScript number.
          statement.setReadBigInts(true);
          for (const row of statement.all()) {
            const record = registryRecord(registry.kind, row, "owner_ref");
            if (record) next.push({ ...record, command: registry.label });
          }
        } catch (error) {
          console.error(`[FBRP orgs] could not read ${path.basename(file)}:`, error.message);
        } finally {
          try { handle?.close(); } catch { /* already closed */ }
        }
      }
    }
    cache = { at: Date.now(), records: next };
    return next;
  }

  async function guildMember(guildId, discordId) {
    const key = `${guildId}:${discordId}`;
    const hit = memberCache.get(key);
    if (hit && Date.now() - hit.at < MEMBER_MS) return hit.roles;
    let roles = null;
    const guild = guildId ? client.guilds.cache.get(String(guildId)) : null;
    if (guild) {
      const member = guild.members.cache.get(String(discordId)) || await guild.members.fetch(String(discordId)).catch(() => null);
      if (member) roles = new Set(member.roles.cache.keys());
    }
    if (!roles && guildId) {
      const row = await db.one("SELECT roles FROM discord_member_cache WHERE guild_id=? AND discord_id=?", [String(guildId), String(discordId)]).catch(() => null);
      let list = row?.roles || null;
      if (typeof list === "string") try { list = JSON.parse(list); } catch { list = null; }
      if (Array.isArray(list)) roles = new Set(list.map(String));
    }
    roles ??= new Set();
    memberCache.set(key, { at: Date.now(), roles });
    if (memberCache.size > 5000) for (const [cached, value] of memberCache) if (Date.now() - value.at > MEMBER_MS) memberCache.delete(cached);
    return roles;
  }

  /** Owner/command standing of one member in one organization. */
  async function standing(discordId, org) {
    const record = recordForOrg(await records(), org);
    if (!record) return { owner: false, command: false, record: null };
    const owner = Boolean(record.ownerId && record.ownerId === String(discordId));
    const command = Boolean(record.commandRoleId && (await guildMember(record.guildId, discordId)).has(record.commandRoleId));
    return { owner, command, record };
  }

  /** Every organization id where the member is owner or command, with that standing. */
  async function standings(discordId, orgs) {
    const list = await records();
    const result = new Map();
    for (const org of orgs) {
      const record = recordForOrg(list, org);
      if (!record) continue;
      const owner = Boolean(record.ownerId && record.ownerId === String(discordId));
      const command = Boolean(record.commandRoleId && (await guildMember(record.guildId, discordId)).has(record.commandRoleId));
      if (owner || command) result.set(Number(org.id), { owner, command, record });
    }
    return result;
  }

  /** Public owner/command details of an organization for its roster page. */
  async function leadership(org) {
    const record = recordForOrg(await records(), org);
    if (!record) return null;
    const guild = record.guildId ? client.guilds.cache.get(record.guildId) : null;
    const role = guild && record.commandRoleId ? guild.roles.cache.get(record.commandRoleId) : null;
    const commandMembers = role ? [...role.members.keys()].slice(0, 40) : [];
    return {
      kind: record.kind, command: record.command, ownerId: record.ownerId,
      guildId: record.guildId, guildName: guild?.name || null,
      commandRole: role ? { id: role.id, name: role.name, color: role.hexColor } : record.commandRoleId ? { id: record.commandRoleId, name: "Command role", color: null } : null,
      commandMembers,
    };
  }

  async function settings(orgId) {
    const row = await db.one("SELECT role_sync,auto_rank,updated_by,updated_at FROM org_roster_settings WHERE org_id=?", [Number(orgId)]).catch(() => null);
    return { roleSync: row ? Boolean(Number(row.role_sync)) : true, autoRank: row ? Boolean(Number(row.auto_rank)) : false, updatedBy: row?.updated_by || null, updatedAt: row?.updated_at ? Number(row.updated_at) : null };
  }

  async function bindings(orgId) {
    return db.query("SELECT rank_id,guild_id,role_id FROM org_rank_roles WHERE org_id=? ORDER BY added_at", [Number(orgId)]);
  }

  /** Discord servers whose roles an organization may bind: its own, its manager's and its external server. */
  async function candidateGuildIds(org) {
    const record = recordForOrg(await records(), org);
    const ids = [org.guild_id, record?.guildId, record?.externalGuildId].map(snowflake).filter(Boolean);
    const required = await db.query("SELECT DISTINCT guild_id FROM organization_role_requirements WHERE org_id=?", [Number(org.id)]).catch(() => []);
    for (const row of required) if (snowflake(row.guild_id)) ids.push(String(row.guild_id));
    return [...new Set(ids)].filter((id) => client.guilds.cache.has(id));
  }

  /** Roles the bot can hand out in each candidate server (below its own highest role, not managed). */
  async function bindableRoles(org) {
    const servers = [];
    for (const guildId of await candidateGuildIds(org)) {
      const guild = client.guilds.cache.get(guildId);
      const top = guild.members.me?.roles.highest?.position ?? 0;
      const roles = [...guild.roles.cache.values()]
        .filter((role) => role.id !== guild.id && !role.managed)
        .sort((a, b) => b.position - a.position)
        .map((role) => ({ id: role.id, name: role.name, color: role.hexColor === "#000000" ? null : role.hexColor, assignable: role.position < top }));
      servers.push({ id: guild.id, name: guild.name, icon: guild.iconURL?.({ size: 64 }) || null, roles });
    }
    return servers;
  }

  /** Check every requested binding is a real, bot-assignable role in a candidate server. */
  async function validateBindings(org, requested) {
    const allowed = new Set(await candidateGuildIds(org));
    const clean = [];
    const seen = new Set();
    for (const entry of Array.isArray(requested) ? requested : []) {
      const guildId = snowflake(entry?.guildId ?? entry?.guild_id);
      const roleId = snowflake(entry?.roleId ?? entry?.role_id);
      if (!guildId || !roleId || seen.has(`${guildId}:${roleId}`)) continue;
      if (!allowed.has(guildId)) throw new Error("A selected role belongs to a server this organization cannot use.");
      const guild = client.guilds.cache.get(guildId);
      const role = guild?.roles.cache.get(roleId);
      if (!role || role.managed || role.id === guild.id) throw new Error("A selected role no longer exists.");
      if (role.position >= (guild.members.me?.roles.highest?.position ?? 0))
        throw new Error(`${role.name} is above the bot's role in ${guild.name}. Move the bot's role higher first.`);
      seen.add(`${guildId}:${roleId}`);
      clean.push({ guildId, roleId, name: role.name });
    }
    if (clean.length > MAX_ROLES_PER_RANK) throw new Error(`A rank can have up to ${MAX_ROLES_PER_RANK} bound roles.`);
    return clean;
  }

  async function setRankBindings(org, rankId, requested, actorId) {
    const roles = await validateBindings(org, requested);
    const stamp = Date.now();
    await db.transaction(async (query) => {
      await query("DELETE FROM org_rank_roles WHERE org_id=? AND rank_id=?", [Number(org.id), Number(rankId)]);
      for (const role of roles)
        await query("INSERT INTO org_rank_roles(rank_id,org_id,guild_id,role_id,added_by,added_at) VALUES(?,?,?,?,?,?)", [Number(rankId), Number(org.id), role.guildId, role.roleId, String(actorId), stamp]);
    });
    return roles;
  }

  /** Give a member their rank's bound roles and remove the roles of every other rank. */
  async function syncMemberRoles(org, discordId, rankId, reason) {
    const config = await settings(org.id);
    const bound = await bindings(org.id);
    if (!config.roleSync || !bound.length) return { added: 0, removed: 0, errors: [] };
    const result = { added: 0, removed: 0, errors: [] };
    const byGuild = new Map();
    for (const binding of bound) byGuild.set(String(binding.guild_id), [...(byGuild.get(String(binding.guild_id)) || []), binding]);
    for (const [guildId, guildBindings] of byGuild) {
      const guild = client.guilds.cache.get(guildId);
      const member = guild ? await guild.members.fetch(String(discordId)).catch(() => null) : null;
      if (!member) continue;
      const plan = rolePlan(guildBindings, rankId, member.roles.cache.keys());
      for (const binding of plan.add)
        await member.roles.add(String(binding.role_id), reason).then(() => { result.added += 1; }).catch((error) => result.errors.push(`${guild.name}: ${error.message}`));
      for (const binding of plan.remove)
        await member.roles.remove(String(binding.role_id), reason).then(() => { result.removed += 1; }).catch((error) => result.errors.push(`${guild.name}: ${error.message}`));
      memberCache.delete(`${guildId}:${discordId}`);
    }
    return result;
  }

  /** The rank each roster member should have from the bound roles they hold in Discord. */
  async function rankChangesFromDiscord(org, { demote = false } = {}) {
    const bound = await bindings(org.id);
    if (!bound.length) return [];
    const ranks = await db.query("SELECT id,name,level FROM org_ranks WHERE org_id=?", [Number(org.id)]);
    const members = await db.query("SELECT discord_id,rank_id,manager FROM organization_members WHERE org_id=?", [Number(org.id)]);
    const guildIds = [...new Set(bound.map((binding) => String(binding.guild_id)))];
    const boundRanks = new Set(bound.map((binding) => Number(binding.rank_id)));
    const changes = [];
    for (const member of members) {
      if (Boolean(Number(member.manager))) continue;
      const held = new Set();
      for (const guildId of guildIds) for (const roleId of await guildMember(guildId, member.discord_id)) held.add(roleId);
      const target = rankFromRoles(ranks, bound, held);
      const current = member.rank_id == null ? null : Number(member.rank_id);
      if (target && Number(target.id) !== current) changes.push({ discordId: String(member.discord_id), rank: target });
      else if (!target && demote && current != null && boundRanks.has(current)) changes.push({ discordId: String(member.discord_id), rank: null });
    }
    return changes;
  }

  return {
    records, standing, standings, leadership, settings, bindings, bindableRoles, setRankBindings,
    syncMemberRoles, rankChangesFromDiscord, forget: () => { cache = { at: 0, records: [] }; memberCache.clear(); },
  };
}
