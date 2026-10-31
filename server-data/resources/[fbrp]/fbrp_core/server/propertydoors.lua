-- Property and police station door locks.
--
-- Every door at an organization property (the shop items of kind property) starts locked, and
-- every door added to a police station starts locked. Doors lock and unlock one at a time:
-- standing at a door the player sees whether it is locked and presses E to flip that door only.
--   * A property door answers to the members of the organization that owns the property, and
--     only once DevOps has marked the property as set up. A pending property stays shut.
--   * A police station door answers to law enforcement personnel who are clocked in.
-- An unlocked door relocks by itself after RELOCK_MS, on a restart, or when the property
-- changes owner or is marked not set up. Doors are found and held shut on the client
-- (client/propertydoors.lua); this file decides who may unlock.
--
-- Everything about how a property is set up (door spots, terminal, bar, stash, armory,
-- wardrobe, door corrections) and which doors belong to police stations is edited through the
-- property setup menu, not chat commands. Dev Manager and above manage properties. Community
-- Director and above, on duty, may add police station doors as well.

local S = FBRP.Server
local sessions = S.sessions

local props = {}        -- key -> { key, label, x, y, z, radius, owner, ownerName, ready }
local manual = {}       -- key -> list of { id, kind, model, x, y, z }
local stationDoors = {} -- list of { dbId, id, station, model, x, y, z }
local open = {}         -- door id -> { at, group }  (group is a property key or 'station')
local RELOCK_MS = 20 * 60 * 1000
local STATION_RELOCK_MS = 60 * 60 * 1000
local POINTS = { door=true, door2=true, door3=true, terminal=true, bar=true, stash=true, armory=true, wardrobe=true }
local POINT_ORDER = { 'door', 'door2', 'door3', 'terminal', 'bar', 'stash', 'armory', 'wardrobe' }
local points = {}       -- key -> { [point] = { x, y, z } }
local memberships = {}  -- source -> { at, orgs = { [orgId] = true } }
local DEV_MANAGER_LEVEL = 5
local TOGGLE_REACH = 5.0
local DOOR_SPOT_REACH_XY, DOOR_SPOT_REACH_Z = 12.0, 12.0

local function decode(value)
    if type(value) ~= 'string' then return value or {} end
    local ok, out = pcall(json.decode, value)
    return ok and type(out) == 'table' and out or {}
end

-- The identity of one door. The client builds the same string from the door object it found,
-- so a door is named by what it is and where it stands rather than by any server counter.
local function doorId(model, x, y, z)
    return ('%d_%d_%d_%d'):format(math.floor(model), math.floor(x * 10), math.floor(y * 10), math.floor(z * 10))
end

local function policeStations()
    local list = {}
    local stations = (FBRP.Economy and FBRP.Economy.departments and FBRP.Economy.departments.stations) or {}
    for _, station in ipairs(stations) do
        if station.types and station.types.leo then
            list[#list + 1] = { label=station.label, x=station.x, y=station.y, z=station.z }
        end
    end
    return list
end

local function loadAll()
    local rows = MySQL.query.await([[
        SELECT i.item_key,i.label,i.data,p.org_id,p.setup_status,o.name org_name FROM org_shop_items i
          LEFT JOIN org_properties p ON p.item_key=i.item_key
          LEFT JOIN organizations o ON o.id=p.org_id WHERE i.kind='property'
    ]]) or {}
    local nextProps = {}
    for _, row in ipairs(rows) do
        local d = decode(row.data)
        if tonumber(d.x) and tonumber(d.y) then
            nextProps[row.item_key] = {
                key=row.item_key, label=row.label,
                x=tonumber(d.x) + 0.0, y=tonumber(d.y) + 0.0, z=(tonumber(d.z) or 30.0) + 0.0,
                radius=tonumber(d.doorRadius) or math.max(tonumber(d.radius) or 35.0, 50.0),
                owner=row.org_id and tonumber(row.org_id) or nil,
                ownerName=row.org_name,
                ready=row.org_id ~= nil and row.setup_status == 'ready',
            }
        end
    end
    -- Doors relock when their property changes hands or stops being set up.
    for id, state in pairs(open) do
        if state.group ~= 'station' then
            local was, now = props[state.group], nextProps[state.group]
            if not now or not was or now.owner ~= was.owner or now.ready ~= was.ready then open[id] = nil end
        end
    end
    local nextManual = {}
    for _, row in ipairs(MySQL.query.await('SELECT id,property_key,kind,model,x,y,z FROM property_doors') or {}) do
        local list = nextManual[row.property_key] or {}
        list[#list + 1] = { id=tonumber(row.id), kind=row.kind, model=tonumber(row.model), x=tonumber(row.x), y=tonumber(row.y), z=tonumber(row.z) }
        nextManual[row.property_key] = list
    end
    local nextPoints = {}
    for _, row in ipairs(MySQL.query.await('SELECT property_key,point,x,y,z FROM property_points') or {}) do
        nextPoints[row.property_key] = nextPoints[row.property_key] or {}
        nextPoints[row.property_key][row.point] = { x=tonumber(row.x), y=tonumber(row.y), z=tonumber(row.z) }
    end
    local nextStation = {}
    for _, row in ipairs(MySQL.query.await('SELECT id,station,model,x,y,z FROM station_doors ORDER BY station,id') or {}) do
        local model, x, y, z = tonumber(row.model), tonumber(row.x), tonumber(row.y), tonumber(row.z)
        nextStation[#nextStation + 1] = { dbId=tonumber(row.id), id=doorId(model, x, y, z), station=row.station, model=model, x=x, y=y, z=z }
    end
    local keep = {}
    for _, door in ipairs(nextStation) do keep[door.id] = true end
    for id, state in pairs(open) do
        if state.group == 'station' and not keep[id] then open[id] = nil end
    end
    props, manual, points, stationDoors = nextProps, nextManual, nextPoints, nextStation
    memberships = {}
end

local function orgsOf(source)
    local cached = memberships[source]
    if cached and GetGameTimer() - cached.at < 30000 then return cached.orgs end
    local s = sessions[source]
    local orgs = {}
    if s and s.discord then
        for _, row in ipairs(MySQL.query.await('SELECT org_id FROM organization_members WHERE discord_id=?', { s.discord }) or {}) do
            orgs[tonumber(row.org_id)] = true
        end
    end
    memberships[source] = { at=GetGameTimer(), orgs=orgs }
    return orgs
end

-- ─────────────────────── who may do what ───────────────────────

local devCache = {}
-- Dev Manager and above: an active member of the DevOps roster at Development Manager (level 5)
-- or higher. The same roster decides the Dev Manager+ Discord role.
local function isDevManager(source)
    local s = sessions[source]
    if not (s and s.discord) then return false end
    local cached = devCache[source]
    if cached and GetGameTimer() - cached.at < 60000 then return cached.ok end
    local ok = MySQL.scalar.await([[
        SELECT 1 FROM devops_members m JOIN devops_ranks r ON r.role_id=m.rank_role_id
         WHERE m.discord_id=? AND m.status='active' AND r.level>=? LIMIT 1
    ]], { s.discord, DEV_MANAGER_LEVEL }) ~= nil
    devCache[source] = { at=GetGameTimer(), ok=ok }
    return ok
end

local directorThreshold
-- Executive Management and above (staff ranks), on duty.
local function isExecutiveManagement(source)
    local s = sessions[source]
    if not (s and s.staffDuty) then return false end
    if directorThreshold == nil or GetGameTimer() - directorThreshold.at > 300000 then
        local rank = MySQL.scalar.await([[
            SELECT rank_order FROM ace_groups
             WHERE staff_only=TRUE AND (name='executive_management' OR label='Executive Management')
             ORDER BY rank_order LIMIT 1
        ]])
        directorThreshold = { at=GetGameTimer(), rank=tonumber(rank) }
    end
    if not directorThreshold.rank then return false end
    for _, group in ipairs(s.groups or {}) do
        local staffOnly = group.staff_only == 1 or group.staff_only == true
        if staffOnly and tonumber(group.rank_order or -1) >= directorThreshold.rank then return true end
    end
    return false
end

local function canManageProperties(source) return isDevManager(source) end
local function canManageStations(source) return isDevManager(source) or isExecutiveManagement(source) end

-- Law enforcement that is clocked in to a law enforcement organization right now.
local function isClockedInLeo(source)
    local s = sessions[source]
    return s ~= nil and s.org ~= nil and s.org.type == 'leo'
end

-- A property is opened by the members of the organization that owns it, once it is set up.
-- Dev Managers also hold the keys, since setting a property up means walking through it.
local function hasKey(source, prop)
    if prop.ready and prop.owner and orgsOf(source)[prop.owner] == true then return true end
    return isDevManager(source)
end

-- ─────────────────────── payload to every client ───────────────────────

local function payloadFor(source)
    local list, keys = {}, {}
    for key, prop in pairs(props) do
        local doorPoints = {}
        for name, point in pairs(points[key] or {}) do
            if name:sub(1, 4) == 'door' then doorPoints[#doorPoints + 1] = point end
        end
        list[#list + 1] = { key=key, label=prop.label, x=prop.x, y=prop.y, z=prop.z, radius=prop.radius, owned=prop.owner ~= nil, doorPoints=doorPoints }
        if hasKey(source, prop) then keys[#keys + 1] = key end
    end
    local openList = {}
    for id in pairs(open) do openList[#openList + 1] = id end
    local station = {}
    for _, door in ipairs(stationDoors) do station[#station + 1] = { id=door.id, model=door.model, x=door.x, y=door.y, z=door.z } end
    return { props=list, keys=keys, open=openList, doors=manual, stationDoors=station, leo=isClockedInLeo(source) }
end

local function push(source)
    if sessions[source] then TriggerClientEvent('fbrp:doors:data', source, payloadFor(source)) end
end

local function pushAll()
    for source in pairs(sessions) do push(source) end
end

RegisterNetEvent('fbrp:doors:request', function()
    local src = source
    if sessions[src] then memberships[src] = nil; push(src) end
end)

AddEventHandler('fbrp:economy:reload', function()
    loadAll()
    pushAll()
end)
-- Clocking in or out of a law enforcement organization changes who holds the station keys.
AddEventHandler('fbrp:organizationDutyChanged', function(source)
    source = tonumber(source)
    if source and sessions[source] then push(source) end
end)
AddEventHandler('playerDropped', function() memberships[source] = nil; devCache[source] = nil end)

CreateThread(function()
    while not S.isReady() do Wait(500) end
    Wait(2500)
    loadAll()
    pushAll()
    -- Membership changes (hired, fired, left) reach players within a minute.
    while true do
        Wait(60000)
        memberships = {}
        pushAll()
    end
end)

-- ─────────────────────── locking one door ───────────────────────

-- The door the player named, if the player really stands at it. Returns its id and the group
-- that answers for it: a property, or 'station'.
local function resolveDoor(source, model, x, y, z)
    model, x, y, z = tonumber(model), tonumber(x), tonumber(y), tonumber(z)
    if not (model and x and y and z) then return nil end
    local ped = GetPlayerPed(source)
    local at = ped > 0 and GetEntityCoords(ped) or nil
    if not at or #(at - vector3(x, y, z)) > TOGGLE_REACH then return nil, 'You are too far from that door.' end
    local id = doorId(model, x, y, z)
    for _, door in ipairs(stationDoors) do
        if door.id == id then return id, 'station', nil, { x=x, y=y, z=z } end
    end
    for _, prop in pairs(props) do
        for name, point in pairs(points[prop.key] or {}) do
            if name:sub(1, 4) == 'door' then
                local dx, dy = x - point.x, y - point.y
                if dx * dx + dy * dy <= DOOR_SPOT_REACH_XY * DOOR_SPOT_REACH_XY and math.abs(z - point.z) < DOOR_SPOT_REACH_Z then
                    return id, prop.key, prop, { x=x, y=y, z=z }
                end
            end
        end
    end
    return nil, 'That door is not part of a property or police station.'
end

local lastToggle = {}

RegisterNetEvent('fbrp:doors:toggle', function(model, x, y, z)
    local src = source
    if not sessions[src] then return end
    local now = GetGameTimer()
    if lastToggle[src] and now - lastToggle[src] < 400 then return end
    lastToggle[src] = now
    local id, group, prop = resolveDoor(src, model, x, y, z)
    if not id then return S.notify(src, group or 'Stand at a door.', 'error') end
    if group == 'station' then
        if not isClockedInLeo(src) then return S.notify(src, 'Only law enforcement on duty can use this door.', 'error') end
    else
        if not prop.ready then return S.notify(src, 'This property has not been set up yet.', 'error') end
        if not hasKey(src, prop) then return S.notify(src, 'You do not have the keys to this door.', 'error') end
    end
    if open[id] then open[id] = nil else open[id] = { at=GetGameTimer(), group=group } end
    S.notify(src, ('Door %s.'):format(open[id] and 'unlocked' or 'locked'), 'success')
    FBRP.DB.audit((sessions[src] and sessions[src].discord) or tostring(src), 'property.door_toggle', group == 'station' and 'station' or group, { door=id, unlocked=open[id] ~= nil })
    pushAll()
end)
AddEventHandler('playerDropped', function() lastToggle[source] = nil end)

-- Breaching: a locked property door can be blown open with a thrown explosive. The player plants
-- it at the door (third eye), the charge goes off after the fuse, and that door stays open until
-- it relocks like any other. Members online are warned and the breach is audited. Police station
-- doors cannot be breached.
local BREACH_FUSE_MS, BREACH_COOLDOWN_MS = 5000, 5 * 60 * 1000
local breachAt, planting = {}, {}

RegisterNetEvent('fbrp:doors:breachStart', function(model, x, y, z)
    local src = source
    if not sessions[src] then return end
    local id, group, prop = resolveDoor(src, model, x, y, z)
    if not id then return S.notify(src, group or 'Get closer to the door.', 'error') end
    if group == 'station' then return S.notify(src, 'This door cannot be breached.', 'error') end
    if open[id] then return S.notify(src, 'The door is already open.', 'info') end
    if breachAt[id] and GetGameTimer() - breachAt[id] < BREACH_COOLDOWN_MS then
        return S.notify(src, 'This door was breached a moment ago. The frame will not take another charge yet.', 'error')
    end
    planting[src] = { id=id, group=group, x=tonumber(x), y=tonumber(y), z=tonumber(z), model=tonumber(model), at=GetGameTimer() }
    TriggerClientEvent('fbrp:doors:breachApproved', src, model, x, y, z)
end)

RegisterNetEvent('fbrp:doors:breachPlanted', function(model, x, y, z)
    local src = source
    local job = planting[src]
    planting[src] = nil
    if not job then return end
    local id, group, prop = resolveDoor(src, model, x, y, z)
    if not (id and id == job.id and prop) then return end
    local elapsed = GetGameTimer() - job.at
    if elapsed < 2000 or elapsed > 30000 then return end
    breachAt[id] = GetGameTimer()
    local who = sessions[src] and sessions[src].discord or tostring(src)
    FBRP.DB.audit(who, 'property.breach', prop.key, { property=prop.label, door=id })
    for other in pairs(sessions) do
        if other ~= src and prop.owner and orgsOf(other)[prop.owner] then
            S.notify(other, ('Alert: someone is placing explosives on a door of %s.'):format(prop.label), 'warning')
        end
    end
    SetTimeout(BREACH_FUSE_MS, function()
        open[id] = { at=GetGameTimer(), group=prop.key }
        pushAll()
        if sessions[src] then TriggerClientEvent('fbrp:doors:blast', src, job.x, job.y, job.z) end
    end)
end)
AddEventHandler('playerDropped', function() planting[source] = nil end)

CreateThread(function()
    while true do
        Wait(30000)
        local changed = false
        for id, state in pairs(open) do
            local limit = state.group == 'station' and STATION_RELOCK_MS or RELOCK_MS
            if GetGameTimer() - state.at > limit then open[id] = nil; changed = true end
        end
        if changed then pushAll() end
    end
end)

-- ─────────────────────── the setup menu ───────────────────────

local pendingPoint = {}  -- source -> { key, point, at } waiting for the player to confirm
local menuOpen = {}      -- source -> true while the menu is showing

local function menuPayload(source)
    local canProps, canStations = canManageProperties(source), canManageStations(source)
    if not (canProps or canStations) then return nil end
    local ped = GetPlayerPed(source)
    local at = ped > 0 and GetEntityCoords(ped) or vector3(0.0, 0.0, 0.0)
    local data = { canProps=canProps, canStations=canStations, pointOrder=POINT_ORDER, props={}, stations={}, stationDoors={} }
    if canProps then
        for key, prop in pairs(props) do
            local spots = {}
            for name in pairs(points[key] or {}) do spots[name] = true end
            local status = 'unowned'
            if prop.owner then status = prop.ready and 'ready' or 'pending' end
            data.props[#data.props + 1] = {
                key=key, label=prop.label, owner=prop.ownerName, status=status, spots=spots,
                corrections=manual[key] or {}, x=prop.x, y=prop.y, z=prop.z,
                distance=math.floor(#(at - vector3(prop.x, prop.y, prop.z))),
            }
        end
        table.sort(data.props, function(a, b) return a.distance < b.distance end)
    end
    if canStations then
        for _, station in ipairs(policeStations()) do
            data.stations[#data.stations + 1] = {
                label=station.label, x=station.x, y=station.y, z=station.z,
                distance=math.floor(#(at - vector3(station.x, station.y, station.z))),
            }
        end
        table.sort(data.stations, function(a, b) return a.distance < b.distance end)
        for _, door in ipairs(stationDoors) do
            data.stationDoors[#data.stationDoors + 1] = {
                id=door.dbId, station=door.station, x=door.x, y=door.y, z=door.z,
                distance=math.floor(#(at - vector3(door.x, door.y, door.z))),
            }
        end
    end
    return data
end

local function sendMenu(source, opening)
    local data = menuPayload(source)
    if not data then return false end
    menuOpen[source] = true
    TriggerClientEvent(opening and 'fbrp:propmenu:data' or 'fbrp:propmenu:update', source, data)
    return true
end

RegisterNetEvent('fbrp:propmenu:open', function()
    local src = source
    if not sessions[src] then return end
    if not sendMenu(src, true) then
        S.notify(src, 'Only Dev Manager and above manage properties. Executive Management and above on duty add police station doors.', 'error')
    end
end)

RegisterNetEvent('fbrp:propmenu:refresh', function()
    if sessions[source] and menuOpen[source] then sendMenu(source, false) end
end)

RegisterNetEvent('fbrp:propmenu:closed', function() menuOpen[source] = nil end)
AddEventHandler('playerDropped', function() menuOpen[source] = nil end)

-- Placing a spot is a preview first: the client shows where it will go and the player confirms.
RegisterNetEvent('fbrp:propmenu:setpoint', function(key, point)
    local src = source
    local s = sessions[src]
    if not s then return end
    point = type(point) == 'string' and point:lower() or ''
    local prop = type(key) == 'string' and props[key] or nil
    if not (prop and POINTS[point]) then return end
    if not canManageProperties(src) then return S.notify(src, 'Only Dev Manager and above manage properties.', 'error') end
    pendingPoint[src] = { key=prop.key, point=point, at=GetGameTimer() }
    local existing = {}
    for name, spot in pairs(points[prop.key] or {}) do existing[name] = spot end
    TriggerClientEvent('fbrp:propset:preview', src, { key=prop.key, label=prop.label, point=point, existing=existing })
end)

RegisterNetEvent('fbrp:propmenu:clearpoint', function(key, point)
    local src = source
    local s = sessions[src]
    if not s then return end
    point = type(point) == 'string' and point:lower() or ''
    local prop = type(key) == 'string' and props[key] or nil
    if not (prop and POINTS[point]) then return end
    if not canManageProperties(src) then return S.notify(src, 'Only Dev Manager and above manage properties.', 'error') end
    MySQL.query.await('DELETE FROM property_points WHERE property_key=? AND point=?', { prop.key, point })
    FBRP.DB.audit(s.discord or tostring(src), 'property.point_set', prop.key, { point=point, cleared=true })
    S.notify(src, ('%s cleared for %s.'):format(point, prop.label), 'success')
    TriggerEvent('fbrp:economy:reload')
    sendMenu(src, false)
end)

-- Door corrections: include a door the scan missed, exclude an object it wrongly locked, or
-- remove an earlier correction. Dev Manager and above.
RegisterNetEvent('fbrp:doors:edit', function(action, model, x, y, z, id, key)
    local src = source
    local s = sessions[src]
    if not s then return end
    if not canManageProperties(src) then return S.notify(src, 'Only Dev Manager and above edit property doors.', 'error') end
    model, x, y, z = tonumber(model), tonumber(x), tonumber(y), tonumber(z)
    local by = s.discord or tostring(src)
    if action == 'remove' then
        id = tonumber(id)
        if not id then return end
        MySQL.query.await('DELETE FROM property_doors WHERE id=?', { id })
    elseif action == 'include' or action == 'exclude' then
        if not (model and x and y and z) then return end
        local target = type(key) == 'string' and props[key] or nil
        if not target then
            local best
            for _, prop in pairs(props) do
                local dx, dy = x - prop.x, y - prop.y
                local distance = math.sqrt(dx * dx + dy * dy)
                if distance <= prop.radius + 25.0 and (not best or distance < best) then target, best = prop, distance end
            end
        end
        if not target then return S.notify(src, 'That is not near a property.', 'error') end
        MySQL.insert.await('INSERT INTO property_doors(property_key,kind,model,x,y,z,added_by,created_at) VALUES(?,?,?,?,?,?,?,?)',
            { target.key, action, math.floor(model), x, y, z, by, S.now() })
        S.notify(src, ('Door %s for %s.'):format(action == 'include' and 'added' or 'excluded', target.label), 'success')
    else
        return
    end
    FBRP.DB.audit(by, 'property.door_edit', tostring(action), { model=model, x=x, y=y, z=z })
    loadAll()
    pushAll()
    sendMenu(src, false)
end)

-- Police station doors: Executive Management and above on duty, and Dev Manager and above.
RegisterNetEvent('fbrp:stationdoors:add', function(station, model, x, y, z)
    local src = source
    local s = sessions[src]
    if not s then return end
    if not canManageStations(src) then return S.notify(src, 'Only Executive Management and above on duty add police station doors.', 'error') end
    model, x, y, z = tonumber(model), tonumber(x), tonumber(y), tonumber(z)
    station = type(station) == 'string' and station:gsub('^%s+', ''):gsub('%s+$', ''):sub(1, 60) or ''
    if station == '' or not (model and x and y and z) then return S.notify(src, 'Pick a station and stand next to the door.', 'error') end
    local ped = GetPlayerPed(src)
    local at = ped > 0 and GetEntityCoords(ped) or nil
    if not at or #(at - vector3(x, y, z)) > 8.0 then return S.notify(src, 'Stand next to the door you are adding.', 'error') end
    local id = doorId(model, x, y, z)
    for _, door in ipairs(stationDoors) do
        if door.id == id then return S.notify(src, 'That door is already on a police station.', 'info') end
    end
    MySQL.insert.await('INSERT INTO station_doors(station,model,x,y,z,added_by,created_at) VALUES(?,?,?,?,?,?,?)',
        { station, math.floor(model), x, y, z, s.discord or tostring(src), S.now() })
    FBRP.DB.audit(s.discord or tostring(src), 'station.door_add', station, { model=model, x=x, y=y, z=z })
    S.notify(src, ('Door added to %s. Only clocked-in law enforcement can use it.'):format(station), 'success')
    loadAll()
    pushAll()
    sendMenu(src, false)
end)

RegisterNetEvent('fbrp:stationdoors:remove', function(dbId)
    local src = source
    local s = sessions[src]
    if not s then return end
    if not canManageStations(src) then return S.notify(src, 'Only Executive Management and above on duty remove police station doors.', 'error') end
    dbId = tonumber(dbId)
    if not dbId then return end
    MySQL.query.await('DELETE FROM station_doors WHERE id=?', { dbId })
    FBRP.DB.audit(s.discord or tostring(src), 'station.door_remove', tostring(dbId), {})
    S.notify(src, 'Station door removed.', 'success')
    loadAll()
    pushAll()
    sendMenu(src, false)
end)

-- The player confirmed (or cancelled) the previewed spot. The position is read here, not trusted
-- from the client, and the right to edit is checked again.
RegisterNetEvent('fbrp:propset:confirm', function()
    local src = source
    local pending = pendingPoint[src]
    pendingPoint[src] = nil
    local s = sessions[src]
    local prop = pending and props[pending.key]
    if not (s and prop) then return end
    if GetGameTimer() - pending.at > 5 * 60 * 1000 then return S.notify(src, 'The placement timed out. Open the property menu and place it again.', 'error') end
    if not canManageProperties(src) then return S.notify(src, 'Only Dev Manager and above manage properties.', 'error') end
    local ped = GetPlayerPed(src)
    if ped <= 0 then return end
    local at = GetEntityCoords(ped)
    MySQL.query.await([[
        INSERT INTO property_points(property_key,point,x,y,z,set_by,set_at) VALUES(?,?,?,?,?,?,?)
        ON DUPLICATE KEY UPDATE x=VALUES(x),y=VALUES(y),z=VALUES(z),set_by=VALUES(set_by),set_at=VALUES(set_at)
    ]], { prop.key, pending.point, at.x, at.y, at.z - 1.0, s.discord or tostring(src), S.now() })
    FBRP.DB.audit(s.discord or tostring(src), 'property.point_set', prop.key, { point=pending.point, cleared=false, x=at.x, y=at.y, z=at.z })
    S.notify(src, ('%s placed for %s.'):format(pending.point, prop.label), 'success')
    TriggerEvent('fbrp:economy:reload')
    TriggerClientEvent('fbrp:propmenu:reopen', src, prop.key)
end)

RegisterNetEvent('fbrp:propset:cancel', function()
    local src = source
    local pending = pendingPoint[src]
    pendingPoint[src] = nil
    if pending then TriggerClientEvent('fbrp:propmenu:reopen', src, pending.key) end
end)
AddEventHandler('playerDropped', function() pendingPoint[source] = nil end)
