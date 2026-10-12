export const OWNER_DISCORD_ID = "1090083387638812755";

export function requireOwnerId(discordId, action = "make this change") {
  if (String(discordId) === OWNER_DISCORD_ID) return;
  throw new Error(`Only the Florida Bay owner can ${action}.`);
}
