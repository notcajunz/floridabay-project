-- Tackle: sprint at someone and press G (rebindable)
local cfg = MiscConfig
local cooldown = false

local function notify(title, description, kind)
    lib.notify({ id = "tackle_notify", title = title, description = description, type = kind or "error", position = cfg.NotifyPosition, duration = 4000 })
end

local function Restricted(ped)
    if GetPedConfigFlag(ped, 78, true) then return true end -- aiming
    if IsPlayerFreeAiming(PlayerId()) then return true end
    local state = LocalPlayer.state
    if state.dead or state.knockedout or state["fbrp:downed"] then return true end
    if state["fbrp:restrained"] or state["fbrp:jailed"] or state["fbrp:staffJailed"] then return true end
    if IsEntityAttached(ped) then return true end -- being escorted / piggybacked
    return false
end

local function getTouchedPlayers(ped)
    local touched = {}
    for _, player in ipairs(GetActivePlayers()) do
        if player ~= PlayerId() and IsEntityTouchingEntity(ped, GetPlayerPed(player)) then
            touched[#touched + 1] = player
        end
    end
    return touched
end

RegisterCommand("tackle", function()
    local ped = PlayerPedId()
    if IsPedInAnyVehicle(ped, false) then return end
    if cooldown then return notify("Too Fast", "You need to wait between tackles!") end
    if Restricted(ped) or not IsPedSprinting(ped) then return end

    local forward = GetEntityForwardVector(ped)
    SetPedToRagdollWithFall(ped, 1000, 1500, 0, forward.x, forward.y, forward.z, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0)

    cooldown = true
    SetTimeout(cfg.TackleCooldown, function() cooldown = false end)

    -- while we're flying forward, tackle whoever we touch (once each)
    local tackled = {}
    local untilAt = GetGameTimer() + 2000
    while IsPedRagdoll(ped) and GetGameTimer() < untilAt do
        for _, player in ipairs(getTouchedPlayers(ped)) do
            if not tackled[player] then
                tackled[player] = true
                TriggerServerEvent("FBRP:Tackle:TacklePlayer", GetPlayerServerId(player), { x = forward.x, y = forward.y, z = forward.z })
            end
        end
        Wait(0)
    end
end, false)

RegisterKeyMapping("tackle", "Tackle (while sprinting)", "keyboard", cfg.TackleKey)

RegisterNetEvent("FBRP:Tackle:Tackled", function(forward)
    local ped = PlayerPedId()
    forward = forward or GetEntityForwardVector(ped)
    SetPedToRagdollWithFall(ped, cfg.TackledDownMs, cfg.TackledDownMs, 0, forward.x, forward.y, forward.z, 10.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0)
end)
