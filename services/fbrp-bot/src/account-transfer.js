/**
 * Durable Discord-account ownership moved by /global transfer.
 *
 * Actor/author/audit columns are deliberately not rewritten: they describe who
 * performed a historical action. Subject, membership, ownership, and active
 * assignment columns follow the person to the replacement account.
 */

export const ACCOUNT_MOVE_COLUMNS = Object.freeze([
  ["chain_of_command_entries", "discord_id"],
  ["characters", "discord_id"],
  ["community_service", "discord_id"],
  ["custom_eup", "created_by"],
  ["devops_awards", "discord_id"],
  ["devops_discipline", "discord_id"],
  ["devops_history", "discord_id"],
  ["devops_intake", "discord_id"],
  ["devops_incidents", "commander_id"],
  ["devops_leaves", "discord_id"],
  ["devops_members", "discord_id"],
  ["devops_standups", "discord_id"],
  ["devops_tasks", "assignee_id"],
  ["devops_tickets", "author_id"],
  ["devops_tickets", "claimed_by"],
  ["dispatch_calls", "caller_discord"],
  ["giveaways", "host_id"],
  ["iaa_awards", "discord_id"],
  ["iaa_blacklist", "discord_id"],
  ["iaa_cases", "subject_id"],
  ["iaa_cases", "lead_id"],
  ["iaa_discipline", "discord_id"],
  ["iaa_history", "discord_id"],
  ["iaa_leaves", "discord_id"],
  ["iaa_members", "discord_id"],
  ["iaa_shifts", "discord_id"],
  ["jail_sentences", "discord_id"],
  ["mdt_units", "discord_id"],
  ["moderation_appeals", "author_id"],
  ["moderation_appeals", "assigned_to"],
  ["moderation_cases", "target_id"],
  ["offices", "owner_id"],
  ["organization_members", "discord_id"],
  ["organization_shifts", "discord_id"],
  ["org_applications", "discord_id"],
  ["org_applications", "reviewer_id"],
  ["org_drug_runs", "discord_id"],
  ["org_member_profiles", "discord_id"],
  ["org_member_records", "discord_id"],
  ["personal_liveries", "added_by"],
  ["personal_vehicles", "owner_id"],
  ["players", "discord_id"],
  ["player_playtime", "discord_id"],
  ["player_tag_selection", "discord_id"],
  ["role_manager_roles", "owner_id"],
  ["staff_exam_applications", "discord_id"],
  ["staff_exam_grants", "discord_id"],
  ["staff_roster_discipline", "discord_id"],
  ["staff_roster_history", "discord_id"],
  ["staff_roster_members", "discord_id"],
  ["staff_shifts", "discord_id"],
  ["staff_welcome_queue", "discord_id"],
  ["support_tickets", "author_id"],
  ["support_tickets", "claimed_by"],
  ["vehicle_registrations", "discord_id"],
]);

/** Rows that may legitimately exist on a freshly verified replacement account. */
export const ACCOUNT_MERGE_COLUMNS = Object.freeze([
  ["ace_memberships", "discord_id"],
  ["devops_ticket_participants", "user_id"],
  ["discord_security_exemptions", "discord_id"],
  ["discord_security_exemption_scopes", "discord_id"],
  ["giveaway_entries", "discord_id"],
  ["headtag_grants", "discord_id"],
  ["iaa_alerts", "discord_id"],
  ["identity_links", "discord_id"],
  ["network_bot_adder_allowlist", "subject_id"],
  ["organization_duty_global_access", "discord_id"],
  ["org_event_rsvps", "discord_id"],
  ["personal_vehicle_trust", "discord_id"],
  ["protected_role_access", "subject_id"],
  ["role_manager_members", "discord_id"],
  ["staff_roster_member_jobs", "discord_id"],
  ["ticket_participants", "user_id"],
]);

/**
 * These tables contain a singular or authoritative live profile. Refuse to
 * overwrite one on the destination; staff must choose a genuinely replacement
 * account instead of silently combining two established people.
 */
export const DESTINATION_CONFLICTS = Object.freeze([
  ["chain_of_command_entries", "discord_id", "chain of command"],
  ["devops_members", "discord_id", "DevOps roster"],
  ["iaa_blacklist", "discord_id", "IAA blacklist"],
  ["iaa_members", "discord_id", "IAA roster"],
  ["mdt_units", "discord_id", "active MDT unit"],
  ["network_nuke_offenders", "discord_id", "security quarantine"],
  ["organization_members", "discord_id", "organization roster"],
  ["org_member_profiles", "discord_id", "organization profile"],
  ["player_tag_selection", "discord_id", "selected in-game tag"],
  ["staff_roster_members", "discord_id", "staff roster"],
]);

const identifier = (value) => {
  if (!/^[a-z0-9_]+$/i.test(value)) throw new Error(`Unsafe SQL identifier: ${value}`);
  return `\`${value}\``;
};

export async function destinationAccountConflicts(query, discordId) {
  const conflicts = [];
  for (const [table, column, label] of DESTINATION_CONFLICTS) {
    const rows = await query(
      `SELECT 1 present FROM ${identifier(table)} WHERE ${identifier(column)}=? LIMIT 1`,
      [String(discordId)],
    );
    if (rows.length) conflicts.push(label);
  }
  return conflicts;
}

async function countRows(query, table, column, discordId) {
  const rows = await query(
    `SELECT COUNT(*) count FROM ${identifier(table)} WHERE ${identifier(column)}=?`,
    [String(discordId)],
  );
  return Number(rows[0]?.count || 0);
}

/** Move all person-owned database state inside the caller's transaction. */
export async function transferAccountData(query, sourceId, destinationId) {
  const source = String(sourceId);
  const destination = String(destinationId);
  if (source === destination) throw new Error("Source and destination accounts must be different.");

  const counts = {};
  // staff_roster_member_jobs has a foreign key to staff_roster_members without
  // ON UPDATE CASCADE. Clone the parent under its new key, move the children,
  // then remove the old parent so the handoff remains valid throughout.
  const staffMembers = await countRows(query, "staff_roster_members", "discord_id", source);
  if (staffMembers) {
    await query(
      `INSERT INTO staff_roster_members
       (discord_id,display_name,username,rank_name,rank_id,callsign,status,joined_at,rank_changed_at,tickets_handled,activity_note,updated_at,added_by,removed_at,removed_by,removal_reason)
       SELECT ?,display_name,username,rank_name,rank_id,callsign,status,joined_at,rank_changed_at,tickets_handled,activity_note,updated_at,added_by,removed_at,removed_by,removal_reason
         FROM staff_roster_members WHERE discord_id=?`,
      [destination, source],
    );
    const jobs = await query(
      "UPDATE staff_roster_member_jobs SET discord_id=? WHERE discord_id=?",
      [destination, source],
    );
    await query("DELETE FROM staff_roster_members WHERE discord_id=?", [source]);
    counts.staff_roster_members = staffMembers;
    if (Number(jobs.affectedRows || 0)) counts.staff_roster_member_jobs = Number(jobs.affectedRows);
  }

  for (const [table, column] of ACCOUNT_MERGE_COLUMNS) {
    if (table === "staff_roster_member_jobs") continue;
    const count = await countRows(query, table, column, source);
    if (!count) continue;
    // Automatic base memberships and identity links may already be present on
    // the replacement account. Keep the destination copy for exact duplicates.
    await query(
      `UPDATE IGNORE ${identifier(table)} SET ${identifier(column)}=? WHERE ${identifier(column)}=?`,
      [destination, source],
    );
    await query(`DELETE FROM ${identifier(table)} WHERE ${identifier(column)}=?`, [source]);
    counts[table] = (counts[table] || 0) + count;
  }

  for (const [table, column] of ACCOUNT_MOVE_COLUMNS) {
    if (table === "staff_roster_members") continue;
    const result = await query(
      `UPDATE ${identifier(table)} SET ${identifier(column)}=? WHERE ${identifier(column)}=?`,
      [destination, source],
    );
    const changed = Number(result.affectedRows || 0);
    if (changed) counts[table] = (counts[table] || 0) + changed;
  }

  // Tokens are cryptographically and contractually bound to the Discord user
  // that granted them. Sessions/caches must be recreated by each real account.
  for (const table of [
    "command_cooldowns",
    "discord_member_cache",
    "discord_oauth_grants",
    "discord_pending_role_restores",
    "discord_role_restore_snapshots",
    "member_guilds",
    "member_verifications",
    "network_role_queue",
    "network_sync_queue",
  ]) {
    const column = table === "command_cooldowns" ? "actor_id" : "discord_id";
    await query(`DELETE FROM ${identifier(table)} WHERE ${identifier(column)}=?`, [source]);
  }
  await query("DELETE FROM portal_sessions WHERE discord_id IN (?,?)", [source, destination]);

  return counts;
}

export function transferCount(counts) {
  return Object.values(counts || {}).reduce((total, value) => total + Number(value || 0), 0);
}
