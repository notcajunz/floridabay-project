-- Duty blips (client): on-duty members on the map.
-- Nearby units are tracked live (entity blips); far-away units move with the server updates.
local cfg = FBRP.DutyBlips or {}
local SPRITES = cfg.sprites or {}

local dutyBlips = {} -- [serverId] = { blip, entity, entry }

local function removeDutyBlip(serverId)
    local entry = dutyBlips[serverId]
    if entry and DoesBlipExist(entry.blip) then RemoveBlip(entry.blip) end
    dutyBlips[serverId] = nil
end

local function vehicleKind(ped)
    local vehicle = GetVehiclePedIsIn(ped, false)
    if vehicle == 0 then return 'foot', false end
    local class = GetVehicleClass(vehicle)
    local kind = (class == 15 and 'heli') or (class == 16 and 'plane') or (class == 14 and 'boat')
        or ((class == 8 or class == 13) and 'bike') or 'automobile'
    return kind, IsVehicleSirenOn(vehicle)
end

-- icon, rotation, colour, flashing, name
local function styleBlip(blip, data, kind, siren, heading)
    local sprite = SPRITES[kind] or SPRITES.other or 1
    if GetBlipSprite(blip) ~= sprite then SetBlipSprite(blip, sprite) end
    SetBlipScale(blip, cfg.scale or 0.85)
    SetBlipColour(blip, data.color or (data.leo and 38 or 2))
    SetBlipDisplay(blip, 2)
    SetBlipAsShortRange(blip, false)
    SetBlipCategory(blip, 7)
    ShowHeadingIndicatorOnBlip(blip, kind == 'foot')
    SetBlipRotation(blip, math.floor(heading or 0.0))

    local flash = cfg.flashWithSirens ~= false and siren == true
    if data.flashing ~= flash then
        data.flashing = flash
        SetBlipFlashes(blip, flash)
        if flash then
            SetBlipFlashInterval(blip, 400)
            if data.orgType == 'leo' then SetBlipFlashesAlternate(blip, true) end -- red / blue
        else
            SetBlipFlashesAlternate(blip, false)
        end
    end

    if data.named ~= data.label then
        data.named = data.label
        BeginTextCommandSetBlipName('STRING')
        AddTextComponentString(data.label or ('On-duty member [%d]'):format(data.id))
        EndTextCommandSetBlipName(blip)
    end
end

RegisterNetEvent('fbrp:dutyBlips:update', function(entries)
    entries = type(entries) == 'table' and entries or {}
    local active = {}

    for _, entry in ipairs(entries) do
        local serverId = tonumber(entry.id)
        local x, y, z = tonumber(entry.x), tonumber(entry.y), tonumber(entry.z)
        if serverId and x and y and z then
            active[serverId] = true
            local current = dutyBlips[serverId]

            -- nearby (their ped exists on our side) -> live entity blip; otherwise a coordinate blip
            local player = GetPlayerFromServerId(serverId)
            local ped = player ~= -1 and GetPlayerPed(player) or 0
            local entity = (ped ~= 0 and DoesEntityExist(ped)) and ped or nil

            if current and (current.entity ~= entity or not DoesBlipExist(current.blip)) then
                removeDutyBlip(serverId)
                current = nil
            end
            if not current then
                local blip = entity and AddBlipForEntity(entity) or AddBlipForCoord(x + 0.0, y + 0.0, z + 0.0)
                current = { blip = blip, entity = entity, entry = {} }
                dutyBlips[serverId] = current
            end

            local data = current.entry
            data.id, data.label, data.color, data.leo, data.orgType = serverId, entry.label, entry.color, entry.leo, entry.orgType
            data.serverKind, data.serverSiren, data.serverHeading = entry.kind or 'foot', entry.siren == true, tonumber(entry.heading) or 0.0
            if not entity then
                SetBlipCoords(current.blip, x + 0.0, y + 0.0, z + 0.0)
                styleBlip(current.blip, data, data.serverKind, data.serverSiren, data.serverHeading)
            end
        end
    end

    for serverId in pairs(dutyBlips) do
        if not active[serverId] then removeDutyBlip(serverId) end
    end
end)

-- live units: keep icon / heading / siren flash up to date between server updates
CreateThread(function()
    while true do
        local any = false
        for serverId, current in pairs(dutyBlips) do
            if current.entity then
                any = true
                if DoesEntityExist(current.entity) and DoesBlipExist(current.blip) then
                    local kind, siren = vehicleKind(current.entity)
                    styleBlip(current.blip, current.entry, kind, siren, GetEntityHeading(current.entity))
                else
                    removeDutyBlip(serverId) -- they went out of range: next server update makes a map blip
                end
            end
        end
        Wait(any and 250 or 1000)
    end
end)

AddEventHandler('onClientResourceStop', function(resource)
    if resource ~= GetCurrentResourceName() then return end
    for serverId in pairs(dutyBlips) do removeDutyBlip(serverId) end
end)
