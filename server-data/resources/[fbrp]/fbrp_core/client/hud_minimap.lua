-- The HUD draws its border around the normal GTA minimap and hides the built-in health / armour bars.
-- Anything of the map that leaks outside the border is covered by the HUD's bezel (HudConfig.Minimap.bezel).
-- No mask textures or minimap components are changed: GTA's own minimap is kept as-is.

local minimapStyled = false

-- undo any minimap changes from older builds (square mask / blur size) and let GTA rebuild the map once
local function styleMinimap()
    RemoveReplaceTexture('platform:/textures/graphics', 'radarmasksm')
    RemoveReplaceTexture('platform:/textures/graphics', 'radarmask1g')
    SetMinimapComponentPosition('minimap_blur', 'L', 'B', -0.03, 0.022, 0.266, 0.237)  -- GTA default
    SetRadarBigmapEnabled(true, false)
    Wait(0)
    SetRadarBigmapEnabled(false, false)
    minimapStyled = true
end

local minimapMovie = nil

local function loadMovie()
    if minimapMovie and HasScaleformMovieLoaded(minimapMovie) then return true end
    minimapMovie = RequestScaleformMovie('minimap')
    local tries = 0
    while not HasScaleformMovieLoaded(minimapMovie) and tries < 50 do Wait(10) tries = tries + 1 end
    return HasScaleformMovieLoaded(minimapMovie)
end

local function hideHealthBars()
    if not loadMovie() then return end
    BeginScaleformMovieMethod(minimapMovie, 'SETUP_HEALTH_ARMOUR')
    ScaleformMovieMethodAddParamInt(3)
    EndScaleformMovieMethod()
end

CreateThread(function()
    while not NetworkIsSessionStarted() do Wait(250) end
    hideHealthBars()
    while true do
        if not IsRadarHidden() then
            -- keep the small map unless the player is holding the expand key (Z)
            if IsBigmapActive() and not IsControlPressed(0, 20) then SetBigmapActive(false, false) end
            BeginScaleformMovieMethod(minimapMovie, 'SETUP_HEALTH_ARMOUR')
            ScaleformMovieMethodAddParamInt(3)
            EndScaleformMovieMethod()
            Wait(0)
        else
            Wait(250)
        end
    end
end)

-- where GTA draws the minimap, 0-1 of the screen
local function minimapRect()
    local safezone = GetSafeZoneSize()
    local aspect = GetAspectRatio(false)
    local resX, resY = GetActiveScreenResolution()
    local xscale, yscale = 1.0 / resX, 1.0 / resY
    local w = xscale * (resX / (4 * aspect))
    local h = yscale * (resY / 5.674)
    local margin = (math.abs(safezone - 1.0) * 10) / 20
    local left = xscale * (resX * margin)
    local bottom = 1.0 - yscale * (resY * margin)
    return { x = left, y = bottom - h, w = w, h = h }
end

local lastKey = nil
FBRPHud.minimapResend = function() lastKey = nil end

CreateThread(function()
    while not NetworkIsSessionStarted() do Wait(250) end
    Wait(1500)
    styleMinimap()
    hideHealthBars()
    local lastRes = nil
    while true do
        local inVeh = IsPedInAnyVehicle(PlayerPedId(), false)
        local want = (FBRPHud.visible and (inVeh or FBRPHud.settings.minimapOnFoot == true)) or FBRPHud.settingsOpen
        if want ~= FBRPHud.radar or (IsRadarHidden() == want) then
            FBRPHud.radar = want
            DisplayRadar(want)
        end
        local rx, ry = GetActiveScreenResolution()
        local r = minimapRect()
        local key = ('%.4f|%.4f|%.4f|%.4f|%s'):format(r.x, r.y, r.w, r.h, tostring(want))
        if key ~= lastKey then
            lastKey = key
            r.show = want
            FBRPHud.send('minimapFrame', r)
        end
        if lastRes ~= rx .. 'x' .. ry then
            -- resolution changed: GTA rebuilds the map, so style it again
            if lastRes and minimapStyled then styleMinimap() end
            lastRes = rx .. 'x' .. ry
            hideHealthBars()
        end
        Wait(want and 250 or 500)
    end
end)

AddEventHandler('onResourceStop', function(res)
    if res ~= GetCurrentResourceName() then return end
    RemoveReplaceTexture('platform:/textures/graphics', 'radarmasksm')
    RemoveReplaceTexture('platform:/textures/graphics', 'radarmask1g')
    SetMinimapComponentPosition('minimap_blur', 'L', 'B', -0.03, 0.022, 0.266, 0.237)  -- GTA default
    DisplayRadar(true)
end)
