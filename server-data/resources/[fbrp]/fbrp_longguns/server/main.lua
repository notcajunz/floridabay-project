-- Trunk weapon storage. Long guns live in vehicle trunks (keyed by plate) and
-- come out one at a time; the client handles slinging and enforcement.

local allowed = {}
for _, name in ipairs(LG.weapons) do allowed[name] = true end

local lastAction = {}

local function notify(target, message, tone)
    TriggerClientEvent('ox_lib:notify', target, { description = message, type = tone or 'info' })
end

local function clamp(value, minimum, maximum)
    value = tonumber(value) or minimum
    return math.max(minimum, math.min(maximum, math.floor(value)))
end

local function limited(source)
    local now = GetGameTimer()
    if (lastAction[source] or 0) + 400 > now then return true end
    lastAction[source] = now
    return false
end

AddEventHandler('playerDropped', function() lastAction[source] = nil end)

MySQL.ready(function()
    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS fbrp_trunk_weapons (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            plate VARCHAR(16) NOT NULL,
            weapon VARCHAR(64) NOT NULL,
            ammo INT NOT NULL DEFAULT 0,
            clip INT NOT NULL DEFAULT 0,
            tint TINYINT NOT NULL DEFAULT 0,
            components TEXT NULL,
            stored_by VARCHAR(64) NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_plate (plate)
        )
    ]])
    MySQL.update.await('DELETE FROM fbrp_trunk_weapons WHERE created_at < (NOW() - INTERVAL ? DAY)', { LG.trunkRetentionDays })
end)

-- Resolves the vehicle a player is reaching into and checks they stand near it.
local function resolveVehicle(source, netId)
    netId = tonumber(netId)
    if not netId then return nil end
    local vehicle = NetworkGetEntityFromNetworkId(netId)
    if not vehicle or vehicle == 0 or not DoesEntityExist(vehicle) then return nil end
    local ped = GetPlayerPed(source)
    if not ped or ped == 0 then return nil end
    if #(GetEntityCoords(ped) - GetEntityCoords(vehicle)) > 9.0 then return nil end
    local plate = tostring(GetVehicleNumberPlateText(vehicle) or ''):gsub('^%s+', ''):gsub('%s+$', ''):upper():sub(1, 16)
    if plate == '' then return nil end
    return vehicle, plate
end

local function listTrunk(plate)
    local rows = MySQL.query.await(
        'SELECT id, weapon, ammo, clip, tint, components FROM fbrp_trunk_weapons WHERE plate = ? ORDER BY id', { plate }
    ) or {}
    local items = {}
    for _, row in ipairs(rows) do
        local components = {}
        if row.components and row.components ~= '' then
            local ok, decoded = pcall(json.decode, row.components)
            if ok and type(decoded) == 'table' then components = decoded end
        end
        items[#items + 1] = {
            id = row.id, weapon = row.weapon, ammo = row.ammo, clip = row.clip,
            tint = row.tint, components = components
        }
    end
    return items
end

local function pushState(source, netId, plate)
    TriggerClientEvent('fbrp_longguns:state', source, netId, plate, listTrunk(plate), LG.trunkCapacity)
end

RegisterNetEvent('fbrp_longguns:open', function(netId)
    local src = source
    if limited(src) then return end
    local _, plate = resolveVehicle(src, netId)
    if not plate then return notify(src, 'You are too far from that trunk.', 'error') end
    pushState(src, netId, plate)
end)

RegisterNetEvent('fbrp_longguns:stow', function(netId, ref, snapshot)
    local src = source
    if limited(src) then return end
    local _, plate = resolveVehicle(src, netId)
    if not plate then return notify(src, 'You are too far from that trunk.', 'error') end
    if type(snapshot) ~= 'table' then return end
    local weapon = tostring(snapshot.weapon or ''):upper()
    if not allowed[weapon] then return notify(src, 'That weapon cannot be stored in a trunk.', 'error') end

    local count = MySQL.scalar.await('SELECT COUNT(*) FROM fbrp_trunk_weapons WHERE plate = ?', { plate }) or 0
    if count >= LG.trunkCapacity then return notify(src, 'This trunk is full.', 'error') end

    local components = {}
    if type(snapshot.components) == 'table' then
        for _, name in ipairs(snapshot.components) do
            name = tostring(name)
            if #components < 32 and #name <= 64 and name:match('^COMPONENT_[%w_]+$') then components[#components + 1] = name end
        end
    end
    local discord
    for _, identifier in ipairs(GetPlayerIdentifiers(src)) do
        if identifier:sub(1, 8) == 'discord:' then discord = identifier:sub(9) end
    end
    MySQL.insert.await(
        'INSERT INTO fbrp_trunk_weapons (plate, weapon, ammo, clip, tint, components, stored_by) VALUES (?,?,?,?,?,?,?)',
        { plate, weapon, clamp(snapshot.ammo, 0, 1000), clamp(snapshot.clip, 0, 500), clamp(snapshot.tint, 0, 32),
          json.encode(components), discord or tostring(src) }
    )
    TriggerClientEvent('fbrp_longguns:stowed', src, tostring(ref or ''))
    pushState(src, netId, plate)
end)

RegisterNetEvent('fbrp_longguns:take', function(netId, id)
    local src = source
    if limited(src) then return end
    local _, plate = resolveVehicle(src, netId)
    if not plate then return notify(src, 'You are too far from that trunk.', 'error') end
    id = tonumber(id)
    if not id then return end
    local row = MySQL.single.await(
        'SELECT id, weapon, ammo, clip, tint, components FROM fbrp_trunk_weapons WHERE id = ? AND plate = ?', { id, plate }
    )
    if not row then return pushState(src, netId, plate) end
    -- Deleting first makes the take atomic: two players cannot both receive the same gun.
    local removed = MySQL.update.await('DELETE FROM fbrp_trunk_weapons WHERE id = ? AND plate = ?', { id, plate })
    if (removed or 0) < 1 then return pushState(src, netId, plate) end
    local components = {}
    if row.components and row.components ~= '' then
        local ok, decoded = pcall(json.decode, row.components)
        if ok and type(decoded) == 'table' then components = decoded end
    end
    TriggerClientEvent('fbrp_longguns:taken', src, {
        weapon = row.weapon, ammo = row.ammo, clip = row.clip, tint = row.tint, components = components
    })
    pushState(src, netId, plate)
end)
