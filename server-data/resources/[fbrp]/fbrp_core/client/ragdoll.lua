-- Ragdoll physics: gunshot stumbles and knockback, vehicle strikes, hard landings and
-- launches out of wrecked vehicles. Everything is local to the player's own ped; the
-- downed state, parachuting and swimming are left to their own systems.
FBRP = FBRP or {}
FBRP.Ragdoll = FBRP.Ragdoll or {}

local R = {
    minMs = 700,
    maxMs = 7000,
    hitCooldownMs = 2200,    -- small hits cannot chain-ragdoll a player who just got up
    heavyHitDamage = 60,     -- hits this hard ignore the cooldown
    getUpAfterMs = 1300,     -- SPACE gets the player up early once this long has passed
    landingSpeed = 11.0,     -- downward m/s above which a landing ragdolls
}

local LEG_BONES = { [58271] = true, [51826] = true, [63931] = true, [36864] = true, [14201] = true, [52301] = true }
local HEAD_BONES = { [31086] = true, [39317] = true }
local WEAPON_GROUP = { shotgun = 860033945, sniper = 3082541095, mg = 1159398588, heavy = 1752584910, melee = 3566412244, unarmed = 2685387236 }
local STUN_GUN = GetHashKey('WEAPON_STUNGUN')
local rand = math.random

local ragdollUntil = 0
local lastHitRagdoll = 0

-- No ragdoll while "settling": right after spawning / switching character / teleporting / noclip.
-- (Leaving txAdmin noclip in the air or spawning above the ground used to count as a fall and lay you down.)
local graceUntil = 0
local GRACE = { spawn = 8000, noclip = 5000, teleport = 4000 }

local function inGrace() return GetGameTimer() < graceUntil end

function FBRP.Ragdoll.grace(ms)
    graceUntil = math.max(graceUntil, GetGameTimer() + (ms or 5000))
    -- if one of our ragdolls is playing right now, stand back up
    if GetGameTimer() < ragdollUntil then
        ragdollUntil = 0
        local ped = PlayerPedId()
        if IsPedRagdoll(ped) and not IsEntityDead(ped) then SetPedToRagdoll(ped, 1, 1, 0, false, false, false) end
    end
end

local function clamp(v, lo, hi) return math.max(lo, math.min(hi, v)) end

local function blocked(ped)
    if inGrace() then return true end
    if FBRP.IsDowned and FBRP.IsDowned() then return true end
    if IsEntityDead(ped) or IsPedInParachuteFreeFall(ped) or GetPedParachuteState(ped) > 0 then return true end
    if IsEntityInWater(ped) and IsPedSwimming(ped) then return true end
    if IsPedInAnyVehicle(ped, false) then return true end
    return false
end

-- Knocks the ped over for `ms` and optionally shoves it with a world-space force.
function FBRP.Ragdoll.knock(ped, ms, force, bone)
    ped = ped or PlayerPedId()
    ms = clamp(math.floor(ms or 2000), R.minMs, R.maxMs)
    SetPedCanRagdoll(ped, true)
    SetPedToRagdoll(ped, ms, ms, 0, false, false, false)
    ragdollUntil = GetGameTimer() + ms
    if force then
        ApplyForceToEntity(ped, 1, force.x, force.y, force.z, 0.0, 0.0, 0.0, bone or 0, false, true, true, false, true)
    end
    FBRP.Ragdoll.watchGetUp(ped, ms)
end

-- Lets a player who has stopped tumbling press SPACE to get up before the timer ends.
local watching = false
function FBRP.Ragdoll.watchGetUp(ped, ms)
    if watching then return end
    watching = true
    CreateThread(function()
        local started = GetGameTimer()
        while GetGameTimer() < ragdollUntil do
            Wait(0)
            local p = PlayerPedId()
            if not IsPedRagdoll(p) or IsEntityDead(p) then break end
            local elapsed = GetGameTimer() - started
            if elapsed > R.getUpAfterMs and GetEntitySpeed(p) < 1.2 and IsControlJustPressed(0, 22)
                and not (FBRP.IsDowned and FBRP.IsDowned()) then
                SetPedToRagdoll(p, 1, 1, 0, false, false, false)
                break
            end
        end
        watching = false
    end)
end

-- Throws an ejected occupant along `velocity` for a few frames: the ragdoll start resets the
-- ped's velocity, so it is re-applied until the body is clear of the car.
function FBRP.Ragdoll.launch(ped, velocity, ms, lift)
    FBRP.Ragdoll.knock(ped, ms or 3500)
    local fling = vector3(velocity.x * 0.9, velocity.y * 0.9, math.max(velocity.z, 0.0) + (lift or 2.5))
    for _ = 1, 8 do
        SetEntityVelocity(ped, fling.x, fling.y, fling.z)
        Wait(0)
    end
    -- A little spin so the body tumbles instead of sliding flat.
    ApplyForceToEntity(ped, 3, 0.0, 0.0, 0.0, rand(-40, 40) / 10.0, rand(-40, 40) / 10.0, rand(-20, 20) / 10.0, 0, false, true, true, false, true)
end

local function weaponGroupOf(attacker)
    if attacker == 0 or not DoesEntityExist(attacker) or not IsEntityAPed(attacker) then return nil, nil end
    local weapon = GetSelectedPedWeapon(attacker)
    return GetWeapontypeGroup(weapon), weapon
end

-- Turns one damage event into a stumble, knock-down or hard knockback.
local function reactToDamage(ped, damage, attacker, bone)
    if damage < 3 or blocked(ped) then return end
    local now = GetGameTimer()
    local heavy = damage >= R.heavyHitDamage
    if not heavy and (now - lastHitRagdoll < R.hitCooldownMs or now < ragdollUntil) then return end

    local group, weapon = weaponGroupOf(attacker)
    if weapon == STUN_GUN then return end -- tasers already drop people

    local struckByVehicle = attacker ~= 0 and DoesEntityExist(attacker) and IsEntityAVehicle(attacker)
    local leg = LEG_BONES[bone] == true
    local head = HEAD_BONES[bone] == true
    local meleeHit = group == WEAPON_GROUP.melee or group == WEAPON_GROUP.unarmed

    local score = damage
    if group == WEAPON_GROUP.shotgun then score = score * 1.6
    elseif group == WEAPON_GROUP.sniper or group == WEAPON_GROUP.heavy then score = score * 1.8
    elseif group == WEAPON_GROUP.mg then score = score * 1.2 end
    if leg then score = score * 1.7 elseif head then score = score * 1.15 end
    if meleeHit then score = score * 0.8 end

    local threshold = leg and 14 or 32
    if struckByVehicle then
        local speed = GetEntitySpeed(attacker)
        if speed < 3.0 then return end
        score = math.max(score, speed * 7.0)
    elseif score < threshold then
        return
    end

    local ms = clamp(700 + score * 38, R.minMs, R.maxMs)
    if leg then ms = ms * 1.25 end

    local force
    local origin
    if attacker ~= 0 and DoesEntityExist(attacker) then origin = GetEntityCoords(attacker) end
    if origin then
        local push = GetEntityCoords(ped) - origin
        push = vector3(push.x, push.y, 0.0)
        local len = #push
        if len > 0.01 then
            push = push / len
            local magnitude = clamp(score * 0.09, 1.5, 22.0)
            if struckByVehicle then magnitude = clamp(GetEntitySpeed(attacker) * 1.4, 6.0, 38.0) end
            if meleeHit then magnitude = magnitude * 0.6 end
            force = vector3(push.x * magnitude, push.y * magnitude, magnitude * (struckByVehicle and 0.55 or 0.25))
        end
    end

    lastHitRagdoll = now
    FBRP.Ragdoll.knock(ped, ms, force, 0)
end

-- FiveM has no "source of damage" native for living peds, so find the entity that last hurt
-- this ped: a nearby vehicle first (hit and run), then any ped (gunfire and melee).
local function damageSource(ped)
    local mine = GetEntityCoords(ped)
    for _, vehicle in ipairs(GetGamePool('CVehicle')) do
        if #(GetEntityCoords(vehicle) - mine) < 15.0 and HasEntityBeenDamagedByEntity(ped, vehicle, true) then return vehicle end
    end
    for _, other in ipairs(GetGamePool('CPed')) do
        if other ~= ped and #(GetEntityCoords(other) - mine) < 300.0 and HasEntityBeenDamagedByEntity(ped, other, true) then return other end
    end
    return 0
end

CreateThread(function()
    local ped = PlayerPedId()
    local health = GetEntityHealth(ped)
    while true do
        Wait(0)
        local p = PlayerPedId()
        if p ~= ped then ped = p; health = GetEntityHealth(p) end
        local now = GetEntityHealth(ped)
        if now < health and now > 0 then
            local attacker = damageSource(ped)
            local ok, bone = GetPedLastDamageBone(ped)
            reactToDamage(ped, health - now, attacker, ok and bone or 0)
            ClearPedLastDamageBone(ped)
            ClearEntityLastDamageEntity(ped)
        end
        health = now
    end
end)

-- Hard landings: remember the fastest downward speed of the fall and, on touchdown,
-- knock the player over for longer the harder they hit.
CreateThread(function()
    local fastest = 0.0
    local fallInGrace = false
    while true do
        local ped = PlayerPedId()
        if IsPedFalling(ped) and not IsPedInParachuteFreeFall(ped) and GetPedParachuteState(ped) < 1 then
            if fastest == 0.0 then fallInGrace = inGrace() end -- fall just started
            fastest = math.min(fastest, GetEntityVelocity(ped).z)
            Wait(0)
        else
            if fastest < -R.landingSpeed and not fallInGrace and not blocked(ped) and not IsPedRagdoll(ped) then
                local speed = -fastest
                local ms = clamp((speed - R.landingSpeed + 2.0) * 420, 900, 5500)
                local dir = GetEntityVelocity(ped)
                FBRP.Ragdoll.knock(ped, ms, vector3(dir.x * 0.5, dir.y * 0.5, 0.0), 0)
            end
            fastest = 0.0
            fallInGrace = false
            Wait(IsPedFalling(ped) and 0 or 100)
        end
    end
end)

exports('RagdollPlayer', function(ms) FBRP.Ragdoll.knock(PlayerPedId(), ms or 3000) end)

---------------------------------------------------------------- settling detection

-- spawning / picking a character
AddEventHandler('playerSpawned', function() FBRP.Ragdoll.grace(GRACE.spawn) end)
AddEventHandler('fbrp:characterSpawned', function() FBRP.Ragdoll.grace(GRACE.spawn) end)
AddEventHandler('onClientResourceStart', function(resource)
    if resource == GetCurrentResourceName() then FBRP.Ragdoll.grace(GRACE.spawn) end
end)

-- noclip (txAdmin, vMenu, fbrp_core), model changes and teleports
local function inNoclip(ped)
    if LocalPlayer.state['fbrp:noclip'] == true then return true end
    if not IsEntityVisible(ped) or GetEntityAlpha(ped) < 255 then return true end -- txAdmin/vMenu noclip hide you
    if GetEntityCollisionDisabled(ped) or IsEntityPositionFrozen(ped) then return true end
    return false
end

CreateThread(function()
    local lastPed, lastPos = PlayerPedId(), GetEntityCoords(PlayerPedId())
    while true do
        Wait(100)
        local ped = PlayerPedId()
        local pos = GetEntityCoords(ped)
        if ped ~= lastPed then
            FBRP.Ragdoll.grace(GRACE.spawn) -- new ped = spawned / changed model
        elseif inNoclip(ped) then
            FBRP.Ragdoll.grace(GRACE.noclip) -- keeps renewing while in noclip, lasts 5s after leaving it
        elseif #(pos - lastPos) > 30.0 and not IsPedInAnyVehicle(ped, false) then
            FBRP.Ragdoll.grace(GRACE.teleport) -- moved 30m+ in 0.1s on foot = teleported
        end
        lastPed, lastPos = ped, pos
    end
end)
