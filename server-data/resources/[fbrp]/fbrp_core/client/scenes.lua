-- Community scene directory and event routing.
RegisterCommand('scenehost', function(_, args)
    local title = table.concat(args, ' ')
    if #title < 4 then
        TriggerEvent('fbrp:notify', 'Usage: /scenehost <scene title>', 'error')
        return
    end
    TriggerServerEvent('fbrp:scenes:create', title, 'Open roleplay scene · everyone is welcome.')
end, false)

RegisterCommand('scenes', function()
    TriggerServerEvent('fbrp:scenes:request')
end, false)

RegisterCommand('sceneend', function() TriggerServerEvent('fbrp:scenes:endMine') end, false)

RegisterCommand('eventgo', function()
    local event = GlobalState['fbrp:event']
    if not event then return TriggerEvent('fbrp:notify', 'No community event is active right now.', 'info') end
    if event.coords then
        SetNewWaypoint(event.coords.x + 0.0, event.coords.y + 0.0)
        TriggerEvent('fbrp:notify', ('Route set: %s'):format(event.title or 'Community event'), 'success')
    else
        TriggerEvent('fbrp:notify', ('%s · %s'):format(event.title or 'Community event', event.location or 'Check chat for details.'), 'info')
    end
end, false)

RegisterNetEvent('fbrp:scenes:data', function(data)
    FBRP.OpenMenu('scenes', data)
end)

RegisterNetEvent('fbrp:scenes:waypoint', function(coords, title)
    SetNewWaypoint(coords.x + 0.0, coords.y + 0.0)
    TriggerEvent('fbrp:notify', ('Route set to %s.'):format(title or 'scene'), 'success')
end)

RegisterNetEvent('fbrp:event:update', function(event)
    if event then TriggerEvent('fbrp:notify', ('Community event: %s'):format(event.title), 'success') end
end)

RegisterNUICallback('sceneWaypoint', function(data, cb)
    TriggerServerEvent('fbrp:scenes:route', tonumber(data.id))
    cb({ ok=true })
end)

RegisterNUICallback('eventWaypoint', function(_, cb)
    ExecuteCommand('eventgo')
    cb({ ok=true })
end)
