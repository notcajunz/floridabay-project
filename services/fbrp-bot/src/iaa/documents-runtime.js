import { PERMISSIONS, config, ranks } from "./store.js";
import { createDocumentService } from "./documents.js";
import { sqlDocumentRepo } from "./documents-store.js";
import { GoogleWorkspace } from "./google.js";

/** Process-wide wiring of the documents service: SQL storage, the bot's Google account and the IAA guild. */
let service = null;
let guildRef = null;
export const bindGuild = (guild) => {
  guildRef = guild;
};

async function divisions() {
  const out = new Map();
  if (!guildRef) return out;
  const cfg = await config();
  const roles = [...(cfg.roles.divisions || []), ...(cfg.roles.positions || [])].map((id) => guildRef.roles.cache.get(id)).filter(Boolean);
  for (const role of roles) {
    for (const member of role.members.values()) {
      const list = out.get(member.id) || [];
      list.push(role.name.replace(/^IAA\s*[|·-]\s*/i, ""));
      out.set(member.id, list);
    }
  }
  return out;
}

async function authority() {
  const cfg = await config();
  return { permissions: PERMISSIONS, tiers: cfg.tiers?.length ? cfg.tiers.map((t) => ({ key: t.key, label: t.label, index: t.index })) : undefined, overrides: cfg.settings.perms || {} };
}

export function documents() {
  if (service) return service;
  let google = null;
  try {
    google = GoogleWorkspace.fromEnv();
  } catch (error) {
    console.warn(`[IAA] Google documents disabled: ${error.message}`);
  }
  service = createDocumentService({ repo: sqlDocumentRepo(), google, ranks, settings: async () => (await config()).settings, divisions, authority });
  return service;
}

/** Ends document access after an agent leaves the roster by any route. Never throws. */
export async function offboardDocuments(discordId, { by = "system", reason = "left the agency" } = {}) {
  try {
    return await documents().offboard(discordId, { by, reason });
  } catch (error) {
    console.warn(`[IAA] document offboarding for ${discordId}: ${error.message}`);
    return null;
  }
}

let rosterTimer = null;
/** Rewrites the roster sheet a few seconds after the last change, so a burst of promotions writes once. */
export function scheduleRosterSheet() {
  if (rosterTimer) return;
  rosterTimer = setTimeout(async () => {
    rosterTimer = null;
    try {
      const svc = documents();
      if (await svc.ready()) await svc.syncRoster();
    } catch (error) {
      console.warn(`[IAA] roster sheet sync: ${error.message}`);
    }
  }, 15000);
}
