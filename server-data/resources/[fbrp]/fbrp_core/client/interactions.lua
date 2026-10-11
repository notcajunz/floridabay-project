local restrained = false
local restraintType = nil
local blindfolded = false
local escortedBy = nil

local thirdEyeOpen = false

local function cameraDirection(rotation)
    local z = math.rad(rotation.z)
    local x = math.rad(rotation.x)
    local cosX = math.abs(math.cos(x))
    return vector3(-math.sin(z) * cosX, math.cos(z) * cosX, math.sin(x))
end

local function targetedPlayer(maxDistance)
    local camera = GetGameplayCamCoord()
    local destination = camera + cameraDirection(GetGameplayCamRot(2)) * (maxDistance or 4.0)
    local probe = StartShapeTestCapsule(camera.x, camera.y, camera.z, destination.x, destination.y, destination.z, 0.35, 12, PlayerPedId(), 7)
    local status, hit, _, _, entity = 1, 0, nil, nil, 0
    local timeout = GetGameTimer() + 100
    repeat
        status, hit, _, _, entity = GetShapeTestResult(probe)
        if status == 1 then Wait(0) end
    until status ~= 1 or GetGameTimer() >= timeout
    if hit ~= 1 or entity == 0 or not IsEntityAPed(entity) or not IsPedAPlayer(entity) then return nil end
    for _, player in ipairs(GetActivePlayers()) do
        if player ~= PlayerId() and GetPlayerPed(player) == entity then return GetPlayerServerId(player) end
    end
    return nil
end

local function closeThirdEye()
    if not thirdEyeOpen then return end
    thirdEyeOpen = false
    SetNuiFocus(false, false)
    SendNUIMessage({type='thirdEye',open=false})
end

local function loadAnim(dict)
    RequestAnimDict(dict)
    local untilAt = GetGameTimer() + 4000
    while not HasAnimDictLoaded(dict) and GetGameTimer() < untilAt do Wait(20) end
    return HasAnimDictLoaded(dict)
end

local function setRestrained(kind)
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
    SendNUIMessage({type='restraint',active=restrained,kind=kind})
end

RegisterCommand('interactions', function()
    if thirdEyeOpen then return closeThirdEye() end
    local target = targetedPlayer(FBRP.Config.interactionDistance)
    if not target then
        return TriggerEvent('fbrp:notify', 'Third eye: look directly at a nearby player, then press F5.', 'info')
    end
    TriggerServerEvent('fbrp:interactions:request', target)
end, false)
RegisterCommand('rpactions', function() ExecuteCommand('interactions') end, false)
RegisterKeyMapping('interactions', 'Use third eye on a nearby player', 'keyboard', 'F5')

RegisterNetEvent('fbrp:interactions:data', function(data)
    thirdEyeOpen = true
    SetNuiFocus(true, true)
    SendNUIMessage({type='thirdEye',open=true,data=data})
end)

RegisterNUICallback('thirdEyeAction', function(data, cb)
    TriggerServerEvent('fbrp:interactions:use', tonumber(data.target), tostring(data.action or ''))
    closeThirdEye()
    cb({ok=true})
end)

RegisterNUICallback('closeThirdEye', function(_, cb)
    closeThirdEye()
    cb({ok=true})
end)

RegisterNetEvent('fbrp:interaction:apply', function(action, actorServerId)
    local ped = PlayerPedId()
    if action == 'softcuff' or action == 'hardcuff' or action == 'arrest' or action == 'ziptie' then
        setRestrained(action == 'ziptie' and 'Zip tied' or (action == 'softcuff' and 'Soft cuffed' or action == 'arrest' and 'Arrested' or 'Hard cuffed'))
    elseif action == 'uncuff' then
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
    if action ~= 'escort' then return end
    local target = GetPlayerFromServerId(tonumber(targetServerId))
    if target ~= -1 and loadAnim('missfinale_c2mcs_1') then
        TaskPlayAnim(PlayerPedId(),'missfinale_c2mcs_1','fin_c2_mcs_1_camman',8.0,-8.0,1200,48,0,false,false,false)
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

