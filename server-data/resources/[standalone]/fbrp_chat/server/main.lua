local recent = {}
local MAX_MESSAGE_LENGTH = 300
local CHAT_RANGE = 20.0

local announcements = {
    'Welcome to Florida Bay Roleplay. Build a character, create a story, and keep every scene fair.',
    'Need staff assistance? Use /report followed by a short explanation of what happened.',
    'Use /me for character actions and /do for scene details. Both are visible to nearby players.',
    'Keep in-character and out-of-character knowledge separate. Good roleplay gives everyone room to respond.',
    'Questions about server systems belong in the community Discord or a support ticket.'
}

local function clean(value, limit)
    return tostring(value or '')
        :gsub('[\r\n\t]', ' ')
        :gsub('%s+', ' ')
        :gsub('^%s+', '')
        :gsub('%s+$', '')
        :sub(1, limit or MAX_MESSAGE_LENGTH)
end

local function emit(target, payload)
    TriggerClientEvent('chat:addMessage', target, payload)
end

local function systemMessage(target, message, tone)
    local colors = { info='#69C9FF', success='#62E6A7', warning='#FFC261', error='#FF6B7A' }
    emit(target, {
        badge='FBRP', icon='◆', message=clean(message, 800),
        color=colors[tone] or colors.info, system=true
    })
end

exports('SendMessage', function(target, payload)
    target = tonumber(target) or -1
    payload = type(payload) == 'table' and payload or { message=tostring(payload or '') }
    emit(target, payload)
end)

local function allowedToSpeak(source)
    local now = GetGameTimer()
    local state = recent[source] or { times={}, blockedUntil=0 }
    recent[source] = state
    if now < state.blockedUntil then
        systemMessage(source, 'Slow down a moment before sending another message.', 'warning')
        return false
    end
    local nextTimes = {}
    for _, stamp in ipairs(state.times) do
        if now - stamp < 4000 then nextTimes[#nextTimes+1] = stamp end
    end
    state.times = nextTimes
    if #state.times >= 5 then
        state.blockedUntil = now + 5000
        state.times = {}
        systemMessage(source, 'Chat paused for five seconds because messages were sent too quickly.', 'warning')
        return false
    end
    state.times[#state.times+1] = now
    return true
end

local function nearbyPlayers(source, radius)
    local sourcePed = GetPlayerPed(source)
    if sourcePed <= 0 then return { source } end
    local origin = GetEntityCoords(sourcePed)
    local recipients = {}
    for _, id in ipairs(GetPlayers()) do
        local target = tonumber(id)
        local ped = target and GetPlayerPed(target) or 0
        if ped > 0 and #(GetEntityCoords(ped) - origin) <= radius then
            recipients[#recipients+1] = target
        end
    end
    return recipients
end

local function roleplayMessage(source, kind, raw)
    if source <= 0 or not allowedToSpeak(source) then return end
    local message = clean(raw)
    if message == '' then return end
    local player = Player(source)
    local name = clean(player and player.state['fbrp:name'] or GetPlayerName(source), 80)
    local selectedChatTag = player and player.state['fbrp:chatTag'] or nil
    local chatTag = type(selectedChatTag) == 'table' and {
        label=clean(selectedChatTag.label, 40),
        color=clean(selectedChatTag.color, 7)
    } or nil

    TriggerEvent('chatMessage', source, name, message)
    if WasEventCanceled() then return end

    local styles = {
        ooc={ badge='OOC', icon='◌', color='#8FD8FF', showAuthor=true },
        me={ badge='ME', icon='✦', color='#D6A8FF', showAuthor=true },
        ['do']={ badge='DO', icon='◇', color='#FFCC80', showAuthor=true }
    }
    local style = styles[kind] or styles.ooc
    local payload = {
        badge=style.badge, icon=style.icon, color=style.color,
        author=name, playerId=source, message=message, channel=kind, chatTag=chatTag
    }
    for _, target in ipairs(nearbyPlayers(source, CHAT_RANGE)) do emit(target, payload) end
    if kind == 'me' or kind == 'do' then
        TriggerClientEvent('fbrp_chat:floating', -1, source, kind, message)
    end
end

RegisterNetEvent('fbrp_chat:say', function(message)
    roleplayMessage(source, 'ooc', message)
end)

RegisterCommand('ooc', function(source, args)
    roleplayMessage(source, 'ooc', table.concat(args, ' '))
end, false)

RegisterCommand('me', function(source, args)
    roleplayMessage(source, 'me', table.concat(args, ' '))
end, false)

RegisterCommand('do', function(source, args)
    roleplayMessage(source, 'do', table.concat(args, ' '))
end, false)

AddEventHandler('playerDropped', function() recent[source] = nil end)

CreateThread(function()
    local index = 1
    while true do
        Wait(15 * 60 * 1000)
        systemMessage(-1, announcements[index], 'info')
        index = index % #announcements + 1
    end
end)

