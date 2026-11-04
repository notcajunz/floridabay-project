-- Florida Bay chat - server. Stands in for the cfx `chat` resource (routing, hooks, modes, suggestions)
-- and adds the Florida Bay chat rules: badges, mutes, cooldowns, OOC. Commands are in commands.lua.

RegisterNetEvent('chat:init')
RegisterNetEvent('chat:addTemplate')
RegisterNetEvent('chat:addMessage')
RegisterNetEvent('chat:addSuggestion')
RegisterNetEvent('chat:removeSuggestion')
RegisterNetEvent('_chat:messageEntered')
RegisterNetEvent('chat:clear')
RegisterNetEvent('__cfx_internal:commandFallback')
RegisterNetEvent('playerJoining')

Chat = {}

---------------------------------------------------------------- fbrp_core

local function core(fn, ...)
    if GetResourceState('fbrp_core') ~= 'started' then return nil end
    local ok, result = pcall(exports.fbrp_core[fn], exports.fbrp_core, ...)
    return ok and result or nil
end

function Chat.IsStaffOnDuty(src)
    return core('IsStaffOnDuty', src) == true
end

function Chat.StaffRank(src)
    local rank = core('GetStaffRank', src)
    return type(rank) == 'table' and rank or nil
end

function Chat.IsStaffMember(src)
    return Chat.StaffRank(src) ~= nil
end

function Chat.IsLeo(src)
    local org = core('GetActiveOrganization', src)
    return type(org) == 'table' and org.type == 'leo'
end

function Chat.CanModerate(src)
    return src == 0 or IsPlayerAceAllowed(src, Config.ModerateAce) or Chat.IsStaffOnDuty(src)
end

---------------------------------------------------------------- text helpers

function Chat.Clean(text, limit)
    text = tostring(text or '')
    text = text:gsub('%^%d', ''):gsub('~[%a]~', '')
    text = text:gsub('[%c]', ' '):gsub('%s+', ' ')
    text = text:gsub('^%s+', ''):gsub('%s+$', '')
    return text:sub(1, limit or Config.MaxLength)
end

function Chat.ArgsText(args, from)
    return Chat.Clean(table.concat(args, ' ', from or 1))
end

function Chat.DisplayName(src)
    return ('(%s) %s'):format(src, GetPlayerName(src) or 'Unknown')
end

-- character name for in-character lines (/me /do /gme), falls back to the FiveM name
function Chat.CharacterName(src)
    local name = Player(src).state['fbrp:name']
    return Chat.Clean(type(name) == 'string' and name ~= '' and name or GetPlayerName(src) or 'Unknown', 60)
end

function Chat.Notify(src, msg, nType)
    if src == 0 then return print(('[fbrp_chat] %s'):format(msg)) end
    TriggerClientEvent('ox_lib:notify', src, { title = 'Chat', description = msg, type = nType or 'inform', position = 'center-right' })
end

---------------------------------------------------------------- sending

-- Send one message. m = { kind, label?, author?, text, badges?, color?, source? }
function Chat.Send(target, m)
    local payload = {
        fbrp = m,
        args = m.author and { m.author, m.text } or { m.text },
    }
    if type(target) == 'table' then
        for _, id in ipairs(target) do TriggerClientEvent('chat:addMessage', id, payload) end
    else
        TriggerClientEvent('chat:addMessage', target, payload)
    end
end

function Chat.System(target, text, label)
    Chat.Send(target, { kind = 'system', label = label or 'FBRP', text = Chat.Clean(text, 800) })
end

-- staff rank badge (when clocked in and not hidden) + the chat tag picked in fbrp_core's tag menu
local hiddenStaff = {}
Chat.HiddenStaff = hiddenStaff

function Chat.Badges(src)
    local out = {}
    if not hiddenStaff[src] and Chat.IsStaffOnDuty(src) then
        local rank = Chat.StaffRank(src)
        local label = rank and Chat.Clean(rank.label or rank.name, 30) or ''
        if label ~= '' then
            out[#out + 1] = { text = ('[%s]'):format(label), color = Config.StaffColors[rank.name] or Config.StaffDefaultColor }
        end
    end
    local tag = Player(src).state['fbrp:chatTag']
    if type(tag) == 'table' and tag.label and tag.label ~= '' then
        out[#out + 1] = { text = ('[%s]'):format(Chat.Clean(tag.label, 40)), color = tag.color }
    end
    return #out > 0 and out or nil
end

---------------------------------------------------------------- mutes / cooldowns

local muted, lastUse = {}, {}
Chat.Muted = muted

function Chat.IsMuted(src)
    local untilTime = muted[src]
    if not untilTime then return false end
    if os.time() >= untilTime then muted[src] = nil return false end
    return true, untilTime - os.time()
end

function Chat.CanTalk(src)
    local isMuted, left = Chat.IsMuted(src)
    if isMuted then
        Chat.Notify(src, ('You are muted for %s more seconds.'):format(left), 'error')
        return false
    end
    return true
end

function Chat.Cooldown(src, key, seconds)
    local id = src .. ':' .. key
    local now = os.time()
    if lastUse[id] and now - lastUse[id] < seconds then
        Chat.Notify(src, ('Please wait %ss before using that again.'):format(seconds - (now - lastUse[id])), 'error')
        return false
    end
    lastUse[id] = now
    return true
end

function Chat.Nearby(src, radius)
    local ped = GetPlayerPed(src)
    if ped == 0 then return { src } end
    local origin = GetEntityCoords(ped)
    local list = {}
    for _, id in ipairs(GetPlayers()) do
        id = tonumber(id)
        local other = GetPlayerPed(id)
        if other ~= 0 and #(GetEntityCoords(other) - origin) <= radius then list[#list + 1] = id end
    end
    return list
end

AddEventHandler('playerDropped', function()
    local src = source
    muted[src], hiddenStaff[src] = nil, nil
    for key in pairs(lastUse) do
        if key:sub(1, #tostring(src) + 1) == src .. ':' then lastUse[key] = nil end
    end
end)

---------------------------------------------------------------- cfx chat compatibility: hooks, modes, routing

exports('addMessage', function(target, message)
    if not message then message, target = target, -1 end
    if not target or not message then return end
    TriggerClientEvent('chat:addMessage', target, message)
end)

local hooks, hookIdx = {}, 1
exports('registerMessageHook', function(hook)
    hookIdx = hookIdx + 1
    hooks[hookIdx] = { fn = hook, resource = GetInvokingResource() }
end)

local modes = {}
local function matchingPlayers(seObject)
    local out = {}
    for _, v in ipairs(GetPlayers()) do
        if IsPlayerAceAllowed(v, seObject) then out[#out + 1] = v end
    end
    return out
end

local function modeClientObject(m)
    return { name = m.name, displayName = m.displayName, color = m.color or '#fff', isChannel = m.isChannel, isGlobal = m.isGlobal }
end

exports('registerMode', function(modeData)
    if not modeData.name or not modeData.displayName or not modeData.cb then return false end
    modes[modeData.name] = modeData
    modes[modeData.name].resource = GetInvokingResource()
    local obj = modeClientObject(modeData)
    if not modeData.seObject then
        TriggerClientEvent('chat:addMode', -1, obj)
    else
        for _, v in ipairs(matchingPlayers(modeData.seObject)) do TriggerClientEvent('chat:addMode', v, obj) end
    end
    return true
end)

AddEventHandler('onResourceStop', function(resName)
    for k, v in pairs(hooks) do if v.resource == resName then hooks[k] = nil end end
    for k, v in pairs(modes) do
        if v.resource == resName then
            TriggerClientEvent('chat:removeMode', -1, { name = k })
            modes[k] = nil
        end
    end
end)

local function routeMessage(src, author, message, mode, fromConsole)
    if type(message) ~= 'string' then return end
    if src >= 1 then author = GetPlayerName(src) end

    local outMessage = { color = { 255, 255, 255 }, multiline = true, args = { message }, mode = mode }
    if author and author ~= '' then outMessage.args = { author, message } end

    if mode and modes[mode] and modes[mode].seObject and not IsPlayerAceAllowed(src, modes[mode].seObject) then return end

    local canceled, routingTarget = false, -1
    local hookRef = {
        updateMessage = function(t)
            for k, v in pairs(t) do
                if k == 'template' then
                    outMessage.template = v:gsub('%{%}', outMessage.template or '@default')
                elseif k == 'params' then
                    outMessage.params = outMessage.params or {}
                    for pk, pv in pairs(v) do outMessage.params[pk] = pv end
                else
                    outMessage[k] = v
                end
            end
        end,
        cancel = function() canceled = true end,
        setSeObject = function(object) routingTarget = matchingPlayers(object) end,
        setRouting = function(target) routingTarget = target end,
    }

    for _, hook in pairs(hooks) do
        if hook.fn then hook.fn(src, outMessage, hookRef) end
    end
    if modes[mode] then modes[mode].cb(src, outMessage, hookRef) end
    if canceled then return end

    -- the OOC handler below (and any other script) formats the message and cancels the plain one
    TriggerEvent('chatMessage', src, #outMessage.args > 1 and outMessage.args[1] or '', outMessage.args[#outMessage.args])
    if not WasEventCanceled() then
        if type(routingTarget) ~= 'table' then
            TriggerClientEvent('chat:addMessage', routingTarget, outMessage)
        else
            for _, id in ipairs(routingTarget) do TriggerClientEvent('chat:addMessage', id, outMessage) end
        end
    end

    if not fromConsole then
        print(('%s^7%s: %s^7'):format(author or '', modes[mode] and (' (' .. modes[mode].displayName .. ')') or '', message))
    end
end

AddEventHandler('_chat:messageEntered', function(author, _, message, mode)
    if not message or not author then return end
    routeMessage(source, author, message, mode)
end)

-- unknown /commands: swallow them quietly
AddEventHandler('__cfx_internal:commandFallback', function(command)
    routeMessage(source, GetPlayerName(source), '/' .. command, nil, true)
    CancelEvent()
end)

RegisterCommand('say', function(src, _, rawCommand)
    routeMessage(src, src == 0 and 'console' or GetPlayerName(src), rawCommand:sub(5), nil, true)
end, true)

---------------------------------------------------------------- OOC (anything typed without a /)

local lastChat = {}

AddEventHandler('chatMessage', function(src, _, message)
    CancelEvent()
    if type(message) ~= 'string' or message:sub(1, 1) == '/' or src <= 0 then return end
    if not Chat.CanTalk(src) then return end

    local now = GetGameTimer()
    if lastChat[src] and now - lastChat[src] < Config.ChatCooldownMs then
        return Chat.Notify(src, "You're sending messages too fast.", 'error')
    end
    lastChat[src] = now

    local text = Chat.Clean(message)
    if text == '' then return end

    Chat.Send(Config.OocRange and Chat.Nearby(src, Config.OocRange) or -1, {
        kind = 'ooc', author = Chat.DisplayName(src), text = text, badges = Chat.Badges(src), source = src,
    })
end)

AddEventHandler('playerDropped', function() lastChat[source] = nil end)

---------------------------------------------------------------- join / leave

AddEventHandler('playerJoining', function()
    if not Config.ShowJoins then return end
    Chat.Send(-1, { kind = 'system', label = 'JOIN', text = ('%s joined.'):format(GetPlayerName(source) or 'Someone'), color = '#62E6A7' })
end)

AddEventHandler('playerDropped', function(reason)
    if not Config.ShowQuits then return end
    Chat.Send(-1, { kind = 'system', label = 'LEAVE', text = ('%s left (%s).'):format(GetPlayerName(source) or 'Someone', Chat.Clean(reason, 80)), color = '#8B95A7' })
end)

---------------------------------------------------------------- suggestions: only commands the player may use

local function refreshCommands(player)
    if not GetRegisteredCommands then return end
    local list = {}
    for _, command in ipairs(GetRegisteredCommands()) do
        if IsPlayerAceAllowed(player, ('command.%s'):format(command.name)) then
            list[#list + 1] = { name = '/' .. command.name, help = '' }
        end
    end
    TriggerClientEvent('chat:addSuggestions', player, list)
end

AddEventHandler('chat:init', function()
    local src = source
    refreshCommands(src)
    for _, m in pairs(modes) do
        if not m.seObject or IsPlayerAceAllowed(src, m.seObject) then
            TriggerClientEvent('chat:addMode', src, modeClientObject(m))
        end
    end
end)

AddEventHandler('onServerResourceStart', function()
    Wait(500)
    for _, player in ipairs(GetPlayers()) do refreshCommands(player) end
end)

---------------------------------------------------------------- server tips

CreateThread(function()
    if (Config.AutoMessageMinutes or 0) <= 0 or #Config.AutoMessages == 0 then return end
    local index = 1
    while true do
        Wait(Config.AutoMessageMinutes * 60 * 1000)
        Chat.System(-1, Config.AutoMessages[index])
        index = index % #Config.AutoMessages + 1
    end
end)

---------------------------------------------------------------- exports for other scripts

-- exports.fbrp_chat:SendMessage(target, { badge, message, color, author?, playerId? })  (used by fbrp_core)
exports('SendMessage', function(target, payload)
    target = tonumber(target) or -1
    payload = type(payload) == 'table' and payload or { message = tostring(payload or '') }
    TriggerClientEvent('chat:addMessage', target, payload)
end)

-- exports.fbrp_chat:Card(target, kind, icon, title, message)
exports('Card', function(target, kind, _, title, message)
    Chat.Send(tonumber(target) or -1, { kind = tostring(kind or 'system'):gsub('[^%w_-]', ''), author = Chat.Clean(title, 80), text = Chat.Clean(message, 800) })
end)

-- exports.fbrp_chat:Send(target, { kind, label?, author?, text, color? })
exports('Send', function(target, m)
    if type(m) ~= 'table' then return end
    Chat.Send(tonumber(target) or -1, { kind = m.kind or 'system', label = m.label, author = m.author, text = Chat.Clean(m.text, 800), color = m.color })
end)

exports('IsMuted', function(src) return (Chat.IsMuted(tonumber(src))) end)
