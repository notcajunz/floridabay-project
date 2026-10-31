-- FBRP HUD Notice | Made by Saif for Florida Bay Roleplay (FBRP)
-- Shows the notice ONCE per join, the first time the player presses W/A/S/D.
-- /disablehudmsg turns it off permanently for that player.

local KVP_KEY = 'fbrp_hudnotice_disabled'
local MOVE_KEYS = { 32, 33, 34, 35, 71, 72 } -- W, S, A, D (on foot) + accelerate/brake (vehicle)

local function isDisabled()
    return GetResourceKvpString(KVP_KEY) == '1'
end

local function chat(msg)
    TriggerEvent('chat:addMessage', { color = { 255, 122, 26 }, args = { 'FBRP', msg } })
end

RegisterCommand('disablehudmsg', function()
    SetResourceKvp(KVP_KEY, '1')
    SendNUIMessage({ action = 'hide' })
    chat('The HUD notice will no longer show for you.')
end, false)

CreateThread(function()
    if isDisabled() then return end

    -- wait until the player has actually loaded in
    while not NetworkIsPlayerActive(PlayerId()) do Wait(250) end
    while IsScreenFadedOut() or IsPlayerSwitchInProgress() or not IsPlayerControlOn(PlayerId()) do Wait(250) end

    -- wait for the first movement key press
    while true do
        Wait(0)
        if isDisabled() then return end
        for _, key in ipairs(MOVE_KEYS) do
            if IsControlJustPressed(0, key) or IsDisabledControlJustPressed(0, key) then
                SendNUIMessage({
                    action   = 'show',
                    title    = Config.Title,
                    message  = Config.Message,
                    duration = Config.Duration
                })
                return -- never again until the player rejoins
            end
        end
    end
end)
