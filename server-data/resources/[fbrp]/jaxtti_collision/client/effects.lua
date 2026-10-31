Effects = {}

local dazedUntil, blurUntil = 0, 0
local dazedActive, blurActive = false, false
local hudHiddenByUs = false
local DAZED_CLIPSET = 'move_m@drunk@verydrunk'

local function nui(action, data) SendNUIMessage({ action = action, data = data }) end

function Effects.impact(strength)
    nui('impact', { strength = strength })
    ShakeGameplayCam('SMALL_EXPLOSION_SHAKE', strength)
end

function Effects.sound(name, opts)
    opts = opts or {}
    opts.name = name
    opts.volume = (opts.volume or 1.0) * Config.Volume
    nui('sound', opts)
end

function Effects.blur(ms)
    if ms <= 0 then return end
    blurUntil = math.max(blurUntil, GetGameTimer() + ms)
    if not blurActive then
        blurActive = true
        TriggerScreenblurFadeIn(400)
    end
end

function Effects.dazed(ms, heartbeat)
    if ms <= 0 then return end
    local now = GetGameTimer()
    dazedUntil = math.max(dazedUntil, now + ms)
    nui('vignette', { strength = heartbeat and 0.9 or 0.6, pulse = heartbeat, ms = dazedUntil - now })
    if heartbeat then Effects.sound('heartbeat', { loop = true, volume = 0.9 }) end
    if not dazedActive then
        dazedActive = true
        ShakeGameplayCam('DRUNK_SHAKE', heartbeat and 1.4 or 0.8)
    end
end

function Effects.blackout(ms)
    if ms <= 0 then return end
    CreateThread(function()
        if Config.HideHudOnBlackout and GetResourceState('jaxtti_hud') == 'started' then
            local ok, visible = pcall(function() return exports.jaxtti_hud:IsVisible() end)
            if ok and visible then
                hudHiddenByUs = true
                exports.jaxtti_hud:SetHidden(true)
            end
        end
        DoScreenFadeOut(150)
        Wait(ms)
        DoScreenFadeIn(math.min(3000, 800 + ms // 2))
        if hudHiddenByUs then
            hudHiddenByUs = false
            pcall(function() exports.jaxtti_hud:SetHidden(false) end)
        end
    end)
end

function Effects.isDazed() return GetGameTimer() < dazedUntil end

function Effects.clear()
    dazedUntil, blurUntil = 0, 0
    nui('clear')
    if blurActive then TriggerScreenblurFadeOut(500) blurActive = false end
    if dazedActive then
        StopGameplayCamShaking(false)
        ResetPedMovementClipset(cache.ped, 1.0)
        dazedActive = false
    end
    if IsScreenFadedOut() then DoScreenFadeIn(500) end
    if hudHiddenByUs then
        hudHiddenByUs = false
        pcall(function() exports.jaxtti_hud:SetHidden(false) end)
    end
end

CreateThread(function()
    local clipsetOn = false
    while true do
        local now = GetGameTimer()
        local sleep = 500

        if blurActive and now >= blurUntil then
            blurActive = false
            TriggerScreenblurFadeOut(1500)
        end

        if dazedActive then
            sleep = 250
            local ped = cache.ped
            local left = dazedUntil - now
            if left <= 0 then
                dazedActive = false
                StopGameplayCamShaking(false)
                nui('stop', { name = 'heartbeat' })
                if clipsetOn then ResetPedMovementClipset(ped, 1.0) clipsetOn = false end
            else
                SetGameplayCamShakeAmplitude(math.max(0.2, math.min(1.4, left / 5000)))
                local onFoot = not IsPedInAnyVehicle(ped, false)
                if onFoot and not clipsetOn then
                    lib.requestAnimSet(DAZED_CLIPSET)
                    SetPedMovementClipset(ped, DAZED_CLIPSET, 0.5)
                    clipsetOn = true
                elseif not onFoot and clipsetOn then
                    ResetPedMovementClipset(ped, 1.0)
                    clipsetOn = false
                end
                if onFoot then
                    DisableControlAction(0, 21, true)
                    DisableControlAction(0, 22, true)
                    sleep = 0
                end
            end
        end
        Wait(sleep)
    end
end)
