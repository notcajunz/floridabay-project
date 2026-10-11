local lastSpawn=0
local seatbelt=false
local cruise=false
local cruiseSpeed=0.0

RegisterCommand('vehicles',function()
    TriggerServerEvent('fbrp:vehicles:request')
end,false)
RegisterCommand('garage',function() ExecuteCommand('vehicles') end,false)
RegisterKeyMapping('vehicles','Open Florida Bay vehicle garage','keyboard','F7')

RegisterNetEvent('fbrp:vehicles:data',function(categories)
    FBRP.OpenMenu('vehicles',{categories=categories})
end)

RegisterNUICallback('spawnVehicle',function(data,cb)
    if GetGameTimer()-lastSpawn<FBRP.Config.vehicleSpawnCooldownMs then cb({ok=false,error='Please wait before spawning again.'}); return end
    lastSpawn=GetGameTimer()
    TriggerServerEvent('fbrp:vehicles:spawn',tostring(data.category),tostring(data.model))
    FBRP.CloseMenu()
    cb({ok=true})
end)

RegisterNetEvent('fbrp:vehicles:approved',function(model,label)
    local hash=joaat(model)
    if not IsModelInCdimage(hash) or not IsModelAVehicle(hash) then return TriggerEvent('fbrp:notify','Vehicle model is not installed.','error') end
    RequestModel(hash)
    local timeout=GetGameTimer()+8000
    while not HasModelLoaded(hash) and GetGameTimer()<timeout do Wait(25) end
    if not HasModelLoaded(hash) then return TriggerEvent('fbrp:notify','Vehicle model timed out.','error') end
    local ped=PlayerPedId(); local coords=GetOffsetFromEntityInWorldCoords(ped,0.0,4.5,0.2); local heading=GetEntityHeading(ped)
    local vehicle=CreateVehicle(hash,coords.x,coords.y,coords.z,heading,true,false)
    SetVehicleOnGroundProperly(vehicle)
    SetVehicleNumberPlateText(vehicle,'FBRP'..math.random(100,999))
    SetEntityAsMissionEntity(vehicle,true,true)
    TaskWarpPedIntoVehicle(ped,vehicle,-1)
    SetModelAsNoLongerNeeded(hash)
    TriggerServerEvent('fbrp:justice:register',GetVehicleNumberPlateText(vehicle),model,label or model,true)
    TriggerEvent('fbrp:notify',(label or model)..' ready.','success')
end)

local function myVehicle(driverOnly)
    local ped=PlayerPedId(); local vehicle=GetVehiclePedIsIn(ped,false)
    if vehicle==0 then return nil end
    if driverOnly and GetPedInVehicleSeat(vehicle,-1)~=ped then return nil end
    return vehicle
end

RegisterCommand('engine',function()
    if FBRP.IsDowned and FBRP.IsDowned() then return end
    local vehicle=myVehicle(true); if not vehicle then return end
    local on=GetIsVehicleEngineRunning(vehicle)
    SetVehicleEngineOn(vehicle,not on,false,true)
    TriggerEvent('fbrp:notify',on and 'Engine off.' or 'Engine on.','info')
end,false)
RegisterKeyMapping('engine','Toggle vehicle engine','keyboard','G')

RegisterCommand('seatbelt',function()
    if not myVehicle(false) then return end
    seatbelt=not seatbelt
    TriggerEvent('fbrp:notify',seatbelt and 'Seatbelt fastened.' or 'Seatbelt unfastened.',seatbelt and 'success' or 'info')
end,false)
RegisterKeyMapping('seatbelt','Toggle seatbelt','keyboard','B')

RegisterCommand('vehlock',function()
    local ped=PlayerPedId(); local vehicle=GetVehiclePedIsIn(ped,false)
    if vehicle==0 then
        local coords=GetEntityCoords(ped)
        vehicle=GetClosestVehicle(coords.x,coords.y,coords.z,8.0,0,71)
    end
    if vehicle==0 then return end
    local locked=GetVehicleDoorLockStatus(vehicle)>=2
    SetVehicleDoorsLocked(vehicle,locked and 1 or 2)
    SetVehicleLights(vehicle,2); Wait(120); SetVehicleLights(vehicle,0)
    TriggerEvent('fbrp:notify',locked and 'Vehicle unlocked.' or 'Vehicle locked.','info')
end,false)
RegisterKeyMapping('vehlock','Toggle vehicle locks','keyboard','L')

RegisterCommand('cruise',function()
    local vehicle=myVehicle(true); if not vehicle then return end
    cruise=not cruise
    cruiseSpeed=GetEntitySpeed(vehicle)
    if cruise and cruiseSpeed>4.0 then SetEntityMaxSpeed(vehicle,cruiseSpeed) else cruise=false; SetEntityMaxSpeed(vehicle,GetVehicleEstimatedMaxSpeed(vehicle)) end
    TriggerEvent('fbrp:notify',cruise and ('Cruise set: %d MPH'):format(math.floor(cruiseSpeed*2.236936)) or 'Cruise disabled.','info')
end,false)
RegisterKeyMapping('cruise','Toggle cruise control','keyboard','Y')

RegisterCommand('carcontrols',function()
    SetNuiFocus(true,true)
    SendNUIMessage({type='carControls',open=true})
end,false)
RegisterKeyMapping('carcontrols','Open vehicle control panel','keyboard','K')

RegisterNUICallback('vehicleControl',function(data,cb)
    local action=tostring(data.action or '')
    if action=='engine' then ExecuteCommand('engine')
    elseif action=='belt' then ExecuteCommand('seatbelt')
    elseif action=='lock' then ExecuteCommand('vehlock')
    elseif action=='cruise' then ExecuteCommand('cruise')
    else
        local vehicle=myVehicle(true)
        if vehicle then
            local door=({hood=4,trunk=5,lf=0,rf=1,lr=2,rr=3})[action]
            if door then
                if GetVehicleDoorAngleRatio(vehicle,door)>0.1 then SetVehicleDoorShut(vehicle,door,false) else SetVehicleDoorOpen(vehicle,door,false,false) end
            end
        end
    end
    cb({ok=true})
end)

RegisterNUICallback('closeCarControls',function(_,cb)
    SetNuiFocus(false,false)
    SendNUIMessage({type='carControls',open=false})
    cb({ok=true})
end)

CreateThread(function()
    local previousVelocity=vector3(0,0,0)
    while true do
        local vehicle=myVehicle(false)
        if vehicle then
            if seatbelt then DisableControlAction(0,75,true) end
            if cruise and (IsControlPressed(0,72) or IsControlPressed(0,76) or GetEntitySpeed(vehicle)<2.0) then cruise=false; SetEntityMaxSpeed(vehicle,GetVehicleEstimatedMaxSpeed(vehicle)) end
            if not seatbelt and GetEntitySpeed(vehicle)>16.0 then
                local velocity=GetEntityVelocity(vehicle)
                if #(previousVelocity-velocity)>11.0 then
                    local ped=PlayerPedId(); local coords=GetEntityCoords(ped)
                    SetEntityCoords(ped,coords.x,coords.y,coords.z+0.5,true,true,true,false)
                    SetEntityVelocity(ped,previousVelocity.x,previousVelocity.y,previousVelocity.z)
                    SetPedToRagdoll(ped,1200,1200,0,false,false,false)
                end
                previousVelocity=velocity
            else previousVelocity=GetEntityVelocity(vehicle) end
            Wait(0)
        else
            seatbelt=false; cruise=false; Wait(250)
        end
    end
end)

function FBRP.VehicleStatus()
    local vehicle=myVehicle(false)
    if not vehicle then return {inVehicle=false,seatbelt=false,cruise=false} end
    return {
        inVehicle=true,
        speed=math.floor(GetEntitySpeed(vehicle)*2.236936+0.5),
        rpm=math.floor(GetVehicleCurrentRpm(vehicle)*100),
        gear=GetVehicleCurrentGear(vehicle),
        fuel=math.floor(math.min(100.0,GetVehicleFuelLevel(vehicle)/math.max(GetVehicleHandlingFloat(vehicle,'CHandlingData','fPetrolTankVolume'),1.0)*100.0)+0.5),
        engine=GetIsVehicleEngineRunning(vehicle),
        seatbelt=seatbelt,
        cruise=cruise,
        locked=GetVehicleDoorLockStatus(vehicle)>=2
    }
end

