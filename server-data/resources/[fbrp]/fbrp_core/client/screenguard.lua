-- Screen guard. A dark or grey screen after spawning means something the game
-- opened (pause menu, player switch, fade, post effect, camera, loading screen)
-- was never closed. Anything stuck is cleared and reported to the server log.
-- /screendiag reports on demand and saves one game-frame capture on the server;
-- screenshot-basic captures the game render without NUI pages, so a bright
-- capture of a dark screen means the darkness is a UI layer, not the game.
local lastSpawn = 0
local since = {}
local lastFix = 0

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

AddEventHandler('fbrp:screen:fix', function()
    clearAll('command')
    SetTimeout(1500, function() report('after-fix') capture('after-fix') end)
end)

RegisterCommand('screendiag', function()
    report('command')
    capture('command')
    TriggerEvent('fbrp:notify', 'Screen state sent to the server log.', 'info')
end, false)

CreateThread(function()
    while not NetworkIsSessionStarted() do Wait(500) end
    while true do
        Wait(500)
        local postSpawn = lastSpawn > 0 and GetGameTimer() - lastSpawn < 45000
        local cooled = GetGameTimer() - lastFix > 4000

        -- A fade left part way: scripted teleports finish theirs in under 8s.
        local fade = held('fade', not check(IsScreenFadedIn), 12000)
        local switch = held('switch', check(IsPlayerSwitchInProgress), 4000)
        -- Only inside the spawn window, so players can still open the map later.
        local pause = held('pause', postSpawn and check(IsPauseMenuActive), 1500)
        local stuck = postSpawn and held('stuck', check(GetIsLoadingScreenActive)
            or check(NetworkIsInSpectatorMode)
            or not check(IsGameplayCamRendering) and (try(GetRenderingCam) or -1) == -1
            or (try(GetTimecycleModifierIndex) or -1) ~= -1
            or snapshot().postfx ~= 'none', 1500)

        if cooled and (fade or switch or pause or stuck) then
            local why = fade and 'fade' or switch and 'switch' or pause and 'pause' or 'stuck'
            clearAll(why)
            since = {}
        end
    end
end)
