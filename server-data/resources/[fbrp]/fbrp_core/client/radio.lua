local radioMenuOpen = false

RegisterCommand('radio', function() TriggerServerEvent('fbrp:radio:request') end, false)
RegisterCommand('radiomenu', function() ExecuteCommand('radio') end, false)
RegisterKeyMapping('radio', 'Open Florida Bay radio', 'keyboard', 'F10')

RegisterNetEvent('fbrp:radio:data', function(data)
    radioMenuOpen = true
    FBRP.OpenMenu('radio', data or {})
end)

RegisterNUICallback('radioAction', function(data, cb)
    local action = tostring(data.action or '')
    if action == 'join' then
        TriggerServerEvent('fbrp:radio:join', tonumber(data.channel))
    elseif action == 'leave' then
        TriggerServerEvent('fbrp:radio:leave')
    elseif action == 'refresh' then
        TriggerServerEvent('fbrp:radio:request')
    elseif action == 'volume' then
        local volume = math.max(0, math.min(100, math.floor(tonumber(data.value) or 30)))
        exports['pma-voice']:setRadioVolume(volume)
        LocalPlayer.state:set('fbrp:radioVolume', volume, false)
    end
    cb({ok=true})
end)

AddEventHandler('pma-voice:radioActive', function(active)
    SendNUIMessage({type='radioTalking',active=active == true})
end)

AddStateBagChangeHandler('radioChannel', nil, function(bagName)
    if bagName == ('player:%s'):format(GetPlayerServerId(PlayerId())) and radioMenuOpen and FBRP.IsMenuOpen() then
        SetTimeout(250, function() TriggerServerEvent('fbrp:radio:request') end)
    end
end)

AddEventHandler('fbrp:menuClosed', function() radioMenuOpen = false end)

CreateThread(function()
    while true do
        if radioMenuOpen and FBRP.IsMenuOpen() then
            Wait(2000)
            if radioMenuOpen and FBRP.IsMenuOpen() then TriggerServerEvent('fbrp:radio:request') end
        else
            Wait(500)
        end
    end
end)
