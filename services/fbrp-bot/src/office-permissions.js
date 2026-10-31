/**
 * Channel-scoped permissions granted to an assigned office owner.
 * Discord labels ManageRoles as "Manage Permissions" in channel settings; it
 * allows the owner to edit this voice channel's permission overwrites.
 */
export const OFFICE_OWNER_PERMISSIONS = Object.freeze({
  ViewChannel: true,
  Connect: true,
  ManageChannels: true,
  ManageRoles: true,
  MoveMembers: true,
});
