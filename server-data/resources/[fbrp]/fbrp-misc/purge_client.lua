-- Purge broadcast: big "EMERGENCY BROADCAST" message + siren when DeathScript's /purge is switched on.
-- (No NPC blocking here, so fbrp_core's traffic and pedestrians stay.)
local cfg = MiscConfig
local Purge = false
local AnnouncementActive = false

exports("Purge", function() return Purge end)

local function PlayPurgeSound()
    if GetResourceState("xsound") == "started" then
        local ok = pcall(function() exports.xsound:PlayUrl("purge_sound", cfg.PurgeSoundUrl, 1.0, false) end)
        if ok then return end
    end
    PlaySoundFrontend(-1, "Bed", "WastedSounds", true) -- fallback if xsound isn't installed
end

local function ShowAnnouncement()
    CreateThread(function()
        local scaleform = RequestScaleformMovie("mp_big_message_freemode")
        local untilAt = GetGameTimer() + 3000
        while not HasScaleformMovieLoaded(scaleform) and GetGameTimer() < untilAt do Wait(0) end
        if not HasScaleformMovieLoaded(scaleform) then return end
        PushScaleformMovieFunction(scaleform, "SHOW_SHARD_WASTED_MP_MESSAGE")
        PushScaleformMovieFunctionParameterString(cfg.PurgeTitle)
        PushScaleformMovieFunctionParameterString(cfg.PurgeText)
        PopScaleformMovieFunctionVoid()
        while AnnouncementActive do
            DrawScaleformMovieFullscreen(scaleform, 255, 255, 255, 255, 0)
            Wait(0)
        end
        SetScaleformMovieAsNoLongerNeeded(scaleform)
    end)
end

local function startPurge(announce)
    Purge = true
    if not announce then return end
    PlayPurgeSound()
    AnnouncementActive = true
    ShowAnnouncement()
    SetTimeout(12500, function() AnnouncementActive = false end)
end

-- DeathScript's /purge on|off
RegisterNetEvent("DeathScript:TogglePurge", function(on)
    if on and not Purge then
        startPurge(true)
    elseif not on then
        Purge = false
        AnnouncementActive = false
        if GetResourceState("xsound") == "started" then pcall(function() exports.xsound:Destroy("purge_sound") end) end
    end
end)

-- old event name still works
RegisterNetEvent("Purge:Start", function(action)
    if action == "sound" then startPurge(true) end
end)
