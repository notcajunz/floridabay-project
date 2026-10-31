-- Granted with the FBRP | Custom Weapons role (ACE group custom_weapons). Legacy
-- vMenu strips the weapon_ prefix when it creates per-addon-weapon ACE names.
local accessObject = 'vMenu.WeaponOptions.WhitelistedModels.mp9a'
local guildId = '1557594282976747550'
local roleId = '1558772553789743214'

local function discordId(source)
    for _, identifier in ipairs(GetPlayerIdentifiers(source)) do
        if identifier:sub(1, 8) == 'discord:' then return identifier:sub(9) end
    end
end

local function hasCustomWeaponsRole(source)
    if IsPlayerAceAllowed(source, accessObject) then return true end
    local discord = discordId(source)
    if not discord then return false end
    return MySQL.scalar.await([[
        SELECT 1 FROM discord_member_cache
        WHERE guild_id=? AND discord_id=? AND JSON_CONTAINS(roles, JSON_QUOTE(?))
        LIMIT 1
    ]], { guildId, discord, roleId }) ~= nil
end

RegisterNetEvent('fbrp_guns2:requestAccess', function()
    local src = source
    local ok, allowed = pcall(hasCustomWeaponsRole, src)
    TriggerClientEvent('fbrp_guns2:setAccess', src, ok and allowed == true)
end)
