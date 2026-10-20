-- Property and police station door locks, client side. Doors near each organization property
-- (the door spots placed in the property setup menu) are found by shape, and the doors added to
-- police stations are known exactly. All of them are registered with the game's door system and
-- held shut until someone who may opens that one door: walk up to it, the lock icon shows
-- whether it is locked or unlocked, and E flips it. Nothing teleports anyone; a locked door
-- simply will not open. The setup menu (/propmenu) is at the end of this file.

local props, manualDoors, keys, openNow = {}, {}, {}, {}
local stationList, leo = {}, false
local doors = {}            -- door id -> { id, hash, group, model, x, y, z, locked, manual, station }
local nearestDoor = nil     -- closest door within reach, for the prompt and the third eye
local lastScan = 0           -- game time of the last pool scan
local showUntil = 0
local preview = nil          -- placement being previewed, see the end of the file
local menuIsOpen = false
local menuSelect = nil       -- property the setup menu returns to after a placement

local function toSet(list)
    local out = {}
    for _, value in ipairs(list or {}) do out[value] = true end
    return out
end

-- The same identity the server computes: what the door is and where it stands.
local function doorId(model, x, y, z)
    return ('%d_%d_%d_%d'):format(math.floor(model), math.floor(x * 10), math.floor(y * 10), math.floor(z * 10))
end

local function doorHash(id)
    return joaat('fbrp_pd_' .. id)
end

-- Door shaped: 0.8 to 3.2 m wide and 1.8 to 3.2 m tall, or a garage door 3 to 8 m wide and
-- 2 to 5 m tall, and in both cases a thin panel.
local function doorShapeTest(model)
    local minimum, maximum = GetModelDimensions(model)
    local sx, sy, sz = maximum.x - minimum.x, maximum.y - minimum.y, maximum.z - minimum.z
    local wide, thin = math.max(sx, sy), math.min(sx, sy)
    if thin > 0.55 then return false end
    if wide >= 0.6 and wide <= 3.5 and sz >= 1.6 and sz <= 3.5 then return true end
    return wide > 3.2 and wide <= 8.0 and sz >= 2.0 and sz <= 5.0
end

local shapeCache = {}
local function doorShaped(model)
    local cached = shapeCache[model]
    if cached == nil then cached = doorShapeTest(model); shapeCache[model] = cached end
    return cached
end

local function excluded(model, x, y, z, list)
    for _, row in ipairs(list or {}) do
        if row.kind == 'exclude' and row.model == model
            and math.abs(row.x - x) < 0.6 and math.abs(row.y - y) < 0.6 and math.abs(row.z - z) < 0.6 then
            return true
        end
    end
    return false
end

local function register(group, model, x, y, z, isManual, isStation)
    local id = doorId(model, x, y, z)
    if doors[id] then
        -- A scanned door that is later added by hand or to a station takes that role.
        if isStation then doors[id].station = true; doors[id].manual = true; doors[id].group = group end
        return
    end
    local hash = doorHash(id)
    if not IsDoorRegisteredWithSystem(hash) then AddDoorToSystem(hash, model, x, y, z, false, false, false) end
    doors[id] = { id=id, hash=hash, group=group, model=model, x=x, y=y, z=z, locked=nil, manual=isManual == true, station=isStation == true }
end

local function unregister(id)
    local door = doors[id]
    if not door then return end
    DoorSystemSetDoorState(door.hash, 0, false, true)
    if IsDoorRegisteredWithSystem(door.hash) then RemoveDoorFromSystem(door.hash) end
    doors[id] = nil
end

-- May this player use the door right now? The server decides for real, this only shapes the prompt.
local function usable(door)
    if door.station then return leo end
    return keys[door.group] == true
end

local function applyStates()
    for _, door in pairs(doors) do
        local locked = not openNow[door.id]
        if door.locked ~= locked then
            door.locked = locked
            DoorSystemSetDoorState(door.hash, locked and 1 or 0, false, true)
        end
    end
end

-- A door belongs to the property whose hand-placed door spot is within 12 metres. A property
-- with no door spot has no locked doors; nothing is assumed from its listed coordinates.
local function ownerOf(at)
    for _, prop in ipairs(props) do
        for _, point in ipairs(prop.doorPoints or {}) do
            local dx, dy = at.x - point.x, at.y - point.y
            if dx * dx + dy * dy <= 144.0 and math.abs(at.z - point.z) < 12.0 then return prop end
        end
    end
    return nil
end

local function scanAll(near)
    for _, object in ipairs(GetGamePool('CObject')) do
        if DoesEntityExist(object) and not NetworkGetEntityIsNetworked(object) then
            local at = GetEntityCoords(object)
            local dx, dy = at.x - near.x, at.y - near.y
            if dx * dx + dy * dy <= 40000.0 then
                local prop = ownerOf(at)
                if prop then
                    local model = GetEntityModel(object)
                    if doorShaped(model) and not excluded(model, at.x, at.y, at.z, manualDoors[prop.key]) then
                        register(prop.key, model, at.x, at.y, at.z, false, false)
                    end
                end
            end
        end
    end
end

RegisterNetEvent('fbrp:doors:data', function(data)
    props = data.props or {}
    keys = toSet(data.keys)
    openNow = toSet(data.open)
    manualDoors = data.doors or {}
    stationList = data.stationDoors or {}
    leo = data.leo == true

    -- Corrections: includes are always registered; excluded doors are released.
    local included, stationIds = {}, {}
    for key, list in pairs(manualDoors) do
        for _, row in ipairs(list) do
            if row.kind == 'include' then
                included[doorId(row.model, row.x, row.y, row.z)] = true
                register(key, row.model, row.x, row.y, row.z, true, false)
            end
        end
    end
    for _, row in ipairs(stationList) do
        stationIds[row.id] = true
        register('station', row.model, row.x, row.y, row.z, true, true)
    end
    for id, door in pairs(doors) do
        if door.station and not stationIds[id] then
            unregister(id)
        elseif door.manual and not door.station and not included[id] then
            unregister(id)
        elseif not door.manual and excluded(door.model, door.x, door.y, door.z, manualDoors[door.group]) then
            unregister(id)
        end
    end
    applyStates()
end)

CreateThread(function()
    while not LocalPlayer.state['fbrp:ready'] and not NetworkIsSessionStarted() do Wait(1000) end
    Wait(3000)
    TriggerServerEvent('fbrp:doors:request')
    local asked = 1
    local ticks = 0
    while true do
        Wait(300)
        ticks = ticks + 1
        local at = GetEntityCoords(PlayerPedId())
        if ticks % 5 == 0 then
            if #props == 0 then
                asked = asked + 1
                if asked % 4 == 1 then TriggerServerEvent('fbrp:doors:request') end
            end
            local now = GetGameTimer()
            local close = false
            for _, prop in ipairs(props) do
                for _, point in ipairs(prop.doorPoints or {}) do
                    if #(at - vector3(point.x, point.y, point.z)) <= 80.0 then close = true break end
                end
                if close then break end
            end
            if close and now - lastScan > 5000 then
                lastScan = now
                scanAll(at)
            end
            applyStates()
        end

        local best
        for _, door in pairs(doors) do
            local distance = #(at - vector3(door.x, door.y, door.z))
            if distance < 2.4 and (not best or distance < best.distance) then best = { door=door, distance=distance } end
        end
        nearestDoor = best and best.door or nil
    end
end)

-- The door prompt: a small lock icon that shows locked or unlocked, and E when the player may use it.
local promptShown = nil
local function setPrompt(state)
    local signature = state and ('%s:%s'):format(state.locked and 'l' or 'u', state.usable and 'y' or 'n') or nil
    if signature == promptShown then return end
    promptShown = signature
    if state then
        SendNUIMessage({ type = 'doorPrompt', show = true, locked = state.locked, usable = state.usable })
    else
        SendNUIMessage({ type = 'doorPrompt', show = false })
    end
end

CreateThread(function()
    while true do
        local door = (not preview and not menuIsOpen) and nearestDoor or nil
        if door then
            local mayUse = usable(door)
            setPrompt({ locked = door.locked ~= false, usable = mayUse })
            if mayUse and IsControlJustReleased(0, 38) then
                TriggerServerEvent('fbrp:doors:toggle', door.model, door.x, door.y, door.z)
                Wait(600)
            end
            Wait(0)
        else
            setPrompt(nil)
            Wait(150)
        end
    end
end)

-- Third eye reads the door the player stands at.
function FBRP.NearestPropertyDoor()
    local door = nearestDoor
    if not door then return nil end
    return {
        key = door.group, id = door.id, model = door.model, x = door.x, y = door.y, z = door.z,
        locked = door.locked ~= false, hasKeys = usable(door), station = door.station == true,
    }
end

-- ─────────────────────── breaching ───────────────────────
-- The explosive in the player's hands; one is used up per breach. Third eye offers the action.
local EXPLOSIVES = { 'WEAPON_STICKYBOMB', 'WEAPON_PIPEBOMB', 'WEAPON_GRENADE', 'WEAPON_PROXMINE' }

function FBRP.BreachExplosive()
    local ped = PlayerPedId()
    for _, name in ipairs(EXPLOSIVES) do
        local hash = joaat(name)
        if HasPedGotWeapon(ped, hash, false) and GetAmmoInPedWeapon(ped, hash) > 0 then return hash end
    end
    return nil
end

function FBRP.StartBreach(door)
    if not FBRP.BreachExplosive() then
        return TriggerEvent('fbrp:notify', 'You need an explosive (sticky bomb, pipe bomb, grenade or proximity mine).', 'error')
    end
    TriggerServerEvent('fbrp:doors:breachStart', door.model, door.x, door.y, door.z)
end

RegisterNetEvent('fbrp:doors:breachApproved', function(model, x, y, z)
    local ped = PlayerPedId()
    local hash = FBRP.BreachExplosive()
    if not hash then return end
    if IsPedInAnyVehicle(ped, false) or IsEntityDead(ped) then return end
    TaskStartScenarioInPlace(ped, 'CODE_HUMAN_MEDIC_KNEEL', 0, true)
    SendNUIMessage({ type = 'progress', label = 'Planting explosives', ms = 4000 })
    Wait(4000)
    ClearPedTasks(ped)
    if IsEntityDead(ped) or not HasPedGotWeapon(ped, hash, false) then return end
    local ammo = GetAmmoInPedWeapon(ped, hash)
    if ammo <= 1 then RemoveWeaponFromPed(ped, hash) else SetPedAmmo(ped, hash, ammo - 1) end
    TriggerEvent('fbrp:notify', 'Charge planted. Get clear.', 'warning')
    TriggerServerEvent('fbrp:doors:breachPlanted', model, x, y, z)
end)

RegisterNetEvent('fbrp:doors:blast', function(x, y, z)
    AddExplosion(x + 0.0, y + 0.0, z + 0.5, 2, 0.5, true, false, 0.8)
end)

-- Refresh the keys after clocking in, since duty can change who holds them.
AddStateBagChangeHandler('fbrp:staffDuty', ('player:%d'):format(GetPlayerServerId(PlayerId())), function()
    TriggerServerEvent('fbrp:doors:request')
end)

-- ─────────────────────── door markers ───────────────────────

CreateThread(function()
    while true do
        if GetGameTimer() < showUntil then
            for _, door in pairs(doors) do
                local r, g = door.locked and 255 or 60, door.locked and 60 or 255
                DrawMarker(1, door.x, door.y, door.z + 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.4, 0.4, 1.2, r, g, 60, 140, false, false, 2, false, nil, nil, false)
            end
            Wait(0)
        else
            Wait(500)
        end
    end
end)

local function DrawText3D(x, y, z, text)
    local onScreen, sx, sy = GetScreenCoordFromWorldCoord(x, y, z)
    if not onScreen then return end
    SetTextScale(0.32, 0.32)
    SetTextFont(4)
    SetTextProportional(true)
    SetTextColour(255, 255, 255, 230)
    SetTextOutline()
    SetTextCentre(true)
    BeginTextCommandDisplayText('STRING')
    AddTextComponentSubstringPlayerName(text)
    EndTextCommandDisplayText(sx, sy)
end

-- ─────────────────────── property setup menu ───────────────────────
-- /propmenu opens one menu for everything about setting up a property (door spots, terminal,
-- bar, stash, armory, wardrobe, door corrections) and for police station doors. The server
-- decides who sees it: Dev Manager and above for properties, and also Community Director and
-- above on duty for police station doors.

local function nearestDoorObject(maxDistance)
    local at = GetEntityCoords(PlayerPedId())
    local bestShaped, shapedDistance, bestAny, anyDistance
    for _, object in ipairs(GetGamePool('CObject')) do
        if DoesEntityExist(object) and not NetworkGetEntityIsNetworked(object) then
            local distance = #(at - GetEntityCoords(object))
            if distance <= maxDistance then
                if doorShaped(GetEntityModel(object)) then
                    if not shapedDistance or distance < shapedDistance then bestShaped, shapedDistance = object, distance end
                elseif not anyDistance or distance < anyDistance then
                    bestAny, anyDistance = object, distance
                end
            end
        end
    end
    local object = bestShaped or bestAny
    if not object then return nil end
    local position = GetEntityCoords(object)
    return { model = GetEntityModel(object), x = position.x, y = position.y, z = position.z }
end

local function nearestRegistered(maxDistance)
    local at = GetEntityCoords(PlayerPedId())
    local best, bestDistance
    for _, door in pairs(doors) do
        local distance = #(at - vector3(door.x, door.y, door.z))
        if distance <= maxDistance and (not bestDistance or distance < bestDistance) then best, bestDistance = door, distance end
    end
    return best
end

local function openMenuUi(data)
    menuIsOpen = true
    SetNuiFocus(true, true)
    SendNUIMessage({ type = 'propmenu', open = true, data = data, select = menuSelect })
    menuSelect = nil
end

local function closeMenuUi(tellServer)
    if not menuIsOpen then return end
    menuIsOpen = false
    SetNuiFocus(false, false)
    SendNUIMessage({ type = 'propmenu', open = false })
    if tellServer ~= false then TriggerServerEvent('fbrp:propmenu:closed') end
end

RegisterCommand('propmenu', function()
    if menuIsOpen then return end
    TriggerServerEvent('fbrp:propmenu:open')
end, false)

RegisterNetEvent('fbrp:propmenu:data', function(data)
    if preview then return end
    openMenuUi(data)
end)

RegisterNetEvent('fbrp:propmenu:update', function(data)
    if menuIsOpen then SendNUIMessage({ type = 'propmenu', open = true, data = data, keep = true }) end
end)

RegisterNetEvent('fbrp:propmenu:reopen', function(key)
    menuSelect = key
    Wait(400)
    TriggerServerEvent('fbrp:propmenu:open')
end)

RegisterNUICallback('propmenuAction', function(data, cb)
    cb({ ok = true })
    if type(data) ~= 'table' then return end
    local action = data.action
    if action == 'close' then
        closeMenuUi()
    elseif action == 'refresh' then
        TriggerServerEvent('fbrp:propmenu:refresh')
    elseif action == 'setpoint' and type(data.key) == 'string' and type(data.point) == 'string' then
        closeMenuUi()
        TriggerServerEvent('fbrp:propmenu:setpoint', data.key, data.point)
    elseif action == 'clearpoint' and type(data.key) == 'string' and type(data.point) == 'string' then
        TriggerServerEvent('fbrp:propmenu:clearpoint', data.key, data.point)
    elseif action == 'adddoor' and type(data.key) == 'string' then
        local object = nearestDoorObject(3.5)
        if not object then return TriggerEvent('fbrp:notify', 'No door object within 3.5 metres. Stand next to the door.', 'error') end
        TriggerServerEvent('fbrp:doors:edit', 'include', object.model, object.x, object.y, object.z, nil, data.key)
    elseif action == 'excludedoor' and type(data.key) == 'string' then
        local door = nearestRegistered(4.0)
        if not door or door.manual then return TriggerEvent('fbrp:notify', 'No scanned door within 4 metres.', 'error') end
        TriggerServerEvent('fbrp:doors:edit', 'exclude', door.model, door.x, door.y, door.z, nil, data.key)
    elseif action == 'removecorrection' and tonumber(data.id) then
        TriggerServerEvent('fbrp:doors:edit', 'remove', nil, nil, nil, nil, tonumber(data.id))
    elseif action == 'showdoors' then
        showUntil = GetGameTimer() + 20000
        TriggerEvent('fbrp:notify', 'Locked doors are marked red and unlocked green for 20 seconds.', 'info')
    elseif action == 'waypoint' and tonumber(data.x) and tonumber(data.y) then
        SetNewWaypoint(tonumber(data.x) + 0.0, tonumber(data.y) + 0.0)
        TriggerEvent('fbrp:notify', 'Waypoint set.', 'info')
    elseif action == 'stationadd' and type(data.station) == 'string' then
        local object = nearestDoorObject(3.5)
        if not object then return TriggerEvent('fbrp:notify', 'No door object within 3.5 metres. Stand next to the door.', 'error') end
        TriggerServerEvent('fbrp:stationdoors:add', data.station, object.model, object.x, object.y, object.z)
    elseif action == 'stationremove' and tonumber(data.id) then
        TriggerServerEvent('fbrp:stationdoors:remove', tonumber(data.id))
    end
end)

AddEventHandler('onResourceStop', function(resource)
    if resource == GetCurrentResourceName() and menuIsOpen then SetNuiFocus(false, false) end
end)

-- ─────────────────────── placement preview ───────────────────────
-- Placing a spot from the menu shows where it will go, at the player's feet, with the property's
-- other spots in grey, until it is confirmed with E or cancelled with Backspace. Nothing is
-- saved before that.

RegisterNetEvent('fbrp:propset:preview', function(data)
    preview = data
    preview.until_ = GetGameTimer() + 5 * 60 * 1000
    TriggerEvent('fbrp:notify', ('Placing %s for %s. Walk to the spot, then press E to confirm or Backspace to cancel.'):format(data.point, data.label), 'info')
end)

local function endPreview(confirmed)
    if not preview then return end
    preview = nil
    TriggerServerEvent(confirmed and 'fbrp:propset:confirm' or 'fbrp:propset:cancel')
end

local POINT_COLORS = {
    door = { 255, 120, 60 }, terminal = { 63, 227, 210 }, bar = { 255, 105, 180 }, stash = { 63, 227, 210 },
    armory = { 255, 181, 71 }, wardrobe = { 196, 139, 255 },
}

CreateThread(function()
    while true do
        if preview then
            local ped = PlayerPedId()
            local at = GetEntityCoords(ped)
            local floor = at.z - 1.0
            local base = (preview.point:gsub('%d+$', ''))
            local color = POINT_COLORS[base] or { 255, 255, 255 }

            -- The spot being placed: a disc on the floor and a tall beam, following the player.
            DrawMarker(1, at.x, at.y, floor, 0, 0, 0, 0, 0, 0, 1.4, 1.4, 0.35, color[1], color[2], color[3], 150, false, false, 2, false, nil, nil, false)
            DrawMarker(1, at.x, at.y, floor, 0, 0, 0, 0, 0, 0, 0.12, 0.12, 4.0, color[1], color[2], color[3], 120, false, false, 2, false, nil, nil, false)
            -- Spots already placed on this property, so the new one can be lined up with them.
            for name, spot in pairs(preview.existing or {}) do
                if name ~= preview.point then
                    DrawMarker(1, spot.x, spot.y, spot.z, 0, 0, 0, 0, 0, 0, 0.9, 0.9, 0.25, 160, 160, 160, 110, false, false, 2, false, nil, nil, false)
                    DrawText3D(spot.x, spot.y, spot.z + 1.1, name)
                end
            end
            DrawText3D(at.x, at.y, floor + 1.4, ('%s · %s'):format(preview.point, preview.label))

            BeginTextCommandDisplayHelp('STRING')
            AddTextComponentSubstringPlayerName(('Placing ~y~%s~s~ here · ~INPUT_CONTEXT~ Confirm · ~INPUT_FRONTEND_RRIGHT~ Cancel'):format(preview.point))
            EndTextCommandDisplayHelp(0, false, false, 100)

            if IsControlJustReleased(0, 38) then
                endPreview(true)
            elseif IsControlJustReleased(0, 177) or IsControlJustReleased(0, 194) or GetGameTimer() > preview.until_ then
                endPreview(false)
                TriggerEvent('fbrp:notify', 'Placement cancelled.', 'info')
            end
            Wait(0)
        else
            Wait(400)
        end
    end
end)
