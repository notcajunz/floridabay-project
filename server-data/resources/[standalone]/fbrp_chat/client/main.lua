local open = false
local suggestions = {}
local floating = {}

local function post(message)
    SendNUIMessage(message)
end

local function setOpen(value)
    open = value == true
    SetNuiFocus(open, open)
    post({ type='open', value=open })
end

RegisterNetEvent('chat:addMessage', function(message)
    post({ type='message', data=type(message) == 'table' and message or { message=tostring(message or '') } })
end)

RegisterNetEvent('chat:addSuggestion', function(name, help, params)
    name = tostring(name or '')
    if name == '' then return end
    suggestions[name] = { name=name, help=tostring(help or ''), params=params or {} }
    post({ type='suggestions', data=suggestions })
end)

RegisterNetEvent('chat:addSuggestions', function(entries)
    for _, entry in ipairs(type(entries) == 'table' and entries or {}) do
        if entry.name then suggestions[entry.name] = entry end
    end
    post({ type='suggestions', data=suggestions })
end)

RegisterNetEvent('chat:removeSuggestion', function(name)
    suggestions[tostring(name or '')] = nil
    post({ type='suggestions', data=suggestions })
end)

RegisterNetEvent('chat:clear', function()
    post({ type='clear' })
end)

RegisterNetEvent('chat:addTemplate', function() end)

RegisterCommand('fbrp_chat_open', function()
    if open or IsPauseMenuActive() or IsNuiFocused() then return end
    setOpen(true)
end, false)
RegisterKeyMapping('fbrp_chat_open', 'Open Florida Bay chat', 'keyboard', 'T')

RegisterCommand('chat', function() if not open then setOpen(true) end end, false)
RegisterCommand('clear', function()
    post({ type='clear' })
    TriggerEvent('chat:addMessage', { badge='FBRP', icon='◆', color='#69C9FF', message='Chat history cleared.', system=true })
end, false)

RegisterNUICallback('submit', function(data, cb)
    local message = type(data) == 'table' and tostring(data.message or '') or ''
    message = message:gsub('[\r\n]', ' '):sub(1, 300)
    setOpen(false)
    if message:sub(1, 1) == '/' then
        local command = message:sub(2):gsub('^%s+', '')
        if command ~= '' then ExecuteCommand(command) end
    elseif message:gsub('%s', '') ~= '' then
        TriggerServerEvent('fbrp_chat:say', message)
    end
    cb({ ok=true })
end)

RegisterNUICallback('close', function(_, cb)
    setOpen(false)
    cb({ ok=true })
end)

RegisterNetEvent('fbrp_chat:floating', function(sourceId, kind, text)
    floating[#floating+1] = {
        source=tonumber(sourceId), kind=tostring(kind), text=tostring(text):sub(1, 100),
        expires=GetGameTimer()+8000
    }
end)

local function drawText3d(coords, text, color)
    local visible, x, y = World3dToScreen2d(coords.x, coords.y, coords.z)
    if not visible then return end
    SetTextScale(0.0, 0.35)
    SetTextFont(4)
    SetTextProportional(true)
    SetTextCentre(true)
    SetTextColour(color[1], color[2], color[3], 235)
    SetTextDropshadow(1, 0, 0, 0, 180)
    SetTextOutline()
    BeginTextCommandDisplayText('STRING')
    AddTextComponentSubstringPlayerName(text)
    EndTextCommandDisplayText(x, y)
end

CreateThread(function()
    while true do
        local now = GetGameTimer()
        local mine = GetEntityCoords(PlayerPedId())
        local nextEntries = {}
        for _, entry in ipairs(floating) do
            if now < entry.expires then
                nextEntries[#nextEntries+1] = entry
                local player = GetPlayerFromServerId(entry.source)
                if player ~= -1 then
                    local ped = GetPlayerPed(player)
                    local coords = GetEntityCoords(ped)
                    if #(mine - coords) <= 20.0 then
                        local prefix = entry.kind == 'me' and '* ' or ''
                        drawText3d(coords + vector3(0.0, 0.0, 1.05), prefix .. entry.text, entry.kind == 'me' and {214,168,255} or {255,204,128})
                    end
                end
            end
        end
        floating = nextEntries
        Wait(#floating > 0 and 0 or 250)
    end
end)

CreateThread(function()
    while not NetworkIsSessionStarted() do Wait(500) end
    for _, command in ipairs(GetRegisteredCommands()) do
        local name = '/' .. tostring(command.name or '')
        if name ~= '/' then suggestions[name] = suggestions[name] or { name=name, help='Server command', params={} } end
    end
    suggestions['/ooc'] = { name='/ooc', help='Nearby out-of-character message', params={{name='message'}} }
    suggestions['/me'] = { name='/me', help='Show an action above your head to nearby players', params={{name='action'}} }
    suggestions['/do'] = { name='/do', help='Describe the nearby scene or situation', params={{name='detail'}} }
    suggestions['/gme'] = { name='/gme', help='Global roleplay action in the green GME channel', params={{name='action'}} }
    suggestions['/twitter'] = { name='/twitter', help='Post to the global Twitter feed', params={{name='message'}} }
    suggestions['/tweet'] = { name='/tweet', help='Alias for /twitter', params={{name='message'}} }
    suggestions['/twitch'] = { name='/twitch', help='Post a Twitch stream update', params={{name='message'}} }
    suggestions['/instagram'] = { name='/instagram', help='Post to the global Instagram feed', params={{name='message'}} }
    suggestions['/insta'] = { name='/insta', help='Alias for /instagram', params={{name='message'}} }
    suggestions['/darkweb'] = { name='/darkweb', help='Post anonymously to the global dark web feed', params={{name='message'}} }
    suggestions['/dark'] = { name='/dark', help='Alias for /darkweb', params={{name='message'}} }
    suggestions['/ad'] = { name='/ad', help='Post a global roleplay advertisement', params={{name='message'}} }
    suggestions['/news'] = { name='/news', help='Post a global breaking-news message', params={{name='message'}} }
    suggestions['/dv'] = { name='/dv', help='Delete the closest nearby vehicle you own or spawned', params={} }
    suggestions['/hidetags'] = { name='/hidetags', help='Hide or show all overhead tags for yourself', params={} }
    suggestions['/heal'] = { name='/heal', help='Restore health (3 minute cooldown)', params={} }
    suggestions['/armour'] = { name='/armour', help='Replenish armour (5 minute cooldown)', params={} }
    suggestions['/clear'] = { name='/clear', help='Clear your chat history', params={} }
    post({ type='suggestions', data=suggestions })
end)

AddEventHandler('onClientResourceStop', function(resource)
    if resource == GetCurrentResourceName() and open then SetNuiFocus(false, false) end
end)
