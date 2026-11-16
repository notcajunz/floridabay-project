
local Config = require 'shared.import'
local VehicleList = require 'data.vehicles'

local CACHE_MS = 30000
local roleCache = {}

-- Discord roles come from the same cache fbrp_core uses for every role check (kept current by the Discord bot).
-- The cache holds one row per network server a member is in, so it must be read for the main guild only.
local MAIN_GUILD = '1557594282976747550'

local function fetchRoleSet(discordId)
    local set = {}
    local row = MySQL.scalar.await('SELECT roles FROM discord_member_cache WHERE guild_id=? AND discord_id=? LIMIT 1', { MAIN_GUILD, tostring(discordId) })
    if row then
        local ok, data = pcall(json.decode, row)
        if ok and type(data) == 'table' then
            for _, roleId in ipairs(data) do set[tostring(roleId)] = true end
        end
    end
    return set
end

local function playerRoles(src)
    local discord
    for _, id in ipairs(GetPlayerIdentifiers(src)) do
        if id:sub(1, 8) == 'discord:' then discord = id:sub(9) break end
    end
    if not discord then return {} end
    local cached = roleCache[discord]
    if cached and (GetGameTimer() - cached.at) < CACHE_MS then return cached.set end
    local set = fetchRoleSet(discord)
    roleCache[discord] = { at = GetGameTimer(), set = set }
    return set
end

-- Founder's Edition holders get every paid pack and menu (the owner-only keys and staff dev keys stay role-bound).
local FOUNDER_ROLE = '1570227921061150810'
local NOT_FOR_FOUNDERS = { ownerkeys = true, ownerfleet = true, acedevkeys = true }

local function allowed(roles, entry)
    -- an entry may list several roles (entry.roles); holding any one of them is enough
    if entry.roles then
        for _, role in ipairs(entry.roles) do
            if roles[tostring(role)] == true then return true end
        end
        return false
    end
    local role = entry.role
    if not role or role == 'public' then return true end
    if roles[FOUNDER_ROLE] and not NOT_FOR_FOUNDERS[entry.id] then return true end
    return roles[tostring(role)] == true
end

local function collect(src)
    local permissions, vehicles = {}, {}
    local settings = Config.settings
    local roles = playerRoles(src)

    for _, list in ipairs({ Config.packs, Config.core, Config.shortcuts }) do
        for _, entry in ipairs(list) do
            if entry.id and allowed(roles, entry) then permissions[entry.id] = true end
        end
    end

    vehicles.public = VehicleList.public or {}

    if VehicleList.ownerkeys and permissions.ownerkeys then
        vehicles.ownerkeys = VehicleList.ownerkeys
    end

    -- the owner fleet is only ever sent to holders of its roles
    if VehicleList.ownerfleet and permissions.ownerfleet then
        vehicles.ownerfleet = VehicleList.ownerfleet
    end

    for _, pack in ipairs(Config.packs) do
        if permissions[pack.id] then
            -- an owned pack with no vehicles yet still gets its (empty) submenu
            vehicles[pack.id] = type(VehicleList[pack.id]) == 'table' and VehicleList[pack.id] or {}
        end
    end

    return vehicles, permissions
end

local lastSent = {}
RegisterNetEvent('F6Menu:Server:UpdateVehicles', function()
    local src = source
    local now = GetGameTimer()
    if lastSent[src] and now - lastSent[src] < 2000 then return end
    lastSent[src] = now

    local vehicles, permissions = collect(src)
    TriggerClientEvent('F6Menu:Client:UpdateVehicles', src, vehicles, permissions)
end)

AddEventHandler('playerDropped', function()
    lastSent[source] = nil
end)
