local F = FBRP.Fishing

local current = nil      -- playing emote { scenario | dict, anim, flag, props }
local handsUp = false
local pointing = false
local fishing = nil      -- { rod, stage }

local function ui(message) SendNUIMessage(message) end
local function notify(message, tone) TriggerEvent('fbrp:notify', message, tone or 'info') end

local function loadAnim(dict)
    RequestAnimDict(dict)
    local untilAt = GetGameTimer() + 3000
    while not HasAnimDictLoaded(dict) and GetGameTimer() < untilAt do Wait(10) end
    return HasAnimDictLoaded(dict)
end

local function loadModel(hash)
    if not IsModelInCdimage(hash) then return false end
    RequestModel(hash)
    local untilAt = GetGameTimer() + 3000
    while not HasModelLoaded(hash) and GetGameTimer() < untilAt do Wait(10) end
    return HasModelLoaded(hash)
end

local function attachProp(ped, prop)
    local hash = joaat(prop.model)
    if not loadModel(hash) then return nil end
    local coords = GetEntityCoords(ped)
    local object = CreateObject(hash, coords.x, coords.y, coords.z + 0.2, true, true, true)
    AttachEntityToEntity(object, ped, GetPedBoneIndex(ped, prop.bone), prop.pos[1], prop.pos[2], prop.pos[3], prop.rot[1], prop.rot[2], prop.rot[3], true, true, false, true, 1, true)
    SetModelAsNoLongerNeeded(hash)
    return object
end

local function deleteProps(list)
    for _, object in ipairs(list or {}) do
        if DoesEntityExist(object) then
            DetachEntity(object, true, false)
            DeleteEntity(object)
        end
    end
end

local function blocked()
    local ped = PlayerPedId()
    if FBRP.IsDowned and FBRP.IsDowned() then return 'You cannot do that while incapacitated.' end
    if LocalPlayer.state['fbrp:restrained'] then return 'You are restrained.' end
    if IsPedInAnyVehicle(ped, false) then return 'Get out of the vehicle first.' end
    if IsPedRagdoll(ped) or IsPedFalling(ped) or IsPedSwimming(ped) then return 'Not right now.' end
    return nil
end

-- ─────────────────────────── emotes ───────────────────────────

local function stopEmote()
    if not current then return end
    local ped = PlayerPedId()
    deleteProps(current.props)
    if current.scenario then ClearPedTasks(ped)
    else StopAnimTask(ped, current.dict, current.anim, 2.0) end
    current = nil
end

local function stopHandsUp()
    if not handsUp then return end
    handsUp = false
    StopAnimTask(PlayerPedId(), 'missminuteman_1ig_2', 'handsup_enter', 2.0)
    LocalPlayer.state:set('fbrp:handsup', false, true)
end

local function playEmote(id)
    local emote = FBRP.FindEmote(id)
    if not emote then return notify(('Unknown emote "%s". Open the list with /emotes.'):format(tostring(id)), 'error') end
    local reason = blocked()
    if reason then return notify(reason, 'error') end
    TriggerEvent('fbrp:cancelActivities', 'emote')
    stopEmote()
    stopHandsUp()
    local ped = PlayerPedId()
    if emote.scenario then
        ClearPedTasks(ped)
        TaskStartScenarioInPlace(ped, emote.scenario, 0, true)
        current = { id=emote.id, scenario=true, props={} }
        return
    end
    if not loadAnim(emote.dict) then return notify('That animation could not be loaded.', 'error') end
    TaskPlayAnim(ped, emote.dict, emote.anim, 2.0, 2.0, -1, emote.flag or 49, 0, false, false, false)
    current = { id=emote.id, dict=emote.dict, anim=emote.anim, flag=emote.flag or 49, props={} }
    for _, prop in ipairs(emote.props or {}) do
        local object = attachProp(ped, prop)
        if object then current.props[#current.props + 1] = object end
    end
end

RegisterCommand('e', function(_, args)
    local id = (args[1] or ''):lower()
    if id == '' then return ExecuteCommand('emotes') end
    if id == 'c' or id == 'cancel' or id == 'stop' then return stopEmote() end
    playEmote(id)
end, false)
RegisterCommand('emote', function(_, args) ExecuteCommand('e ' .. table.concat(args, ' ')) end, false)

RegisterCommand('emotes', function()
    if FBRP.IsMenuOpen() then return end
    local list = {}
    for _, emote in ipairs(FBRP.Emotes) do list[#list + 1] = { id=emote.id, label=emote.label, cat=emote.cat } end
    FBRP.OpenMenu('emotes', { emotes=list, current=current and current.id or nil })
end, false)
RegisterKeyMapping('emotes', 'Open emote menu', 'keyboard', 'F3')

RegisterNUICallback('emote', function(data, cb)
    local id = type(data) == 'table' and tostring(data.id or '') or ''
    FBRP.CloseMenu()
    if id == 'stop' then stopEmote() else playEmote(id) end
    cb({ ok=true })
end)

-- Ended looped animations (ragdoll, task interrupt) take their props with them.
CreateThread(function()
    while true do
        Wait(500)
        if current and not current.scenario and (current.flag % 2 == 1) and not IsEntityPlayingAnim(PlayerPedId(), current.dict, current.anim, 3) then
            deleteProps(current.props)
            current = nil
        end
    end
end)

-- ─────────────────────────── hands up & pointing ───────────────────────────

RegisterCommand('handsup', function()
    if handsUp then return stopHandsUp() end
    if current then return stopEmote() end
    if fishing then return TriggerEvent('fbrp:cancelActivities') end
    local reason = blocked()
    if reason then return end
    if not loadAnim('missminuteman_1ig_2') then return end
    handsUp = true
    TaskPlayAnim(PlayerPedId(), 'missminuteman_1ig_2', 'handsup_enter', 8.0, 8.0, -1, 50, 0, false, false, false)
    LocalPlayer.state:set('fbrp:handsup', true, true)
end, false)
RegisterKeyMapping('handsup', 'Hands up / cancel emote', 'keyboard', 'X')

local function stopPointing()
    if not pointing then return end
    pointing = false
    local ped = PlayerPedId()
    RequestTaskMoveNetworkStateTransition(ped, 'Stop')
    if not IsPedInjured(ped) then ClearPedSecondaryTask(ped) end
    SetPedConfigFlag(ped, 36, false)
    ClearPedSecondaryTask(ped)
end

RegisterCommand('point', function()
    if pointing then return stopPointing() end
    local ped = PlayerPedId()
    if blocked() or handsUp then return end
    if not loadAnim('anim@mp_point') then return end
    pointing = true
    SetPedCurrentWeaponVisible(ped, false, true, true, true)
    SetPedConfigFlag(ped, 36, true)
    TaskMoveNetworkByName(ped, 'task_mp_pointing', 0.5, false, 'anim@mp_point', 24)
    CreateThread(function()
        while pointing do
            local p = PlayerPedId()
            if not IsTaskMoveNetworkActive(p) or IsPedInAnyVehicle(p, false) or IsPedRagdoll(p) then stopPointing() break end
            local pitch = math.max(-70.0, math.min(42.0, GetGameplayCamRelativePitch()))
            local heading = math.max(-180.0, math.min(180.0, GetGameplayCamRelativeHeading()))
            SetTaskMoveNetworkSignalFloat(p, 'Pitch', (pitch + 70.0) / 112.0)
            SetTaskMoveNetworkSignalFloat(p, 'Heading', ((heading + 180.0) / 360.0) * -1.0 + 1.0)
            SetTaskMoveNetworkSignalBool(p, 'isBlocked', false)
            SetTaskMoveNetworkSignalBool(p, 'isFirstPerson', GetCamViewModeForContext(GetCamActiveViewModeContext()) == 4)
            Wait(0)
        end
    end)
end, false)
RegisterKeyMapping('point', 'Point (on foot)', 'keyboard', 'B')

-- ─────────────────────────── fishing ───────────────────────────

local ROD = { model='prop_fishing_rod_01', bone=60309, pos={0.0,0.0,0.0}, rot={0.0,0.0,0.0} }

local function facingWater()
    local ped = PlayerPedId()
    local from = GetOffsetFromEntityInWorldCoords(ped, 0.0, 0.5, 1.0)
    for _, ahead in ipairs({ 6.0, 10.0, 15.0 }) do
        local to = GetOffsetFromEntityInWorldCoords(ped, 0.0, ahead, -12.0)
        local hit = TestProbeAgainstWater(from.x, from.y, from.z, to.x, to.y, to.z)
        if hit then return true end
    end
    local front = GetOffsetFromEntityInWorldCoords(ped, 0.0, 8.0, 0.0)
    local found, height = GetWaterHeight(front.x, front.y, front.z)
    return found and height < GetEntityCoords(ped).z
end

local function stopFishing(silent)
    if not fishing then return end
    local state = fishing
    fishing = nil
    deleteProps({ state.rod })
    StopAnimTask(PlayerPedId(), 'amb@world_human_stand_fishing@idle_a', 'idle_c', 2.0)
    ui({ type='fishing', stage='off' })
    TriggerServerEvent('fbrp:fishing:cancel')
    if not silent then notify('You reel in your line.', 'info') end
end

-- Two hits out of three: press E while the needle is inside the green zone.
local function reelMinigame()
    local zoneStart = 0.2 + math.random() * 0.5
    local zoneWidth = 0.16
    local period = 1100 + math.random(0, 500)
    local started = GetGameTimer()
    ui({ type='fishing', stage='bite', zone={ zoneStart, zoneWidth }, period=period })
    PlaySoundFrontend(-1, 'Beep_Red', 'DLC_HEIST_HACKING_SNAKE_SOUNDS', true)
    local hits, tries = 0, 0
    local deadline = started + 9000
    while fishing and GetGameTimer() < deadline and tries < 3 and hits < 2 do
        DisableControlAction(0, 38, true)
        if IsDisabledControlJustPressed(0, 38) then
            tries = tries + 1
            local phase = ((GetGameTimer() - started) % (period * 2)) / period
            local position = phase <= 1 and phase or 2 - phase
            local hit = position >= zoneStart and position <= zoneStart + zoneWidth
            if hit then hits = hits + 1 end
            ui({ type='fishing', stage='press', hit=hit, hits=hits, tries=tries })
            PlaySoundFrontend(-1, hit and 'Hack_Success' or 'Hack_Failed', 'DLC_HEIST_BIOLAB_PREP_HACKING_SOUNDS', true)
        end
        Wait(0)
    end
    return hits >= 2
end

local function fishLoop()
    CreateThread(function()
        local origin = GetEntityCoords(PlayerPedId())
        while fishing do
            TriggerServerEvent('fbrp:fishing:cast')
            ui({ type='fishing', stage='waiting' })
            local biteAt = GetGameTimer() + math.random(F.biteMinMs, F.biteMaxMs)
            while fishing and GetGameTimer() < biteAt do
                local ped = PlayerPedId()
                if #(GetEntityCoords(ped) - origin) > 2.0 or IsPedRagdoll(ped) then return stopFishing() end
                if not IsEntityPlayingAnim(ped, 'amb@world_human_stand_fishing@idle_a', 'idle_c', 3) then
                    TaskPlayAnim(ped, 'amb@world_human_stand_fishing@idle_a', 'idle_c', 2.0, 2.0, -1, 49, 0, false, false, false)
                end
                Wait(100)
            end
            if not fishing then return end
            local landed = reelMinigame()
            if not fishing then return end
            fishing.stage = 'reeling'
            TriggerServerEvent('fbrp:fishing:hooked', landed)
            local waitUntil = GetGameTimer() + 4000
            while fishing and fishing.stage == 'reeling' and GetGameTimer() < waitUntil do Wait(100) end
            -- Let the catch card breathe before the next cast.
            local recastAt = GetGameTimer() + 3500
            while fishing and GetGameTimer() < recastAt do
                if #(GetEntityCoords(PlayerPedId()) - origin) > 2.0 then return stopFishing() end
                Wait(100)
            end
        end
    end)
end

RegisterCommand('fish', function()
    if fishing then return stopFishing() end
    local reason
    local ped = PlayerPedId()
    if IsPedInAnyBoat(ped) then
        if GetPedInVehicleSeat(GetVehiclePedIsIn(ped, false), -1) == ped and GetEntitySpeed(GetVehiclePedIsIn(ped, false)) > 1.0 then reason = 'Stop the boat first.' end
    else
        reason = blocked()
        if not reason and not facingWater() then reason = 'Face open water to cast your line.' end
    end
    if reason then return notify(reason, 'error') end
    if not loadAnim('amb@world_human_stand_fishing@idle_a') then return end
    stopEmote()
    stopHandsUp()
    fishing = { stage='waiting' }
    fishing.rod = attachProp(ped, ROD)
    TaskPlayAnim(ped, 'amb@world_human_stand_fishing@idle_a', 'idle_c', 2.0, 2.0, -1, 49, 0, false, false, false)
    notify('Line cast. Wait for a bite, then hit E in the green. Move or press X to stop.', 'info')
    fishLoop()
end, false)

RegisterNetEvent('fbrp:fishing:result', function(result)
    ui({ type='fishing', stage='result', result=result })
    if fishing then fishing.stage = 'landed' end
end)

AddEventHandler('fbrp:cancelActivities', function(except)
    if except ~= 'emote' then stopEmote() end
    stopHandsUp()
    stopPointing()
    stopFishing(true)
end)

AddEventHandler('onResourceStop', function(name)
    if name ~= GetCurrentResourceName() then return end
    if current then deleteProps(current.props) end
    if fishing then deleteProps({ fishing.rod }) end
end)
