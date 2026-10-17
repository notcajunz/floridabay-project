local restrained = false
local restraintType = nil
local blindfolded = false
local escortedBy = nil

local thirdEyeOpen = false
local thirdEyeHeld = false
local thirdEyePending = false
local thirdEyeTarget = nil
local thirdEyeHoverAt = 0
local restraintProps = {}

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

local function closeThirdEye()
    if not thirdEyeOpen and not thirdEyeHeld and not thirdEyePending then return end
    thirdEyeOpen = false
    thirdEyeHeld = false
    thirdEyePending = false
    thirdEyeTarget = nil
    thirdEyeHoverAt = 0
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

local function restraintKind(value)
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
            if target ~= thirdEyeTarget then
                thirdEyeTarget = target
                thirdEyeHoverAt = target and GetGameTimer() or 0
                thirdEyePending = false
                SendNUIMessage({type='thirdEyeTarget',open=true,active=target ~= nil})
            elseif target and not thirdEyePending and GetGameTimer() - thirdEyeHoverAt >= 180 then
                thirdEyePending = true
                TriggerServerEvent('fbrp:interactions:request', target)
                SetTimeout(1200, function()
                    if not thirdEyeOpen then thirdEyePending = false end
                end)
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
    SendNUIMessage({type='thirdEyeTarget',open=true,active=true})
    SendNUIMessage({type='thirdEye',open=true,data=data})
end)

RegisterNUICallback('thirdEyeAction', function(data, cb)
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
    elseif action == 'shootcuffs' then
        TaskTurnPedToFaceEntity(PlayerPedId(), targetPed, 250)
        Wait(250)
        TaskAimGunAtEntity(PlayerPedId(), targetPed, 1250, false)
        Wait(650)
        local muzzle = GetPedBoneCoords(PlayerPedId(), 57005, 0.12, 0.0, 0.0)
        local wrists = GetPedBoneCoords(targetPed, 60309, 0.0, 0.0, 0.0)
        -- Make the removal visibly/audibly use the held gun without damaging the player.
        local weapon = GetSelectedPedWeapon(PlayerPedId())
        ShootSingleBulletBetweenCoords(muzzle.x, muzzle.y, muzzle.z, wrists.x, wrists.y, wrists.z, 0, true, weapon, PlayerPedId(), true, false, 40.0)
        SetPedAmmo(PlayerPedId(), weapon, math.max(0, GetAmmoInPedWeapon(PlayerPedId(), weapon) - 1))
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
