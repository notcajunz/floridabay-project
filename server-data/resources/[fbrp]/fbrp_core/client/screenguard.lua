-- Screen guard. A dark or grey screen after spawning means something the game
-- opened (pause menu, player switch, fade, post effect, camera, loading screen)
-- was never closed. Anything stuck is cleared and reported to the server log.
-- /screendiag reports on demand and saves one game-frame capture on the server;
-- screenshot-basic captures the game render without NUI pages, so a bright
-- capture of a dark screen means the darkness is a UI layer, not the game.
local lastSpawn = 0
local since = {}
local lastFix = 0
-- A scripted spawn fades out and waits on model and collision streaming, which
-- can take well over the fade limit on a cold client. Not a stuck screen.
local graceUntil = 0

local POSTFX = {
    'DeathFailOut', 'DeathFailNeutralIn', 'DeathFailMPDark', 'DeathFailMPIn',
    'SwitchHUDIn', 'SwitchHUDOut', 'SwitchShortNeutralIn', 'SwitchShortMichaelIn',
    'SwitchShortFranklinIn', 'SwitchShortTrevorIn', 'SwitchOpenMichaelIn',
    'SwitchOpenFranklinIn', 'SwitchOpenTrevorIn', 'MenuMGHeistIn', 'MenuMGSelectionIn',
    'MenuMGTournamentIn', 'FocusIn', 'FocusOut', 'MP_Celeb_Lose', 'MP_Celeb_Win',
}

local function try(fn, ...)
    if type(fn) ~= 'function' then return nil end
    local ok, value = pcall(fn, ...)
    if ok then return value end
    return nil
end

-- Some BOOL natives come back as 1/0 instead of true/false.
local function yes(value)
    return value == true or (type(value) == 'number' and value ~= 0)
end

local function check(fn, ...)
    return yes(try(fn, ...))
end

local function snapshot()
    local ped = PlayerPedId()
    local running = {}
    for _, name in ipairs(POSTFX) do
        if check(AnimpostfxIsRunning, name) then running[#running + 1] = name end
    end
    local pos = GetEntityCoords(ped)
    local cam = try(GetFinalRenderedCamCoord) or try(GetGameplayCamCoord)
    return {
        fadedIn = check(IsScreenFadedIn), fadedOut = check(IsScreenFadedOut),
        fadingIn = check(IsScreenFadingIn), fadingOut = check(IsScreenFadingOut),
        pause = check(IsPauseMenuActive), switch = check(IsPlayerSwitchInProgress),
        switchState = try(GetPlayerSwitchState) or -1,
        nuiFocus = check(IsNuiFocused),
        timecycle = try(GetTimecycleModifierIndex) or -1,
        tcTransition = try(GetTimecycleTransitionModifierIndex) or -1,
        postfx = #running > 0 and table.concat(running, ',') or 'none',
        gameplayCam = check(IsGameplayCamRendering),
        cinematicCam = check(IsCinematicCamRendering),
        renderingCam = try(GetRenderingCam) or -1,
        camDist = cam and math.floor(#(cam - pos) * 10) / 10 or -1,
        spectating = check(NetworkIsInSpectatorMode),
        loadingScreen = check(GetIsLoadingScreenActive),
        cutscene = check(IsCutsceneActive),
        nightvision = check(GetUsingnightvision), seethrough = check(GetUsingseethrough),
        control = check(IsPlayerControlOn, PlayerId()),
        playing = check(IsPlayerPlaying, PlayerId()),
        hudHidden = check(IsHudHidden), radarHidden = check(IsRadarHidden),
        health = GetEntityHealth(ped), dead = check(IsEntityDead, ped),
        visible = check(IsEntityVisible, ped), frozen = check(IsEntityPositionFrozen, ped),
        alpha = try(GetEntityAlpha, ped) or -1,
        interior = try(GetInteriorFromEntity, ped) or 0,
        loadScene = check(IsNewLoadSceneActive),
        loadingPrompt = check(IsLoadingPromptBeingDisplayed),
        sinceSpawnMs = lastSpawn > 0 and (GetGameTimer() - lastSpawn) or -1,
        hour = GetClockHours(),
        pos = ('%.1f,%.1f,%.1f'):format(pos.x, pos.y, pos.z),
    }
end

local function report(reason)
    TriggerServerEvent('fbrp:screen:report', reason, snapshot())
end

local function capture(reason)
    if GetResourceState('screenshot-basic') ~= 'started' then return end
    exports['screenshot-basic']:requestScreenshot({ encoding='jpg', quality=0.7 }, function(data)
        if type(data) == 'string' and #data < 2500000 then
            TriggerLatentServerEvent('fbrp:screen:capture', 250000, reason, data)
        end
    end)
end

local function clearAll(reason)
    TriggerServerEvent('fbrp:screen:report', 'fix:' .. reason, snapshot())
    lastFix = GetGameTimer()
    local ped = PlayerPedId()

    if check(GetIsLoadingScreenActive) then ShutdownLoadingScreen() end
    try(ShutdownLoadingScreenNui)
    if check(IsPlayerSwitchInProgress) then try(StopPlayerSwitch) end
    if check(IsPauseMenuActive) then
        try(SetFrontendActive, false)
        try(SetPauseMenuActive, false)
    end
    if check(NetworkIsInSpectatorMode) then NetworkSetInSpectatorMode(false, ped) end
    if not check(IsGameplayCamRendering) then RenderScriptCams(false, false, 0, true, true) end
    try(SetNightvision, false)
    try(SetSeethrough, false)
    ClearTimecycleModifier()
    try(ClearExtraTimecycleModifier)
    AnimpostfxStopAll()
    try(TriggerScreenblurFadeOut, 0.0)
    try(ResetPausedRenderphases)
    if not check(IsPlayerControlOn, PlayerId()) then SetPlayerControl(PlayerId(), true, 0) end
    if not check(IsScreenFadedIn) then DoScreenFadeIn(400) end
end

-- True once `condition` has held continuously for `ms`.
local function held(key, condition, ms)
    if not condition then since[key] = nil return false end
    since[key] = since[key] or GetGameTimer()
    return GetGameTimer() - since[key] >= ms
end

AddEventHandler('playerSpawned', function()
    lastSpawn = GetGameTimer()
end)

AddEventHandler('fbrp:screen:expect', function(ms)
    graceUntil = ms and ms > 0 and GetGameTimer() + math.min(ms, 90000) or 0
    since.fade = nil
end)

AddEventHandler('fbrp:screen:fix', function()
    clearAll('command')
    SetTimeout(1500, function() report('after-fix') capture('after-fix') end)
end)

RegisterCommand('screendiag', function()
    report('command')
    capture('command')
    lib.notify({ description = 'Screen state sent to the server log.', type = 'info' })
end, false)

CreateThread(function()
    while not NetworkIsSessionStarted() do Wait(500) end
    while true do
        Wait(500)
        -- The character selector and the pause menu are deliberate screens: the
        -- selector sits over a held ped and the pause menu runs its own blur,
        -- timecycle and camera. Clearing them was closing the pause menu and
        -- re-running fades and post effects behind the selector.
        local selecting = FBRP.CharacterSelecting == true
        local paused = check(IsPauseMenuActive)
        if selecting or paused then
            since = {}
            goto continue
        end

        local postSpawn = lastSpawn > 0 and GetGameTimer() - lastSpawn < 45000
        local cooled = GetGameTimer() - lastFix > 4000

        -- A fade left part way: scripted teleports finish theirs in under 8s.
        local fade = held('fade', not check(IsScreenFadedIn) and GetGameTimer() >= graceUntil, 12000)
        local switch = held('switch', check(IsPlayerSwitchInProgress), 4000)
        -- The game's own cinematic camera (idle camera after ~30s without input,
        -- vehicle cinematic camera) replaces the gameplay camera and is not stuck.
        local stuck = postSpawn and held('stuck', check(GetIsLoadingScreenActive)
            or check(NetworkIsInSpectatorMode)
            or not check(IsGameplayCamRendering) and not check(IsCinematicCamRendering)
                and (try(GetRenderingCam) or -1) == -1
            or (try(GetTimecycleModifierIndex) or -1) ~= -1
            or snapshot().postfx ~= 'none', 1500)

        if cooled and (fade or switch or stuck) then
            local why = fade and 'fade' or switch and 'switch' or 'stuck'
            clearAll(why)
            since = {}
        end
        ::continue::
    end
end)
