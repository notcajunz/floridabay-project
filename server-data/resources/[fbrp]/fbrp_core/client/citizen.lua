-- My Citizen: identity, details, ID card and license menu for civilians.

local function ui(message) SendNUIMessage(message) end

RegisterNetEvent('fbrp:citizen:open', function(payload)
    FBRP.OpenMenu('citizen', payload or {})
end)

RegisterNetEvent('fbrp:citizen:data', function(kind, data)
    if FBRP.MenuView() == 'citizen' then ui({ type='citizenData', kind=kind, data=data }) end
end)

RegisterNUICallback('citizenAction', function(data, cb)
    if type(data) == 'table' then
        TriggerServerEvent('fbrp:citizen:action', tostring(data.kind or ''), data)
    end
    cb({ ok=true })
end)

RegisterCommand('citizen', function()
    TriggerServerEvent('fbrp:citizen:request')
end, false)
