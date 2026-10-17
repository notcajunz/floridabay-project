-- Organization economy, client side: lab, business terminal and drop-off
-- markers, timed production / shift tasks / hand-offs, mechanic repairs,
-- serving customers, the armory, the organization wardrobe and the F2 hub.

local E = FBRP.Economy

local state = {}          -- latest stateFor() from the server
local blips = {}
local runBlip = nil
local busy = nil          -- 'produce' | 'task' | 'handoff'
local grounds = {}        -- cached ground Z per marker key

local function ui(message) SendNUIMessage(message) end
local function notify(message, tone) TriggerEvent('fbrp:notify', message, tone or 'info') end

local function help(text)
    BeginTextCommandDisplayHelp('STRING')
    AddTextComponentSubstringPlayerName(text)
    EndTextCommandDisplayHelp(0, false, false, -1)
end

local function ground(key, x, y, z)
    if grounds[key] then return grounds[key] end
    -- Probe just above the configured height first so points inside a building
    -- land on its floor instead of the roof, then higher for low coordinates.
    for _, lift in ipairs({ 1.0, 3.0, 10.0 }) do
        local found, g = GetGroundZFor_3dCoord(x + 0.0, y + 0.0, z + lift, false)
        if found then grounds[key] = g return g end
    end
    return z
end

local function blocked()
    if FBRP.IsDowned and FBRP.IsDowned() then return true end
    if LocalPlayer.state['fbrp:jailed'] or LocalPlayer.state['fbrp:communityService'] then return true end
    return false
end

local function clearBlips()
    for _, blip in ipairs(blips) do
        if DoesBlipExist(blip) then RemoveBlip(blip) end
    end
    blips = {}
end

local function addBlip(x, y, z, sprite, colour, label, scale)
    local blip = AddBlipForCoord(x + 0.0, y + 0.0, z + 0.0)
    SetBlipSprite(blip, sprite)
    SetBlipColour(blip, colour)
    SetBlipScale(blip, scale or 0.8)
    SetBlipAsShortRange(blip, true)
    BeginTextCommandSetBlipName('STRING')
    AddTextComponentString(label)
    EndTextCommandSetBlipName(blip)
    blips[#blips + 1] = blip
end

local BUSINESS_SPRITE = { mechanic=446, bar=93, club=121, restaurant=106, warehouse=473, lab=499, hideout=40 }
local DRUG_SPRITE = { weed=496, meth=499, coke=501 }

local function setRun(run)
    if runBlip and DoesBlipExist(runBlip) then RemoveBlip(runBlip) end
    runBlip = nil
    state.run = run
    if run then
        runBlip = AddBlipForCoord(run.x + 0.0, run.y + 0.0, run.z + 0.0)
        SetBlipSprite(runBlip, 514)
        SetBlipColour(runBlip, 27)
        SetBlipRoute(runBlip, true)
        SetBlipRouteColour(runBlip, 27)
        BeginTextCommandSetBlipName('STRING')
        AddTextComponentString('Drop-off')
        EndTextCommandSetBlipName(runBlip)
        state.runEndsAt = GetGameTimer() + (tonumber(run.secondsLeft) or 0) * 1000
    end
end

local function pushHud()
    local c = state.carry
    local drug = c and E.drugs[c.drug]
    ui({
        type='contraband',
        active=(c and c.units and c.units > 0) and true or false,
        drug=drug and drug.label or nil, color=drug and drug.color or nil, units=c and c.units or 0, capacity=state.capacity,
        run=state.run and { label=state.run.label, endsIn=math.max(0, math.floor(((state.runEndsAt or 0) - GetGameTimer()) / 1000)) } or nil,
    })
end

RegisterNetEvent('fbrp:economy:state', function(data)
    state = data or {}
    clearBlips()
    for _, lab in ipairs(state.labs or {}) do
        addBlip(lab.x, lab.y, lab.z, DRUG_SPRITE[lab.drug] or 499, lab.owned and 27 or 7, (lab.owned and 'Private lab: ' or 'Lab: ') .. lab.label, 0.75)
    end
    for _, property in ipairs(state.properties or {}) do
        addBlip(property.x, property.y, property.z, BUSINESS_SPRITE[property.business] or 476, 5, property.label, 0.85)
    end
    setRun(state.run)
    pushHud()
end)

RegisterNetEvent('fbrp:economy:run', function(run)
    setRun(run)
    pushHud()
end)

AddEventHandler('fbrp:characterSpawned', function()
    TriggerServerEvent('fbrp:economy:spawned')
end)

local function cancelBusy(reason)
    if not busy then return end
    if busy == 'produce' then TriggerServerEvent('fbrp:economy:produceCancel') end
    if busy == 'task' then TriggerServerEvent('fbrp:economy:taskCancel') end
    busy = nil
    ClearPedTasks(PlayerPedId())
    ui({ type='progress', cancel=true })
    if reason then notify(reason, 'error') end
end

local function timed(kind, point, ms, scenario, label, onDone)
    if busy then return end
    busy = kind
    local ped = PlayerPedId()
    if scenario then TaskStartScenarioInPlace(ped, scenario, 0, true) end
    ui({ type='progress', label=label, ms=ms })
    local endsAt = GetGameTimer() + ms
    CreateThread(function()
        while busy == kind and GetGameTimer() < endsAt do
            if #(GetEntityCoords(PlayerPedId()) - point) > 4.0 then return cancelBusy('You moved away.') end
            if IsControlJustReleased(0, 73) then return cancelBusy('Stopped.') end
            if blocked() then return cancelBusy() end
            Wait(0)
        end
        if busy ~= kind then return end
        busy = nil
        ClearPedTasks(PlayerPedId())
        onDone()
    end)
end

local PRODUCE_SCENARIO = { weed='WORLD_HUMAN_GARDENER_PLANT', meth='PROP_HUMAN_BBQ', coke='PROP_HUMAN_PARKING_METER' }
local PRODUCE_LABEL = { weed='Harvesting weed', meth='Cooking meth', coke='Cutting cocaine' }

RegisterNetEvent('fbrp:economy:produceApproved', function(labId, ms, drug)
    for _, lab in ipairs(state.labs or {}) do
        if lab.id == labId then
            local point = vector3(lab.x, lab.y, ground('lab:' .. lab.id, lab.x, lab.y, lab.z))
            return timed('produce', point, tonumber(ms) or 12000, PRODUCE_SCENARIO[drug], PRODUCE_LABEL[drug] or 'Working', function()
                TriggerServerEvent('fbrp:economy:produceDone')
            end)
        end
    end
end)

RegisterNetEvent('fbrp:economy:taskApproved', function(key, ms, scenario, label)
    for _, property in ipairs(state.properties or {}) do
        if property.key == key then
            local point = vector3(property.x, property.y, ground('prop:' .. key, property.x, property.y, property.z))
            return timed('task', point, tonumber(ms) or 10000, scenario, label or 'Working a shift', function()
                TriggerServerEvent('fbrp:economy:taskDone')
            end)
        end
    end
end)

-- Where a property's prompts are drawn: only spots placed by hand with /propset.
local SPOT_STYLE = {
    terminal = { color = { 63, 227, 210 }, icon = 21 },
    stash = { color = { 63, 227, 210 }, icon = 21 },
    armory = { color = { 255, 181, 71 }, icon = 20 },
    wardrobe = { color = { 196, 139, 255 }, icon = 20 },
    all = { color = { 63, 227, 210 }, icon = 21 },
}

local function propertySpots(property)
    local points = property.points or {}
    local spots = {}
    for _, kind in ipairs({ 'terminal', 'stash', 'armory', 'wardrobe' }) do
        local point = points[kind]
        if point then
            spots[#spots + 1] = { kind = kind, x = point.x, y = point.y, z = point.z, color = SPOT_STYLE[kind].color, icon = SPOT_STYLE[kind].icon }
        end
    end
    return spots
end

-- Markers and prompts.
CreateThread(function()
    while true do
        local sleep = 750
        if (state.org or state.run) and not blocked() then
            local here = GetEntityCoords(PlayerPedId())
            for _, lab in ipairs(state.labs or {}) do
                local z = ground('lab:' .. lab.id, lab.x, lab.y, lab.z)
                local distance = #(here - vector3(lab.x, lab.y, z))
                if distance < 60.0 then
                    sleep = 0
                    local drug = E.drugs[lab.drug]
                    DrawMarker(1, lab.x, lab.y, z - 0.05, 0, 0, 0, 0, 0, 0, 1.4, 1.4, 0.45, 196, 139, 255, 120, false, false, 2, false, nil, nil, false)
                    DrawMarker(29, lab.x, lab.y, z + 1.2, 0, 0, 0, 0, 0, 0, 0.6, 0.6, 0.6, 196, 139, 255, 180, true, true, 2, false, nil, nil, false)
                    if distance < 2.0 and not busy then
                        help(('Press ~INPUT_CONTEXT~ to %s (%s).'):format(lab.drug == 'weed' and 'harvest' or lab.drug == 'meth' and 'cook' or 'cut product', drug and drug.label or lab.drug))
                        if IsControlJustReleased(0, 38) then TriggerServerEvent('fbrp:economy:produceStart', lab.id) end
                    end
                end
            end
            for _, property in ipairs(state.properties or {}) do
                for _, spot in ipairs(propertySpots(property)) do
                    local z = ground('prop:' .. property.key .. ':' .. spot.kind, spot.x, spot.y, spot.z)
                    local distance = #(here - vector3(spot.x, spot.y, z))
                    if distance < 45.0 then
                        sleep = 0
                        local c = spot.color
                        DrawMarker(1, spot.x, spot.y, z - 0.05, 0, 0, 0, 0, 0, 0, 1.2, 1.2, 0.4, c[1], c[2], c[3], 120, false, false, 2, false, nil, nil, false)
                        DrawMarker(spot.icon, spot.x, spot.y, z + 1.1, 0, 0, 0, 0, 180.0, 0, 0.5, 0.5, 0.5, c[1], c[2], c[3], 190, true, true, 2, false, nil, nil, false)
                        if distance < 1.8 and not busy then
                            local extra = property.service == 'repair' and ' · /mechanic repair' or property.service == 'serve' and ' · /serve' or ''
                            if spot.kind == 'all' then
                                help(('~INPUT_CONTEXT~ %s · ~INPUT_DETONATE~ armory & wardrobe%s'):format(property.task or 'Work a shift', extra))
                                if IsControlJustReleased(0, 38) then TriggerServerEvent('fbrp:economy:taskStart', property.key) end
                                if IsControlJustReleased(0, 47) then TriggerServerEvent('fbrp:economy:hub') end
                            elseif spot.kind == 'terminal' or spot.kind == 'stash' then
                                help(('~INPUT_CONTEXT~ %s%s'):format(property.task or 'Work a shift', extra))
                                if IsControlJustReleased(0, 38) then TriggerServerEvent('fbrp:economy:taskStart', property.key) end
                            else
                                help(('~INPUT_CONTEXT~ Open the organization %s'):format(spot.kind))
                                if IsControlJustReleased(0, 38) then TriggerServerEvent('fbrp:economy:hub') end
                            end
                        end
                    end
                end
            end
            local run = state.run
            if run then
                local z = ground('drop:' .. run.label, run.x, run.y, run.z)
                local distance = #(here - vector3(run.x, run.y, z))
                if distance < 80.0 then
                    sleep = 0
                    DrawMarker(1, run.x, run.y, z - 0.05, 0, 0, 0, 0, 0, 0, 2.2, 2.2, 0.6, 255, 181, 71, 120, false, false, 2, false, nil, nil, false)
                    if distance < 3.0 and not busy then
                        help('Press ~INPUT_CONTEXT~ to hand over the product.')
                        if IsControlJustReleased(0, 38) then
                            if IsPedInAnyVehicle(PlayerPedId(), false) then
                                notify('Step out of the vehicle to make the hand-off.', 'error')
                            else
                                timed('handoff', vector3(run.x, run.y, z), E.handoffMs, 'WORLD_HUMAN_DRUG_DEALER', 'Making the hand-off', function()
                                    TriggerServerEvent('fbrp:economy:deliveryDone')
                                end)
                            end
                        end
                    end
                end
            end
        end
        Wait(sleep)
    end
end)

-- Delivery countdown on the HUD.
CreateThread(function()
    while true do
        Wait(1000)
        if state.run or (state.carry and state.carry.units and state.carry.units > 0) then pushHud() end
    end
end)

-- ─────────────────────────── commands ───────────────────────────

RegisterCommand('org', function() TriggerServerEvent('fbrp:economy:hub') end, false)
RegisterCommand('orghub', function() ExecuteCommand('org') end, false)
RegisterKeyMapping('org', 'Open organization hub', 'keyboard', 'F2')
RegisterCommand('delivery', function() TriggerServerEvent('fbrp:economy:deliveryStart') end, false)
RegisterCommand('canceldelivery', function() TriggerServerEvent('fbrp:economy:deliveryCancel') end, false)
RegisterCommand('armory', function() TriggerServerEvent('fbrp:economy:hub') end, false)
RegisterCommand('orgwardrobe', function() TriggerServerEvent('fbrp:economy:hub') end, false)

local function nearestVehicle(radius)
    local coords = GetEntityCoords(PlayerPedId())
    local best, bestDistance = nil, radius
    for _, vehicle in ipairs(GetGamePool('CVehicle')) do
        local distance = #(coords - GetEntityCoords(vehicle))
        if distance < bestDistance then best, bestDistance = vehicle, distance end
    end
    return best
end

local function mechanicRepair(aimed)
    if blocked() then return end
    local ped = PlayerPedId()
    if IsPedInAnyVehicle(ped, false) then return notify('Step out to work on the vehicle.', 'error') end
    local vehicle = (type(aimed) == 'number' and aimed > 1000 and DoesEntityExist(aimed) and #(GetEntityCoords(ped) - GetEntityCoords(aimed)) < 7.0) and aimed or nearestVehicle(5.0)
    if not vehicle or not NetworkGetEntityIsNetworked(vehicle) then return notify('No vehicle close enough.', 'error') end
    TaskStartScenarioInPlace(ped, 'PROP_HUMAN_BUM_BIN', 0, true)
    ui({ type='progress', label='Repairing vehicle', ms=7000 })
    Wait(7000)
    ClearPedTasks(ped)
    -- The vehicle can leave scope or be deleted during the repair animation.
    if not DoesEntityExist(vehicle) or not NetworkGetEntityIsNetworked(vehicle) then
        return notify('The vehicle is no longer available.', 'error')
    end
    local netId = NetworkGetNetworkIdFromEntity(vehicle)
    if netId <= 0 then return notify('The vehicle is no longer available.', 'error') end
    TriggerServerEvent('fbrp:economy:repair', netId)
end

RegisterCommand('mechanicrepair', mechanicRepair, false)
RegisterCommand('mechanic', function(_, args)
    if tostring(args and args[1] or ''):lower() ~= 'repair' then
        return notify('Usage: /mechanic repair', 'info')
    end
    mechanicRepair()
end, false)

-- Third eye (client/interactions.lua) reads these instead of players typing chat commands.
FBRP.MechanicRepair = mechanicRepair

-- Owned property spots for the organization the player is on duty with.
function FBRP.PropertySpots()
    local out = {}
    for _, property in ipairs(state.properties or {}) do
        for _, spot in ipairs(propertySpots(property)) do
            out[#out + 1] = { kind = spot.kind, x = spot.x, y = spot.y, z = spot.z, key = property.key, label = property.label, task = property.task, service = property.service }
        end
    end
    return out
end

-- True while on duty with an organization whose property here serves customers.
function FBRP.CanServe()
    local here = GetEntityCoords(PlayerPedId())
    for _, property in ipairs(state.properties or {}) do
        for _, spot in ipairs(propertySpots(property)) do
            if property.service == 'serve' and #(here - vector3(spot.x, spot.y, spot.z)) < 25.0 then return true end
        end
    end
    return false
end

RegisterCommand('serve', function()
    if blocked() then return end
    local me, mine = PlayerPedId(), GetEntityCoords(PlayerPedId())
    local best, bestDistance = nil, 3.0
    for _, player in ipairs(GetActivePlayers()) do
        if player ~= PlayerId() then
            local distance = #(GetEntityCoords(GetPlayerPed(player)) - mine)
            if distance < bestDistance then best, bestDistance = player, distance end
        end
    end
    if not best then return notify('Nobody close enough to serve.', 'error') end
    TaskStartScenarioInPlace(me, 'WORLD_HUMAN_STAND_IMPATIENT', 0, true)
    Wait(2500)
    ClearPedTasks(me)
    TriggerServerEvent('fbrp:economy:serve', GetPlayerServerId(best))
end, false)

RegisterNetEvent('fbrp:economy:fixVehicle', function(netId)
    local vehicle = NetToVeh(tonumber(netId) or 0)
    if not vehicle or vehicle == 0 or not DoesEntityExist(vehicle) then return end
    SetVehicleFixed(vehicle)
    SetVehicleDeformationFixed(vehicle)
    SetVehicleEngineHealth(vehicle, 1000.0)
    SetVehicleUndriveable(vehicle, false)
    SetVehicleBodyHealth(vehicle, 1000.0)
    SetVehiclePetrolTankHealth(vehicle, 1000.0)
    SetVehicleDirtLevel(vehicle, 0.0)
end)

RegisterNetEvent('fbrp:economy:served', function(info)
    local ped = PlayerPedId()
    SetEntityHealth(ped, math.min(GetEntityMaxHealth(ped), GetEntityHealth(ped) + 40))
    local drink = info and (info.business == 'bar' or info.business == 'club')
    notify(('%s served you %s at %s.'):format(info and info.from or 'Staff', drink and 'a drink' or 'a meal', info and info.place or 'the business'), 'success')
    if drink then
        ShakeGameplayCam('DRUNK_SHAKE', 0.6)
        SetTimeout(45000, function() StopGameplayCamShaking(true) end)
    end
end)

RegisterNetEvent('fbrp:economy:wear', function(data, label)
    local ped = PlayerPedId()
    local model = GetEntityModel(ped)
    local set = model == joaat('mp_f_freemode_01') and (data and data.female) or (model == joaat('mp_m_freemode_01') and data and data.male) or nil
    if not set then return notify('That outfit only fits the freemode characters.', 'error') end
    for component, value in pairs(set.components or {}) do
        if type(value) == 'table' then SetPedComponentVariation(ped, tonumber(component), tonumber(value[1]) or 0, tonumber(value[2]) or 0, 0) end
    end
    for prop, value in pairs(set.props or {}) do
        if type(value) == 'table' then SetPedPropIndex(ped, tonumber(prop), tonumber(value[1]) or 0, tonumber(value[2]) or 0, true) end
    end
    notify(('Wearing %s.'):format(label or 'organization outfit'), 'success')
end)

-- ─────────────────────────── hub ───────────────────────────

RegisterNetEvent('fbrp:economy:hub', function(payload)
    payload = payload or {}
    if FBRP.MenuView() == 'orghub' then
        ui({ type='orghubData', data=payload })
    else
        FBRP.OpenMenu('orghub', payload)
    end
end)

RegisterNUICallback('orgAction', function(data, cb)
    if type(data) ~= 'table' then return cb({ ok=false }) end
    local action = tostring(data.action or '')
    if action == 'waypoint' and tonumber(data.x) and tonumber(data.y) then
        SetNewWaypoint(tonumber(data.x) + 0.0, tonumber(data.y) + 0.0)
        PlaySoundFrontend(-1, 'WAYPOINT_SET', 'HUD_FRONTEND_DEFAULT_SOUNDSET', true)
        notify('Waypoint set.', 'success')
    elseif action == 'delivery' then
        TriggerServerEvent('fbrp:economy:deliveryStart')
        FBRP.CloseMenu()
    elseif action == 'cancelDelivery' then
        TriggerServerEvent('fbrp:economy:deliveryCancel')
    elseif action == 'armory' then
        TriggerServerEvent('fbrp:economy:armory', tostring(data.key or ''))
    elseif action == 'outfit' then
        TriggerServerEvent('fbrp:economy:outfit', tostring(data.key or ''))
    elseif action == 'refresh' then
        TriggerServerEvent('fbrp:economy:hub')
    end
    cb({ ok=true })
end)

AddEventHandler('onResourceStop', function(name)
    if name ~= GetCurrentResourceName() then return end
    clearBlips()
    if runBlip and DoesBlipExist(runBlip) then RemoveBlip(runBlip) end
end)
