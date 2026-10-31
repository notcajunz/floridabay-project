-- FBRP Iron Man - client: Mark 50 suit and powers. Nothing here runs until the server confirms the player may suit up
-- (Co-Owner and above, on duty) and the server revokes it again if that stops being true.
local cfg = IronManConfig
local E = cfg.Energy
local F = cfg.Flight

local suited, busy = false, false
local saved
local flying, landing, diving = false, false, false
local flightMode            -- 'fly' or 'hover', the animation currently playing
local vel = vector3(0.0, 0.0, 0.0)
local spaceDown, spaceSince = false, 0
local energy = E.Max
local lastSpend = 0
local lowWarned = false
local combat, gunOn, unibeam = false, false, false
local locked
local held
local cooldown = {}

local BONE_RHAND, BONE_CHEST, BONE_SHOULDER = 57005, 24818, 10706

-- ===================== helpers =====================
local function notify(desc, kind)
    lib.notify({ title = 'Iron Man', description = desc, type = kind or 'inform' })
end

local function play(name, volume, loop)
    SendNUIMessage({ play = name, volume = volume or 0.5, loop = loop or false })
end

local function stopSound(name)
    SendNUIMessage({ stop = name })
end

local function report(power)
    TriggerServerEvent('fbrp_ironman:used', power)
end

local function ready(name, ms)
    local now = GetGameTimer()
    if cooldown[name] and now < cooldown[name] then return false end
    cooldown[name] = now + ms
    return true
end

local function spend(cost)
    if energy < cost then
        if ready('empty', 1500) then notify('Arc reactor depleted.', 'error') end
        return false
    end
    energy = energy - cost
    lastSpend = GetGameTimer()
    return true
end

local function loadModel(hash)
    if not IsModelInCdimage(hash) or not IsModelValid(hash) then return false end
    RequestModel(hash)
    local deadline = GetGameTimer() + 10000
    while not HasModelLoaded(hash) and GetGameTimer() < deadline do Wait(0) end
    return HasModelLoaded(hash)
end

local function loadDict(dict)
    if HasAnimDictLoaded(dict) then return true end
    RequestAnimDict(dict)
    local deadline = GetGameTimer() + 3000
    while not HasAnimDictLoaded(dict) and GetGameTimer() < deadline do Wait(0) end
    return HasAnimDictLoaded(dict)
end

local function playAnim(ped, dict, name, flag)
    if loadDict(dict) then
        TaskPlayAnim(ped, dict, name, 4.0, -4.0, -1, flag or 1, 0.0, false, false, false)
        return true
    end
    return false
end

local function camDir()
    local rot = GetGameplayCamRot(2)
    local rx, rz = math.rad(rot.x), math.rad(rot.z)
    local c = math.abs(math.cos(rx))
    return vector3(-math.sin(rz) * c, math.cos(rz) * c, math.sin(rx)), rot
end

local function bone(ped, id, x, y, z)
    return GetPedBoneCoords(ped, id, x or 0.0, y or 0.0, z or 0.0)
end

-- Where the crosshair points (or a locked target), and the entity hit if any.
local function aimPoint(ped, dist)
    if locked and DoesEntityExist(locked) then
        return GetEntityCoords(locked) + vector3(0.0, 0.0, IsEntityAPed(locked) and 0.3 or 0.0), locked
    end
    local origin = GetGameplayCamCoord()
    local dir = camDir()
    local dest = origin + dir * (dist or 400.0)
    local ray = StartExpensiveSynchronousShapeTestLosProbe(origin.x, origin.y, origin.z, dest.x, dest.y, dest.z, -1, ped, 7)
    local _, hit, endCoords, _, entity = GetShapeTestResult(ray)
    if hit == 1 then return endCoords, entity end
    return dest, 0
end

local function blast(coords, kind, scale)
    AddExplosion(coords.x, coords.y, coords.z, kind, (scale or 1.0) * cfg.ExplosionScale, true, false, 0.3)
end

-- Players and the vehicles they sit in are never grabbed, thrown, pushed or disabled by the non-weapon powers.
local function occupiedByPlayer(vehicle)
    for seat = -1, GetVehicleModelNumberOfSeats(GetEntityModel(vehicle)) - 2 do
        local occupant = GetPedInVehicleSeat(vehicle, seat)
        if occupant ~= 0 and IsPedAPlayer(occupant) then return true end
    end
    return false
end

local function movable(entity, ped)
    if entity == ped or not DoesEntityExist(entity) then return false end
    if IsEntityAPed(entity) then return not IsPedAPlayer(entity) and not IsPedInAnyVehicle(entity, true) end
    if IsEntityAVehicle(entity) then return not occupiedByPlayer(entity) end
    return false
end

local function control(entity)
    if NetworkHasControlOfEntity(entity) then return true end
    NetworkRequestControlOfEntity(entity)
    local deadline = GetGameTimer() + 600
    while not NetworkHasControlOfEntity(entity) and GetGameTimer() < deadline do Wait(0) end
    return NetworkHasControlOfEntity(entity)
end

local function nearby(ped, radius)
    local out = {}
    local here = GetEntityCoords(ped)
    for _, pool in ipairs({ 'CPed', 'CVehicle' }) do
        for _, entity in ipairs(GetGamePool(pool)) do
            if movable(entity, ped) and #(GetEntityCoords(entity) - here) <= radius then
                out[#out + 1] = entity
            end
        end
    end
    return out
end

local function candidates(ped)
    local out = {}
    local origin, dir = GetGameplayCamCoord(), camDir()
    for _, pool in ipairs({ 'CPed', 'CVehicle' }) do
        for _, entity in ipairs(GetGamePool(pool)) do
            if entity ~= ped and not IsEntityDead(entity) and not (IsEntityAPed(entity) and IsPedInAnyVehicle(entity, true)) then
                local to = GetEntityCoords(entity) - origin
                local dist = #to
                if dist > 3.0 and dist < 150.0 and #(to / dist - dir) < 0.35 then
                    out[#out + 1] = { entity = entity, dist = dist }
                end
            end
        end
    end
    table.sort(out, function(a, b) return a.dist < b.dist end)
    return out
end

local function drawText(text, x, y, scale, r, g, b)
    SetTextFont(4)
    SetTextScale(scale, scale)
    SetTextColour(r or 255, g or 255, b or 255, 230)
    SetTextOutline()
    SetTextCentre(true)
    BeginTextCommandDisplayText('STRING')
    AddTextComponentSubstringPlayerName(text)
    EndTextCommandDisplayText(x, y)
end

local function beam(from, to, thickness)
    for i = 0, 3 do
        local o = (i - 1.5) * thickness
        DrawLine(from.x + o, from.y, from.z, to.x + o, to.y, to.z, 120, 210, 255, 220)
        DrawLine(from.x, from.y + o, from.z, to.x, to.y + o, to.z, 120, 210, 255, 220)
    end
    DrawLightWithRange(from.x, from.y, from.z, 120, 210, 255, 6.0, 8.0)
end

-- ===================== suit =====================
local function snapshot(ped)
    local s = {
        model = GetEntityModel(ped),
        health = GetEntityHealth(ped),
        armour = GetPedArmour(ped),
        comps = {},
        props = {},
        overlays = {},
    }
    for i = 0, 11 do
        s.comps[i] = { GetPedDrawableVariation(ped, i), GetPedTextureVariation(ped, i), GetPedPaletteVariation(ped, i) }
    end
    for i = 0, 7 do
        s.props[i] = { GetPedPropIndex(ped, i), GetPedPropTextureIndex(ped, i) }
    end
    for i = 0, 12 do
        s.overlays[i] = GetPedHeadOverlayValue(ped, i)
    end
    local okHair, hair = pcall(GetPedHairColor, ped)
    local okHigh, high = pcall(GetPedHairHighlightColor, ped)
    s.hair = okHair and hair or nil
    s.highlight = okHigh and high or nil
    return s
end

local function restore(s)
    if not s then return end
    if loadModel(s.model) then
        SetPlayerModel(PlayerId(), s.model)
        SetModelAsNoLongerNeeded(s.model)
    end
    local ped = PlayerPedId()
    SetPedDefaultComponentVariation(ped)
    SetPedHeadBlendData(ped, 0, 0, 0, 0, 0, 0, 0.0, 0.0, 0.0, false)
    for i, c in pairs(s.comps) do
        SetPedComponentVariation(ped, i, c[1], c[2], c[3])
    end
    for i, p in pairs(s.props) do
        if p[1] >= 0 then SetPedPropIndex(ped, i, p[1], p[2], true) else ClearPedProp(ped, i) end
    end
    for i, v in pairs(s.overlays) do
        if v ~= 255 then SetPedHeadOverlay(ped, i, v, 1.0) end
    end
    if s.hair then SetPedHairColor(ped, s.hair, s.highlight or s.hair) end
    SetEntityHealth(ped, math.max(s.health, 120))
    SetPedArmour(ped, s.armour)
end

local function stopFlight()
    if not flying then return end
    flying, landing, diving = false, false, false
    flightMode = nil
    vel = vector3(0.0, 0.0, 0.0)
    local ped = PlayerPedId()
    SetEntityHasGravity(ped, true)
    SetPedCanRagdoll(ped, true)
    ClearPedTasks(ped)
    stopSound('jet_loop')
end

local function stopHeld(throw)
    if not held then return end
    local entity = held
    held = nil
    if DoesEntityExist(entity) then
        DetachEntity(entity, true, true)
        if throw then
            local dir = camDir()
            if IsEntityAPed(entity) then SetPedToRagdoll(entity, 4000, 4000, 0, false, false, false) end
            ApplyForceToEntity(entity, 1, dir.x * 60.0, dir.y * 60.0, dir.z * 60.0 + 8.0, 0.0, 0.0, 0.0, 0, false, true, true, false, true)
            play('throw', 0.5)
        end
    end
end

local function suitDown(silent, skipServer)
    if not suited then return end
    stopFlight()
    stopHeld(false)
    stopSound('unibeam_fire')
    combat, gunOn, unibeam, locked = false, false, false, nil
    suited = false
    if not skipServer then
        lib.callback.await('fbrp_ironman:toggle', false)
    end
    restore(saved)
    saved = nil
    play('jarvis_power', 0.5)
    if not silent then notify('Suit retracted.') end
end

local function suitUp(silent)
    local ped = PlayerPedId()
    if IsPedInAnyVehicle(ped, true) or IsEntityDead(ped) or IsPedRagdoll(ped) then
        if not silent then notify('You cannot suit up right now.', 'error') end
        return
    end
    local res = lib.callback.await('fbrp_ironman:toggle', false)
    if not res or not res.ok then
        if not silent then notify('Only Co-Owner and above can use the suit, and only while clocked in.', 'error') end
        return
    end
    if not res.suited then
        -- the server thought we were already suited (this script was restarted); toggle back so both agree
        lib.callback.await('fbrp_ironman:toggle', false)
        return suitUp(silent)
    end
    saved = snapshot(ped)
    local hash = joaat(cfg.Model)
    if not loadModel(hash) then
        lib.callback.await('fbrp_ironman:toggle', false)
        saved = nil
        local why = ('inCdimage=%s valid=%s loaded=%s'):format(tostring(IsModelInCdimage(hash)), tostring(IsModelValid(hash)), tostring(HasModelLoaded(hash)))
        print(('[fbrp_ironman] suit model %s failed to load: %s'):format(cfg.Model, why))
        TriggerServerEvent('fbrp_ironman:diag', why)
        notify('The suit model failed to load.', 'error')
        return
    end
    SetPlayerModel(PlayerId(), hash)
    SetModelAsNoLongerNeeded(hash)
    ped = PlayerPedId()
    SetPedDefaultComponentVariation(ped)
    SetEntityHealth(ped, saved.health)
    SetPedArmour(ped, saved.armour)
    suited = true
    energy = E.Max
    lowWarned = false
    play('jarvis_online', 0.6)
    notify('Mark 50 online. F5 or /ironmanhelp for the controls.', 'success')
end

local function toggleSuit(silent)
    if busy then return end
    busy = true
    local ok, err = pcall(function()
        if suited then suitDown(silent) else suitUp(silent) end
    end)
    busy = false
    if not ok then print(('[fbrp_ironman] suit toggle failed: %s'):format(tostring(err))) end
end

RegisterCommand(cfg.Command, function() toggleSuit(false) end, false)
RegisterCommand('ironman_key', function() toggleSuit(true) end, false)
RegisterKeyMapping('ironman_key', 'Iron Man: suit up / down', 'keyboard', cfg.DefaultKey)

RegisterCommand('ironmanhelp', function()
    if not suited then return notify('Suit up first with /' .. cfg.Command .. '.', 'error') end
    lib.alertDialog({
        header = 'Iron Man controls',
        content = table.concat({
            '**SPACE** fly / hold to climb / tap to land, **LCTRL** descend, **LSHIFT** boost, **WASD** steer',
            '**E** repulsor beam, **LMB** quick shots, **Q** (hold) unibeam, **R** homing missiles',
            '**F** pulse blast, **G** ground slam, **X** hero landing / slam, **C** combat mode (LMB punches)',
            '**V** grab ped or vehicle then **LMB** throw, **B** shoulder gun, **RMB** lock on, **Z** next target',
            '**F5** suit up / down',
        }, '\n\n'),
        centered = true,
    })
end, false)

RegisterNetEvent('fbrp_ironman:revoke', function()
    if suited then
        suitDown(true, true)
        notify('Suit access revoked.', 'error')
    end
end)

AddEventHandler('onResourceStop', function(resource)
    if resource ~= GetCurrentResourceName() or not suited then return end
    stopFlight()
    stopHeld(false)
    restore(saved)
end)

-- ===================== powers =====================
local function startFlight(ped)
    if flying or IsPedInAnyVehicle(ped, true) then return end
    if not spend(2.0) then return end
    flying, landing, diving = true, false, false
    ClearPedTasksImmediately(ped)
    SetEntityHasGravity(ped, false)
    SetPedCanRagdoll(ped, false)
    vel = vector3(0.0, 0.0, 6.0)
    play('jet_loop', 0.35, true)
    report('flight')
end

local function setMode(ped, mode)
    if flightMode == mode then return end
    flightMode = mode
    if mode == 'fly' then
        playAnim(ped, 'skydive@base', 'free_idle', 1)
    else
        if not playAnim(ped, 'amb@world_human_stand_impatient@male@no_sign@base', 'base', 1) then ClearPedTasks(ped) end
    end
end

local function flightTick(ped, dt)
    local dir, rot = camDir()
    local right = vector3(math.cos(math.rad(rot.z)), math.sin(math.rad(rot.z)), 0.0)
    local fwd = (IsControlPressed(0, 32) and 1.0 or 0.0) - (IsControlPressed(0, 33) and 1.0 or 0.0)
    local side = (IsControlPressed(0, 35) and 1.0 or 0.0) - (IsControlPressed(0, 34) and 1.0 or 0.0)
    local boost = IsDisabledControlPressed(0, 21) or IsControlPressed(0, 21)
    local climbing = spaceDown and (GetGameTimer() - spaceSince) > 250
    local up = (climbing and 1.0 or 0.0) - (IsDisabledControlPressed(0, 36) and 1.0 or 0.0)
    local speed = boost and F.BoostSpeed or F.Speed

    local target = dir * (fwd * speed) + right * (side * F.Strafe) + vector3(0.0, 0.0, up * F.Climb)
    if landing then
        target = vector3(0.0, 0.0, -7.0)
        if GetEntityHeightAboveGround(ped) < 1.4 or not IsEntityInAir(ped) then
            stopFlight()
            return
        end
    elseif diving then
        target = vector3(0.0, 0.0, -75.0)
    end

    vel = vel + (target - vel) * math.min(1.0, F.Smoothing * (dt * 60.0))
    SetEntityVelocity(ped, vel.x, vel.y, vel.z)

    local moving = #vel > 4.0 and (fwd ~= 0.0 or boost or diving)
    if moving then
        setMode(ped, 'fly')
        SetEntityRotation(ped, diving and -80.0 or rot.x, 0.0, rot.z, 2, true)
    else
        setMode(ped, 'hover')
        SetEntityRotation(ped, 0.0, 0.0, rot.z, 2, true)
    end

    local drain = boost and E.BoostPerSecond or E.FlightPerSecond
    energy = math.max(0.0, energy - drain * dt)
    lastSpend = GetGameTimer()
    SetPlayerSprint(PlayerId(), false)
    if energy <= 0.0 then
        notify('Arc reactor depleted, emergency descent.', 'error')
        landing = true
    end
end

local function groundImpact(ped, radius, force, label)
    local here = GetEntityCoords(ped)
    play('crash', 0.6)
    ShakeGameplayCam('MEDIUM_EXPLOSION_SHAKE', 0.4)
    for _, entity in ipairs(nearby(ped, radius)) do
        if control(entity) then
            local away = GetEntityCoords(entity) - here
            local len = #away
            away = len > 0.1 and away / len or vector3(0.0, 0.0, 1.0)
            if IsEntityAPed(entity) then SetPedToRagdoll(entity, 3500, 3500, 0, false, false, false) end
            ApplyForceToEntity(entity, 1, away.x * force, away.y * force, force * 0.5, 0.0, 0.0, 0.0, 0, false, true, true, false, true)
        end
    end
    report(label)
end

local function pulse(ped)
    if not ready('pulse', 2500) or not spend(E.Pulse) then return end
    local here = GetEntityCoords(ped)
    play('sonic_boom', 0.7)
    CreateThread(function()
        local started = GetGameTimer()
        while GetGameTimer() - started < 500 do
            local scale = 2.0 + (GetGameTimer() - started) / 500.0 * 48.0
            DrawMarker(28, here.x, here.y, here.z, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, scale, scale, scale, 120, 210, 255, 70, false, false, 2, false, nil, nil, false)
            Wait(0)
        end
    end)
    ShakeGameplayCam('SMALL_EXPLOSION_SHAKE', 0.3)
    for _, entity in ipairs(nearby(ped, 25.0)) do
        if control(entity) then
            local away = GetEntityCoords(entity) - here
            local len = #away
            away = len > 0.1 and away / len or vector3(0.0, 0.0, 1.0)
            if IsEntityAPed(entity) then
                SetPedToRagdoll(entity, 3000, 3000, 0, false, false, false)
            else
                SetVehicleEngineOn(entity, false, true, true)
            end
            ApplyForceToEntity(entity, 1, away.x * 35.0, away.y * 35.0, 14.0, 0.0, 0.0, 0.0, 0, false, true, true, false, true)
        end
    end
    report('pulse')
end

local function slam(ped)
    if not ready('slam', 2000) then return end
    if diving then
        diving = false
        stopFlight()
        groundImpact(ped, 22.0, 45.0, 'hero landing')
        return
    end
    if flying then
        if not spend(E.Slam) then return end
        diving = true
        landing = false
        return
    end
    if IsEntityInAir(ped) or not spend(E.Slam) then return end
    groundImpact(ped, 15.0, 30.0, 'ground slam')
end

local function repulsorBeam(ped)
    if not ready('beam', 1800) or not spend(E.Repulsor) then return end
    play('charge', 0.5)
    CreateThread(function()
        Wait(550)
        if not suited then return end
        local origin = bone(ped, BONE_RHAND)
        local target = aimPoint(ped, 600.0)
        play('unibeam_fire', 0.5)
        local started = GetGameTimer()
        while GetGameTimer() - started < 350 do
            beam(bone(ped, BONE_RHAND), target, 0.04)
            Wait(0)
        end
        blast(target, 1, 1.0)
        report('repulsor beam')
    end)
end

local function quickShots(ped)
    if not ready('shots', 1400) or not spend(E.Shot * 6) then return end
    CreateThread(function()
        for _ = 1, 6 do
            if not suited then return end
            local target = aimPoint(ped, 500.0)
            local origin = bone(ped, BONE_RHAND)
            ShootSingleBulletBetweenCoords(origin.x, origin.y, origin.z, target.x, target.y, target.z, 30, true, joaat('WEAPON_RAYPISTOL'), ped, true, false, 600.0)
            play('pulse_fire', 0.25)
            Wait(70)
        end
    end)
    report('repulsor shots')
end

local function missiles(ped)
    if not ready('missiles', 4000) or not spend(E.Missiles) then return end
    play('jarvis_missiles', 0.5)
    CreateThread(function()
        Wait(400)
        for _ = 1, 4 do
            if not suited then return end
            local target = aimPoint(ped, 400.0)
            local origin = bone(ped, BONE_SHOULDER, (math.random() - 0.5) * 1.2, 0.2, 0.3)
            ShootSingleBulletBetweenCoords(origin.x, origin.y, origin.z, target.x, target.y, target.z, 100, true, joaat('WEAPON_RPG'), ped, true, false, 90.0)
            play('missile_fire', 0.4)
            Wait(160)
        end
    end)
    report('missiles')
end

local function punch(ped)
    if not ready('punch', 700) or not spend(E.Punch) then return end
    playAnim(ped, 'melee@unarmed@streamed_core_fps', 'heavy_punch_a', 0)
    play('heavy_punch', 0.5)
    local here, facing = GetEntityCoords(ped), GetEntityForwardVector(ped)
    local best, bestDist
    for _, entity in ipairs(nearby(ped, 4.0)) do
        local to = GetEntityCoords(entity) - here
        local dist = #to
        if dist > 0.1 and #(to / dist - facing) < 0.9 and (not bestDist or dist < bestDist) then
            best, bestDist = entity, dist
        end
    end
    if best and control(best) then
        play('punch_impact', 0.6)
        if IsEntityAPed(best) then SetPedToRagdoll(best, 4000, 4000, 0, false, false, false) end
        ApplyForceToEntity(best, 1, facing.x * 55.0, facing.y * 55.0, 12.0, 0.0, 0.0, 0.0, 0, false, true, true, false, true)
        report('punch')
    end
end

local function grab(ped)
    if held then return stopHeld(false) end
    local here, facing = GetEntityCoords(ped), GetEntityForwardVector(ped)
    local best, bestDist
    for _, entity in ipairs(nearby(ped, 6.0)) do
        local to = GetEntityCoords(entity) - here
        local dist = #to
        if dist > 0.1 and #(to / dist - facing) < 1.1 and (not bestDist or dist < bestDist) then
            best, bestDist = entity, dist
        end
    end
    if not best or not control(best) then return end
    held = best
    local vehicle = IsEntityAVehicle(best)
    AttachEntityToEntity(best, ped, GetPedBoneIndex(ped, BONE_RHAND), vehicle and 0.0 or 0.3, vehicle and 2.5 or 0.5, vehicle and 1.2 or 0.0, 0.0, 0.0, 0.0, false, false, false, false, 2, true)
    play('grab', 0.5)
    report('grab')
end

local function toggleLock(ped, cycle)
    local list = candidates(ped)
    if #list == 0 then
        locked = nil
        return
    end
    if cycle and locked then
        for i, c in ipairs(list) do
            if c.entity == locked then
                locked = list[(i % #list) + 1].entity
                play('jarvis_target', 0.0)
                return
            end
        end
    end
    if not cycle and locked then
        locked = nil
        return
    end
    locked = list[1].entity
    play('jarvis_target', 0.4)
end

-- ===================== main loop =====================
local DISABLED = { 22, 23, 24, 25, 26, 0, 29, 38, 44, 45, 47, 73, 140, 141, 142, 257, 263, 264, 20 }

CreateThread(function()
    local last = GetGameTimer()
    local gunAt, unibeamAt = 0, 0
    while true do
        if not suited then
            Wait(500)
            last = GetGameTimer()
        else
            Wait(0)
            local ped = PlayerPedId()
            local now = GetGameTimer()
            local dt = math.min(0.1, (now - last) / 1000.0)
            last = now

            if IsEntityDead(ped) then
                -- stay suited; retracting would hand back a fresh, healthy ped and bypass the death system
                stopFlight()
                stopHeld(false)
            elseif IsPedInAnyVehicle(ped, false) then
                -- put in a vehicle by someone else: powers stay off until out again
                stopFlight()
            else
                for _, id in ipairs(DISABLED) do DisableControlAction(0, id, true) end

                -- arc reactor glow
                local chest = bone(ped, BONE_CHEST, 0.12, 0.0, 0.0)
                DrawLightWithRange(chest.x, chest.y, chest.z, 120, 210, 255, 1.2, 2.5)

                -- space: press to fly, hold to climb, tap to land
                if IsDisabledControlJustPressed(0, 22) then
                    spaceDown, spaceSince = true, now
                    if not flying then startFlight(ped) end
                elseif spaceDown and IsDisabledControlJustReleased(0, 22) then
                    spaceDown = false
                    if flying and now - spaceSince < 250 and now - spaceSince > 0 and not diving then landing = true end
                end

                if flying then
                    flightTick(ped, dt)
                else
                    -- no fall damage in the suit
                    local v = GetEntityVelocity(ped)
                    if v.z < -9.0 and IsEntityInAir(ped) then SetEntityVelocity(ped, v.x, v.y, -9.0) end
                end

                if diving and not IsEntityInAir(ped) then slam(ped) end

                if IsDisabledControlJustPressed(0, 38) then repulsorBeam(ped) end
                if IsDisabledControlJustPressed(0, 45) then missiles(ped) end
                if IsDisabledControlJustPressed(0, 23) then pulse(ped) end
                if IsDisabledControlJustPressed(0, 47) or IsDisabledControlJustPressed(0, 73) then slam(ped) end
                if IsDisabledControlJustPressed(0, 26) then
                    combat = not combat
                    notify(combat and 'Combat mode on: LMB punches.' or 'Combat mode off.')
                end
                if IsDisabledControlJustPressed(0, 0) then grab(ped) end
                if IsDisabledControlJustPressed(0, 29) then
                    gunOn = not gunOn
                    notify(gunOn and 'Shoulder gun online.' or 'Shoulder gun offline.')
                end
                if IsDisabledControlJustPressed(0, 25) then toggleLock(ped, false) end
                if IsDisabledControlJustPressed(0, 20) then toggleLock(ped, true) end
                if IsDisabledControlJustPressed(0, 24) then
                    if held then stopHeld(true)
                    elseif combat then punch(ped)
                    else quickShots(ped) end
                end

                -- unibeam while Q is held
                if IsDisabledControlPressed(0, 44) and energy > 1.0 then
                    if not unibeam then
                        unibeam = true
                        play('unibeam_fire', 0.6)
                        report('unibeam')
                    end
                    local origin = bone(ped, BONE_CHEST, 0.0, 0.25, 0.0)
                    local target = aimPoint(ped, 300.0)
                    beam(origin, target, 0.1)
                    energy = math.max(0.0, energy - E.UnibeamPerSecond * dt)
                    lastSpend = now
                    if now > unibeamAt then
                        unibeamAt = now + 250
                        blast(target, 1, 0.5)
                    end
                elseif unibeam then
                    unibeam = false
                    stopSound('unibeam_fire')
                    play('unibeam_end', 0.5)
                end

                -- shoulder gun
                if gunOn and now > gunAt and energy > 1.0 then
                    gunAt = now + 90
                    local origin = bone(ped, BONE_SHOULDER, 0.0, 0.2, 0.3)
                    local target = aimPoint(ped, 300.0) + vector3((math.random() - 0.5) * 1.5, (math.random() - 0.5) * 1.5, (math.random() - 0.5) * 1.5)
                    ShootSingleBulletBetweenCoords(origin.x, origin.y, origin.z, target.x, target.y, target.z, 25, true, joaat('WEAPON_COMBATMG'), ped, true, false, 500.0)
                    energy = math.max(0.0, energy - E.GunPerSecond * 0.09)
                    lastSpend = now
                end

                -- lock-on marker
                if locked then
                    if DoesEntityExist(locked) and not IsEntityDead(locked) then
                        local c = GetEntityCoords(locked)
                        DrawMarker(2, c.x, c.y, c.z + 1.6, 0.0, 0.0, 0.0, 180.0, 0.0, 0.0, 0.5, 0.5, 0.5, 255, 60, 60, 220, true, true, 2, false, nil, nil, false)
                    else
                        locked = nil
                    end
                end

                -- arc reactor recharge and HUD
                if not flying and not unibeam and now - lastSpend > E.RegenDelayMs then
                    energy = math.min(E.Max, energy + E.RegenPerSecond * dt)
                end
                if energy < E.LowWarning then
                    if not lowWarned then
                        lowWarned = true
                        play('jarvis_warning', 0.6)
                    end
                elseif energy > E.LowWarning + 10.0 then
                    lowWarned = false
                end

                local low = energy < E.LowWarning
                DrawRect(0.5, 0.965, 0.18, 0.012, 0, 0, 0, 150)
                DrawRect(0.5 - 0.09 * (1.0 - energy / E.Max), 0.965, 0.18 * (energy / E.Max), 0.008, low and 255 or 120, low and 70 or 210, low and 70 or 255, 230)
                local status = {}
                if flying then status[#status + 1] = diving and 'DIVE' or (landing and 'LANDING' or 'FLIGHT') end
                if combat then status[#status + 1] = 'COMBAT' end
                if gunOn then status[#status + 1] = 'GUN' end
                if locked then status[#status + 1] = 'LOCK' end
                drawText(('ARC REACTOR %d%%  %s'):format(math.floor(energy), table.concat(status, ' / ')), 0.5, 0.935, 0.32)
            end
        end
    end
end)
