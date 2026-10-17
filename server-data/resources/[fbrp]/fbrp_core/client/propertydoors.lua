-- Property door locks, client side. Doors near each organization property (and near any
-- door spot staff placed with /propset) are found by shape, registered with the game's door
-- system and held shut until someone with the keys unlocks the property: press E at a door.
-- Nothing teleports anyone; a locked door simply will not open. Staff fix mistakes with
-- /propdoors.

local props, manualDoors, keys, openNow = {}, {}, {}, {}
local doors = {}            -- door hash -> { key, model, x, y, z, locked, manual }
local nearestDoor = nil     -- { key, locked, distance } of the closest door, for the prompt
local lastScan = 0           -- game time of the last pool scan
local showUntil = 0

local function toSet(list)
    local out = {}
    for _, value in ipairs(list or {}) do out[value] = true end
    return out
end

local function doorHash(model, x, y, z)
    return joaat(('fbrp_pd_%d_%d_%d_%d'):format(model, math.floor(x * 10), math.floor(y * 10), math.floor(z * 10)))
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

local function register(key, model, x, y, z, isManual)
    local hash = doorHash(model, x, y, z)
    if doors[hash] then return end
    if not IsDoorRegisteredWithSystem(hash) then AddDoorToSystem(hash, model, x, y, z, false, false, false) end
    doors[hash] = { key=key, model=model, x=x, y=y, z=z, locked=nil, manual=isManual == true }
end

local function allowed(key)
    return openNow[key] == true
end

local function applyStates()
    for hash, door in pairs(doors) do
        local locked = not allowed(door.key)
        if door.locked ~= locked then
            door.locked = locked
            DoorSystemSetDoorState(hash, locked and 1 or 0, false, true)
        end
    end
end

local function nearestProp(x, y, z)
    local best, bestDistance
    for _, prop in ipairs(props) do
        local dx, dy = x - prop.x, y - prop.y
        local distance = math.sqrt(dx * dx + dy * dy)
        if distance <= prop.radius and math.abs(z - prop.z) < 40.0 and (not bestDistance or distance < bestDistance) then
            best, bestDistance = prop, distance
        end
    end
    return best
end

-- A door belongs to the property whose door spot is within 12 metres, else to the property
-- whose radius holds it.
local function ownerOf(at)
    for _, prop in ipairs(props) do
        for _, point in ipairs(prop.doorPoints or {}) do
            local dx, dy = at.x - point.x, at.y - point.y
            if dx * dx + dy * dy <= 144.0 and math.abs(at.z - point.z) < 12.0 then return prop end
        end
    end
    return nearestProp(at.x, at.y, at.z)
end

local function scanAll(near)
    local found = 0
    for _, object in ipairs(GetGamePool('CObject')) do
        if DoesEntityExist(object) and not NetworkGetEntityIsNetworked(object) then
            local at = GetEntityCoords(object)
            local dx, dy = at.x - near.x, at.y - near.y
            if dx * dx + dy * dy <= 40000.0 then
                local prop = ownerOf(at)
                if prop then
                    local model = GetEntityModel(object)
                    if doorShaped(model) and not excluded(model, at.x, at.y, at.z, manualDoors[prop.key]) then
                        local before = next(doors)
                        register(prop.key, model, at.x, at.y, at.z, false)
                        found = found + 1
                    end
                end
            end
        end
    end
    return found
end

RegisterNetEvent('fbrp:doors:data', function(data)
    props = data.props or {}
    keys = toSet(data.keys)
    openNow = toSet(data.open)
    manualDoors = data.doors or {}
    -- Corrections: includes are always registered; excluded doors are released.
    for key, list in pairs(manualDoors) do
        for _, row in ipairs(list) do
            if row.kind == 'include' then register(key, row.model, row.x, row.y, row.z, true) end
        end
    end
    for hash, door in pairs(doors) do
        if not door.manual and excluded(door.model, door.x, door.y, door.z, manualDoors[door.key]) then
            DoorSystemSetDoorState(hash, 0, false, true)
            if IsDoorRegisteredWithSystem(hash) then RemoveDoorFromSystem(hash) end
            doors[hash] = nil
        end
    end
    -- Doors may belong to a different property after a correction.
    applyStates()
end)

CreateThread(function()
    while not LocalPlayer.state['fbrp:ready'] and not NetworkIsSessionStarted() do Wait(1000) end
    Wait(3000)
    TriggerServerEvent('fbrp:doors:request')
    local asked = 1
    while true do
        Wait(1500)
        if #props == 0 then
            asked = asked + 1
            if asked % 4 == 1 then TriggerServerEvent('fbrp:doors:request') end
        end
        local at = GetEntityCoords(PlayerPedId())
        local now = GetGameTimer()
        local close = false
        for _, prop in ipairs(props) do
            local dx, dy = at.x - prop.x, at.y - prop.y
            if math.sqrt(dx * dx + dy * dy) <= prop.radius + 60.0 then close = true break end
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

        nearestDoor = nil
        for _, door in pairs(doors) do
            local distance = #(at - vector3(door.x, door.y, door.z))
            if distance < 2.6 and (not nearestDoor or distance < nearestDoor.distance) then
                nearestDoor = { distance = distance, key = door.key, locked = door.locked }
            end
        end
        if not nearestDoor then
            -- A door spot staff placed counts even when the scan found no door object there.
            for _, prop in ipairs(props) do
                for _, point in ipairs(prop.doorPoints or {}) do
                    local distance = #(at - vector3(point.x, point.y, point.z))
                    if distance < 2.6 then nearestDoor = { distance = distance, key = prop.key, locked = not allowed(prop.key) } end
                end
            end
        end
    end
end)

CreateThread(function()
    while true do
        local door = nearestDoor
        if door then
            local text
            if keys[door.key] then
                text = door.locked and '~INPUT_CONTEXT~ Unlock the property doors' or '~INPUT_CONTEXT~ Lock the property doors'
            else
                text = door.locked and '~r~Locked.~s~ Only the property owner can unlock this door.' or 'Unlocked.'
            end
            BeginTextCommandDisplayHelp('STRING')
            AddTextComponentSubstringPlayerName(text)
            EndTextCommandDisplayHelp(0, false, false, 100)
            if keys[door.key] and IsControlJustReleased(0, 38) then
                TriggerServerEvent('fbrp:doors:toggle', door.key)
                Wait(600)
            end
            Wait(0)
        else
            Wait(300)
        end
    end
end)

-- Third eye reads the door the player stands at.
function FBRP.NearestPropertyDoor()
    local door = nearestDoor
    if not door then return nil end
    return { key = door.key, locked = door.locked, hasKeys = keys[door.key] == true }
end

-- Refresh the keys after clocking in, since duty can change who holds them.
AddStateBagChangeHandler('fbrp:staffDuty', ('player:%d'):format(GetPlayerServerId(PlayerId())), function()
    TriggerServerEvent('fbrp:doors:request')
end)

-- ─────────────────────── staff corrections ───────────────────────

local function nearestRegistered(maxDistance)
    local at = GetEntityCoords(PlayerPedId())
    local bestHash, best, bestDistance
    for hash, door in pairs(doors) do
        local distance = #(at - vector3(door.x, door.y, door.z))
        if distance <= maxDistance and (not bestDistance or distance < bestDistance) then
            bestHash, best, bestDistance = hash, door, distance
        end
    end
    return bestHash, best
end

RegisterCommand('propdoors', function(_, args)
    local action = tostring(args[1] or ''):lower()
    if action == 'show' then
        showUntil = GetGameTimer() + 20000
        return TriggerEvent('fbrp:notify', 'Locked doors are marked red and unlocked green for 20 seconds.', 'info')
    elseif action == 'info' then
        local at = GetEntityCoords(PlayerPedId())
        local count, nearCount = 0, 0
        for _, door in pairs(doors) do
            count = count + 1
            if #(at - vector3(door.x, door.y, door.z)) < 60.0 then nearCount = nearCount + 1 end
        end
        return TriggerEvent('fbrp:notify', ('Properties known: %d. Doors registered: %d (%d within 60 m). Your keys: %d.'):format(#props, count, nearCount, (function() local n = 0 for _ in pairs(keys) do n = n + 1 end return n end)()), 'info')
    elseif action == 'exclude' then
        local _, door = nearestRegistered(4.0)
        if not door or door.manual then return TriggerEvent('fbrp:notify', 'No scanned door within 4 metres.', 'error') end
        TriggerServerEvent('fbrp:doors:edit', 'exclude', door.model, door.x, door.y, door.z)
    elseif action == 'add' then
        local at = GetEntityCoords(PlayerPedId())
        local best, bestDistance
        for _, object in ipairs(GetGamePool('CObject')) do
            if DoesEntityExist(object) and not NetworkGetEntityIsNetworked(object) then
                local distance = #(at - GetEntityCoords(object))
                if distance <= 3.5 and (not bestDistance or distance < bestDistance) then best, bestDistance = object, distance end
            end
        end
        if not best then return TriggerEvent('fbrp:notify', 'No door object within 3.5 metres.', 'error') end
        local position = GetEntityCoords(best)
        TriggerServerEvent('fbrp:doors:edit', 'include', GetEntityModel(best), position.x, position.y, position.z)
    elseif action == 'remove' then
        local at = GetEntityCoords(PlayerPedId())
        for _, list in pairs(manualDoors) do
            for _, row in ipairs(list) do
                if #(at - vector3(row.x, row.y, row.z)) <= 4.0 then
                    return TriggerServerEvent('fbrp:doors:edit', 'remove', nil, nil, nil, nil, row.id)
                end
            end
        end
        TriggerEvent('fbrp:notify', 'No saved correction within 4 metres.', 'error')
    else
        TriggerEvent('fbrp:notify', 'Staff: /propdoors info | show | add | exclude | remove, and /propset to place spots', 'info')
    end
end, false)

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
