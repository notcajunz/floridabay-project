-- Florida Bay chat - client. Replaces the cfx `chat` resource: same events and exports, new UI (web/).
-- Every message shape scripts already send (chatMessage, chat:addMessage with args / templates / structured
-- payloads) is converted here into { tag, label, author, text, color, badges, mine } for the UI.

local chatInputActive = false
local chatInputActivating = false
local chatLoaded = false

RegisterNetEvent('chatMessage')
RegisterNetEvent('chat:addTemplate')
RegisterNetEvent('chat:addMessage')
RegisterNetEvent('chat:addSuggestion')
RegisterNetEvent('chat:addSuggestions')
RegisterNetEvent('chat:addMode')
RegisterNetEvent('chat:removeMode')
RegisterNetEvent('chat:removeSuggestion')
RegisterNetEvent('chat:clear')
RegisterNetEvent('__cfx_internal:serverPrint')
RegisterNetEvent('_chat:messageEntered')

local function ui(action, data) SendNUIMessage({ action = action, data = data }) end

---------------------------------------------------------------- message conversion

local function hexColour(c)
    if type(c) == 'table' and c[1] then
        return ('#%02X%02X%02X'):format(math.floor(tonumber(c[1]) or 255), math.floor(tonumber(c[2]) or 255), math.floor(tonumber(c[3]) or 255))
    elseif type(c) == 'string' and c:match('^#%x%x%x%x%x%x$') then
        return c
    end
end

local function decode(s)
    s = tostring(s or '')
    s = s:gsub('<br%s*/?>', ' '):gsub('<[^>]->', '')
    s = s:gsub('&nbsp;', ' '):gsub('&lt;', '<'):gsub('&gt;', '>'):gsub('&quot;', '"'):gsub('&#39;', "'"):gsub('&amp;', '&')
    return (s:gsub('%s+', ' '):gsub('^%s+', ''):gsub('%s+$', ''))
end

local function fill(template, args)
    return (tostring(template):gsub('{(%d+)}', function(i) return tostring(args[tonumber(i) + 1] or '') end))
end

local function kind(name)
    return Config.Kinds[tostring(name or ''):lower()]
end

local function badgeList(list)
    local out = {}
    for _, b in ipairs(type(list) == 'table' and list or {}) do
        if type(b) == 'table' and b.text and tostring(b.text) ~= '' then
            out[#out + 1] = { text = tostring(b.text), color = hexColour(b.color) or '#ffffff' }
        end
    end
    return #out > 0 and out or nil
end

local me = nil
local function mySource()
    me = me or GetPlayerServerId(PlayerId())
    return me
end

local function convert(message)
    local args = message.args or {}

    -- structured message (this resource, and older tfd / jaxtti scripts)
    local s = message.fbrp or message.jaxtti or message.tfd
    if type(s) == 'table' then
        local k = kind(s.kind) or Config.Kinds.system
        local label = s.label or k.label
        if s.label == false then label = nil end  -- label = false: no [TAG] in front
        return {
            tag = tostring(s.tag or s.kind or 'system'):upper(),
            label = label,
            author = s.author,
            text = s.text,
            icon = s.icon,
            tint = s.tint == true,
            color = hexColour(s.color) or k.color,
            badges = badgeList(s.badges),
            mine = s.source ~= nil and tonumber(s.source) == mySource() or s.mine == true,
        }
    end

    -- old fbrp_chat shape: { badge, author, message, color, channel, chatTag, staffBadge, card, system }
    if message.message ~= nil or message.badge ~= nil then
        local channel = tostring(message.card or message.channel or (message.system and 'system') or ''):lower()
        local k = kind(channel)
        local badges = {}
        if type(message.staffBadge) == 'table' and message.staffBadge.label then badges[#badges + 1] = { text = '[' .. message.staffBadge.label .. ']', color = message.staffBadge.color } end
        if type(message.chatTag) == 'table' and message.chatTag.label then badges[#badges + 1] = { text = '[' .. message.chatTag.label .. ']', color = message.chatTag.color } end
        local author = message.author
        if author and message.playerId then author = ('(%s) %s'):format(message.playerId, author) end
        return {
            tag = (channel ~= '' and channel or 'system'):upper(),
            label = (message.card and k and k.label) or (message.badge and tostring(message.badge):upper()) or (k and k.label) or 'INFO',
            author = author,
            text = tostring(message.message or ''),
            color = hexColour(message.color) or (k and k.color) or Config.Kinds.system.color,
            badges = badgeList(badges),
        }
    end

    if message.templateId == 'print' then
        return { tag = 'SYSTEM', label = 'SERVER', text = table.concat(args, ' ') }
    end

    -- HTML template (older scripts): take the css class, the bold title and the rest as text
    if message.template then
        local html = fill(message.template, args)
        local cls = html:match('chat%-message%s+([%w_%-]+)')
        local title = html:match('<b>(.-)</b>')
        local body = html:match('class="message">(.-)</span>') or html
        local k = kind(cls) or Config.Kinds.system
        local text = decode(body)
        if title and not message.template:find('class="message"') then text = decode(html:gsub('<b>.-</b>', '', 1)) end
        return { tag = tostring(cls or 'system'):upper(), label = k.label, author = title and decode(title) or nil, text = text, color = k.color }
    end

    -- plain args: { author, text } or { text }
    local author, text
    if #args >= 2 then
        author, text = tostring(args[1]), table.concat(args, ' ', 2)
    else
        text = tostring(args[1] or '')
    end
    if author == '' then author = nil end
    return { tag = author and 'CHAT' or 'SYSTEM', label = author and 'CHAT' or 'INFO', author = author, text = text, color = hexColour(message.color) }
end

local function addMessage(message)
    if type(message) == 'string' then message = { args = { message } } end
    if type(message) ~= 'table' then return end
    local ok, out = pcall(convert, message)
    if ok and out and out.text and out.text ~= '' then ui('message', out) end
end

-- deprecated, use chat:addMessage
AddEventHandler('chatMessage', function(author, color, text)
    local args = { text }
    if author ~= '' then table.insert(args, 1, author) end
    addMessage({ color = color, args = args })
end)

AddEventHandler('__cfx_internal:serverPrint', function(msg)
    print(msg)
    addMessage({ templateId = 'print', args = { msg } })
end)

exports('addMessage', addMessage)
AddEventHandler('chat:addMessage', addMessage)

---------------------------------------------------------------- suggestions

local suggestions = {}
local pushQueued = false
local function pushSuggestions()
    if pushQueued then return end
    pushQueued = true
    SetTimeout(250, function()
        pushQueued = false
        ui('suggestions', suggestions)
    end)
end

local function addSuggestion(name, help, params)
    if type(name) ~= 'string' then return end
    suggestions[name] = { name = name, help = help or '', params = params }
    pushSuggestions()
end

exports('addSuggestion', addSuggestion)
AddEventHandler('chat:addSuggestion', addSuggestion)

AddEventHandler('chat:addSuggestions', function(list)
    for _, s in ipairs(list or {}) do
        if s.name and not (suggestions[s.name] and suggestions[s.name].help ~= '' and (s.help or '') == '') then
            suggestions[s.name] = { name = s.name, help = s.help or '', params = s.params }
        end
    end
    pushSuggestions()
end)

AddEventHandler('chat:removeSuggestion', function(name)
    suggestions[name] = nil
    pushSuggestions()
end)

-- modes / templates aren't used by this UI (kept so scripts calling them don't error)
AddEventHandler('chat:addMode', function() end)
AddEventHandler('chat:removeMode', function() end)
AddEventHandler('chat:addTemplate', function() end)

AddEventHandler('chat:clear', function() ui('clear') end)

---------------------------------------------------------------- input

local function closeInput()
    chatInputActive = false
    SetNuiFocus(false, false)
end

RegisterNUICallback('submit', function(data, cb)
    cb('ok')
    closeInput()
    local text = type(data) == 'table' and tostring(data.text or '') or ''
    text = text:gsub('[\r\n]', ' '):gsub('^%s+', ''):gsub('%s+$', '')
    if text == '' then return end
    if text:sub(1, 1) == '/' then
        ExecuteCommand(text:sub(2))
    else
        TriggerServerEvent('_chat:messageEntered', GetPlayerName(PlayerId()), { 0, 0x99, 255 }, text, nil)
    end
end)

RegisterNUICallback('close', function(_, cb)
    cb('ok')
    closeInput()
end)

local function openChat()
    if chatInputActive or not chatLoaded or IsPauseMenuActive() or IsNuiFocused() then return end
    chatInputActive = true
    chatInputActivating = true
    ui('open')
end

-- same command name as the previous fbrp_chat, so players keep their key binding
RegisterCommand('fbrp_chat_open', openChat, false)
RegisterKeyMapping('fbrp_chat_open', 'Open Florida Bay chat', 'keyboard', Config.OpenKey)
RegisterCommand('chat', openChat, false)

---------------------------------------------------------------- look (one style for everyone, set in config.lua)

local function sendConfig()
    ui('config', {
        style = Config.Style,
        fade = Config.FadeSeconds,
        max = Config.MaxMessages,
        season = Config.Season,
        seasons = Config.Seasons,
        theme = { accent = Config.Accent },
        placeholder = Config.Placeholder,
        serverName = Config.ServerName,
        top = Config.Top,
        background = Config.ClearBackground,
    })
end


---------------------------------------------------------------- command list for suggestions

local function refreshCommands()
    if not GetRegisteredCommands then return end
    local list = {}
    for _, command in ipairs(GetRegisteredCommands()) do
        local name = command.name
        if IsAceAllowed(('command.%s'):format(name)) and name ~= 'toggleChat' and not name:find('^[%+%-]') then
            list[#list + 1] = { name = '/' .. name, help = '' }
        end
    end
    TriggerEvent('chat:addSuggestions', list)
end

AddEventHandler('onClientResourceStart', function()
    Wait(500)
    refreshCommands()
end)

AddEventHandler('onClientResourceStop', function(resource)
    if resource == GetCurrentResourceName() and chatInputActive then SetNuiFocus(false, false) end
    Wait(500)
    refreshCommands()
end)

RegisterNUICallback('loaded', function(_, cb)
    TriggerServerEvent('chat:init')
    sendConfig()
    refreshCommands()
    chatLoaded = true
    addSuggestion('/toggleChat', 'Chat visibility', { { name = 'state', help = 'whenactive | visible | hidden' } })
    cb('ok')
end)

---------------------------------------------------------------- visibility (/toggleChat, L)

local HIDE = { SHOW_WHEN_ACTIVE = 0, ALWAYS_SHOW = 1, ALWAYS_HIDE = 2 }
local kvpEntry = GetResourceKvpString('hideState')
local chatHideState = kvpEntry and tonumber(kvpEntry) or HIDE.SHOW_WHEN_ACTIVE

RegisterKeyMapping('toggleChat', 'Toggle chat visibility', 'keyboard', 'l')
RegisterCommand('toggleChat', function(_, args)
    if not args[1] then
        if chatHideState == HIDE.SHOW_WHEN_ACTIVE then chatHideState = HIDE.ALWAYS_SHOW
        elseif chatHideState == HIDE.ALWAYS_SHOW then chatHideState = HIDE.ALWAYS_HIDE
        else chatHideState = HIDE.SHOW_WHEN_ACTIVE end
    elseif args[1] == 'visible' then chatHideState = HIDE.ALWAYS_SHOW
    elseif args[1] == 'hidden' then chatHideState = HIDE.ALWAYS_HIDE
    elseif args[1] == 'whenactive' then chatHideState = HIDE.SHOW_WHEN_ACTIVE end
    SetResourceKvp('hideState', tostring(chatHideState))
end, false)

CreateThread(function()
    SetTextChatEnabled(false)
    SetNuiFocus(false, false)

    local lastState, origState = -1, -1
    while true do
        Wait(0)
        -- give focus once the open key is released, so the T doesn't land in the input box
        if chatInputActivating and not IsControlPressed(0, 245) then
            SetNuiFocus(true, false)
            chatInputActivating = false
        end

        if chatLoaded then
            local forceHide = IsScreenFadedOut() or IsPauseMenuActive()
            if forceHide and chatInputActive then
                ui('forceClose')
                closeInput()
            end
            if chatHideState ~= HIDE.ALWAYS_HIDE then
                if forceHide then
                    origState = chatHideState
                    chatHideState = HIDE.ALWAYS_HIDE
                end
            elseif not forceHide and origState ~= -1 then
                chatHideState = origState
                origState = -1
            end
            if chatHideState ~= lastState then
                lastState = chatHideState
                ui('visibility', chatHideState)
            end
        end
    end
end)

---------------------------------------------------------------- /me and /do above the player's head

local floating = {}

RegisterNetEvent('fbrp_chat:floating', function(sourceId, kindName, text)
    floating[#floating + 1] = {
        source = tonumber(sourceId), kind = tostring(kindName), text = tostring(text):sub(1, 100),
        expires = GetGameTimer() + 8000,
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
        local keep = {}
        local stack = {}
        for _, entry in ipairs(floating) do
            if now < entry.expires then
                keep[#keep + 1] = entry
                local player = GetPlayerFromServerId(entry.source)
                if player ~= -1 then
                    local coords = GetEntityCoords(GetPlayerPed(player))
                    if #(mine - coords) <= Config.RoleplayRange then
                        local n = stack[entry.source] or 0
                        stack[entry.source] = n + 1
                        local prefix = entry.kind == 'me' and '* ' or ''
                        drawText3d(coords + vector3(0.0, 0.0, 1.05 + n * 0.12), prefix .. entry.text,
                            entry.kind == 'me' and { 214, 168, 255 } or { 128, 230, 190 })
                    end
                end
            end
        end
        floating = keep
        Wait(#floating > 0 and 0 or 250)
    end
end)

---------------------------------------------------------------- misc

-- server asks us to run a client command (10-99 also fires fbrp_core's /panic dispatch)
RegisterNetEvent('fbrp_chat:runCommand', function(command)
    if command == 'panic' then ExecuteCommand('panic') end
end)

RegisterCommand('chattag', function()
    if GetResourceState('fbrp_tags') == 'started' then return TriggerEvent('fbrp_tags:open', 'chat') end
    TriggerServerEvent('fbrp:tags:request')
end, false)

lib.callback.register('fbrp_chat:leoAnnounceDialog', function()
    local input = lib.inputDialog('LEO Announcement', {
        { type = 'input', label = 'Message', required = true, icon = 'fa-regular fa-rectangle-list', min = 3, max = 150 },
    })
    return input and input[1] or false
end)
