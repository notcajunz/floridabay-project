-- Property door locks. Every door at every organization property (the shop items of
-- kind property) starts locked. Members of the owning organization and staff on duty hold
-- the keys: standing at a door they press E to unlock it (for everyone) and again to lock
-- it. An unlocked property relocks by itself after RELOCK_MS, on a restart, or when it
-- changes owner. A property nobody owns can only be unlocked by staff. Doors are found and
-- held shut on the client (client/propertydoors.lua); this file decides who may unlock.
-- Exact spots are placed by hand with /propset (door, terminal, bar, stash, armory, wardrobe).

local S = FBRP.Server
local sessions = S.sessions

local props = {}        -- key -> { key, label, x, y, z, radius, owner }
local manual = {}       -- key -> list of { id, kind, model, x, y, z }
local open = {}         -- key -> game time it was unlocked
local RELOCK_MS = 20 * 60 * 1000
local POINTS = { door=true, door2=true, door3=true, terminal=true, bar=true, stash=true, armory=true, wardrobe=true }
local points = {}       -- key -> { [point] = { x, y, z } }
local memberships = {}  -- source -> { at, orgs = { [orgId] = true } }

local function decode(value)
    if type(value) ~= 'string' then return value or {} end
    local ok, out = pcall(json.decode, value)
    return ok and type(out) == 'table' and out or {}
end

local function loadAll()
    local rows = MySQL.query.await([[
        SELECT i.item_key,i.label,i.data,p.org_id FROM org_shop_items i
          LEFT JOIN org_properties p ON p.item_key=i.item_key WHERE i.kind='property'
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
            }
        end
    end
    for key in pairs(open) do
        if not nextProps[key] or not props[key] or nextProps[key].owner ~= props[key].owner then open[key] = nil end
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
    props, manual, points = nextProps, nextManual, nextPoints
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

local function hasKey(source, prop)
    local s = sessions[source]
    if s and s.staffDuty then return true end
    return prop.owner ~= nil and orgsOf(source)[prop.owner] == true
end

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
    for key in pairs(open) do openList[#openList + 1] = key end
    return { props=list, keys=keys, open=openList, doors=manual }
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
AddEventHandler('playerDropped', function() memberships[source] = nil end)

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

-- The command of an organization: its leader, or a rank allowed to manage the roster. Both are
-- set in the database when the gang or business is made.
local function isCommand(source, orgId)
    local s = sessions[source]
    if not (s and s.discord and orgId) then return false end
    local row = MySQL.single.await([[
        SELECT m.manager,r.can_roster FROM organization_members m
          LEFT JOIN org_ranks r ON r.id=m.rank_id AND r.org_id=m.org_id
         WHERE m.org_id=? AND m.discord_id=?
    ]], { orgId, s.discord })
    return row ~= nil and (row.manager == 1 or row.manager == true or row.can_roster == 1 or row.can_roster == true)
end

-- Staff on duty at Community Manager or above may edit any property, the command of the
-- owning organization its own.
local function canEdit(source, prop)
    local s = sessions[source]
    if s and s.staffDuty and S.hasStaffGroupAtLeast(source, 'community_manager') then return true end
    return prop ~= nil and prop.owner ~= nil and isCommand(source, prop.owner)
end

-- The property whose placed spot (any door, terminal, stash, armory or wardrobe) the player
-- stands within 15 metres of. Nothing is assumed from the property's listed coordinates.
local function nearProperty(source)
    local ped = GetPlayerPed(source)
    local at = ped > 0 and GetEntityCoords(ped) or nil
    if not at then return nil end
    local best, bestDistance
    for _, prop in pairs(props) do
        for _, point in pairs(points[prop.key] or {}) do
            local ex, ey = at.x - point.x, at.y - point.y
            local d = math.sqrt(ex * ex + ey * ey)
            if d <= 15.0 and math.abs(at.z - point.z) < 15.0 and (not bestDistance or d < bestDistance) then best, bestDistance = prop, d end
        end
    end
    return best
end

local pendingPoint = {}  -- source -> { key, point, at } waiting for the player to confirm

local function toggle(src, key)
    local prop = props[key] or nearProperty(src)
    if not prop then return S.notify(src, 'Stand at a property door to lock or unlock it.', 'error') end
    if nearProperty(src) ~= prop then return S.notify(src, 'You are too far from that property.', 'error') end
    if not hasKey(src, prop) then return S.notify(src, 'You do not have the keys to this property.', 'error') end
    if open[prop.key] then open[prop.key] = nil else open[prop.key] = GetGameTimer() end
    S.notify(src, ('%s is now %s.'):format(prop.label, open[prop.key] and 'unlocked' or 'locked'), 'success')
    FBRP.DB.audit((sessions[src] and sessions[src].discord) or tostring(src), 'property.door_toggle', prop.key, { unlocked=open[prop.key] ~= nil })
    pushAll()
end

RegisterNetEvent('fbrp:doors:toggle', function(key)
    if sessions[source] then toggle(source, type(key) == 'string' and key or nil) end
end)
RegisterCommand('proplock', function(src) if src ~= 0 then toggle(src, nil) end end, false)
RegisterCommand('propopen', function(src) if src ~= 0 then toggle(src, nil) end end, false)

-- Breaching: a locked door can be blown open with a thrown explosive. The player plants it
-- at the door (third eye), the charge goes off after the fuse, and the property stays open
-- until it relocks like any other. Members online are warned and the breach is audited.
local BREACH_FUSE_MS, BREACH_COOLDOWN_MS = 5000, 5 * 60 * 1000
local breachAt, planting = {}, {}

RegisterNetEvent('fbrp:doors:breachStart', function(key)
    local src = source
    local prop = type(key) == 'string' and props[key] or nil
    if not (sessions[src] and prop) then return end
    if nearProperty(src) ~= prop then return S.notify(src, 'Get closer to the door.', 'error') end
    if open[prop.key] then return S.notify(src, 'The doors are already open.', 'info') end
    if breachAt[prop.key] and GetGameTimer() - breachAt[prop.key] < BREACH_COOLDOWN_MS then
        return S.notify(src, 'This property was breached a moment ago. The frame will not take another charge yet.', 'error')
    end
    planting[src] = { key=prop.key, at=GetGameTimer() }
    TriggerClientEvent('fbrp:doors:breachApproved', src, prop.key)
end)

RegisterNetEvent('fbrp:doors:breachPlanted', function(key)
    local src = source
    local job = planting[src]
    planting[src] = nil
    local prop = type(key) == 'string' and props[key] or nil
    if not (job and prop and job.key == prop.key) then return end
    local elapsed = GetGameTimer() - job.at
    if elapsed < 2000 or elapsed > 30000 or nearProperty(src) ~= prop then return end
    breachAt[prop.key] = GetGameTimer()
    local who = sessions[src] and sessions[src].discord or tostring(src)
    FBRP.DB.audit(who, 'property.breach', prop.key, { property=prop.label })
    for other in pairs(sessions) do
        if other ~= src and prop.owner and orgsOf(other)[prop.owner] then
            S.notify(other, ('Alert: someone is placing explosives on the door of %s.'):format(prop.label), 'warning')
        end
    end
    SetTimeout(BREACH_FUSE_MS, function()
        local ped = GetPlayerPed(src)
        local at = ped > 0 and GetEntityCoords(ped) or nil
        local blast, bestDistance
        for name, point in pairs(points[prop.key] or {}) do
            if name:sub(1, 4) == 'door' then
                local d = at and #(at - vector3(point.x, point.y, point.z)) or 0.0
                if not bestDistance or d < bestDistance then blast, bestDistance = point, d end
            end
        end
        if not blast and at then blast = { x=at.x, y=at.y, z=at.z } end
        open[prop.key] = GetGameTimer()
        pushAll()
        if blast and sessions[src] then TriggerClientEvent('fbrp:doors:blast', src, blast.x, blast.y, blast.z) end
    end)
end)
AddEventHandler('playerDropped', function() planting[source] = nil end)

CreateThread(function()
    while true do
        Wait(30000)
        local changed = false
        for key, since in pairs(open) do
            if GetGameTimer() - since > RELOCK_MS then open[key] = nil; changed = true end
        end
        if changed then pushAll() end
    end
end)

-- /propset <point> [property key], /propset list, /propset clear <point>: Community Manager+ on duty, or the
-- command of the owning gang or business, stand where the spot belongs. Without a key the
-- nearest property within 150 metres that the player may edit is used.
RegisterCommand('propset', function(src, args)
    if src == 0 then return end
    local s = sessions[src]
    if not s then return end
    local ped = GetPlayerPed(src)
    local at = GetEntityCoords(ped)
    local action = tostring(args[1] or ''):lower()
    local function nearest(keyArg)
        if keyArg and props[keyArg] then return canEdit(src, props[keyArg]) and props[keyArg] or nil end
        local best, bestDistance
        for _, prop in pairs(props) do
            local dx, dy = at.x - prop.x, at.y - prop.y
            local distance = math.sqrt(dx * dx + dy * dy)
            if distance <= 150.0 and (not bestDistance or distance < bestDistance) and canEdit(src, prop) then best, bestDistance = prop, distance end
        end
        return best
    end
    if action == 'list' then
        local prop = nearest(args[2])
        if not prop then return S.notify(src, 'No property you can edit within 150 metres. Community Manager+ staff on duty, or the command of the owning gang or business, only.', 'error') end
        local parts = {}
        for name in pairs(points[prop.key] or {}) do parts[#parts + 1] = name end
        table.sort(parts)
        return S.notify(src, ('%s (%s): %s'):format(prop.label, prop.key, #parts > 0 and table.concat(parts, ', ') or 'no spots set'), 'info')
    end
    local clearing = action == 'clear'
    local point = clearing and tostring(args[2] or ''):lower() or action
    if not POINTS[point] then
        return S.notify(src, 'Use /propset door|door2|door3|terminal|bar|stash|armory|wardrobe [key], /propset list, or /propset clear <point>.', 'info')
    end
    local prop = nearest(clearing and args[3] or args[2])
    if not prop then return S.notify(src, 'No property you can edit within 150 metres. Community Manager+ staff on duty, or the command of the owning gang or business, only.', 'error') end
    if clearing then
        MySQL.query.await('DELETE FROM property_points WHERE property_key=? AND point=?', { prop.key, point })
        FBRP.DB.audit(s.discord or tostring(src), 'property.point_set', prop.key, { point=point, cleared=true })
        S.notify(src, ('%s cleared for %s.'):format(point, prop.label), 'success')
        TriggerEvent('fbrp:economy:reload')
        return
    end
    -- Placing is a preview first: the client shows where the spot will go and the player confirms.
    pendingPoint[src] = { key=prop.key, point=point, at=GetGameTimer() }
    local existing = {}
    for name, spot in pairs(points[prop.key] or {}) do existing[name] = spot end
    TriggerClientEvent('fbrp:propset:preview', src, { key=prop.key, label=prop.label, point=point, existing=existing })
end, false)

-- Staff corrections: include a door the scan missed, exclude an object it wrongly locked,
-- or remove an earlier correction. Staff on duty only.
RegisterNetEvent('fbrp:doors:edit', function(action, model, x, y, z, id)
    local src = source
    local s = sessions[src]
    if not s then return end
    model, x, y, z = tonumber(model), tonumber(x), tonumber(y), tonumber(z)
    local by = s.discord or tostring(src)
    if action == 'remove' then
        id = tonumber(id)
        if not id then return end
        local row = MySQL.single.await('SELECT property_key FROM property_doors WHERE id=?', { id })
        if not row or not canEdit(src, props[row.property_key]) then return S.notify(src, 'You cannot edit that door.', 'error') end
        MySQL.query.await('DELETE FROM property_doors WHERE id=?', { id })
    elseif action == 'include' or action == 'exclude' then
        if not (model and x and y and z) then return end
        local nearest, best
        for _, prop in pairs(props) do
            local dx, dy = x - prop.x, y - prop.y
            local distance = math.sqrt(dx * dx + dy * dy)
            if distance <= prop.radius + 25.0 and (not best or distance < best) and canEdit(src, prop) then nearest, best = prop, distance end
        end
        if not nearest then return S.notify(src, 'That is not near a property you can edit.', 'error') end
        MySQL.insert.await('INSERT INTO property_doors(property_key,kind,model,x,y,z,added_by,created_at) VALUES(?,?,?,?,?,?,?,?)',
            { nearest.key, action, math.floor(model), x, y, z, by, S.now() })
        S.notify(src, ('Door %s for %s.'):format(action == 'include' and 'added' or 'excluded', nearest.label), 'success')
    else
        return
    end
    FBRP.DB.audit(by, 'property.door_edit', tostring(action), { model=model, x=x, y=y, z=z })
    loadAll()
    pushAll()
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
    if GetGameTimer() - pending.at > 5 * 60 * 1000 then return S.notify(src, 'The placement timed out. Run /propset again.', 'error') end
    if not canEdit(src, prop) then return S.notify(src, 'You cannot edit that property.', 'error') end
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
end)

RegisterNetEvent('fbrp:propset:cancel', function() pendingPoint[source] = nil end)
AddEventHandler('playerDropped', function() pendingPoint[source] = nil end)
