local restrained = false
local restraintType = nil
local blindfolded = false
local escortedBy = nil

local thirdEyeOpen = false
local thirdEyeHeld = false
local thirdEyePending = false
local thirdEyeTarget = nil
local thirdEyeHoverAt = 0
local thirdEyeWorld = nil      -- non-player target: { id, name, actions, run }
local thirdEyeWorldKey = nil
local thirdEyeWorldAt = 0
local restraintProps = {}
local lastCuffShotAt = 0
local restraintKind

local function cameraDirection(rotation)
    local pitch = math.rad(rotation.x)
    local yaw = math.rad(rotation.z)
    local scale = math.abs(math.cos(pitch))
    return vector3(-math.sin(yaw) * scale, math.cos(yaw) * scale, math.sin(pitch))
end

local function aimedCuffedPlayer(maxDistance)
    local origin = GetGameplayCamCoord()
    local direction = cameraDirection(GetGameplayCamRot(2))
    local hasImpact, impact = GetPedLastWeaponImpactCoord(PlayerPedId())
    local best, bestMiss = nil, 0.24

    for _, player in ipairs(GetActivePlayers()) do
        if player ~= PlayerId() then
            local serverId = GetPlayerServerId(player)
            local ok, state = pcall(function() return Player(serverId).state['fbrp:restrained'] end)
            local ped = GetPlayerPed(player)
            if ok and restraintKind(state) == 'cuffs' and ped ~= 0 and DoesEntityExist(ped) then
                local wrists = GetPedBoneCoords(ped, 60309, 0.0, 0.0, 0.0)
                local offset = wrists - origin
                local along = offset.x * direction.x + offset.y * direction.y + offset.z * direction.z
                if along > 0.5 and along <= maxDistance and HasEntityClearLosToEntity(PlayerPedId(), ped, 17) then
                    local nearest = origin + direction * along
                    local miss = #(wrists - nearest)
                    if hasImpact and #(wrists - impact) <= 0.55 then miss = 0.0 end
                    if miss < bestMiss then best, bestMiss = serverId, miss end
                end
            end
        end
    end
    return best
end

local function targetedPlayer(maxDistance)
    local me = PlayerPedId()
    local mine = GetEntityCoords(me)
    local best, bestScore = nil, 0.15
    for _, player in ipairs(GetActivePlayers()) do
        if player ~= PlayerId() then
            local ped = GetPlayerPed(player)
            if ped ~= 0 and DoesEntityExist(ped) then -- dead players too (medics revive them)
                local coords = GetEntityCoords(ped)
                local distance = #(coords - mine)
                if distance <= (maxDistance or 4.0) and HasEntityClearLosToEntity(me, ped, 17) then
                    local head = GetPedBoneCoords(ped, 31086, 0.0, 0.0, 0.05)
                    local visible, screenX, screenY = GetScreenCoordFromWorldCoord(head.x, head.y, head.z)
                    if visible then
                        -- A generous center-screen cone works in first- and third-person without
                        -- requiring the camera ray to land on one exact ped collision capsule.
                        local dx, dy = screenX - 0.5, (screenY - 0.5) * 1.35
                        local score = math.sqrt(dx * dx + dy * dy) + distance * 0.002
                        if score < bestScore then best, bestScore = GetPlayerServerId(player), score end
                    end
                end
            end
        end
    end
    return best
end

-- ─────────────── third eye on the world: vehicles, bars, terminals, doors ───────────────
-- Holding the third eye key and aiming at a vehicle or standing at a business spot offers the
-- same actions the chat commands did (/mechanic repair, /serve, /runplate, /impound, the
-- armory and the property doors). The server still checks every permission itself.

local function vehicleLabel(vehicle)
    local model = GetDisplayNameFromVehicleModel(GetEntityModel(vehicle))
    local label = GetLabelText(model)
    return (label ~= 'NULL' and label or model) .. ' [' .. ((GetVehicleNumberPlateText(vehicle) or ''):gsub('^%s+', ''):gsub('%s+$', '')) .. ']'
end

-- vehicle doors for the third eye: index, bone, label
local VEHICLE_DOORS = {
    { index = 0, bone = 'door_dside_f', label = 'driver door' },
    { index = 1, bone = 'door_pside_f', label = 'passenger door' },
    { index = 2, bone = 'door_dside_r', label = 'rear left door' },
    { index = 3, bone = 'door_pside_r', label = 'rear right door' },
}

local function doorOpen(vehicle, index)
    return GetVehicleDoorAngleRatio(vehicle, index) > 0.05
end

-- the side door closest to you (within reach), so the list stays short
local function nearestDoor(vehicle)
    local here = GetEntityCoords(PlayerPedId())
    local best, bestDistance = nil, 2.6
    for _, door in ipairs(VEHICLE_DOORS) do
        local bone = GetEntityBoneIndexByName(vehicle, door.bone)
        if bone ~= -1 and GetIsDoorValid(vehicle, door.index) and not IsVehicleDoorDamaged(vehicle, door.index) then
            local distance = #(here - GetWorldPositionOfEntityBone(vehicle, bone))
            if distance < bestDistance then best, bestDistance = door, distance end
        end
    end
    return best
end

local function hasDoor(vehicle, index, bone)
    return GetEntityBoneIndexByName(vehicle, bone) ~= -1 and GetIsDoorValid(vehicle, index) and not IsVehicleDoorDamaged(vehicle, index)
end

-- open/close a door; doors sync from whoever controls the car, so ask for control first
local function toggleVehicleDoor(vehicle, index)
    if not DoesEntityExist(vehicle) then return end
    if GetVehicleDoorLockStatus(vehicle) >= 2 and GetVehiclePedIsIn(PlayerPedId(), false) ~= vehicle then
        return lib.notify({ description = 'The vehicle is locked.', type = 'error' })
    end
    NetworkRequestControlOfEntity(vehicle)
    local untilAt = GetGameTimer() + 600
    while not NetworkHasControlOfEntity(vehicle) and GetGameTimer() < untilAt do
        Wait(25)
        NetworkRequestControlOfEntity(vehicle)
    end
    if doorOpen(vehicle, index) then
        SetVehicleDoorShut(vehicle, index, false)
    else
        SetVehicleDoorOpen(vehicle, index, false, false)
    end
end

local function aimedVehicle(maxDistance)
    local ped = PlayerPedId()
    local origin = GetGameplayCamCoord()
    local target = origin + cameraDirection(GetGameplayCamRot(2)) * (maxDistance + 4.0)
    local _, hit, _, _, entity = GetShapeTestResult(StartExpensiveSynchronousShapeTestLosProbe(
        origin.x, origin.y, origin.z, target.x, target.y, target.z, 2, ped, 4))
    if hit == 1 and entity ~= 0 and DoesEntityExist(entity) and GetEntityType(entity) == 2
        and #(GetEntityCoords(ped) - GetEntityCoords(entity)) <= maxDistance then
        return entity
    end
    return nil
end

local function worldTarget()
    local ped = PlayerPedId()
    if IsPedInAnyVehicle(ped, false) then return nil end
    local here = GetEntityCoords(ped)

    -- A business, armory, wardrobe or stash spot of the organization on duty.
    local bestSpot, bestDistance = nil, 3.2
    if FBRP.PropertySpots then
        for _, spot in ipairs(FBRP.PropertySpots()) do
            local distance = #(here - vector3(spot.x, spot.y, spot.z))
            if distance < bestDistance then bestSpot, bestDistance = spot, distance end
        end
    end
    if bestSpot then
        local actions = {}
        if bestSpot.kind == 'all' or bestSpot.kind == 'terminal' or bestSpot.kind == 'stash' or bestSpot.kind == 'bar' then
            actions[#actions + 1] = { id = 'w_work', label = bestSpot.task or 'Work a shift' }
        end
        if bestSpot.kind == 'all' or bestSpot.kind == 'armory' or bestSpot.kind == 'wardrobe' then
            actions[#actions + 1] = { id = 'w_facilities', label = bestSpot.kind == 'armory' and 'Open armory' or bestSpot.kind == 'wardrobe' and 'Open wardrobe' or 'Use facilities' }
        end
        if bestSpot.service == 'serve' and (bestSpot.kind == 'terminal' or bestSpot.kind == 'bar') then
            actions[#actions + 1] = { id = 'w_serve', label = 'Serve the nearest customer' }
        end
        return {
            id = 'spot:' .. bestSpot.key .. ':' .. bestSpot.kind, name = bestSpot.label, actions = actions,
            run = function(action)
                if action == 'w_work' then TriggerServerEvent('fbrp:economy:taskStart', bestSpot.key)
                elseif action == 'w_facilities' and FBRP.OpenFacilities then FBRP.OpenFacilities(bestSpot.kind == 'all' and 'facilities' or bestSpot.kind)
                elseif action == 'w_serve' then ExecuteCommand('serve') end
            end,
        }
    end

    -- A property door: keyholders lock and unlock it, anyone with an explosive can breach a locked one.
    local door = FBRP.NearestPropertyDoor and FBRP.NearestPropertyDoor() or nil
    if door then
        local actions = {}
        if door.hasKeys then actions[#actions + 1] = { id = 'w_door', label = door.locked and 'Unlock this door' or 'Lock this door' } end
        if door.locked and not door.station and FBRP.BreachExplosive and FBRP.BreachExplosive() then
            actions[#actions + 1] = { id = 'w_breach', label = 'Breach with explosives' }
        end
        if #actions > 0 then
            return {
                id = 'door:' .. door.id .. ':' .. #actions, name = door.station and 'Police station door' or 'Property door', actions = actions,
                run = function(action)
                    if action == 'w_door' then TriggerServerEvent('fbrp:doors:toggle', door.model, door.x, door.y, door.z)
                    elseif action == 'w_breach' then FBRP.StartBreach(door) end
                end,
            }
        end
    end

    -- A vehicle in front of the crosshair.
    local vehicle = aimedVehicle(6.0)
    if vehicle then
        local actions = {}
        -- doors first: nearest side door, hood, trunk (only the ones this car has)
        local door = nearestDoor(vehicle)
        if door then
            actions[#actions + 1] = { id = 'w_door_side', label = (doorOpen(vehicle, door.index) and 'Close the ' or 'Open the ') .. door.label }
        end
        local hood = hasDoor(vehicle, 4, 'bonnet')
        if hood then actions[#actions + 1] = { id = 'w_hood', label = doorOpen(vehicle, 4) and 'Close the hood' or 'Open the hood' } end
        local trunk = hasDoor(vehicle, 5, 'boot')
        if trunk then actions[#actions + 1] = { id = 'w_trunk', label = doorOpen(vehicle, 5) and 'Close the trunk' or 'Open the trunk' } end
        actions[#actions + 1] = { id = 'w_repair', label = 'Repair the vehicle' }
        actions[#actions + 1] = { id = 'w_lock', label = GetVehicleDoorLockStatus(vehicle) >= 2 and 'Unlock the vehicle' or 'Lock the vehicle' }
        actions[#actions + 1] = { id = 'w_plate', label = 'Run the plate' }
        actions[#actions + 1] = { id = 'w_impound', label = 'Impound the vehicle' }

        -- the key changes when a door opens/closes or you walk to another door, so the list refreshes
        local key = ('veh:%d:%s:%s:%s:%s:%s'):format(vehicle, door and door.index or '-', door and tostring(doorOpen(vehicle, door.index)) or '',
            hood and tostring(doorOpen(vehicle, 4)) or '', trunk and tostring(doorOpen(vehicle, 5)) or '', tostring(GetVehicleDoorLockStatus(vehicle) >= 2))
        return {
            id = key, name = vehicleLabel(vehicle),
            actions = actions,
            run = function(action)
                if not DoesEntityExist(vehicle) then return end
                if action == 'w_door_side' and door then
                    CreateThread(function() toggleVehicleDoor(vehicle, door.index) end)
                elseif action == 'w_hood' then
                    CreateThread(function() toggleVehicleDoor(vehicle, 4) end)
                elseif action == 'w_trunk' then
                    CreateThread(function() toggleVehicleDoor(vehicle, 5) end)
                elseif action == 'w_repair' then
                    CreateThread(function() FBRP.MechanicRepair(vehicle) end)
                elseif action == 'w_lock' then
                    local locked = GetVehicleDoorLockStatus(vehicle) >= 2
                    SetVehicleDoorsLocked(vehicle, locked and 1 or 2)
                    SetVehicleLights(vehicle, 2); Wait(120); SetVehicleLights(vehicle, 0)
                    lib.notify({ description = locked and 'Vehicle unlocked.' or 'Vehicle locked.', type = 'info' })
                elseif action == 'w_plate' then
                    ExecuteCommand('runplate ' .. ((GetVehicleNumberPlateText(vehicle) or ''):gsub('^%s+', ''):gsub('%s+$', '')))
                elseif action == 'w_impound' then
                    ExecuteCommand('impound')
                end
            end,
        }
    end
    return nil
end

-- icon per action, names from the NUI icon set (ICONS in web/app.js)
local thirdEyeIcons = {
    rob='wallet', softcuff='cuffs', hardcuff='cuffs', arrest='gavel',
    ziptie='zip', uncuff='unlock', cutziptie='knife', escort='walk',
    seat='seat', unseat='unseat', blindfold='eyeoff', unblindfold='eye',
    search='search', checkid='id', gsr='target', cite='file',
    jail='gavel', commserv='trash', revive='heart-pulse', heal='heart-pulse',
    diagnose='check', showid='id', w_repair='car', w_lock='lock',
    w_plate='search', w_impound='car', w_work='building', w_facilities='building',
    w_serve='sparkles', w_door='door', w_breach='flame',
    w_door_side='door', w_hood='hood', w_trunk='trunk',
    helpup='users',
}

-- ox_target style: hold the key, look at something, its options show next to the eye.
-- Left click to get the cursor and click an option. Right click / Escape / letting go (before clicking) closes it.
local thirdEyeOptions = nil   -- { name, target, actions, world } currently shown
local thirdEyeFocused = false -- cursor is active (player clicked to select)

local function sendEye(open)
    local options
    if open and thirdEyeOptions then
        options = {}
        for _, action in ipairs(thirdEyeOptions.actions) do
            local id = tostring(action.id or '')
            options[#options + 1] = { id = id, label = tostring(action.label or id), icon = thirdEyeIcons[id] or 'chevron' }
        end
    end
    local name = thirdEyeOptions and thirdEyeOptions.name or nil
    local target = thirdEyeOptions and tonumber(thirdEyeOptions.target) or 0
    if name and target > 0 then name = ('%s [%d]'):format(tostring(name), target) end
    SendNUIMessage({
        type = 'thirdEyeTarget', open = open, active = open and options ~= nil and #options > 0,
        name = name, options = options, focused = open and thirdEyeFocused,
    })
end

local function setEyeOptions(name, target, actions, world)
    if actions and #actions > 0 then
        thirdEyeOptions = { name = name, target = target, actions = actions, world = world }
    else
        thirdEyeOptions = nil
    end
    sendEye(true)
end

local function resetThirdEye()
    if thirdEyeFocused then
        SetNuiFocus(false, false)
        SetNuiFocusKeepInput(false)
    end
    thirdEyeOpen = false
    thirdEyeHeld = false
    thirdEyePending = false
    thirdEyeFocused = false
    thirdEyeOptions = nil
    thirdEyeTarget = nil
    thirdEyeHoverAt = 0
    thirdEyeWorld = nil
    thirdEyeWorldKey = nil
    thirdEyeWorldAt = 0
    SendNUIMessage({type='thirdEyeTarget',open=false,active=false})
end

local function closeThirdEye()
    if not thirdEyeOpen and not thirdEyeHeld and not thirdEyePending then return end
    resetThirdEye()
end

local function runThirdEyeAction(action, target, world)
    resetThirdEye()
    if action:sub(1, 2) == 'w_' then
        if world and world.run then
            world.run(action)
        elseif action == 'w_serve' then
            ExecuteCommand('serve')
        end
        return
    end
    local ped = PlayerPedId()
    local weapon = GetSelectedPedWeapon(ped)
    TriggerServerEvent('fbrp:interactions:use', tonumber(target), action, {
        weapon=weapon, firearm=IsPedArmed(ped, 4), ammo=GetAmmoInPedWeapon(ped, weapon)
    })
end

-- left click while options are showing: lock the target and give the player a cursor
local function focusThirdEye()
    if not thirdEyeOptions or thirdEyeFocused then return end
    thirdEyeOpen = true
    thirdEyeFocused = true
    thirdEyeWorld = thirdEyeOptions.world
    SetNuiFocus(true, true)
    SetNuiFocusKeepInput(false)
    sendEye(true)
    -- start the cursor on the eye (centre of the screen); from there it moves freely across the screen.
    -- set it again a couple of frames later because taking NUI focus can put it back where it was.
    SetCursorLocation(0.5, 0.5)
    CreateThread(function()
        for _ = 1, 3 do
            Wait(0)
            if thirdEyeFocused then SetCursorLocation(0.5, 0.5) end
        end
    end)
end

RegisterNUICallback('thirdEyeSelect', function(data, cb)
    cb({ ok = true })
    local current = thirdEyeOptions
    local id = tostring(data and data.id or '')
    if not current or id == '' then return resetThirdEye() end
    for _, action in ipairs(current.actions) do
        if tostring(action.id) == id then
            return runThirdEyeAction(id, current.target, current.world)
        end
    end
    resetThirdEye()
end)

RegisterNUICallback('thirdEyeClose', function(_, cb)
    cb({ ok = true })
    resetThirdEye()
end)

local function loadAnim(dict)
    RequestAnimDict(dict)
    local untilAt = GetGameTimer() + 4000
    while not HasAnimDictLoaded(dict) and GetGameTimer() < untilAt do Wait(20) end
    return HasAnimDictLoaded(dict)
end

local function loadModel(model)
    local hash = type(model) == 'number' and model or joaat(model)
    RequestModel(hash)
    local untilAt = GetGameTimer() + 3000
    while not HasModelLoaded(hash) and GetGameTimer() < untilAt do Wait(20) end
    return HasModelLoaded(hash) and hash or nil
end

restraintKind = function(value)
    if value == nil or value == false then return nil end
    value = tostring(value or ''):lower()
    if value:find('zip', 1, true) then return 'ziptie' end
    if value ~= '' then return 'cuffs' end
    return nil
end

local function restraintLabel(kind)
    return kind == 'ziptie' and 'Zip tied' or 'Handcuffed'
end

local function clearRestraintProp(serverId)
    local entry = restraintProps[serverId]
    if entry and DoesEntityExist(entry.entity) then DeleteEntity(entry.entity) end
    restraintProps[serverId] = nil
end

local function attachRestraintProp(serverId, ped, kind)
    local current = restraintProps[serverId]
    if current and current.kind == kind and DoesEntityExist(current.entity) and IsEntityAttachedToEntity(current.entity, ped) then return end
    if current then clearRestraintProp(serverId) end
    local model = loadModel(kind == 'ziptie' and 'prop_cs_cable_tie_01' or 'p_cs_cuffs_02_s')
    if not model then return end
    local coords = GetEntityCoords(ped)
    local prop = CreateObject(model, coords.x, coords.y, coords.z, false, false, false)
    if prop == 0 then return SetModelAsNoLongerNeeded(model) end
    SetEntityCollision(prop, false, false)
    if kind == 'ziptie' then
        AttachEntityToEntity(prop, ped, GetPedBoneIndex(ped, 60309), -0.055, 0.015, 0.025, 10.0, 85.0, 80.0, true, true, false, true, 1, true)
    else
        AttachEntityToEntity(prop, ped, GetPedBoneIndex(ped, 60309), -0.055, 0.015, 0.015, 10.0, 85.0, 80.0, true, true, false, true, 1, true)
    end
    restraintProps[serverId] = { entity=prop, kind=kind }
    SetModelAsNoLongerNeeded(model)
end

local function playAnim(dict, name, duration, flag)
    if loadAnim(dict) then
        TaskPlayAnim(PlayerPedId(), dict, name, 8.0, -8.0, duration or 1800, flag or 48, 0.0, false, false, false)
        return true
    end
    return false
end

local function setRestrained(kind)
    kind = restraintKind(kind)
    restrained = kind ~= nil
    restraintType = kind
    LocalPlayer.state:set('fbrp:restrained', kind, true)
    if restrained then
        SetEnableHandcuffs(PlayerPedId(), true)
        SetCurrentPedWeapon(PlayerPedId(), joaat('WEAPON_UNARMED'), true)
        if loadAnim('mp_arresting') then TaskPlayAnim(PlayerPedId(),'mp_arresting','idle',8.0,-8.0,-1,49,0,false,false,false) end
    else
        SetEnableHandcuffs(PlayerPedId(), false)
        DetachEntity(PlayerPedId(), true, false)
        escortedBy = nil
        ClearPedTasks(PlayerPedId())
    end
    SendNUIMessage({type='restraint',active=restrained,kind=restrained and restraintLabel(kind) or nil})
end

local function openThirdEyeTargeting()
    if thirdEyeOpen or thirdEyeHeld then return end
    if IsPauseMenuActive() or (FBRP.IsDowned and FBRP.IsDowned()) then return end
    thirdEyeHeld = true
    thirdEyePending = false
    thirdEyeOptions = nil
    thirdEyeTarget = nil
    thirdEyeHoverAt = 0
    sendEye(true)
end

RegisterCommand('+thirdEye', openThirdEyeTargeting, false)
RegisterCommand('-thirdEye', function()
    -- letting go before clicking an option closes it (like ox_target); after clicking, the cursor stays
    if thirdEyeFocused then return end
    resetThirdEye()
end, false)
RegisterKeyMapping('+thirdEye', 'Hold third eye targeting', 'keyboard', 'LMENU')

-- Not named 'interactions': players who bound F5 to the old command keep that stored
-- keybind, which would keep opening third eye. A renamed command leaves it unbound.
RegisterCommand('thirdeyemenu', function()
    if thirdEyeOpen or thirdEyeHeld then return closeThirdEye() end
    openThirdEyeTargeting()
end, false)
RegisterCommand('rpactions', function() ExecuteCommand('thirdeyemenu') end, false)

-- while targeting: block shooting/punching so the left click selects instead, and watch for the click
CreateThread(function()
    while true do
        if thirdEyeHeld and not thirdEyeFocused then
            DisableControlAction(0, 24, true)   -- attack
            DisableControlAction(0, 25, true)   -- aim
            DisableControlAction(0, 140, true)  -- melee light
            DisableControlAction(0, 141, true)  -- melee heavy
            DisableControlAction(0, 142, true)  -- melee alt
            DisableControlAction(0, 257, true)  -- attack 2
            DisablePlayerFiring(PlayerId(), true)
            if thirdEyeOptions and IsDisabledControlJustPressed(0, 24) then focusThirdEye() end
            if IsDisabledControlJustPressed(0, 25) then resetThirdEye() end
            Wait(0)
        else
            Wait(150)
        end
    end
end)

-- what you're looking at: players first, then work spots / doors / vehicles
CreateThread(function()
    while true do
        if thirdEyeHeld and not thirdEyeFocused then
            local target = targetedPlayer(FBRP.Config.interactionDistance)
            local world = (not target) and worldTarget() or nil
            local worldKey = world and world.id or nil

            if target ~= thirdEyeTarget then
                thirdEyeTarget = target
                thirdEyeHoverAt = target and GetGameTimer() or 0
                thirdEyePending = false
                if thirdEyeOptions and thirdEyeOptions.target ~= 0 then setEyeOptions(nil, 0, nil, nil) end
            end

            if worldKey ~= thirdEyeWorldKey then
                thirdEyeWorldKey = worldKey
                thirdEyeWorldAt = worldKey and GetGameTimer() or 0
                if world then
                    setEyeOptions(world.name, 0, world.actions, world)
                elseif not target then
                    setEyeOptions(nil, 0, nil, nil)
                end
            end

            -- players: the server decides which actions you have, ask once you've looked at them briefly
            if target and not thirdEyePending and GetGameTimer() - thirdEyeHoverAt >= 150
                and not (thirdEyeOptions and thirdEyeOptions.target == target) then
                thirdEyePending = true
                TriggerServerEvent('fbrp:interactions:request', target)
                SetTimeout(1500, function()
                    if thirdEyeTarget == target and not (thirdEyeOptions and thirdEyeOptions.target == target) then
                        thirdEyePending = false
                    end
                end)
            end
            Wait(45)
        else
            Wait(180)
        end
    end
end)

RegisterNetEvent('fbrp:interactions:data', function(data)
    if not thirdEyeHeld or thirdEyeFocused or tonumber(data and data.target) ~= thirdEyeTarget then return end
    data.actions = data.actions or {}
    if FBRP.CanServe and FBRP.CanServe() then data.actions[#data.actions + 1] = { id = 'w_serve', label = 'Serve a drink or meal' } end
    setEyeOptions(data.name, tonumber(data.target), data.actions, nil)
end)

-- A real firearm shot aimed at the physical cuff prop/wrist removes cuffs.
-- This is intentionally not exposed as a third-eye action.
CreateThread(function()
    while true do
        local ped = PlayerPedId()
        if IsPedShooting(ped) and IsPedArmed(ped, 4) then
            local stamp = GetGameTimer()
            if stamp - lastCuffShotAt >= 500 then
                local target = aimedCuffedPlayer(30.0)
                if target then
                    lastCuffShotAt = stamp
                    TriggerServerEvent('fbrp:restraints:cuffsShot', target, {
                        weapon=GetSelectedPedWeapon(ped), firearm=true
                    })
                end
            end
            Wait(0)
        else
            Wait(20)
        end
    end
end)

RegisterNetEvent('fbrp:restraints:clear', function()
    setRestrained(nil)
end)

-- Closest vehicle to a point, scanning the pool instead of GetClosestVehicle (which skips many cars).
local function nearestVehicle(coords,maxDistance)
    local best,bestDistance=0,maxDistance
    for _,vehicle in ipairs(GetGamePool('CVehicle')) do
        local distance=#(GetEntityCoords(vehicle)-coords)
        if distance<bestDistance then best,bestDistance=vehicle,distance end
    end
    return best
end

-- Put a ped in the first free passenger seat (rear seats first), then confirm it actually worked.
local function seatInVehicle(ped,vehicle)
    if NetworkGetEntityIsNetworked(vehicle) then
        local deadline=GetGameTimer()+1000
        NetworkRequestControlOfEntity(vehicle)
        while not NetworkHasControlOfEntity(vehicle) and GetGameTimer()<deadline do Wait(0) end
    end
    local seat
    for candidate=GetVehicleMaxNumberOfPassengers(vehicle)-1,0,-1 do
        if IsVehicleSeatFree(vehicle,candidate) then seat=candidate break end
    end
    if not seat then return lib.notify({ description = 'There is no free seat.', type = 'error' }) end
    ClearPedTasksImmediately(ped)
    TaskWarpPedIntoVehicle(ped,vehicle,seat)
    local deadline=GetGameTimer()+800
    while GetVehiclePedIsIn(ped,false)~=vehicle and GetGameTimer()<deadline do Wait(50) end
    if GetVehiclePedIsIn(ped,false)~=vehicle then SetPedIntoVehicle(ped,vehicle,seat) end
end

RegisterNetEvent('fbrp:interaction:apply', function(action, actorServerId)
    local ped = PlayerPedId()
    if action == 'softcuff' or action == 'hardcuff' or action == 'arrest' or action == 'ziptie' then
        if loadAnim('mp_arrest_paired') then
            TaskPlayAnim(ped, 'mp_arrest_paired', 'crook_p2_back_right', 8.0, -8.0, 2200, 33, 0.0, false, false, false)
            Wait(1800)
        end
        setRestrained(action == 'ziptie' and 'ziptie' or 'cuffs')
    elseif action == 'uncuff' or action == 'cutziptie' or action == 'shootcuffs' then
        if restrained and loadAnim('mp_arresting') then TaskPlayAnim(ped, 'mp_arresting', 'idle', 8.0, -8.0, -1, 49, 0.0, false, false, false) end
        Wait(action == 'cutziptie' and 2600 or action == 'shootcuffs' and 1500 or 1800)
        setRestrained(nil)
    elseif action == 'blindfold' then
        blindfolded = true
        LocalPlayer.state:set('fbrp:blindfolded', true, true)
        SendNUIMessage({type='blindfold',active=true})
    elseif action == 'unblindfold' then
        blindfolded = false
        LocalPlayer.state:set('fbrp:blindfolded', false, true)
        SendNUIMessage({type='blindfold',active=false})
    elseif action == 'escort' then
        if escortedBy then
            DetachEntity(ped,true,false)
            escortedBy=nil
        else
            local actor = GetPlayerFromServerId(tonumber(actorServerId))
            if actor ~= -1 then
                escortedBy=tonumber(actorServerId)
                AttachEntityToEntity(ped,GetPlayerPed(actor),11816,0.42,0.48,0.0,0.0,0.0,0.0,false,false,false,false,2,true)
            end
        end
    elseif action == 'seat' then
        local actor = GetPlayerFromServerId(tonumber(actorServerId))
        if actor ~= -1 then
            local vehicle = GetVehiclePedIsIn(GetPlayerPed(actor),false)
            if vehicle == 0 then vehicle = nearestVehicle(GetEntityCoords(ped),6.0) end
            if vehicle ~= 0 then
                -- An escorted ped is attached to the escort, and warping an attached ped silently fails.
                if escortedBy then
                    DetachEntity(ped,true,false)
                    escortedBy=nil
                end
                seatInVehicle(ped,vehicle)
            end
        end
    elseif action == 'unseat' then
        if IsPedInAnyVehicle(ped,false) then TaskLeaveVehicle(ped,GetVehiclePedIsIn(ped,false),16) end
    end
end)

RegisterNetEvent('fbrp:interaction:actor', function(action, targetServerId)
    local target = GetPlayerFromServerId(tonumber(targetServerId))
    if target == -1 then return end
    local targetPed = GetPlayerPed(target)
    if action == 'escort' and loadAnim('missfinale_c2mcs_1') then
        TaskPlayAnim(PlayerPedId(),'missfinale_c2mcs_1','fin_c2_mcs_1_camman',8.0,-8.0,1200,48,0,false,false,false)
    elseif action == 'softcuff' or action == 'hardcuff' or action == 'arrest' or action == 'ziptie' then
        if loadAnim('mp_arrest_paired') then
            TaskTurnPedToFaceEntity(PlayerPedId(), targetPed, 350)
            Wait(350)
            TaskPlayAnim(PlayerPedId(), 'mp_arrest_paired', 'cop_p2_back_right', 8.0, -8.0, 2200, 48, 0.0, false, false, false)
        end
    elseif action == 'uncuff' then
        TaskTurnPedToFaceEntity(PlayerPedId(), targetPed, 300)
        Wait(300)
        playAnim('mp_arresting', 'a_uncuff', 1800, 48)
    elseif action == 'cutziptie' then
        TaskTurnPedToFaceEntity(PlayerPedId(), targetPed, 350)
        Wait(350)
        playAnim('mini@repair', 'fixing_a_ped', 2600, 48)
    end
end)

local visibleWeapons = {
    {'Pistol',joaat('WEAPON_PISTOL')},{'Combat pistol',joaat('WEAPON_COMBATPISTOL')},{'Heavy pistol',joaat('WEAPON_HEAVYPISTOL')},
    {'Stun gun',joaat('WEAPON_STUNGUN')},{'SMG',joaat('WEAPON_SMG')},{'Carbine rifle',joaat('WEAPON_CARBINERIFLE')},
    {'Pump shotgun',joaat('WEAPON_PUMPSHOTGUN')},{'Knife',joaat('WEAPON_KNIFE')},{'Nightstick',joaat('WEAPON_NIGHTSTICK')},
    {'Baseball bat',joaat('WEAPON_BAT')},{'Crowbar',joaat('WEAPON_CROWBAR')},{'Flashlight',joaat('WEAPON_FLASHLIGHT')}
}

RegisterNetEvent('fbrp:interaction:search', function()
    local found = {}
    local ped = PlayerPedId()
    for _, weapon in ipairs(visibleWeapons) do
        if HasPedGotWeapon(ped,weapon[2],false) then found[#found+1]=weapon[1] end
    end
    TriggerServerEvent('fbrp:interaction:searchResult',found)
end)

AddEventHandler('onClientResourceStart', function(resource)
    if resource ~= GetCurrentResourceName() then return end
    thirdEyeOpen = false
    thirdEyeHeld = false
    thirdEyePending = false
    blindfolded = false
    LocalPlayer.state:set('fbrp:blindfolded', false, true)
    SendNUIMessage({type='thirdEyeTarget',open=false,active=false})
    SendNUIMessage({type='blindfold',active=false})
    local existing = restraintKind(LocalPlayer.state['fbrp:restrained'])
    if existing then setRestrained(existing) else setRestrained(nil) end
end)

AddEventHandler('onClientResourceStop', function(resource)
    if resource ~= GetCurrentResourceName() then return end
    for serverId in pairs(restraintProps) do clearRestraintProp(serverId) end
end)

-- Replicated restraint state makes the physical cuffs/tie visible to everyone,
-- including players who stream in after the restraint was applied.
CreateThread(function()
    while true do
        local seen = {}
        for _, player in ipairs(GetActivePlayers()) do
            local serverId = GetPlayerServerId(player)
            local ped = GetPlayerPed(player)
            local ok, value = pcall(function() return Player(serverId).state['fbrp:restrained'] end)
            local kind = ok and restraintKind(value) or nil
            if kind and ped ~= 0 and DoesEntityExist(ped) then
                seen[serverId] = true
                attachRestraintProp(serverId, ped, kind)
            else
                clearRestraintProp(serverId)
            end
        end
        for serverId in pairs(restraintProps) do
            if not seen[serverId] then clearRestraintProp(serverId) end
        end
        Wait(500)
    end
end)

CreateThread(function()
    while true do
        if restrained then
            local ped=PlayerPedId()
            DisableControlAction(0,21,true)
            DisableControlAction(0,22,true)
            DisableControlAction(0,23,true)
            DisableControlAction(0,24,true)
            DisableControlAction(0,25,true)
            DisableControlAction(0,37,true)
            DisableControlAction(0,44,true)
            DisableControlAction(0,45,true)
            DisableControlAction(0,75,true)
            DisablePlayerFiring(PlayerId(),true)
            local down=FBRP.IsDowned and FBRP.IsDowned()
            if not down and not escortedBy and not IsEntityPlayingAnim(ped,'mp_arresting','idle',3) and not IsPedInAnyVehicle(ped,false) then
                if loadAnim('mp_arresting') then TaskPlayAnim(ped,'mp_arresting','idle',8.0,-8.0,-1,49,0,false,false,false) end
            end
            Wait(0)
        else
            Wait(250)
        end
    end
end)
