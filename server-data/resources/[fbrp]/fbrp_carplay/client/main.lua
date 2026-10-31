-- Made by Saif | © 2026 Saif. All rights reserved.
-- CarPlay client
-- Part 1: audio engine  - renders the replicated `carplay` state bag of nearby vehicles through xsound
-- Part 2: UI bridge     - /carplay, cursor toggle, NUI callbacks, live data for the UI
-- (client/gps.lua adds the Maps app on top of this)

CarPlay = {
    open        = false,   -- UI is shown
    interactive = false,   -- cursor is active (full UI). false = mini mode, game fully controllable
    typing      = false,   -- a text field is focused
    veh         = nil,
    netId       = nil,
    pins        = {},
    shared      = {},
}

local sounds     = {}      -- [netId] = { name, uid, vol, started, destroyed, endedSent, occupant, st }
local candidates = {}      -- [netId] = vehicle entity
local lastRev    = -1

-- ═════════════════════════ Audio engine ═════════════════════════

local function soundName(netId)
    return 'carplay_' .. netId
end

local function desiredPos(st, now)
    if st.paused then return st.pausedAt or 0 end
    return math.max(0, now - (st.startedAt or now))
end

local function destroySound(netId)
    local s = sounds[netId]
    if not s then return end
    s.destroyed = true
    sounds[netId] = nil
    if exports.xsound:soundExists(s.name) then
        exports.xsound:Destroy(s.name)
    end
end

local function reportEnded(netId, s)
    if s.endedSent then return end
    s.endedSent = true
    TriggerServerEvent('carplay:server:ended', netId, s.uid)
end

-- true when the sound escapes the cabin: window down, door/hood/trunk open, broken window, roof down, bikes...
function isOpenAir(veh, st)
    if st.outside then return true end                                   -- windows rolled down from CarPlay
    local class = GetVehicleClass(veh)
    if class == 8 or class == 13 or class == 14 then return true end    -- bikes, cycles, boats
    for i = 0, 5 do
        if GetVehicleDoorAngleRatio(veh, i) > 0.05 then return true end
    end
    for i = 0, 3 do
        if not IsVehicleWindowIntact(veh, i) then return true end
    end
    if IsVehicleAConvertible(veh, false) and GetConvertibleRoofState(veh) ~= 0 then return true end
    return false
end

local muffleOk = true
local function applyMuffle(s, amount)
    if not muffleOk or s.muffle == amount then return end
    local ok = pcall(function() exports.xsound:setMuffle(s.name, amount + 0.0) end)   -- needs the patched xsound
    if ok then s.muffle = amount else muffleOk = false end
end

local function reconcile(netId, veh, st, ped, pedVeh, now)
    local track = st.index and st.index > 0 and st.queue and st.queue[st.index] or nil
    if not track or not st.uid then
        destroySound(netId)
        return
    end

    local occupant = (pedVeh == veh)
    local pedPos   = GetEntityCoords(ped)
    local vehPos   = GetEntityCoords(veh)

    -- Outside the car: keep playing while the engine is running (no more cutting off when you step out)
    local vol, dist, muffle
    if occupant then
        vol, dist, muffle = (st.volume or Config.DefaultVolume), Config.Audio.distance, 0.0
    else
        if not Config.Audio.allowOutside then destroySound(netId) return end
        if Config.Audio.requireEngine and not GetIsVehicleEngineRunning(veh) then destroySound(netId) return end
        local open = isOpenAir(veh, st)
        dist = Config.Audio.distance * (open and 1.0 or Config.Audio.closedDistance)
        if #(pedPos - vehPos) > dist * 1.4 then destroySound(netId) return end
        vol = (st.volume or Config.DefaultVolume) * (open and 1.0 or Config.Audio.closedMultiplier)
        muffle = open and 0.0 or Config.Audio.closedMuffle     -- windows up = dull, bass-heavy sound
    end
    local pos = occupant and pedPos or vehPos      -- occupants always hear it at full strength

    local s = sounds[netId]
    if s and s.uid ~= st.uid then
        destroySound(netId)
        s = nil
    end

    if not s then
        s = { name = soundName(netId), uid = st.uid, vol = vol, st = st, occupant = occupant, dist = dist }
        sounds[netId] = s
        local name = s.name

        if exports.xsound:soundExists(name) then exports.xsound:Destroy(name) end

        exports.xsound:PlayUrlPos(name, track.link, vol, pos, false, {
            onPlayStart = function()
                if sounds[netId] ~= s or s.destroyed then return end
                s.started = true
                local want = desiredPos(s.st, GetCloudTimeAsInt())
                if want > 2 then exports.xsound:setTimeStamp(name, want + 0.0) end
                if s.st.paused then exports.xsound:Pause(name) end
            end,
            onPlayEnd = function()
                if sounds[netId] ~= s or s.destroyed then return end
                reportEnded(netId, s)
            end,
        })
        exports.xsound:Distance(name, dist)
        applyMuffle(s, muffle)
        return
    end

    -- sound already exists: keep it in sync with the replicated state
    s.st       = st
    s.occupant = occupant
    local name = s.name
    if not exports.xsound:soundExists(name) then
        sounds[netId] = nil
        return
    end

    exports.xsound:Position(name, pos)
    applyMuffle(s, muffle)
    if math.abs((s.dist or 0) - dist) > 0.5 then
        exports.xsound:Distance(name, dist)
        s.dist = dist
    end
    if math.abs(s.vol - vol) > 0.01 then
        -- glide to the new level (door opens / window rolls down = gets louder gradually, like real life)
        s.vol = s.vol + (vol - s.vol) * (occupant and 1.0 or 0.5)
        if math.abs(s.vol - vol) < 0.02 then s.vol = vol end
        exports.xsound:setVolume(name, s.vol)
    end

    if not s.started then return end

    local isPaused = exports.xsound:isPaused(name)
    if st.paused and not isPaused then
        exports.xsound:Pause(name)
    elseif not st.paused and isPaused then
        exports.xsound:Resume(name)
    end

    local want = desiredPos(st, now)
    local cur  = exports.xsound:getTimeStamp(name) or 0
    if math.abs(cur - want) > (st.paused and 1.0 or Config.Audio.maxDrift) then
        exports.xsound:setTimeStamp(name, want + 0.0)
        cur = want
    end

    -- fallback end detection (in case the player never fires onPlayEnd)
    local dur = exports.xsound:getMaxDuration(name) or 0
    if dur > 5 and cur >= dur - 0.6 and not st.paused then
        reportEnded(netId, s)
    end
end

CreateThread(function()
    local refresh, lastPedVeh = 0, 0
    while true do
        Wait(300)
        local ped    = PlayerPedId()
        local pedVeh = GetVehiclePedIsIn(ped, false)
        local now    = GetCloudTimeAsInt()

        if pedVeh ~= lastPedVeh then
            lastPedVeh = pedVeh
            refresh = 0
        end

        refresh = refresh - 1
        if refresh <= 0 then
            refresh = 7                                    -- rescan nearby vehicles every ~2 s
            candidates = {}
            if pedVeh ~= 0 and NetworkGetEntityIsNetworked(pedVeh) then
                candidates[NetworkGetNetworkIdFromEntity(pedVeh)] = pedVeh
            end
            if Config.Audio.allowOutside then
                local pc, range = GetEntityCoords(ped), Config.Audio.distance * 1.5
                for _, v in ipairs(GetGamePool('CVehicle')) do
                    if v ~= pedVeh and #(GetEntityCoords(v) - pc) <= range
                        and Entity(v).state.carplay and NetworkGetEntityIsNetworked(v) then
                        candidates[NetworkGetNetworkIdFromEntity(v)] = v
                    end
                end
            end
        end

        for netId, veh in pairs(candidates) do
            if DoesEntityExist(veh) then
                local st = Entity(veh).state.carplay
                if st then
                    reconcile(netId, veh, st, ped, pedVeh, now)
                else
                    destroySound(netId)
                end
            else
                candidates[netId] = nil
                destroySound(netId)
            end
        end

        for netId in pairs(sounds) do
            if not candidates[netId] then destroySound(netId) end
        end
    end
end)

-- ═════════════════════════ UI bridge ═════════════════════════

function CarPlay.setInteractive(on)
    CarPlay.interactive = on and true or false
    if not CarPlay.interactive then CarPlay.typing = false end
    SetNuiFocus(CarPlay.interactive, CarPlay.interactive)
    SetNuiFocusKeepInput(CarPlay.interactive)          -- <- this is what lets you keep driving with the cursor on
    SendNUIMessage({ action = 'mode', interactive = CarPlay.interactive })
end

function CarPlay.openUI()
    local ped = PlayerPedId()
    local veh = GetVehiclePedIsIn(ped, false)
    if veh == 0 then
        Config.Notify('You need to be inside a vehicle to use CarPlay.', 'error')
        return
    end
    if not NetworkGetEntityIsNetworked(veh) then
        Config.Notify('CarPlay is not available in this vehicle.', 'error')
        return
    end

    CarPlay.veh   = veh
    CarPlay.netId = NetworkGetNetworkIdFromEntity(veh)
    CarPlay.open  = true
    lastRev       = -1

    TriggerServerEvent('carplay:server:requestPins')
    SendNUIMessage({
        action = 'open',
        radio = LocalPlayer.state['fbrp:carRadioAccess'] == true,
        cfg = {
            places       = Config.Places,
            units        = Config.Units,
            maxQueue     = Config.MaxQueue,
            cursorKey    = Config.CursorKey,
            allowOutside = Config.Audio.allowOutside,
            controlMode  = Config.ControlMode,
            map          = Config.Map,
        },
    })
    CarPlay.setInteractive(true)
end

function CarPlay.close()
    if not CarPlay.open then return end
    CarPlay.open = false
    CarPlay.setInteractive(false)
    SendNUIMessage({ action = 'close' })
end

RegisterCommand(Config.Command, function()
    if CarPlay.open then CarPlay.close() else CarPlay.openUI() end
end, false)

RegisterCommand('carplay_cursor', function()
    if CarPlay.open then CarPlay.setInteractive(not CarPlay.interactive) end
end, false)
RegisterKeyMapping('carplay_cursor', 'CarPlay: toggle cursor / mini mode', 'keyboard', Config.CursorKey)

TriggerEvent('chat:addSuggestion', '/' .. Config.Command, 'Open or close Apple CarPlay')

-- NUI callbacks ---------------------------------------------------------------------------------

RegisterNUICallback('close', function(_, cb)
    CarPlay.close()
    cb('ok')
end)

RegisterNUICallback('cursor', function(data, cb)
    if CarPlay.open then CarPlay.setInteractive(data and data.on == true) end
    cb('ok')
end)

RegisterNUICallback('typing', function(data, cb)
    CarPlay.typing = (data and data.on == true) or false
    cb('ok')
end)

RegisterNUICallback('action', function(data, cb)
    if CarPlay.netId and data and type(data.action) == 'string' then
        TriggerServerEvent('carplay:server:action', CarPlay.netId, data.action, data.a, data.b)
    end
    cb('ok')
end)

-- Roll the windows down / up (also tells the server so everyone near hears the music accordingly)
RegisterNUICallback('windows', function(data, cb)
    local on = data and data.on == true
    local veh = CarPlay.veh
    if veh and DoesEntityExist(veh) and CarPlay.netId then
        if on then
            RollDownWindows(veh)
        else
            for i = 0, 3 do RollUpWindow(veh, i) end
        end
        TriggerServerEvent('carplay:server:action', CarPlay.netId, 'outside', on)
    end
    cb('ok')
end)

RegisterNetEvent('carplay:client:notify', function(msg, kind)
    if CarPlay.open then
        SendNUIMessage({ action = 'toast', msg = msg, kind = kind })
    else
        Config.Notify(msg, kind)
    end
end)

-- Keep the game controllable: only block what would clash with clicking on the screen ----------

local BLOCKED = { 1, 2, 24, 25, 37, 68, 69, 70, 91, 92, 106, 114, 140, 141, 142, 199, 200, 257, 263, 264 }

CreateThread(function()
    while true do
        if CarPlay.interactive then
            Wait(0)
            if CarPlay.typing then
                DisableAllControlActions(0)            -- typing a link: don't let letters drive the car
            else
                for i = 1, #BLOCKED do DisableControlAction(0, BLOCKED[i], true) end
            end
        else
            Wait(250)
        end
    end
end)

-- Close automatically when leaving the vehicle ---------------------------------------------------

CreateThread(function()
    while true do
        Wait(500)
        if CarPlay.open and GetVehiclePedIsIn(PlayerPedId(), false) ~= CarPlay.veh then
            CarPlay.close()
        end
    end
end)

-- Live data for the UI ---------------------------------------------------------------------------

local function clamp01(v) return math.max(0.0, math.min(100.0, v)) end

CreateThread(function()
    while true do
        if not CarPlay.open or not CarPlay.veh or not DoesEntityExist(CarPlay.veh) then
            Wait(500)
        else
            Wait(250)
            local veh    = CarPlay.veh
            local coords = GetEntityCoords(veh)
            local st     = Entity(veh).state.carplay

            -- playback state (only sent when it changed)
            local rev = st and st.rev or 0
            if rev ~= lastRev then
                lastRev = rev
                SendNUIMessage({ action = 'state', car = st or false })
            end

            -- progress
            local pos, dur, playing = 0, 0, false
            local s = sounds[CarPlay.netId]
            if st and st.index and st.index > 0 then
                pos = desiredPos(st, GetCloudTimeAsInt())
                playing = not st.paused
                if s and s.started and exports.xsound:soundExists(s.name) then
                    pos = exports.xsound:getTimeStamp(s.name) or pos
                    dur = exports.xsound:getMaxDuration(s.name) or 0
                end
            end

            -- dashboard
            local s1 = GetStreetNameAtCoord(coords.x, coords.y, coords.z)
            local fuel = Entity(veh).state.fuel or GetVehicleFuelLevel(veh)
            local seats = (GetPedInVehicleSeat(veh, -1) ~= 0 and 1 or 0) + GetVehicleNumberOfPassengers(veh)

            local dash = {
                x = coords.x, y = coords.y,
                heading = GetEntityHeading(veh),
                speed   = GetEntitySpeed(veh),
                street  = GetStreetNameFromHashKey(s1),
                zone    = GetLabelText(GetNameOfZone(coords.x, coords.y, coords.z)),
                fuel    = clamp01((tonumber(fuel) or 0) + 0.0),
                engine  = clamp01(GetVehicleEngineHealth(veh) / 10.0),
                body    = clamp01(GetVehicleBodyHealth(veh) / 10.0),
                seats   = seats,
                hour    = GetClockHours(),
                minute  = GetClockMinutes(),
            }

            SendNUIMessage({
                action  = 'tick',
                pos     = pos,
                dur     = dur,
                playing = playing,
                dash    = dash,
                nav     = CarPlay.getNav and CarPlay.getNav(coords, dash.speed) or nil,
            })
        end
    end
end)

-- Cleanup ----------------------------------------------------------------------------------------

AddEventHandler('onResourceStop', function(res)
    if res ~= GetCurrentResourceName() then return end
    for netId in pairs(sounds) do destroySound(netId) end
    SetNuiFocus(false, false)
    SetNuiFocusKeepInput(false)
end)
