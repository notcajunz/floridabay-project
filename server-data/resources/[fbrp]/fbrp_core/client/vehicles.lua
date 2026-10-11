local lastSpawn=0
local seatbelt=false
local cruise=false
local cruiseSpeed=0.0
local activeFuelVehicle=0
local fuelVehicle=0
local lastRefuelAt=0
local lastFuelReplicateAt=0
local emptyFuelWarned=false

local function clamp(value,minimum,maximum)
    return math.max(minimum,math.min(maximum,value))
end

local function usesFuel(vehicle)
    if vehicle==0 or not DoesEntityExist(vehicle) then return false end
    local class=GetVehicleClass(vehicle)
    if class==13 or class==21 then return false end -- bicycles and trains
    return GetVehicleHandlingFloat(vehicle,'CHandlingData','fPetrolTankVolume')>0.0
end

local function readFuel(vehicle)
    if not usesFuel(vehicle) then return 100.0 end
    return clamp(tonumber(GetVehicleFuelLevel(vehicle)) or 0.0,0.0,100.0)
end

local function writeFuel(vehicle,value,replicate)
    if not usesFuel(vehicle) then return 100.0 end
    value=clamp(tonumber(value) or 0.0,0.0,100.0)
    SetVehicleFuelLevel(vehicle,value+0.0)
    if replicate and NetworkGetEntityIsNetworked(vehicle) and NetworkHasControlOfEntity(vehicle) then
        -- The entity state preserves the tank when network ownership changes.
        pcall(function() Entity(vehicle).state:set('fbrpFuel',math.floor(value*10.0+0.5)/10.0,true) end)
    end
    return value
end

local function initialiseFuel(vehicle,full)
    if not usesFuel(vehicle) then return end
    local replicated
    if NetworkGetEntityIsNetworked(vehicle) then
        local ok,value=pcall(function() return Entity(vehicle).state.fbrpFuel end)
        if ok then replicated=tonumber(value) end
    end
    local level
    if full then
        level=100.0
    elseif replicated~=nil then
        level=replicated
    else
        level=tonumber(GetVehicleFuelLevel(vehicle)) or 100.0
        -- Some map/third-party vehicles spawn with no native fuel value.
        if level<=0.0 then level=math.random(55,90)+0.0 end
    end
    writeFuel(vehicle,level,true)
end

local function help(text)
    BeginTextCommandDisplayHelp('STRING')
    AddTextComponentSubstringPlayerName(text)
    EndTextCommandDisplayHelp(0,false,true,-1)
end

local function stationNear(coords,extraRadius)
    local radius=(FBRP.Config.fuelStationRadius or 18.0)+(extraRadius or 0.0)
    for _,station in ipairs(FBRP.FuelStations or {}) do
        local dx,dy,dz=coords.x-station.x,coords.y-station.y,coords.z-station.z
        if dx*dx+dy*dy+dz*dz<=radius*radius then return station end
    end
    return nil
end

local function refuelTarget()
    local ped=PlayerPedId()
    local vehicle=GetVehiclePedIsIn(ped,false)
    if vehicle~=0 then
        if GetPedInVehicleSeat(vehicle,-1)~=ped then return 0 end
        return vehicle
    end
    local coords=GetEntityCoords(ped)
    vehicle=GetClosestVehicle(coords.x,coords.y,coords.z,5.5,0,70)
    return vehicle~=0 and vehicle or 0
end

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
    initialiseFuel(vehicle,true)
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
    if not on and usesFuel(vehicle) and readFuel(vehicle)<=0.05 then
        return TriggerEvent('fbrp:notify','The tank is empty. Find a gas station to refuel for free.','error')
    end
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
            if GetPedInVehicleSeat(vehicle,-1)==PlayerPedId() and usesFuel(vehicle) and readFuel(vehicle)<=0.05 then
                DisableControlAction(0,71,true)
                SetVehicleEngineOn(vehicle,false,true,true)
            end
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

-- Fuel use is owned by the current driver. The replicated entity value means
-- passengers and the next network owner inherit the same tank level.
CreateThread(function()
    while true do
        local ped=PlayerPedId()
        local vehicle=GetVehiclePedIsIn(ped,false)
        local isDriver=vehicle~=0 and GetPedInVehicleSeat(vehicle,-1)==ped
        if isDriver and usesFuel(vehicle) then
            if activeFuelVehicle~=vehicle then
                activeFuelVehicle=vehicle
                initialiseFuel(vehicle,false)
                emptyFuelWarned=readFuel(vehicle)<=0.05
            end
            if GetIsVehicleEngineRunning(vehicle) and fuelVehicle~=vehicle then
                local rpm=clamp(GetVehicleCurrentRpm(vehicle),0.0,1.0)
                local class=GetVehicleClass(vehicle)
                local multiplier=({[8]=0.75,[10]=1.25,[11]=1.18,[12]=1.12,[14]=1.20,[15]=1.35,[16]=1.55,[17]=1.12,[18]=1.15,[19]=1.35,[20]=1.30})[class] or 1.0
                local seconds=(FBRP.Config.fuelTickMs or 1000)/1000.0
                local used=((FBRP.Config.fuelIdleConsumptionPerSecond or 0.006)+(rpm^1.55)*(FBRP.Config.fuelRpmConsumptionPerSecond or 0.038))*multiplier*seconds
                local level=writeFuel(vehicle,readFuel(vehicle)-used,true)
                if level<=0.05 then
                    SetVehicleEngineOn(vehicle,false,true,true)
                    if not emptyFuelWarned then
                        emptyFuelWarned=true
                        TriggerEvent('fbrp:notify','Out of gas. Gas stations are marked on the map and fuel is free.','error')
                    end
                end
            end
        else
            activeFuelVehicle=0
            emptyFuelWarned=false
        end
        Wait(FBRP.Config.fuelTickMs or 1000)
    end
end)

-- Map blips and the station interaction share the same coordinate list.
CreateThread(function()
    for _,station in ipairs(FBRP.FuelStations or {}) do
        local blip=AddBlipForCoord(station.x+0.0,station.y+0.0,station.z+0.0)
        SetBlipSprite(blip,361)
        SetBlipColour(blip,1)
        SetBlipScale(blip,0.65)
        SetBlipAsShortRange(blip,true)
        BeginTextCommandSetBlipName('STRING')
        AddTextComponentString('Gas Station')
        EndTextCommandSetBlipName(blip)
    end

    while true do
        local ped=PlayerPedId()
        local coords=GetEntityCoords(ped)
        local nearStation=stationNear(coords,22.0)
        if nearStation then
            local target=fuelVehicle~=0 and fuelVehicle or refuelTarget()
            local valid=target~=0 and DoesEntityExist(target) and usesFuel(target)
                and stationNear(GetEntityCoords(target),0.0)~=nil
            if fuelVehicle~=0 then
                local cancelled=not valid or GetEntitySpeed(target)>1.0 or GetIsVehicleEngineRunning(target)
                if cancelled then
                    if target~=0 and DoesEntityExist(target) then writeFuel(target,readFuel(target),true) end
                    fuelVehicle=0
                    lastRefuelAt=0
                    lastFuelReplicateAt=0
                    TriggerEvent('fbrp:notify','Refuelling cancelled. Keep the vehicle stopped with its engine off.','info')
                else
                    local now=GetGameTimer()
                    local elapsed=clamp((now-lastRefuelAt)/1000.0,0.0,0.25)
                    lastRefuelAt=now
                    local replicate=now-lastFuelReplicateAt>=500
                    if replicate then lastFuelReplicateAt=now end
                    local level=writeFuel(target,readFuel(target)+(FBRP.Config.fuelRefillPerSecond or 3.0)*elapsed,replicate)
                    help(('Refuelling for ~g~FREE~s~... ~b~%d%%~s~  |  Press ~INPUT_CONTEXT~ to stop'):format(math.floor(level+0.5)))
                    if IsControlJustReleased(0,38) then
                        writeFuel(target,level,true)
                        fuelVehicle=0
                        lastRefuelAt=0
                        lastFuelReplicateAt=0
                        TriggerEvent('fbrp:notify',('Refuelling stopped at %d%%.'):format(math.floor(level+0.5)),'info')
                    elseif level>=99.95 then
                        writeFuel(target,100.0,true)
                        fuelVehicle=0
                        lastRefuelAt=0
                        lastFuelReplicateAt=0
                        TriggerEvent('fbrp:notify','Tank full. No charge.','success')
                    end
                end
            elseif valid then
                local level=readFuel(target)
                if level>=99.95 then
                    help('Fuel tank is full.')
                elseif GetEntitySpeed(target)>1.0 then
                    help('Stop the vehicle to refuel.')
                elseif GetIsVehicleEngineRunning(target) then
                    help('Switch off the engine to refuel.')
                else
                    help(('Press ~INPUT_CONTEXT~ to refuel for ~g~FREE~s~  |  Fuel: ~b~%d%%'):format(math.floor(level+0.5)))
                    if IsControlJustReleased(0,38) then
                        fuelVehicle=target
                        lastRefuelAt=GetGameTimer()
                        lastFuelReplicateAt=0
                        SetVehicleEngineOn(target,false,true,true)
                        TriggerEvent('fbrp:notify','Refuelling started. Fuel is free.','success')
                    end
                end
            end
            Wait(0)
        else
            if fuelVehicle~=0 then
                if DoesEntityExist(fuelVehicle) then writeFuel(fuelVehicle,readFuel(fuelVehicle),true) end
                fuelVehicle=0; lastRefuelAt=0; lastFuelReplicateAt=0
            end
            Wait(500)
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
        fuel=math.floor(readFuel(vehicle)+0.5),
        engine=GetIsVehicleEngineRunning(vehicle),
        seatbelt=seatbelt,
        cruise=cruise,
        locked=GetVehicleDoorLockStatus(vehicle)>=2
    }
end

