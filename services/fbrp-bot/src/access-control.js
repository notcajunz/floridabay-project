export const OWNER_DISCORD_ID = "1090083387638812755";

export const PROTECTED_ROLE_MANAGER_IDS = Object.freeze([
  OWNER_DISCORD_ID,
  "1099651002208104488",
]);

export function isProtectedRoleManagerId(discordId) {
  return PROTECTED_ROLE_MANAGER_IDS.includes(String(discordId));
}

export function requireProtectedRoleManagerId(discordId) {
  if (isProtectedRoleManagerId(discordId)) return;
  throw new Error("Only an authorized protected-role manager can make this change.");
}

export function requireOwnerId(discordId, action = "make this change") {
  if (String(discordId) === OWNER_DISCORD_ID) return;
  throw new Error(`Only the Florida Bay owner can ${action}.`);
}
