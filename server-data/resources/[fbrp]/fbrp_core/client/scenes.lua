-- Community scene directory and event routing.
RegisterCommand('scenehost', function(_, args)
    local title = table.concat(args, ' ')
    if #title < 4 then
        lib.notify({ description = 'Usage: /scenehost <scene title>', type = 'error' })
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
    if not event then return lib.notify({ description = 'No community event is active right now.', type = 'info' }) end
    if event.coords then
        SetNewWaypoint(event.coords.x + 0.0, event.coords.y + 0.0)
        lib.notify({ description = ('Route set: %s'):format(event.title or 'Community event'), type = 'success' })
    else
        lib.notify({ description = ('%s · %s'):format(event.title or 'Community event', event.location or 'Check chat for details.'), type = 'info' })
    end
end, false)

RegisterNetEvent('fbrp:scenes:data', function(data)
    FBRP.OpenMenu('scenes', data)
end)

RegisterNetEvent('fbrp:scenes:waypoint', function(coords, title)
    SetNewWaypoint(coords.x + 0.0, coords.y + 0.0)
    lib.notify({ description = ('Route set to %s.'):format(title or 'scene'), type = 'success' })
end)

RegisterNetEvent('fbrp:event:update', function(event)
    if event then lib.notify({ description = ('Community event: %s'):format(event.title), type = 'success' }) end
end)

RegisterNUICallback('sceneWaypoint', function(data, cb)
    TriggerServerEvent('fbrp:scenes:route', tonumber(data.id))
    cb({ ok=true })
end)

RegisterNUICallback('eventWaypoint', function(_, cb)
    ExecuteCommand('eventgo')
    cb({ ok=true })
end)
