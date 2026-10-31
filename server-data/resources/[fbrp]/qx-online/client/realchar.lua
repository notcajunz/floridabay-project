local cooldown = 30 -- 30 sec don't touch
local lastUsed = 0 -- no  no touchyyy

TriggerEvent('chat:addSuggestion', '/realchar', 'Reset your character if your UI or Character its-self is bugged.')
local function resetCharacter()
    local ped = PlayerPedId()

    -- fade out first so the reset is hidden
    if not IsScreenFadedOut() then
        DoScreenFadeOut(500)
        local timeout = GetGameTimer() + 2000 -- safety so it never gets stuck black
        while not IsScreenFadedOut() and GetGameTimer() < timeout do
            Wait(0)
        end
    end

    -- NUI/UI
    SetNuiFocus(false, false) -- TODO:
    SetNuiFocusKeepInput(false)

    FreezeEntityPosition(ped, false)
    SetEntityVisible(ped, true, false)
    SetEntityCollision(ped, true, true)
    SetPlayerControl(PlayerId(), true, 0 --[[true = o --- online math.abs( x )]])

    -- cam stuff, like fade in ect...
    RenderScriptCams(false, false, 0, true, true)
    DestroyAllCams(true)

    -- animations
    if not IsPedInAnyVehicle(ped, false) then
        ClearPedTasks(ped)
    end

    -- hud // bring the stuff back for player
    DisplayRadar(true) -- FBRP hud radar
    DisplayHud(true)
    BusyspinnerOff()

    Wait(500) -- stay black for a sec so it feels like a reset
    DoScreenFadeIn(500) -- do not touch this plz thanks :)
end

RegisterCommand('realchar', function()
    local ped = PlayerPedId()
    local now = GetGameTimer()
    -- my death system is linked to this in (exports) -- making sure people don't use it to skip death...
    if IsEntityDead(ped) then
        lib.notify({
            title = 'FBRP Systems | Char Reset',
            description = "You can't use this while you're dead? what are you doing lol...",
            type = 'error',
            duration = 5000
        })
        return
    end
    local elapsed = now - lastUsed
    if lastUsed ~= 0 and elapsed < cooldown * 1000 then
        local secondsLeft = math.ceil((cooldown * 1000 - elapsed) / 1000)
        lib.notify({
            title = 'FBRP Systems | Char reset',
            description = ('Please wait %d seconds before using this again.'):format(secondsLeft),
            type = 'error',
            duration = 6000
        })
        return
    end

    -- clear any stuck progress bar from other scripts (common cause of bugged chars)
    if lib.progressActive() then
        lib.cancelProgress()
        Wait(250)
    end

    local finished = lib.progressCircle({
        duration = 2000,
        label = 'FBRP Systems | Char reset',
        position = 'bottom',
        useWhileDead = true, -- we already check death above w/ the real ped, ox cache.ped can be stale
        canCancel = true,
        allowRagdoll = true, -- bugged chars are usually stuck ragdolling, don't let that cancel it
        allowFalling = true,
        allowSwimming = true,
        allowCuffed = true,
        disable = { move = true, combat = true }
    })

    -- false = player pressed cancel, nil = ox_lib couldn't start it (char is bugged, reset anyway)
    if finished == false then
        lib.notify({
            title = 'FBRP | Char reset',
            description = 'Char reset cancelled...',
            type = 'error',
            duration = 4000
        })
        return
    end
    lastUsed = now
    resetCharacter()
    -- ox lib notify
    lib.notify({
        title = 'FBRP Systems | Char Reset',
        duration = 6000,
        description = 'Your UI and Char have been freeed...', -- no no touchyyyyyyyyyyyyyyyyyyyyyyy
        type = 'success'
    })

    lib.notify({ -- second notify
        title = 'FBRP Systems | Char System Alert',
        duration = 8000,
        description = 'Any problems? call admin...',
        type = 'warning',
    })
    print('[qx-online] char reset done - X Spazzer roblox god lol')
    print('[qx-online] Spazzer is a retard...')
    print('[qx-online] But all love... :)')

        end, false)