-- Open-world checkpoint challenges and the rotating daily geocache.
local A = FBRP.Activities
local S = FBRP.Server
local runs = {}

local function now() return os.time() * 1000 end
local function dayKey(offset)
    return os.date('!%Y-%m-%d', os.time() + (offset or 0) * 86400)
end
local function dailyCache()
    local day = math.floor(os.time() / 86400)
    return A.caches[(day % #A.caches) + 1]
end
local function distanceTo(src, point)
    local ped = GetPlayerPed(src)
    if ped <= 0 then return 999999.0 end
    return #(GetEntityCoords(ped) - vector3(point.x + 0.0, point.y + 0.0, point.z + 0.0))
end
local function publicChallenge(challenge, featured, personal, leaders)
    local points = {}
    for _, c in ipairs(challenge.checkpoints) do points[#points + 1] = { x=c.x,y=c.y,z=c.z } end
    return {
        id=challenge.id,label=challenge.label,mode=challenge.mode,icon=challenge.icon,
        description=challenge.description,checkpoints=points,featured=featured,
        personal=personal and tonumber(personal.best_ms) or nil,completions=personal and tonumber(personal.completions) or 0,
        leaders=leaders or {},
    }
end

local function payload(src)
    local session = S.sessions[src]
    if not session then return nil end
    local profile = MySQL.single.await('SELECT points,completions,caches_found,cache_streak,last_cache_day FROM activity_profiles WHERE license=?', { session.license }) or {}
    local personalRows = MySQL.query.await('SELECT challenge_id,best_ms,completions FROM activity_records WHERE license=?', { session.license })
    local personal = {}
    for _, row in ipairs(personalRows) do personal[row.challenge_id] = row end
    local leaderRows = MySQL.query.await([[
        SELECT challenge_id,name,best_ms FROM activity_records
        WHERE (challenge_id,best_ms) IN (SELECT challenge_id,MIN(best_ms) FROM activity_records GROUP BY challenge_id)
        ORDER BY challenge_id,name
    ]])
    local leaders = {}
    for _, row in ipairs(leaderRows) do
        leaders[row.challenge_id] = leaders[row.challenge_id] or {}
        local list = leaders[row.challenge_id]
        if #list < 3 then list[#list + 1] = { name=row.name,ms=tonumber(row.best_ms) } end
    end
    local featuredIndex = (math.floor(os.time() / 86400) % #A.challenges) + 1
    local challenges = {}
    for index, challenge in ipairs(A.challenges) do
        challenges[#challenges + 1] = publicChallenge(challenge, index == featuredIndex, personal[challenge.id], leaders[challenge.id])
    end
    local cache = dailyCache()
    local found = MySQL.scalar.await('SELECT 1 FROM activity_cache_finds WHERE license=? AND day_key=? LIMIT 1', { session.license, dayKey() }) ~= nil
    return {
        profile={ points=tonumber(profile.points) or 0,completions=tonumber(profile.completions) or 0,caches=tonumber(profile.caches_found) or 0,streak=tonumber(profile.cache_streak) or 0 },
        challenges=challenges,
        cache={ id=cache.id,label=cache.label,region=cache.region,clue=cache.clue,x=cache.x,y=cache.y,z=cache.z,found=found },
        active=runs[src] and { id=runs[src].id,checkpoint=runs[src].checkpoint,startedAt=runs[src].startedAt } or nil,
    }
end

local function open(src)
    local data = payload(src)
    if data then TriggerClientEvent('fbrp:activities:open', src, data) end
end

RegisterNetEvent('fbrp:activities:request', function() open(source) end)

RegisterNetEvent('fbrp:activities:start', function(rawId)
    local src = source
    local session = S.sessions[src]
    local challenge = FBRP.FindActivity(tostring(rawId or ''))
    if not session or not challenge then return end
    local player = Player(src)
    if player and (player.state['fbrp:jailed'] or player.state['fbrp:communityService'] or player.state['fbrp:downed']) then
        return S.notify(src, 'You cannot start an activity right now.', 'error')
    end
    if runs[src] then return S.notify(src, 'Finish or cancel your current activity first.', 'error') end
    if distanceTo(src, challenge.checkpoints[1]) > 80.0 then
        return TriggerClientEvent('fbrp:activities:routeStart', src, { id=challenge.id,x=challenge.checkpoints[1].x,y=challenge.checkpoints[1].y,z=challenge.checkpoints[1].z,label=challenge.label })
    end
    runs[src] = { id=challenge.id,checkpoint=1,startedAt=now(),lastAt=now() }
    TriggerClientEvent('fbrp:activities:started', src, publicChallenge(challenge, false), runs[src].startedAt)
    S.notify(src, challenge.label .. ' started. Follow the checkpoint route.', 'success')
end)

RegisterNetEvent('fbrp:activities:checkpoint', function(rawId, rawIndex)
    local src = source
    local run = runs[src]
    local challenge = run and FBRP.FindActivity(run.id)
    local index = tonumber(rawIndex)
    if not run or not challenge or tostring(rawId) ~= run.id or index ~= run.checkpoint + 1 then return end
    local point = challenge.checkpoints[index]
    if not point or distanceTo(src, point) > A.checkpointRadius + 8.0 then return end
    run.checkpoint = index
    run.lastAt = now()
    if index < #challenge.checkpoints then
        return TriggerClientEvent('fbrp:activities:advance', src, index)
    end

    local elapsed = now() - run.startedAt
    runs[src] = nil
    if elapsed < challenge.minSeconds * 1000 then
        return TriggerClientEvent('fbrp:activities:cancelled', src, 'That run was too fast to validate.')
    end
    local session = S.sessions[src]
    if not session then return end
    local old = tonumber(MySQL.scalar.await('SELECT best_ms FROM activity_records WHERE license=? AND challenge_id=?', { session.license, challenge.id }))
    local record = tonumber(MySQL.scalar.await('SELECT MIN(best_ms) FROM activity_records WHERE challenge_id=?', { challenge.id }))
    local personalBest = not old or elapsed < old
    local serverRecord = not record or elapsed < record
    local characterId = tonumber(Player(src).state['fbrp:characterId'])
    MySQL.prepare.await([[
        INSERT INTO activity_records(license,character_id,challenge_id,name,best_ms,completions,updated_at) VALUES(?,?,?,?,?,1,?)
        ON DUPLICATE KEY UPDATE character_id=VALUES(character_id),name=VALUES(name),best_ms=LEAST(best_ms,VALUES(best_ms)),completions=completions+1,updated_at=VALUES(updated_at)
    ]], { session.license,characterId,challenge.id,S.displayName(src),elapsed,now() })
    MySQL.prepare.await([[
        INSERT INTO activity_profiles(license,points,completions,updated_at) VALUES(?,?,1,?)
        ON DUPLICATE KEY UPDATE points=points+VALUES(points),completions=completions+1,updated_at=VALUES(updated_at)
    ]], { session.license, personalBest and 100 or 35, now() })
    FBRP.DB.audit(session.discord or session.license, 'activity.finish', challenge.id, { elapsed=elapsed,personalBest=personalBest,serverRecord=serverRecord })
    TriggerClientEvent('fbrp:activities:finished', src, { id=challenge.id,label=challenge.label,ms=elapsed,personalBest=personalBest,serverRecord=serverRecord,points=personalBest and 100 or 35 })
    if serverRecord then S.broadcast('ACTIVITY RECORD', ('%s set a new %s record: %.2fs!'):format(S.displayName(src),challenge.label,elapsed/1000), { 67,232,216 }) end
end)

RegisterNetEvent('fbrp:activities:cancel', function()
    runs[source] = nil
    TriggerClientEvent('fbrp:activities:cancelled', source, 'Activity cancelled.')
end)

RegisterNetEvent('fbrp:activities:cacheFind', function(rawId)
    local src = source
    local session = S.sessions[src]
    local cache = dailyCache()
    if not session or tostring(rawId or '') ~= cache.id or distanceTo(src, cache) > A.cacheRadius + 5.0 then return end
    local player = Player(src)
    if player and (player.state['fbrp:jailed'] or player.state['fbrp:communityService']) then return end
    local today = dayKey()
    local inserted = MySQL.update.await('INSERT IGNORE INTO activity_cache_finds(license,day_key,cache_id,character_id,found_at) VALUES(?,?,?,?,?)', {
        session.license,today,cache.id,tonumber(Player(src).state['fbrp:characterId']),now()
    })
    if tonumber(inserted) ~= 1 then return S.notify(src, 'You already found today\'s cache.', 'info') end
    local row = MySQL.single.await('SELECT cache_streak,last_cache_day FROM activity_profiles WHERE license=?', { session.license }) or {}
    local streak = row.last_cache_day == dayKey(-1) and (tonumber(row.cache_streak) or 0) + 1 or 1
    local points = 100 + math.min(100, (streak - 1) * 10)
    MySQL.prepare.await([[
        INSERT INTO activity_profiles(license,points,caches_found,cache_streak,last_cache_day,updated_at) VALUES(?,?,1,?,?,?)
        ON DUPLICATE KEY UPDATE points=points+VALUES(points),caches_found=caches_found+1,cache_streak=VALUES(cache_streak),last_cache_day=VALUES(last_cache_day),updated_at=VALUES(updated_at)
    ]], { session.license,points,streak,today,now() })
    FBRP.DB.audit(session.discord or session.license, 'activity.cache', cache.id, { points=points,streak=streak })
    TriggerClientEvent('fbrp:activities:cacheFound', src, { label=cache.label,points=points,streak=streak })
end)

AddEventHandler('playerDropped', function() runs[source] = nil end)

RegisterCommand('activities', function(source)
    if source > 0 then open(source) end
end, false)

