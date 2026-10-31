-- Duty blips (server): works out who each on-duty member can see and sends them positions.
local S = FBRP.Server
local sessions = S.sessions
local cfg = FBRP.DutyBlips or {}

---------------------------------------------------------------- who sees who

local function canSee(viewer, target)
    if not viewer or not viewer.org or not target or not target.org then return false end
    local allowed = (cfg.visibility or {})[viewer.org.type]
    if allowed then return allowed[target.org.type] == true end
    return tonumber(viewer.org.id) == tonumber(target.org.id) -- other org types: own organisation only
end

---------------------------------------------------------------- callsigns (from the MDT), cached

local callsigns, callsignAt = {}, {}
local function callsignOf(source)
    if not cfg.showCallsign then return nil end
    local s = sessions[source]
    if not s or not s.discord then return nil end
    local now = GetGameTimer()
    if callsignAt[source] and now - callsignAt[source] < 60000 then return callsigns[source] end
    callsignAt[source] = now
    CreateThread(function()
        local ok, row = pcall(MySQL.single.await, 'SELECT callsign FROM mdt_units WHERE discord_id=?', { s.discord })
        callsigns[source] = ok and row and row.callsign and tostring(row.callsign) ~= '' and tostring(row.callsign) or nil
    end)
    return callsigns[source]
end

---------------------------------------------------------------- what they're in

local function stateOf(source)
    local ped = GetPlayerPed(source)
    if not ped or ped <= 0 then return nil end
    local coords = GetEntityCoords(ped)
    if not coords then return nil end
    local kind, siren = 'foot', false
    local vehicle = GetVehiclePedIsIn(ped, false)
    if vehicle and vehicle ~= 0 and DoesEntityExist(vehicle) then
        local vtype = GetVehicleType(vehicle) or 'automobile'
        kind = (vtype == 'automobile' or vtype == 'bike' or vtype == 'heli' or vtype == 'plane' or vtype == 'boat') and vtype or 'other'
        if vtype == 'submarine' then kind = 'boat' end
        siren = IsVehicleSirenOn(vehicle) == true
    end
    return coords, GetEntityHeading(ped), kind, siren
end

local function colorFor(org)
    local byOrg = (cfg.orgColors or {})[org.slug]
    if byOrg then return byOrg end
    local colors = cfg.colors or {}
    return colors[org.type] or colors.default or 2
end

---------------------------------------------------------------- build + send

local function dutyBlipsFor(viewerSource)
    local viewer = sessions[viewerSource]
    if not viewer or not viewer.org then return {} end
    local blips = {}
    for targetSource, target in pairs(sessions) do
        if targetSource ~= viewerSource and GetPlayerPing(targetSource) > 0 and canSee(viewer, target) then
            local coords, heading, kind, siren = stateOf(targetSource)
            if coords then
                local callsign = callsignOf(targetSource)
                local label = callsign and ('[%d] %s | %s'):format(targetSource, callsign, S.displayName(targetSource))
                    or ('[%d] %s'):format(targetSource, S.displayName(targetSource))
                if target.org.id ~= viewer.org.id then label = ('%s · %s'):format(label, target.org.name) end
                blips[#blips + 1] = {
                    id = targetSource, label = S.clean(label, 100),
                    x = coords.x, y = coords.y, z = coords.z, heading = heading or 0.0,
                    kind = kind, siren = siren, color = colorFor(target.org),
                    orgType = target.org.type, leo = target.org.type == 'leo',
                }
            end
        end
    end
    return blips
end

-- only on-duty players get updates (plus one empty update right after going off duty, to clear the map)
local hadBlips = {}
local function sendDutyBlips(source)
    local s = sessions[source]
    if s and s.org then
        hadBlips[source] = true
        TriggerClientEvent('fbrp:dutyBlips:update', source, dutyBlipsFor(source))
    elseif hadBlips[source] then
        hadBlips[source] = nil
        TriggerClientEvent('fbrp:dutyBlips:update', source, {})
    end
end

local function syncDutyBlips()
    if cfg.enabled == false then return end
    for source in pairs(sessions) do sendDutyBlips(source) end
end

AddEventHandler('fbrp:organizationDutyChanged', function() SetTimeout(0, syncDutyBlips) end)
AddEventHandler('fbrp:playerReady', function() SetTimeout(0, syncDutyBlips) end)
AddEventHandler('playerDropped', function()
    local src = source
    hadBlips[src], callsigns[src], callsignAt[src] = nil, nil, nil
    SetTimeout(0, syncDutyBlips)
end)

CreateThread(function()
    while true do
        Wait(cfg.updateMs or 1500)
        syncDutyBlips()
    end
end)
