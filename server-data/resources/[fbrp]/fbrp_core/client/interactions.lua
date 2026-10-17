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
            if ped ~= 0 and DoesEntityExist(ped) and not IsEntityDead(ped) then
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
        if bestSpot.kind == 'all' or bestSpot.kind == 'terminal' or bestSpot.kind == 'stash' then
            actions[#actions + 1] = { id = 'w_work', label = bestSpot.task or 'Work a shift' }
        end
        if bestSpot.kind == 'all' or bestSpot.kind == 'armory' or bestSpot.kind == 'wardrobe' then
            actions[#actions + 1] = { id = 'w_hub', label = 'Armory and wardrobe' }
        end
        if bestSpot.service == 'serve' and (bestSpot.kind == 'all' or bestSpot.kind == 'terminal') then
            actions[#actions + 1] = { id = 'w_serve', label = 'Serve the nearest customer' }
        end
        return {
            id = 'spot:' .. bestSpot.key .. ':' .. bestSpot.kind, name = bestSpot.label, actions = actions,
            run = function(action)
                if action == 'w_work' then TriggerServerEvent('fbrp:economy:taskStart', bestSpot.key)
                elseif action == 'w_hub' then TriggerServerEvent('fbrp:economy:hub')
                elseif action == 'w_serve' then ExecuteCommand('serve') end
            end,
        }
    end

    -- A property door.
    local door = FBRP.NearestPropertyDoor and FBRP.NearestPropertyDoor() or nil
    if door and door.hasKeys then
        return {
            id = 'door:' .. door.key, name = 'Property doors',
            actions = { { id = 'w_door', label = door.locked and 'Unlock the doors' or 'Lock the doors' } },
            run = function() TriggerServerEvent('fbrp:doors:toggle', door.key) end,
        }
    end

    -- A vehicle in front of the crosshair.
    local vehicle = aimedVehicle(6.0)
    if vehicle then
        return {
            id = 'veh:' .. vehicle, name = vehicleLabel(vehicle),
            actions = {
                { id = 'w_repair', label = 'Repair the vehicle' },
                { id = 'w_lock', label = GetVehicleDoorLockStatus(vehicle) >= 2 and 'Unlock the vehicle' or 'Lock the vehicle' },
                { id = 'w_plate', label = 'Run the plate' },
                { id = 'w_impound', label = 'Impound the vehicle' },
            },
            run = function(action)
                if not DoesEntityExist(vehicle) then return end
                if action == 'w_repair' then
                    CreateThread(function() FBRP.MechanicRepair(vehicle) end)
                elseif action == 'w_lock' then
                    local locked = GetVehicleDoorLockStatus(vehicle) >= 2
                    SetVehicleDoorsLocked(vehicle, locked and 1 or 2)
                    SetVehicleLights(vehicle, 2); Wait(120); SetVehicleLights(vehicle, 0)
                    TriggerEvent('fbrp:notify', locked and 'Vehicle unlocked.' or 'Vehicle locked.', 'info')
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

local function openWorldEye(world)
    thirdEyeWorld = world
    thirdEyeOpen = true
    thirdEyeHeld = false
    SetNuiFocus(true, true)
    SendNUIMessage({type='thirdEyeTarget',open=true,active=true})
    SendNUIMessage({type='thirdEye',open=true,data={target=0,name=world.name,actions=world.actions}})
end

local function closeThirdEye()
    if not thirdEyeOpen and not thirdEyeHeld and not thirdEyePending then return end
    thirdEyeOpen = false
    thirdEyeHeld = false
    thirdEyePending = false
    thirdEyeTarget = nil
    thirdEyeHoverAt = 0
    thirdEyeWorld = nil
    thirdEyeWorldKey = nil
    thirdEyeWorldAt = 0
    SetNuiFocus(false, false)
    SendNUIMessage({type='thirdEye',open=false})
    SendNUIMessage({type='thirdEyeTarget',open=false,active=false})
end

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
    thirdEyeTarget = nil
    thirdEyeHoverAt = 0
    SendNUIMessage({type='thirdEyeTarget',open=true,active=false})
end

RegisterCommand('+thirdEye', openThirdEyeTargeting, false)
RegisterCommand('-thirdEye', function()
    thirdEyeHeld = false
    thirdEyePending = false
    thirdEyeTarget = nil
    thirdEyeHoverAt = 0
    thirdEyeWorldKey = nil
    thirdEyeWorldAt = 0
    if not thirdEyeOpen then SendNUIMessage({type='thirdEyeTarget',open=false,active=false}) end
end, false)
RegisterKeyMapping('+thirdEye', 'Hold third eye player targeting', 'keyboard', 'LMENU')

RegisterCommand('interactions', function()
    if thirdEyeOpen or thirdEyeHeld then return closeThirdEye() end
    openThirdEyeTargeting()
end, false)
RegisterCommand('rpactions', function() ExecuteCommand('interactions') end, false)

CreateThread(function()
    while true do
        if thirdEyeHeld and not thirdEyeOpen then
            local target = targetedPlayer(FBRP.Config.interactionDistance)
            local world = (not target) and worldTarget() or nil
            local worldKey = world and world.id or nil
            if worldKey ~= thirdEyeWorldKey then
                thirdEyeWorldKey = worldKey
                thirdEyeWorldAt = worldKey and GetGameTimer() or 0
            end
            if target ~= thirdEyeTarget then
                thirdEyeTarget = target
                thirdEyeHoverAt = target and GetGameTimer() or 0
                thirdEyePending = false
            end
            SendNUIMessage({type='thirdEyeTarget',open=true,active=(target ~= nil) or (world ~= nil)})
            if target and not thirdEyePending and GetGameTimer() - thirdEyeHoverAt >= 180 then
                thirdEyePending = true
                TriggerServerEvent('fbrp:interactions:request', target)
                SetTimeout(1200, function()
                    if not thirdEyeOpen then thirdEyePending = false end
                end)
            elseif world and #world.actions > 0 and GetGameTimer() - thirdEyeWorldAt >= 180 then
                openWorldEye(world)
            end
            Wait(45)
        else
            Wait(180)
        end
    end
end)

RegisterNetEvent('fbrp:interactions:data', function(data)
    if not thirdEyeHeld or tonumber(data and data.target) ~= thirdEyeTarget then return end
    thirdEyePending = false
    thirdEyeOpen = true
    thirdEyeHeld = false
    SetNuiFocus(true, true)
    data.actions = data.actions or {}
    if FBRP.CanServe and FBRP.CanServe() then data.actions[#data.actions + 1] = { id = 'w_serve', label = 'Serve a drink or meal' } end
    SendNUIMessage({type='thirdEyeTarget',open=true,active=true})
    SendNUIMessage({type='thirdEye',open=true,data=data})
end)

RegisterNUICallback('thirdEyeAction', function(data, cb)
    local action = tostring(data.action or '')
    if action:sub(1, 2) == 'w_' then
        local world = thirdEyeWorld
        closeThirdEye()
        cb({ok=true})
        if world and world.run then
            world.run(action)
        elseif action == 'w_serve' then
            ExecuteCommand('serve')
        end
        return
    end
    local ped = PlayerPedId()
    local weapon = GetSelectedPedWeapon(ped)
    TriggerServerEvent('fbrp:interactions:use', tonumber(data.target), tostring(data.action or ''), {
        weapon=weapon, firearm=IsPedArmed(ped, 4), ammo=GetAmmoInPedWeapon(ped, weapon)
    })
    closeThirdEye()
    cb({ok=true})
end)

RegisterNUICallback('closeThirdEye', function(_, cb)
    closeThirdEye()
    cb({ok=true})
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
            if vehicle == 0 then
                local coords=GetEntityCoords(ped)
                vehicle=GetClosestVehicle(coords.x,coords.y,coords.z,5.0,0,70)
            end
            if vehicle ~= 0 then
                for seat=GetVehicleMaxNumberOfPassengers(vehicle)-1,0,-1 do
                    if IsVehicleSeatFree(vehicle,seat) then TaskWarpPedIntoVehicle(ped,vehicle,seat) break end
                end
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
    SendNUIMessage({type='thirdEye',open=false})
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
