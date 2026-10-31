-- Made by Saif | © 2026 Saif. All rights reserved.
-- CarPlay server
-- The server owns the playback state of every vehicle (queue, position, pause, volume ...) and publishes it
-- through a replicated state bag (`carplay`). Clients only *render* that state with xsound, so passengers
-- who join late, people walking up to the car, and everyone's seek bar always agree.

math.randomseed(os.time())

local cars    = {}   -- [netId] = playback state (same table that is published in the state bag)
local lastAdd = {}   -- [src] = GetGameTimer() of the last add request
local uidSeq  = 0

-- ───────────────────────── helpers ─────────────────────────

local function notify(src, msg, kind)
    TriggerClientEvent('carplay:client:notify', src, msg, kind or 'info')
end

local function nextUid()
    uidSeq = uidSeq + 1
    return ('%d-%d'):format(os.time(), uidSeq)
end

local function clamp(v, lo, hi)
    v = tonumber(v) or lo
    if v < lo then return lo end
    if v > hi then return hi end
    return v
end

local function getVehicle(netId)
    if type(netId) ~= 'number' then return nil end
    local ent = NetworkGetEntityFromNetworkId(netId)
    if ent and ent ~= 0 and DoesEntityExist(ent) then return ent end
    return nil
end

local function newCar()
    return {
        queue     = {},
        index     = 0,        -- 0 = nothing playing
        paused    = false,
        startedAt = 0,        -- unix time such that  position = now - startedAt   (while playing)
        pausedAt  = 0,        -- position (seconds) while paused
        volume    = Config.DefaultVolume,
        shuffle   = false,
        loop      = 0,        -- 0 = off, 1 = repeat queue, 2 = repeat song
        outside   = Config.Audio.defaultOutside,
        rev       = 0,
    }
end

local function commit(netId)
    local car, ent = cars[netId], getVehicle(netId)
    if not car or not ent then
        cars[netId] = nil
        return
    end
    car.rev = (car.rev or 0) + 1
    Entity(ent).state:set('carplay', car, true)
end

local function destroyCar(netId)
    local ent = getVehicle(netId)
    if ent then Entity(ent).state:set('carplay', nil, true) end
    cars[netId] = nil
end

local function occupantsOf(ent)
    local out = {}
    for _, pid in ipairs(GetPlayers()) do
        local ped = GetPlayerPed(pid)
        if ped ~= 0 and GetVehiclePedIsIn(ped, false) == ent then
            out[#out + 1] = tonumber(pid)
        end
    end
    return out
end

-- mode: 'control' = occupant (+ driver only if ControlMode == 'driver'), 'near' = occupant or standing close
local function canAccess(src, netId, mode)
    local ent = getVehicle(netId)
    if not ent then return false, 'This vehicle is no longer available.' end
    local ped = GetPlayerPed(src)
    if ped == 0 then return false end

    local inside = GetVehiclePedIsIn(ped, false) == ent
    if mode == 'near' then
        if inside then return true, ent end
        local d = #(GetEntityCoords(ped) - GetEntityCoords(ent))
        if d <= (Config.Audio.distance * 2.0) then return true, ent end
        return false
    end

    if not inside then return false, 'You need to be inside the vehicle.' end
    if Config.ControlMode == 'driver' and GetPedInVehicleSeat(ent, -1) ~= ped then
        return false, 'Only the driver can control the music.'
    end
    return true, ent
end

-- The Music app needs the Car Radio Discord role (the same one /carradio uses, checked by fbrp_core).
local function hasMusicAccess(src)
    local ok, res = pcall(function() return exports.fbrp_core:HasCarRadioAccess(src) end)
    return ok and res == true
end

-- ───────────────────────── link parsing / metadata ─────────────────────────

local function trim(s) return (s:gsub('^%s+', ''):gsub('%s+$', '')) end

local function urlencode(s)
    return (s:gsub('[^%w%-_%.~]', function(c) return ('%%%02X'):format(c:byte()) end))
end

local function getQueryParam(query, key)
    for k, v in query:gmatch('([^&=?]+)=([^&]*)') do
        if k == key then return v end
    end
end

-- returns kind ('yt' | 'direct'), id, normalized url      (or nil)
local function parseLink(input)
    if type(input) ~= 'string' then return nil end
    input = trim(input)
    if #input < 5 or #input > 400 then return nil end

    if input:match('^[%w_%-]+$') and #input == 11 then
        return 'yt', input, 'https://www.youtube.com/watch?v=' .. input
    end

    local host, rest = input:match('^https?://([^/%?#]+)(.*)$')
    if not host then return nil end
    host = host:lower():gsub('^www%.', ''):gsub('^m%.', ''):gsub('^music%.', '')

    local id
    if host == 'youtu.be' then
        id = rest:match('^/([%w_%-]+)')
    elseif host == 'youtube.com' or host == 'youtube-nocookie.com' then
        id = rest:match('^/shorts/([%w_%-]+)') or rest:match('^/embed/([%w_%-]+)') or rest:match('^/live/([%w_%-]+)')
        if not id and rest:match('^/watch') then
            id = getQueryParam(rest:match('%?(.*)$') or '', 'v')
        end
    end
    if id and #id == 11 and id:match('^[%w_%-]+$') then
        return 'yt', id, 'https://www.youtube.com/watch?v=' .. id
    end

    if Config.AllowDirectLinks then
        local path = rest:match('^([^%?#]*)') or ''
        local ext = path:lower():match('%.(%w+)$')
        if ext == 'mp3' or ext == 'ogg' or ext == 'wav' or ext == 'm4a' then
            return 'direct', nil, input
        end
    end
    return nil
end

local function fetchMeta(kind, id, url, cb)
    if kind ~= 'yt' then
        local name = url:match('([^/]+)$') or 'Audio'
        cb({ title = name:sub(1, 80), author = 'Direct link' })
        return
    end
    local api = 'https://www.youtube.com/oembed?format=json&url=' .. urlencode(url)
    PerformHttpRequest(api, function(status, body)
        if status == 200 and body then
            local ok, data = pcall(json.decode, body)
            if ok and type(data) == 'table' and data.title then
                cb({ title = tostring(data.title):sub(1, 100), author = tostring(data.author_name or 'YouTube'):sub(1, 60) })
                return
            end
        end
        -- 401 = embedding disabled, 403/404 = private / removed
        if status == 401 or status == 403 or status == 404 then
            cb(nil, 'That video is unavailable or can\'t be played outside YouTube.')
            return
        end
        -- couldn't reach YouTube's oEmbed (rate limit, outage...) -> still allow it
        cb({ title = 'YouTube video', author = 'YouTube' })
    end, 'GET')
end

-- ───────────────────────── playback logic ─────────────────────────

local function position(car)
    if car.paused then return car.pausedAt or 0 end
    return math.max(0, os.time() - (car.startedAt or os.time()))
end

local function stopPlayback(car)
    car.index     = 0
    car.uid       = nil
    car.paused    = false
    car.startedAt = 0
    car.pausedAt  = 0
end

local function startIndex(car, i)
    if not car.queue[i] then return stopPlayback(car) end
    car.index     = i
    car.uid       = nextUid()
    car.paused    = false
    car.startedAt = os.time()
    car.pausedAt  = 0
end

local function pickNext(car)
    local n = #car.queue
    if n == 0 then return nil end
    if car.shuffle and n > 1 then
        local i
        repeat i = math.random(1, n) until i ~= car.index
        return i
    end
    if car.index < n then return car.index + 1 end
    if car.loop == 1 then return 1 end
    return nil
end

local function advance(car)
    local i = pickNext(car)
    if i then startIndex(car, i) else stopPlayback(car) end
end

local actions = {}

function actions.play(car, a)
    local i = math.floor(tonumber(a) or 0)
    if car.queue[i] then startIndex(car, i) end
end

function actions.pause(car)
    if car.index > 0 and not car.paused then
        car.pausedAt = position(car)
        car.paused = true
    end
end

function actions.resume(car)
    if car.index > 0 and car.paused then
        car.startedAt = os.time() - (car.pausedAt or 0)
        car.paused = false
    end
end

function actions.toggle(car)
    if car.paused then actions.resume(car) else actions.pause(car) end
end

function actions.next(car)
    if car.index > 0 then advance(car) end
end

function actions.prev(car)
    if car.index == 0 then return end
    if position(car) > 3 or car.index <= 1 then
        startIndex(car, car.index)           -- restart this song
    else
        startIndex(car, car.index - 1)
    end
end

function actions.seek(car, a)
    if car.index == 0 then return end
    local sec = clamp(a, 0, 60 * 60 * 12)
    car.startedAt = os.time() - sec
    car.pausedAt = sec
end

function actions.volume(car, a)
    car.volume = clamp(a, 0.0, 1.0)
end

function actions.shuffle(car, a)
    car.shuffle = (a == true)
end

function actions.loop(car, a)
    local m = math.floor(tonumber(a) or 0)
    if m < 0 or m > 2 then m = 0 end
    car.loop = m
end

function actions.outside(car, a)
    if Config.Audio.allowOutside then car.outside = (a == true) end
end

function actions.clear(car)
    car.queue = {}
    stopPlayback(car)
end

function actions.remove(car, a)
    local i = math.floor(tonumber(a) or 0)
    if not car.queue[i] then return end
    table.remove(car.queue, i)
    if i < car.index then
        car.index = car.index - 1
    elseif i == car.index then
        if car.queue[i] then
            startIndex(car, i)
        elseif car.loop == 1 and #car.queue > 0 then
            startIndex(car, 1)
        else
            stopPlayback(car)
        end
    end
end

local function handleAdd(src, netId, link, mode)
    local t = GetGameTimer()
    if lastAdd[src] and (t - lastAdd[src]) < Config.AddCooldown then
        notify(src, 'Slow down a little!', 'error')
        return
    end
    lastAdd[src] = t

    local kind, id, url = parseLink(link)
    if not kind then
        notify(src, Config.AllowDirectLinks and 'Please paste a valid YouTube or audio link.' or 'Please paste a valid YouTube link.', 'error')
        return
    end
    if cars[netId] and #cars[netId].queue >= Config.MaxQueue then
        notify(src, 'The queue is full.', 'error')
        return
    end

    fetchMeta(kind, id, url, function(meta, err)
        if err then notify(src, err, 'error') return end
        if not canAccess(src, netId, 'control') then return end   -- player may have left meanwhile

        local car = cars[netId] or newCar()
        cars[netId] = car
        if #car.queue >= Config.MaxQueue then notify(src, 'The queue is full.', 'error') return end

        local track = {
            link   = url,
            vid    = id,
            title  = meta.title,
            author = meta.author,
            thumb  = id and ('https://i.ytimg.com/vi/%s/mqdefault.jpg'):format(id) or nil,
            by     = GetPlayerName(src) or 'Someone',
        }

        if mode == 'now' then
            local pos = (car.index > 0) and (car.index + 1) or (#car.queue + 1)
            table.insert(car.queue, pos, track)
            startIndex(car, pos)
        elseif mode == 'next' and car.index > 0 then
            table.insert(car.queue, car.index + 1, track)
        else
            car.queue[#car.queue + 1] = track
            if car.index == 0 then startIndex(car, #car.queue) end
        end
        commit(netId)
        notify(src, ('Added: %s'):format(track.title), 'success')
    end)
end

-- ───────────────────────── events ─────────────────────────

RegisterNetEvent('carplay:server:action', function(netId, action, a, b)
    local src = source
    if type(action) ~= 'string' then return end

    local ok, res = canAccess(src, netId, 'control')
    if not ok then
        if res then notify(src, res, 'error') end
        return
    end

    -- Everything except the window toggle is the Music app.
    if action ~= 'outside' and not hasMusicAccess(src) then
        notify(src, 'CarPlay Music needs the Car Radio role from the Florida Bay Discord.', 'error')
        return
    end

    if action == 'add' then
        if type(a) ~= 'string' then return end
        handleAdd(src, netId, a, (b == 'now' or b == 'next') and b or 'queue')
        return
    end

    if action == 'outside' then cars[netId] = cars[netId] or newCar() end   -- windows work even with no music queued

    local fn = actions[action]
    local car = cars[netId]
    if not fn or not car then return end

    fn(car, a, b)
    commit(netId)
end)

-- Sent by clients when a track finished playing. First valid report wins (deduped by uid).
RegisterNetEvent('carplay:server:ended', function(netId, uid)
    local src = source
    local car = cars[netId]
    if not car or type(uid) ~= 'string' or car.uid ~= uid then return end
    if not canAccess(src, netId, 'near') then return end
    if os.time() - (car.startedAt or 0) < 2 then return end   -- ignore bogus "ended" right after start

    if car.loop == 2 then
        startIndex(car, car.index)
    else
        advance(car)
    end
    commit(netId)
end)

-- ───────────────────────── saved pins (per player, persisted with KVP) ─────────────────────────

local function licenseOf(src)
    for _, id in ipairs(GetPlayerIdentifiers(src)) do
        if id:sub(1, 8) == 'license:' then return id end
    end
    return nil
end

local function loadPins(src)
    local lic = licenseOf(src)
    if not lic then return {} end
    local raw = GetResourceKvpString('pins:' .. lic)
    if not raw then return {} end
    local ok, data = pcall(json.decode, raw)
    return (ok and type(data) == 'table') and data or {}
end

local function savePins(src, pins)
    local lic = licenseOf(src)
    if lic then SetResourceKvp('pins:' .. lic, json.encode(pins)) end
end

local function cleanName(name, fallback)
    name = tostring(name or ''):gsub('[%c<>]', ''):sub(1, 32)
    name = trim(name)
    if name == '' then return fallback end
    return name
end

RegisterNetEvent('carplay:server:requestPins', function()
    local src = source
    TriggerClientEvent('carplay:client:pins', src, loadPins(src))
end)

RegisterNetEvent('carplay:server:savePin', function(name, x, y, z)
    local src = source
    x, y, z = tonumber(x), tonumber(y), tonumber(z) or 0.0
    if not x or not y then return end

    local pins = loadPins(src)
    if #pins >= Config.MaxPins then
        notify(src, ('You can only save %d pins. Delete one first.'):format(Config.MaxPins), 'error')
        return
    end
    pins[#pins + 1] = {
        id   = ('%d-%d'):format(os.time(), math.random(1000, 9999)),
        name = cleanName(name, ('Pin %d'):format(#pins + 1)),
        x = x + 0.0, y = y + 0.0, z = z + 0.0,
    }
    savePins(src, pins)
    TriggerClientEvent('carplay:client:pins', src, pins)
    notify(src, 'Pin saved.', 'success')
end)

RegisterNetEvent('carplay:server:deletePin', function(id)
    local src = source
    local pins = loadPins(src)
    for i, p in ipairs(pins) do
        if p.id == id then
            table.remove(pins, i)
            break
        end
    end
    savePins(src, pins)
    TriggerClientEvent('carplay:client:pins', src, pins)
end)

-- Send a destination to everyone in the same vehicle.
RegisterNetEvent('carplay:server:sharePin', function(netId, name, x, y, z)
    local src = source
    x, y, z = tonumber(x), tonumber(y), tonumber(z)
    if not x or not y then return end
    local ok, ent = canAccess(src, netId, 'near')
    if not ok or GetVehiclePedIsIn(GetPlayerPed(src), false) ~= ent then return end

    name = cleanName(name, 'Shared location')
    local sent = 0
    for _, pid in ipairs(occupantsOf(ent)) do
        if pid ~= src then
            TriggerClientEvent('carplay:client:sharedPin', pid, GetPlayerName(src) or 'Someone', name, x, y, z)
            sent = sent + 1
        end
    end
    notify(src, sent > 0 and 'Destination shared with your passengers.' or 'There is nobody else in the vehicle.', sent > 0 and 'success' or 'info')
end)

-- ───────────────────────── housekeeping ─────────────────────────

-- Remove state of deleted vehicles / stop music in vehicles nobody has been in for a while.
CreateThread(function()
    while true do
        Wait(5000)
        local now = os.time()
        for netId, car in pairs(cars) do
            local ent = getVehicle(netId)
            if not ent then
                cars[netId] = nil
            elseif Config.StopWhenEmpty > 0 then
                local okE, engineOn = pcall(GetIsVehicleEngineRunning, ent)   -- engine on = music keeps playing
                if okE and engineOn then
                    car.emptySince = nil
                elseif #occupantsOf(ent) == 0 then
                    car.emptySince = car.emptySince or now
                    if now - car.emptySince >= Config.StopWhenEmpty then
                        destroyCar(netId)
                    end
                elseif car.emptySince then
                    car.emptySince = nil
                end
            end
        end
    end
end)

AddEventHandler('playerDropped', function()
    lastAdd[source] = nil
end)

-- Clear stale state bags left over from a previous run of this resource.
AddEventHandler('onResourceStart', function(res)
    if res ~= GetCurrentResourceName() then return end
    for _, veh in ipairs(GetAllVehicles()) do
        if Entity(veh).state.carplay then Entity(veh).state:set('carplay', nil, true) end
    end
end)

AddEventHandler('onResourceStop', function(res)
    if res ~= GetCurrentResourceName() then return end
    for netId in pairs(cars) do destroyCar(netId) end
end)
