-- Permission check. Set to a string like "fbrp.sirenmenu" to require an ACE permission.
-- Leave nil to allow everyone (LVC + emergency-vehicle check still apply client-side).
local AcePermission = nil

RegisterNetEvent("fbrp_sirenmenu:checkPerms", function()
    local src = source
    local allowed = (not AcePermission) or IsPlayerAceAllowed(src, AcePermission)
    TriggerClientEvent("fbrp_sirenmenu:perms", src, allowed)
end)
