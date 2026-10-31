-- Centre-screen announcements sent with /announcement (server/main.lua). The NUI queues
-- overlapping announcements, so the client only relays the payload and plays the chime.

RegisterNetEvent('fbrp:announcement:show', function(payload)
    if type(payload) ~= 'table' or type(payload.message) ~= 'string' or payload.message == '' then return end
    local tone = payload.tone
    if tone ~= 'warning' and tone ~= 'urgent' then tone = 'info' end
    SendNUIMessage({ type = 'announcement', message = payload.message:sub(1, 240), tone = tone })
    PlaySoundFrontend(-1, tone == 'urgent' and 'TIMER_STOP' or 'CONFIRM_BEEP', 'HUD_MINI_GAME_SOUNDSET', true)
end)
