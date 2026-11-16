import { createHash } from "node:crypto";
import { SOP_TEXT } from "./sop-content.js";

/**
 * IAA roster sheet, SOP document and locked alt database, plus the access list that controls who
 * can open them. Everything here is storage-agnostic: the service takes a repository (SQL in
 * documents-store.js) and a Google client, so it is fully testable without either.
 *
 * Documents are created by the bot's service account and stay private to it. The only way a person
 * gets in is `grant`, which records who approved it, and the only ways out are `revoke`, offboarding
 * and the reconcile sweep that removes anyone who is no longer a current agent.
 */

export const DOCS = {
  roster: { kind: "sheet", title: "IAA Roster", tabs: ["Homepage", "Master Roster", "Employee Database", "Authority Matrix", "Punishment Guideline"], label: "Agency roster", locked: false },
  sop: { kind: "doc", title: "IAA Standard Operating Procedures", label: "Standard operating procedures", locked: false },
  alts: { kind: "sheet", title: "IAA Locked Alt Database", tabs: ["LOCKED"], label: "Locked alt database", locked: true },
};
export const DOC_KEYS = Object.keys(DOCS);
export const LEVELS = { reader: "View only", commenter: "Comment", writer: "Edit" };

const EMAIL = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[A-Za-z]{2,}$/;
const SNOWFLAKE = /^\d{17,20}$/;
export class DocsError extends Error {}

export const hashOf = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const day = (ms) => (ms ? new Date(Number(ms)).toISOString().slice(0, 10) : "");

/* ------------------------------------------------------------------ pure builders */

/** Roster rows, highest rank first, then by callsign. Removed agents never appear. */
export function rosterGrid(members, ladder, { divisionsOf = () => [] } = {}) {
  const byRole = new Map(ladder.map((r) => [r.role_id, r]));
  const rows = members
    .filter((m) => m.status !== "removed")
    .map((m) => ({ m, rank: byRole.get(m.rank_role_id) || null }))
    .sort((a, b) => (b.rank?.level || 0) - (a.rank?.level || 0) || String(a.m.callsign || "~").localeCompare(String(b.m.callsign || "~"), "en", { numeric: true }));
  return [
    ["Callsign", "Agent", "Discord ID", "Rank", "Tier", "Status", "Divisions", "Joined agency", "Rank held since"],
    ...rows.map(({ m, rank }) => [
      m.callsign || "",
      m.username || "",
      String(m.discord_id),
      rank?.name || "Unranked",
      rank?.tier || "",
      m.status,
      divisionsOf(m.discord_id).join(", "),
      day(m.joined_at),
      day(m.rank_changed_at),
    ]),
  ];
}

/** Alt records for the locked sheet. Only active records are listed. */
export function altGrid(records) {
  return [
    ["Main account", "Alt account", "Alt username", "Source", "Evidence", "Recorded by", "Recorded"],
    ...records.filter((r) => r.status === "active").map((r) => [r.main_discord_id, r.alt_discord_id, r.alt_username || "", r.source, r.evidence || "", r.added_by, day(r.created_at)]),
  ];
}

export const DEFAULT_TIERS = [
  { key: "agent", label: "Agents", index: 0 },
  { key: "supervisor", label: "Supervisors", index: 1 },
  { key: "low_command", label: "Low Command", index: 2 },
  { key: "trial_high_command", label: "Trial High Command", index: 3 },
  { key: "high_command", label: "High Command", index: 4 },
];

/** Overview tab: what the workbook is, who is in it and what each tab holds. */
export function homepageGrid(members, ladder, tiers = DEFAULT_TIERS) {
  const current = members.filter((m) => m.status !== "removed");
  const byRole = new Map(ladder.map((r) => [r.role_id, r]));
  const perTier = tiers.map((t) => [`  ${t.label}`, String(current.filter((m) => m.status === "active" && byRole.get(m.rank_role_id)?.tier === t.key).length)]);
  return [
    ["FBRP | Internal Affairs Agency"],
    ["Confidential. Access to this workbook is granted and removed only through IAA Systems (/iaa-docs). It is kept in step with the bot automatically; do not type over it."],
    [""],
    ["Active agents", String(current.filter((m) => m.status === "active").length)],
    ["Suspended", String(current.filter((m) => m.status === "suspended").length)],
    ["Active agents by tier", ""],
    ...perTier,
    [""],
    ["Tab", "What it holds"],
    ["Master Roster", "Every current agent with callsign, rank, tier, status and divisions."],
    ["Employee Database", "Personnel summary per agent: discipline counts, cases led, awards and leave."],
    ["Authority Matrix", "Which command tier may do what, read live from the bot's permission settings."],
    ["Punishment Guideline", "Discipline actions, who may issue them and which verdicts allow which outcomes."],
  ];
}

export function employeeGrid(stats, ladder) {
  const byRole = new Map(ladder.map((r) => [r.role_id, r]));
  const rows = [...stats].sort((a, b) => (byRole.get(b.rank_role_id)?.level || 0) - (byRole.get(a.rank_role_id)?.level || 0) || String(a.callsign || "~").localeCompare(String(b.callsign || "~"), "en", { numeric: true }));
  return [
    ["Callsign", "Agent", "Discord ID", "Rank", "Status", "Joined agency", "Rank held since", "Warnings", "Active strikes", "Suspensions", "Cases led", "Awards", "On leave until"],
    ...rows.map((m) => [
      m.callsign || "",
      m.username || "",
      String(m.discord_id),
      byRole.get(m.rank_role_id)?.name || "Unranked",
      m.status,
      day(m.joined_at),
      day(m.rank_changed_at),
      Number(m.warnings || 0),
      Number(m.strikes || 0),
      Number(m.suspensions || 0),
      Number(m.cases_led || 0),
      Number(m.awards || 0),
      day(m.leave_until),
    ]),
  ];
}

/** Permission by tier, from the bot's own table so the sheet is never a second source of truth. */
export function authorityGrid(permissions, tiers = DEFAULT_TIERS, overrides = {}) {
  const index = new Map(tiers.map((t) => [t.key, t.index]));
  const label = new Map(tiers.map((t) => [t.key, t.label]));
  return [
    ["Permission", "What it allows", "Minimum tier", ...tiers.map((t) => t.label)],
    ...Object.entries(permissions).map(([key, rule]) => {
      const tier = overrides[key] || rule.tier;
      const needed = index.get(tier) ?? 99;
      return [key, rule.label, label.get(tier) || tier, ...tiers.map((t) => (t.index >= needed ? "Yes" : ""))];
    }),
    [""],
    ["High Command, server administrators and the bot owner may do everything. Nobody may act on a member at or above their own rank."],
  ];
}

export function punishmentGrid(settings = {}, permissions = {}, tiers = DEFAULT_TIERS, overrides = {}) {
  const label = new Map(tiers.map((t) => [t.key, t.label]));
  const who = (perm, fallback) => label.get(overrides[perm] || permissions[perm]?.tier) || fallback;
  const strike = settings.strikeDays || 60;
  return [
    ["Action", "Who may issue it", "Effect", "Duration", "Notes"],
    ["Warning", who("discipline.warn", "Supervisors"), "Written corrective action on the record; no status role.", "Permanent record", "Does not create an active status."],
    ["Strike", who("discipline.warn", "Supervisors"), "Applies the First Strike role.", `${strike} days`, "More than one active strike should trigger suspension or removal review."],
    ["Suspension", who("discipline.suspend", "Low Command"), "Removes agency roles and applies Suspended; roles are restored automatically at the end.", "Set when issued", "Suspended agents receive no document access."],
    ["Revocation", who("discipline.suspend", "Low Command"), "Ends an active strike or suspension and records who ended it and why.", "n/a", ""],
    ["Removal", who("roster.remove", "Low Command"), "Strips agency roles, clears callsign and discipline, ends document access.", "Permanent", "Retirement is for honorable separation only."],
    ["Removal + IAA blacklist", who("discipline.blacklist", "High Command"), "Removes and bans the user and blocks re-entry.", "Until High Command lifts it", "Should follow a documented case."],
    [""],
    ["Verdict", "Outcomes allowed", "", "", ""],
    ["Substantiated", "Any outcome, up to the closing agent's permission", "", "", "Guilty verdict"],
    ["Policy violation (other)", "Any outcome, up to the closing agent's permission", "", "", "Guilty verdict"],
    ["Unsubstantiated", "No action only", "", "", "Cannot carry punishment"],
    ["Insufficient evidence", "No action only", "", "", "Cannot carry punishment"],
    ["Exonerated", "No action only", "", "", "Cannot carry punishment"],
  ];
}

/**
 * The SOP: the converted agency handbook (sop-content.js) with the live values filled in and the live
 * rank ladder appended, so the text never drifts from the bot's settings.
 */
export function sopParagraphs(ladder, settings = {}) {
  const fill = (text) =>
    text.replaceAll("{{strikeDays}}", String(settings.strikeDays || 60)).replaceAll("{{inactivityDays}}", String(settings.inactivityDays || 14));
  const out = [];
  let seen = 0;
  for (const raw of SOP_TEXT.split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim()) continue;
    if (line === "END OF CONTROLLED DOCUMENT") {
      out.push({ style: "HEADING_1", text: "Appendix A. Rank ladder" });
      out.push({ style: "NORMAL_TEXT", text: "Highest rank first. Agents may only act on members strictly below their own rank." });
      for (const r of [...ladder].sort((a, b) => b.level - a.level)) out.push({ style: "NORMAL_TEXT", text: `• ${r.name} — ${String(r.tier || "agent").replace(/_/g, " ")}` });
    }
    seen++;
    if (seen === 1) out.push({ style: "SUBTITLE", text: line });
    else if (seen === 2) out.push({ style: "TITLE", text: line });
    else if (line.startsWith("## ")) out.push({ style: "HEADING_2", text: fill(line.slice(3)) });
    else if (line.startsWith("# ")) out.push({ style: "HEADING_1", text: fill(line.slice(2)) });
    else if (line.startsWith("- ")) out.push({ style: "NORMAL_TEXT", text: `• ${fill(line.slice(2))}` });
    else out.push({ style: "NORMAL_TEXT", text: fill(line) });
  }
  return out;
}

/** The file id from a Google Docs/Sheets link, or a bare id. */
export function googleIdFrom(value) {
  const text = String(value || "").trim();
  const match = text.match(/\/d\/([A-Za-z0-9_-]{20,})/) || text.match(/^([A-Za-z0-9_-]{20,})$/);
  if (!match) throw new DocsError("Paste the link to the Google Doc or Sheet.");
  return match[1];
}

const MIME = { doc: "application/vnd.google-apps.document", sheet: "application/vnd.google-apps.spreadsheet" };

export function validateEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  if (!EMAIL.test(email) || email.length > 190) throw new DocsError("That does not look like a Google account email address.");
  return email;
}

/* ------------------------------------------------------------------ service */

export function createDocumentService({ repo, google, ranks, settings = async () => ({}), divisions = async () => new Map(), authority = async () => ({ permissions: {}, tiers: DEFAULT_TIERS, overrides: {} }), now = () => Date.now(), log = console }) {
  const needGoogle = () => {
    if (!google) throw new DocsError("Google access is not configured for IAA Systems yet (IAA_GOOGLE_SERVICE_ACCOUNT_FILE).");
    return google;
  };
  const docRow = async (key) => {
    if (!DOCS[key]) throw new DocsError("Unknown document.");
    const row = await repo.getDocument(key);
    if (!row) throw new DocsError(`The ${DOCS[key].label.toLowerCase()} has not been created yet. High Command: run /iaa-docs setup.`);
    return row;
  };

  async function writeIfChanged(key, content, force = false) {
    const row = await docRow(key);
    const hash = hashOf(content);
    if (!force && row.content_hash === hash) return false;
    const g = needGoogle();
    if (DOCS[key].kind === "sheet") for (const [tab, grid] of Object.entries(content)) await g.writeSheet(row.google_id, tab, grid);
    else await g.writeDocument(row.google_id, content);
    await repo.touchDocument(key, hash, now());
    return true;
  }

  const service = {
    ready: async () => Boolean(await repo.getDocument("roster")),
    /** Creates any missing document (private to the bot) and fills it. Safe to run repeatedly. */
    async setup(actorId) {
      const g = needGoogle();
      const created = [];
      for (const key of DOC_KEYS) {
        if (await repo.getDocument(key)) continue;
        const spec = DOCS[key];
        let id;
        try {
          id = spec.kind === "doc" ? await g.createDocument(spec.title) : await g.createSpreadsheet(spec.title, spec.tabs);
        } catch (error) {
          if (error.status === 403 && /storage quota|permission/i.test(error.message))
            throw new DocsError("Google does not let a service account own files. Create the file in Google Drive, share it with the bot's Google account as Editor, then run /iaa-docs link with its URL.");
          throw error;
        }
        await repo.saveDocument({ doc_key: key, kind: spec.kind, title: spec.title, google_id: id, created_by: actorId, created_at: now() });
        created.push(key);
      }
      await service.syncAll(true);
      return created;
    },

    /** Adopts a Google file a person created and shared with the bot's account as Editor. */
    async register({ docKey, source, actorId }) {
      const spec = DOCS[docKey];
      if (!spec) throw new DocsError("Unknown document.");
      const id = googleIdFrom(source);
      const g = needGoogle();
      let info;
      try {
        info = await g.inspect(id);
      } catch (error) {
        if (error.status === 404 || error.status === 403) throw new DocsError("The bot cannot see that file. Share it with the bot's Google account as Editor first.");
        throw error;
      }
      if (info.mimeType !== MIME[spec.kind]) throw new DocsError(`That is not a Google ${spec.kind === "doc" ? "Doc" : "Sheet"}.`);
      if (!info.capabilities?.canEdit || !info.capabilities?.canShare) throw new DocsError("The bot needs Editor access, with sharing allowed, on that file.");
      if (spec.kind === "sheet") for (const tab of spec.tabs) await g.ensureTab(id, tab);
      await repo.saveDocument({ doc_key: docKey, kind: spec.kind, title: info.name, google_id: id, created_by: actorId, created_at: now() });
      const sync = { roster: service.syncRoster, sop: service.syncSop, alts: service.syncAlts }[docKey];
      await sync(true);
      return { title: info.name };
    },

    async syncRoster(force = false) {
      const byMember = await divisions();
      const [members, stats, ladder, settingsNow, rules] = [await repo.rosterMembers(), await repo.employeeStats(), await ranks(), await settings(), await authority()];
      const tiers = rules.tiers?.length ? rules.tiers : DEFAULT_TIERS;
      return writeIfChanged(
        "roster",
        {
          Homepage: homepageGrid(members, ladder, tiers),
          "Master Roster": rosterGrid(members, ladder, { divisionsOf: (id) => byMember.get(String(id)) || [] }),
          "Employee Database": employeeGrid(stats, ladder),
          "Authority Matrix": authorityGrid(rules.permissions || {}, tiers, rules.overrides || {}),
          "Punishment Guideline": punishmentGrid(settingsNow, rules.permissions || {}, tiers, rules.overrides || {}),
        },
        force,
      );
    },
    async syncSop(force = false) {
      return writeIfChanged("sop", sopParagraphs(await ranks(), await settings()), force);
    },
    async syncAlts(force = false) {
      return writeIfChanged("alts", { LOCKED: altGrid(await repo.altRecords()) }, force);
    },
    async syncAll(force = false) {
      return { roster: await service.syncRoster(force), sop: await service.syncSop(force), alts: await service.syncAlts(force) };
    },

    /** Opens a document for one named Google account. The caller has already checked the actor's authority. */
    async grant({ docKey, target, email, level = "reader", actorId, override = false }) {
      const spec = DOCS[docKey];
      if (!spec) throw new DocsError("Unknown document.");
      if (!LEVELS[level]) throw new DocsError("Level must be reader, commenter or writer.");
      const address = validateEmail(email);
      if (spec.locked && level !== "reader") throw new DocsError("The locked alt database can only be shared as view-only.");
      const member = await repo.rosterMember(target.discordId);
      if (!override && (!member || member.status !== "active")) throw new DocsError("Only active agents can be given access to agency documents.");
      const row = await docRow(docKey);
      const g = needGoogle();
      const existing = await repo.activeGrants({ docKey, discordId: target.discordId });
      for (const old of existing) {
        if (old.email === address && old.level === level) return { changed: false, grant: old };
        await service.revokeGrant(old, { by: actorId, reason: "replaced" });
      }
      const permissionId = await g.share(row.google_id, address, level);
      const grant = await repo.addGrant({ doc_key: docKey, discord_id: target.discordId, email: address, level, permission_id: permissionId, granted_by: actorId, granted_at: now() });
      return { changed: true, grant };
    },

    /** Ends one grant. If Google is unreachable the grant is flagged and retried by reconcile. */
    async revokeGrant(grant, { by, reason }) {
      try {
        const row = await repo.getDocument(grant.doc_key);
        if (row && grant.permission_id) await needGoogle().unshare(row.google_id, grant.permission_id);
        await repo.markRevoked(grant.id, { by, reason, at: now() });
        return true;
      } catch (error) {
        log.warn?.(`[IAA] could not revoke document access ${grant.id}: ${error.message}`);
        await repo.markRevokePending(grant.id, { by, reason, at: now() });
        return false;
      }
    },

    async revoke({ discordId, docKey = null, by, reason = "revoked" }) {
      const grants = await repo.activeGrants({ docKey, discordId });
      let done = 0;
      for (const grant of grants) if (await service.revokeGrant(grant, { by, reason })) done++;
      return { found: grants.length, revoked: done };
    },

    /** Automatic offboarding: called whenever an agent leaves the roster by any route. */
    async offboard(discordId, { by = "system", reason = "left the agency" } = {}) {
      const result = await service.revoke({ discordId, by, reason });
      await service.syncRoster().catch((e) => log.warn?.(`[IAA] roster sync after offboarding: ${e.message}`));
      return result;
    },

    /** Removes access held by anyone who is no longer an active agent, and retries stuck revocations. */
    async reconcile({ by = "system" } = {}) {
      const revoked = [];
      for (const grant of await repo.activeGrants({})) {
        const member = await repo.rosterMember(grant.discord_id);
        if (!member || member.status !== "active") {
          if (await service.revokeGrant(grant, { by, reason: "no longer an active agent" })) revoked.push(grant.discord_id);
        }
      }
      for (const grant of await repo.pendingRevocations()) await service.revokeGrant(grant, { by, reason: grant.revoke_reason || "retry" });
      return { revoked };
    },

    /** Compares Google's real sharing list with the access list and removes anything unrecorded. */
    async audit({ by = "system" } = {}) {
      const g = needGoogle();
      const removed = [];
      for (const key of DOC_KEYS) {
        const row = await repo.getDocument(key);
        if (!row) continue;
        const known = new Set((await repo.activeGrants({ docKey: key })).map((x) => x.permission_id).filter(Boolean));
        for (const permission of await g.listAccess(row.google_id)) {
          if (permission.role === "owner" || known.has(permission.id)) continue;
          await g.unshare(row.google_id, permission.id);
          removed.push({ doc: key, type: permission.type, email: permission.emailAddress || null });
        }
      }
      if (removed.length) log.warn?.(`[IAA] document audit removed ${removed.length} unrecorded permission(s) (by ${by})`);
      return removed;
    },

    async linkFor(docKey, discordId) {
      const grants = await repo.activeGrants({ docKey, discordId });
      if (!grants.length) throw new DocsError("You have not been given access to that document. Ask a ranked agent to grant it with /iaa-docs.");
      const row = await docRow(docKey);
      return needGoogle().link(row.kind, row.google_id);
    },

    /* ---- alt records */

    async addAlt({ main, alt, username = null, evidence = null, source = "manual", actorId }) {
      if (!SNOWFLAKE.test(String(main)) || !SNOWFLAKE.test(String(alt))) throw new DocsError("Both accounts must be Discord users.");
      if (String(main) === String(alt)) throw new DocsError("An account cannot be its own alt.");
      const record = await repo.upsertAlt({ main: String(main), alt: String(alt), username, evidence: evidence ? String(evidence).slice(0, 500) : null, source, actorId, at: now() });
      await service.syncAlts().catch((e) => log.warn?.(`[IAA] alt sheet sync: ${e.message}`));
      return record;
    },
    async removeAlt({ main, alt, actorId }) {
      const changed = await repo.clearAlt({ main: String(main), alt: String(alt), actorId, at: now() });
      if (!changed) throw new DocsError("There is no active record linking those accounts.");
      await service.syncAlts().catch((e) => log.warn?.(`[IAA] alt sheet sync: ${e.message}`));
      return true;
    },
    listAlts: (filter) => repo.altRecords(filter),
    listGrants: (filter = {}) => repo.activeGrants(filter),
  };
  return service;
}
