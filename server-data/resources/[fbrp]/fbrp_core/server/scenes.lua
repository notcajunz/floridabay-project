-- Player-hosted roleplay scenes and staff-run community events.
local scenes = {}
local nextSceneId = 1
local currentEvent = nil

local function now() return os.time() * 1000 end
local function clean(value, max)
    return FBRP.Server.clean(tostring(value or ''), max or 100)
end
local function countSet(values)
    local total = 0
    for _ in pairs(values or {}) do total = total + 1 end
    return total
end
local function coordsOf(source)
    local ped = GetPlayerPed(source)
    local coords = ped > 0 and GetEntityCoords(ped) or vector3(0.0, 0.0, 0.0)
    return { x=coords.x + 0.0, y=coords.y + 0.0, z=coords.z + 0.0 }
end

local function publicScene(scene)
    return {
        id=scene.id,title=scene.title,description=scene.description,hostName=scene.hostName,
        coords=scene.coords,createdAt=scene.createdAt,expiresAt=scene.expiresAt,
        attendees=countSet(scene.attendees)
    }
end

local function sceneList()
    local rows = {}
    for _, scene in pairs(scenes) do rows[#rows + 1] = publicScene(scene) end
    table.sort(rows, function(a,b) return a.createdAt > b.createdAt end)
    return rows
end

local function eventPublic()
    if not currentEvent then return nil end
    return {
        title=currentEvent.title,description=currentEvent.description,location=currentEvent.location,
        coords=currentEvent.coords,startedAt=currentEvent.startedAt,expiresAt=currentEvent.expiresAt,
        startedBy=currentEvent.startedBy
    }
end

local function pushScenes(target)
    TriggerClientEvent('fbrp:scenes:data', target or -1, { scenes=sceneList(), event=eventPublic(), now=now() })
end

local function removeScene(id, actor, reason)
    id = tonumber(id)
    local scene = id and scenes[id]
    if not scene then return false, 'Scene not found.' end
    scenes[id] = nil
    FBRP.DB.audit(actor or 'system', 'scene.end', tostring(id), { title=scene.title, reason=reason or 'ended' })
    TriggerClientEvent('fbrp:notify', -1, ('Scene #%d · %s has ended.'):format(id, scene.title), 'info')
    pushScenes()
    return true
end

RegisterNetEvent('fbrp:scenes:create', function(title, description)
    local source = source
    local session = FBRP.Server.sessions[source]
    if not session then return end
    title = clean(title, 70)
    description = clean(description, 180)
    if #title < 4 then return FBRP.Server.notify(source, 'Give your scene a title of at least 4 characters.', 'error') end
    for id, scene in pairs(scenes) do
        if scene.host == source then removeScene(id, session.discord or source, 'replaced') end
    end
    local stamp = now()
    local id = nextSceneId
    nextSceneId = nextSceneId + 1
    scenes[id] = {
        id=id,title=title,description=description,host=source,hostDiscord=session.discord,
        hostName=FBRP.Server.displayName(source),coords=coordsOf(source),createdAt=stamp,
        expiresAt=stamp + 60 * 60000,attendees={[source]=true}
    }
    FBRP.DB.audit(session.discord or source, 'scene.create', tostring(id), { title=title, description=description })
    FBRP.Server.broadcast('SCENE HUB', ('#%d · %s — hosted by %s. Use /scenes to join.'):format(id, title, scenes[id].hostName), { 67,232,216 })
    pushScenes()
end)

RegisterNetEvent('fbrp:scenes:request', function() pushScenes(source) end)
RegisterNetEvent('fbrp:scenes:route', function(id)
    local source = source
    local scene = scenes[tonumber(id)]
    if not scene then return FBRP.Server.notify(source, 'That scene has ended.', 'error') end
    scene.attendees[source] = true
    TriggerClientEvent('fbrp:scenes:waypoint', source, scene.coords, scene.title)
    pushScenes()
end)
RegisterNetEvent('fbrp:scenes:endMine', function()
    local source = source
    for id, scene in pairs(scenes) do
        if scene.host == source then return removeScene(id, FBRP.Server.sessions[source] and FBRP.Server.sessions[source].discord or source, 'host') end
    end
    FBRP.Server.notify(source, 'You do not have an active scene.', 'error')
end)

local function startEvent(payload)
    local stamp = now()
    local duration = math.max(10, math.min(180, tonumber(payload.duration) or 60))
    local coords = nil
    if tonumber(payload.x) and tonumber(payload.y) then
        coords = { x=tonumber(payload.x), y=tonumber(payload.y), z=tonumber(payload.z) or 30.0 }
    end
    currentEvent = {
        title=clean(payload.title, 80),description=clean(payload.description, 300),
        location=clean(payload.location, 80),coords=coords,startedAt=stamp,
        expiresAt=stamp + duration * 60000,startedBy=clean(payload.actorName or 'Florida Bay Staff', 80)
    }
    if #currentEvent.title < 4 then currentEvent=nil; return false, 'Event title is too short.' end
    GlobalState['fbrp:event'] = eventPublic()
    FBRP.Server.broadcast('COMMUNITY EVENT', currentEvent.title .. (currentEvent.location ~= '' and (' · ' .. currentEvent.location) or '') .. ' — use /eventgo for details.', {255,194,77})
    TriggerClientEvent('fbrp:event:update', -1, eventPublic())
    FBRP.DB.audit(payload.actor or 'system', 'event.start', currentEvent.title, { duration=duration, location=currentEvent.location })
    pushScenes()
    return true
end

local function endEvent(actor, reason)
    if not currentEvent then return false, 'No community event is active.' end
    local old = currentEvent
    currentEvent = nil
    GlobalState['fbrp:event'] = nil
    TriggerClientEvent('fbrp:event:update', -1, nil)
    FBRP.Server.broadcast('COMMUNITY EVENT', old.title .. ' has ended. Thanks for taking part!', {255,194,77})
    FBRP.DB.audit(actor or 'system', 'event.end', old.title, { reason=reason or 'ended' })
    pushScenes()
    return true
end

RegisterCommand('eventstart', function(source, args)
    if source > 0 and not FBRP.Server.hasPermission(source, FBRP.Ace.announce) then return FBRP.Server.deny(source, FBRP.Ace.announce) end
    local duration = tonumber(args[1]) or 60
    table.remove(args, 1)
    local title = clean(table.concat(args, ' '), 80)
    if #title < 4 then return FBRP.Server.notify(source, 'Usage: /eventstart <minutes> <title>', 'error') end
    local s = FBRP.Server.sessions[source]
    local coords = source > 0 and coordsOf(source) or nil
    startEvent({ title=title,duration=duration,location='Staff event location',x=coords and coords.x,y=coords and coords.y,z=coords and coords.z,actor=s and s.discord or source,actorName=source > 0 and FBRP.Server.displayName(source) or 'Console' })
end, false)
RegisterCommand('eventend', function(source)
    if source > 0 and not FBRP.Server.hasPermission(source, FBRP.Ace.announce) then return FBRP.Server.deny(source, FBRP.Ace.announce) end
    local s = FBRP.Server.sessions[source]
    endEvent(s and s.discord or source, 'command')
end, false)

function FBRP.Server.liveOpsSnapshot()
    local players = {}
    for source, session in pairs(FBRP.Server.sessions) do
        players[#players + 1] = {
            id=source,name=FBRP.Server.displayName(source),staffDuty=session.staffDuty == true,
            organization=session.org and (session.org.name or session.org.slug) or nil,
            joined=session.discord ~= nil
        }
    end
    table.sort(players, function(a,b) return a.id < b.id end)
    local calls = {}
    for _, call in pairs(FBRP.Server.recentCalls) do
        calls[#calls + 1] = { id=call.id,kind=call.kind,callerName=call.callerName,message=call.message,at=call.at,responders=countSet(call.responders) }
    end
    table.sort(calls, function(a,b) return a.at > b.at end)
    return { online=true,generatedAt=now(),players=players,scenes=sceneList(),event=eventPublic(),calls=calls }
end

function FBRP.Server.liveOpsAction(payload)
    local action = tostring(payload.action or '')
    if action == 'announce' then
        local message = clean(payload.message, 300)
        if #message < 3 then return false, 'Announcement is too short.' end
        FBRP.Server.broadcast('FLORIDA BAY', message, {67,232,216})
        FBRP.DB.audit(payload.actor or 'portal', 'ops.announce', nil, { message=message })
        return true
    elseif action == 'event_start' then return startEvent(payload)
    elseif action == 'event_end' then return endEvent(payload.actor, 'portal')
    elseif action == 'scene_end' then return removeScene(payload.sceneId, payload.actor, 'staff') end
    return false, 'Unknown live operations action.'
end

CreateThread(function()
    while true do
        Wait(30000)
        local stamp = now()
        local changed = false
        for id, scene in pairs(scenes) do
            if scene.expiresAt <= stamp or (scene.host and GetPlayerPing(scene.host) <= 0) then
                scenes[id] = nil
                changed = true
            end
        end
        if currentEvent and currentEvent.expiresAt <= stamp then endEvent('system', 'expired')
        elseif changed then pushScenes() end
    end
end)
