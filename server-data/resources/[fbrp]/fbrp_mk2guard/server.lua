-- FBRP Mk2 guard - server: the role check, plus a sweep that takes a Mk2 weapon out of the hands of anyone without it.
local cfg = Mk2Config
local hashes = {}
for _, name in ipairs(cfg.Weapons) do hashes[joaat(name)] = name end

local cache = {}
local CACHE_MS = 15000

local function discordId(source)
    for _, identifier in ipairs(GetPlayerIdentifiers(source)) do
        if identifier:sub(1, 8) == 'discord:' then return identifier:sub(9) end
    end
end

-- true only when the cached Discord roles of this player include the Mk2 Weapons role
local function hasAccess(source)
    local now = GetGameTimer()
    local hit = cache[source]
    if hit and now - hit.at < CACHE_MS then return hit.allowed end
    local discord = discordId(source)
    local allowed = false
    if discord then
        local ok, row = pcall(MySQL.scalar.await, [[
            SELECT 1 FROM discord_member_cache
            WHERE guild_id=? AND discord_id=? AND JSON_CONTAINS(roles, JSON_QUOTE(?))
            LIMIT 1
        ]], { cfg.GuildId, discord, cfg.RoleId })
        allowed = ok and row ~= nil
    end
    cache[source] = { at = now, allowed = allowed }
    return allowed
end

exports('HasMk2Access', hasAccess)

RegisterNetEvent('fbrp_mk2guard:requestAccess', function()
    local src = source
    TriggerClientEvent('fbrp_mk2guard:setAccess', src, hasAccess(src))
end)

local lastNotice = {}

CreateThread(function()
    while true do
        Wait(2000)
        for _, playerId in ipairs(GetPlayers()) do
            local src = tonumber(playerId)
            local ped = GetPlayerPed(src)
            if ped and ped ~= 0 then
                local held = GetSelectedPedWeapon(ped)
                if hashes[held] and not hasAccess(src) then
                    RemoveWeaponFromPed(ped, held)
                    local now = GetGameTimer()
                    if not lastNotice[src] or now - lastNotice[src] > 10000 then
                        lastNotice[src] = now
                        TriggerClientEvent('ox_lib:notify', src, { title = 'Mk2 Weapons', description = cfg.Message, type = 'error' })
                    end
                end
            end
        end
    end
end)

AddEventHandler('playerDropped', function()
    cache[source] = nil
    lastNotice[source] = nil
end)
