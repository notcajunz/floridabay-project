-- Property door locks. Every door at every organization property (the shop items of
-- kind property) is locked. Members of the organization that owns a property hold its
-- keys and walk straight through; so does staff on duty. Everyone else meets a locked
-- door. An unowned property stays locked. A member can open the property to the public
-- with /propopen (a bar or club taking customers) and close it again. Doors are found
-- and locked on the client (client/propertydoors.lua); this file decides who may pass.

local S = FBRP.Server
local sessions = S.sessions

local props = {}        -- key -> { key, label, x, y, z, radius, owner }
local manual = {}       -- key -> list of { id, kind, model, x, y, z }
local open = {}         -- key -> true while the owner has opened it to the public
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
    props, manual = nextProps, nextManual
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
        list[#list + 1] = { key=key, label=prop.label, x=prop.x, y=prop.y, z=prop.z, radius=prop.radius, owned=prop.owner ~= nil }
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

-- /propopen: a member standing at their property opens it to everyone, or locks it again.
RegisterCommand('propopen', function(src)
    if src == 0 then return end
    local ped = GetPlayerPed(src)
    local at = ped > 0 and GetEntityCoords(ped) or nil
    local found
    if at then
        for _, prop in pairs(props) do
            local dx, dy = at.x - prop.x, at.y - prop.y
            if prop.owner and math.sqrt(dx * dx + dy * dy) <= prop.radius and hasKey(src, prop) then found = prop break end
        end
    end
    if not found then return S.notify(src, 'Stand at a property you own to open or lock it.', 'error') end
    if open[found.key] then open[found.key] = nil else open[found.key] = true end
    S.notify(src, ('%s is now %s.'):format(found.label, open[found.key] and 'open to the public' or 'locked'), 'success')
    FBRP.DB.audit((sessions[src] and sessions[src].discord) or tostring(src), 'property.door_toggle', found.key, { open=open[found.key] == true })
    pushAll()
end, false)

-- Staff corrections: include a door the scan missed, exclude an object it wrongly locked,
-- or remove an earlier correction. Staff on duty only.
RegisterNetEvent('fbrp:doors:edit', function(action, model, x, y, z, id)
    local src = source
    local s = sessions[src]
    if not (s and s.staffDuty) then return end
    model, x, y, z = tonumber(model), tonumber(x), tonumber(y), tonumber(z)
    local by = s.discord or tostring(src)
    if action == 'remove' then
        id = tonumber(id)
        if not id then return end
        MySQL.query.await('DELETE FROM property_doors WHERE id=?', { id })
    elseif action == 'include' or action == 'exclude' then
        if not (model and x and y and z) then return end
        local nearest, best
        for _, prop in pairs(props) do
            local dx, dy = x - prop.x, y - prop.y
            local distance = math.sqrt(dx * dx + dy * dy)
            if distance <= prop.radius + 25.0 and (not best or distance < best) then nearest, best = prop, distance end
        end
        if not nearest then return S.notify(src, 'That is not near any property.', 'error') end
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
