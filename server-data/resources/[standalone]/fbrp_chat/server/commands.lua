-- Florida Bay chat commands.

local function name(src) return GetPlayerName(src) or 'Unknown' end

---------------------------------------------------------------- roleplay: /ooc /me /do /gme

RegisterCommand('ooc', function(src, args)
    if src <= 0 then return end
    TriggerEvent('chatMessage', src, name(src), Chat.ArgsText(args))
end, false)

local function nearbyRoleplay(src, kind, args)
    if src <= 0 or not Chat.CanTalk(src) then return end
    local text = Chat.ArgsText(args)
    if text == '' then return Chat.Notify(src, ('Usage: /%s <text>'):format(kind), 'error') end
    if not Chat.Cooldown(src, 'rp', 1) then return end
    Chat.Send(Chat.Nearby(src, Config.RoleplayRange), { kind = kind, author = Chat.CharacterName(src), text = text, source = src })
    TriggerClientEvent('fbrp_chat:floating', -1, src, kind, text)
end

RegisterCommand('me', function(src, args) nearbyRoleplay(src, 'me', args) end, false)
RegisterCommand('do', function(src, args) nearbyRoleplay(src, 'do', args) end, false)

RegisterCommand('gme', function(src, args)
    if src <= 0 or not Chat.CanTalk(src) then return end
    local text = Chat.ArgsText(args)
    if text == '' then return Chat.Notify(src, 'Usage: /gme <action>', 'error') end
    if not Chat.Cooldown(src, 'gme', 5) then return end
    Chat.Send(-1, { kind = 'gme', author = ('%s [%s]'):format(Chat.CharacterName(src), src), text = text, source = src })
end, false)

---------------------------------------------------------------- social / adverts (global, shared cooldown)

local twitterHandles = {}

local function post(command, kind, title, opts)
    opts = opts or {}
    RegisterCommand(command, function(src, args)
        if src <= 0 or not Chat.CanTalk(src) then return end
        local text = Chat.ArgsText(args)
        if text == '' then return Chat.Notify(src, ('Usage: /%s <message>'):format(command), 'error') end
        if not Chat.Cooldown(src, 'ad', Config.AdCooldown) then return end
        if opts.anonymous then
            -- clocked-in staff can see who posted
            for _, id in ipairs(GetPlayers()) do
                id = tonumber(id)
                local author = title(src)
                if Chat.IsStaffOnDuty(id) then author = ('%s [%s]'):format(author, Chat.DisplayName(src)) end
                Chat.Send(id, { kind = kind, author = author, text = text })
            end
        else
            Chat.Send(-1, { kind = kind, author = title(src), text = text, badges = Chat.Badges(src), source = src })
        end
    end, false)
end

local function handle(src) return '@' .. (twitterHandles[src] or name(src):gsub('%s', '')) end

post('twt', 'twitter', handle)
post('twitter', 'twitter', handle)
post('tweet', 'twitter', handle)
post('instagram', 'instagram', function(src) return ('Instagram | %s'):format(name(src)) end)
post('insta', 'instagram', function(src) return ('Instagram | %s'):format(name(src)) end)
post('youtube', 'youtube', function(src) return ('YouTube | %s'):format(name(src)) end)
post('tiktok', 'tiktok', function(src) return ('TikTok | %s'):format(name(src)) end)
post('twitch', 'twitch', function(src) return ('Twitch | %s'):format(name(src)) end)
post('ad', 'ad', function(src) return ('Advertisement | %s'):format(name(src)) end)
post('news', 'news', function(src) return ('Breaking News | %s'):format(name(src)) end)
post('vpn', 'anonymous', function() return 'Anonymous' end, { anonymous = true })  -- an ad with your name hidden
post('darkweb', 'darkweb', function() return 'Anonymous' end, { anonymous = true })
post('dark', 'darkweb', function() return 'Anonymous' end, { anonymous = true })

RegisterCommand('twtname', function(src, args)
    if src <= 0 then return end
    local h = tostring(args[1] or ''):gsub('^@', ''):gsub('[^%w_]', '')
    if #h < 2 or #h > 20 then return Chat.Notify(src, 'Your handle must be 2-20 letters, numbers or _.', 'error') end
    twitterHandles[src] = h
    Chat.Notify(src, ('Your twitter handle is now @%s'):format(h), 'success')
end, false)

---------------------------------------------------------------- SMS

local lastSender = {}

local function sendSms(src, target, text)
    if target == src then return Chat.Notify(src, "You can't message yourself.", 'error') end
    if not target or not GetPlayerName(target) then return Chat.Notify(src, 'That player is not online.', 'error') end
    if text == '' then return Chat.Notify(src, 'Your message is empty.', 'error') end
    Chat.Send(target, { kind = 'pm', author = ('SMS from %s'):format(Chat.DisplayName(src)), text = text })
    Chat.Send(src, { kind = 'pm', author = ('SMS to %s'):format(Chat.DisplayName(target)), text = text, source = src })
    lastSender[target] = src
end

RegisterCommand('sms', function(src, args)
    if src <= 0 or not Chat.CanTalk(src) then return end
    local target = tonumber(args[1])
    if not target then return Chat.Notify(src, 'Usage: /sms <id> <message>', 'error') end
    sendSms(src, target, Chat.ArgsText(args, 2))
end, false)

RegisterCommand('reply', function(src, args)
    if src <= 0 or not Chat.CanTalk(src) then return end
    local target = lastSender[src]
    if not target then return Chat.Notify(src, 'No one has messaged you yet.', 'error') end
    sendSms(src, target, Chat.ArgsText(args))
end, false)

---------------------------------------------------------------- staff

-- /staff and /ondutystaff are owned by fbrp_core (live permissions); registering them here as well would send every announcement twice.
local function from(src) return src == 0 and 'Console' or name(src) end

RegisterCommand('allstaff', function(src, args)
    if src ~= 0 and not Chat.IsStaffMember(src) then return Chat.Notify(src, 'You are not staff.', 'error') end
    local text = Chat.ArgsText(args)
    if text == '' then return end
    for _, id in ipairs(GetPlayers()) do
        id = tonumber(id)
        if Chat.IsStaffMember(id) then Chat.Send(id, { kind = 'staffonly', author = ('Staff | %s'):format(from(src)), text = text }) end
    end
end, false)

RegisterCommand('mute', function(src, args)
    if not Chat.CanModerate(src) then return Chat.Notify(src, 'You must be clocked in as staff.', 'error') end
    local target, seconds = tonumber(args[1]), math.floor(tonumber(args[2]) or 300)
    if not target or not GetPlayerName(target) then return Chat.Notify(src, 'Usage: /mute <id> <seconds>', 'error') end
    seconds = math.max(1, math.min(seconds, Config.MaxMuteSeconds))
    Chat.Muted[target] = os.time() + seconds
    Chat.Send(target, { kind = 'muted', author = 'MUTED', text = ('You have been muted for %s seconds.'):format(seconds) })
    Chat.Notify(src, ('Muted %s for %s seconds.'):format(name(target), seconds), 'success')
end, false)

RegisterCommand('unmute', function(src, args)
    if not Chat.CanModerate(src) then return Chat.Notify(src, 'You must be clocked in as staff.', 'error') end
    local target = tonumber(args[1])
    if not target or not GetPlayerName(target) then return Chat.Notify(src, 'Usage: /unmute <id>', 'error') end
    Chat.Muted[target] = nil
    Chat.Send(target, { kind = 'muted', label = 'UNMUTED', author = 'UNMUTED', text = 'You can chat again.', color = '#62E6A7' })
    Chat.Notify(src, ('Unmuted %s.'):format(name(target)), 'success')
end, false)

-- the one chat clear: wipes chat for everyone, then says who did it
RegisterCommand('chatclear', function(src)
    if not Chat.CanModerate(src) then return Chat.Notify(src, 'You must be clocked in as staff.', 'error') end
    TriggerClientEvent('chat:clear', -1)
    Chat.Send(-1, {
        kind = 'system', label = false, icon = 'gear', tint = true, color = Config.ClearColor,
        text = ('FBRP Systems | Chat has been cleared by: %s'):format(from(src)),
    })
end, false)

RegisterCommand('hidestaffrank', function(src)
    if src <= 0 then return end
    if not Chat.IsStaffMember(src) then return Chat.Notify(src, 'You are not staff.', 'error') end
    Chat.HiddenStaff[src] = not Chat.HiddenStaff[src] or nil
    Chat.Notify(src, Chat.HiddenStaff[src] and 'Your staff rank is hidden from chat.' or 'Your staff rank is shown in chat.', 'success')
end, false)

---------------------------------------------------------------- LEO

local function leoTargets()
    local list = {}
    for _, id in ipairs(GetPlayers()) do
        id = tonumber(id)
        if Chat.IsLeo(id) then list[#list + 1] = id end
    end
    return list
end

local function officerName(src)
    local callsign = Player(src).state['fbrp:callsign']
    if type(callsign) == 'string' and callsign ~= '' then return ('%s | %s'):format(callsign, Chat.CharacterName(src)) end
    return Chat.CharacterName(src)
end

RegisterCommand('leoannounce', function(src, args)
    if src <= 0 then return end
    if not Chat.IsLeo(src) then return Chat.Notify(src, 'You must be on duty as law enforcement.', 'error') end
    if not Chat.Cooldown(src, 'leoannounce', 10) then return end
    local text = Chat.ArgsText(args)
    if text == '' then
        text = Chat.Clean(lib.callback.await('fbrp_chat:leoAnnounceDialog', src) or '', 150)
        if text == '' then return end
    end
    local targets = leoTargets()
    Chat.Send(targets, { kind = 'police', label = 'LEO', author = ('LEO Announcement | %s'):format(officerName(src)), text = text })
    for _, id in ipairs(targets) do
        TriggerClientEvent('ox_lib:notify', id, { title = 'On-Duty LEO Announcement', description = text, type = 'inform', position = 'center-right' })
    end
end, false)

RegisterCommand('1099', function(src, args)
    if src <= 0 then return end
    if not Chat.IsLeo(src) then return Chat.Notify(src, 'You must be on duty as law enforcement.', 'error') end
    if not Chat.Cooldown(src, '1099', 15) then return end
    local postal = Player(src).state.postal
    local info = Chat.ArgsText(args)
    local text = ('%s pressed their PANIC BUTTON%s%s'):format(
        officerName(src),
        postal and (' near postal %s'):format(postal) or '',
        info ~= '' and (' - %s'):format(info) or '')
    local targets = leoTargets()
    Chat.Send(targets, { kind = 'panic', author = '10-99 PANIC', text = text })
    for _, id in ipairs(targets) do
        TriggerClientEvent('ox_lib:notify', id, { title = '10-99 PANIC', description = text, type = 'error', position = 'center-right', duration = 15000 })
    end
    -- also fire fbrp_core's dispatch panic
    TriggerClientEvent('fbrp_chat:runCommand', src, 'panic')
end, false)

---------------------------------------------------------------- cleanup

AddEventHandler('playerDropped', function()
    local src = source
    twitterHandles[src], lastSender[src] = nil, nil
    for receiver, sender in pairs(lastSender) do
        if sender == src then lastSender[receiver] = nil end
    end
end)

---------------------------------------------------------------- suggestions

local SUGGEST = {
    { 'ooc', 'Out-of-character message (same as typing without a /)', 'message' },
    { 'me', 'Show an action above your head to nearby players', 'action' },
    { 'do', 'Describe the nearby scene or situation', 'detail' },
    { 'gme', 'Global roleplay action', 'action' },
    { 'twt', 'Post to Twitter', 'message' }, { 'twitter', 'Post to Twitter', 'message' }, { 'tweet', 'Post to Twitter', 'message' },
    { 'twtname', 'Change your Twitter handle in chat', 'handle' },
    { 'instagram', 'Post to Instagram', 'message' }, { 'insta', 'Post to Instagram', 'message' },
    { 'youtube', 'YouTube themed advertisement', 'message' }, { 'tiktok', 'TikTok themed advertisement', 'message' },
    { 'twitch', 'Twitch stream update', 'message' }, { 'ad', 'Global roleplay advertisement', 'message' },
    { 'news', 'Breaking news', 'message' }, { 'vpn', 'Post an ad with your name hidden', 'message' },
    { 'darkweb', 'Post anonymously to the dark web', 'message' }, { 'dark', 'Post anonymously to the dark web', 'message' },
    { 'sms', 'Text a player', 'id', 'message' }, { 'reply', 'Reply to the last person who texted you', 'message' },
    { 'staff', '[Staff] Announcement to everyone', 'message' }, { 'allstaff', '[Staff] Message only staff can see', 'message' },
    { 'ondutystaff', '[Staff] Message only on-duty staff can see', 'message' },
    { 'mute', '[Staff] Mute a player in chat', 'id', 'seconds' }, { 'unmute', '[Staff] Unmute a player', 'id' },
    { 'chatclear', '[Staff] Clear chat for everyone' },
    { 'hidestaffrank', '[Staff] Show or hide your staff rank in chat' },
    { 'leoannounce', '[LEO] Announce to all on-duty law enforcement', 'message' },
    { '1099', '[LEO] Panic button', 'details' }, { 'chattag', 'Change your chat tag' },
}

AddEventHandler('chat:init', function()
    local src = source
    local list = {}
    for _, e in ipairs(SUGGEST) do
        local params = {}
        for i = 3, #e do params[#params + 1] = { name = e[i] } end
        list[#list + 1] = { name = '/' .. e[1], help = e[2], params = params }
    end
    TriggerClientEvent('chat:addSuggestions', src, list)
end)
