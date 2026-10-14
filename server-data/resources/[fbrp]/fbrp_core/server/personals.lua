-- Personal vehicles. A model is reserved for one owner; the owner may trust a few more
-- people and the vehicle may be locked to tags so every holder of the tag can use it.
-- Rows are managed from Discord (/personal) and the website, and are re-read whenever
-- the bot calls /personals/refresh. The F7 garage spawns them (section "Personal") and
-- this module keeps everyone else out of the driver seat.

FBRP.Personals = FBRP.Personals or {}

local S = FBRP.Server
local sessions = S.sessions
local notify, hasPermission = S.notify, S.hasPermission

local personals = {}      -- id -> { id, model, hash, label, plate, owner, ownerName, trust, tags, tagLabels, bulletproof }
local holders = {}        -- tag id -> { [discord id] = true }
local restricted = {}     -- model hash -> { personal ids }; only models not sold in a public garage
local registry = {}       -- network id -> personal id (set when a personal is spawned)
local active = {}         -- personal id -> network id
local lastEject = {}      -- source -> game timer of the last notice
local synced = {}         -- source -> true once the client has its first list
local armored = {}        -- source -> true while they sit in a bulletproof personal
local pushedBypass = {}   -- source -> the bypass flag the client last received

local BYPASS = 'fbrp.personals.bypass'
local LOCK_MESSAGE = 'This personal vehicle was locked by the DevOps team.'
local lastLockNotice = {} -- source -> game timer of the last lock notice

local function hash(model) return GetHashKey(model) end

local function defaultPlate(id) return ('PV%05d'):format(id) end

local function publicModels()
    local out = {}
    for _, category in ipairs(FBRP.VehicleCatalog or {}) do
        for _, vehicle in ipairs(category.vehicles or {}) do out[hash(vehicle.model:lower())] = true end
    end
    -- Organization garages are bought in the shop; their models are public to that organization.
    local ok, rows = pcall(function() return MySQL.query.await("SELECT data FROM org_shop_items WHERE kind='vehicle'") end)
    if ok and rows then
        for _, row in ipairs(rows) do
            local decoded = type(row.data) == 'string' and select(2, pcall(json.decode, row.data)) or row.data
            if type(decoded) == 'table' and type(decoded.model) == 'string' then out[hash(decoded.model:lower())] = true end
        end
    end
    return out
end

local function load()
    local okRows, rows = pcall(function()
        return MySQL.query.await('SELECT id,model,label,plate,owner_id,bulletproof,locked FROM personal_vehicles WHERE enabled=TRUE')
    end)
    if not okRows then
        -- The lock column arrives with migration 054; keep personals working until it is applied.
        okRows, rows = pcall(function()
            return MySQL.query.await('SELECT id,model,label,plate,owner_id,bulletproof FROM personal_vehicles WHERE enabled=TRUE')
        end)
    end
    if not okRows then return end -- migration not applied yet
    local nextPersonals, ids = {}, {}
    for _, row in ipairs(rows or {}) do
        local id = tonumber(row.id)
        local model = tostring(row.model):lower()
        nextPersonals[id] = {
            id = id, model = model, hash = hash(model), label = row.label, plate = row.plate and row.plate ~= '' and row.plate or defaultPlate(id),
            owner = tostring(row.owner_id), ownerName = nil, trust = {}, tags = {}, tagLabels = {},
            bulletproof = row.bulletproof == true or tonumber(row.bulletproof) == 1,
            locked = row.locked == true or tonumber(row.locked) == 1,
        }
        ids[#ids + 1] = id
    end
    if #ids > 0 then
        for _, row in ipairs(MySQL.query.await('SELECT personal_id,discord_id FROM personal_vehicle_trust') or {}) do
            local p = nextPersonals[tonumber(row.personal_id)]
            if p then p.trust[tostring(row.discord_id)] = true end
        end
        local tagIds = {}
        for _, row in ipairs(MySQL.query.await([[
            SELECT v.personal_id,v.tag_id,t.label FROM personal_vehicle_tags v
            JOIN headtags t ON t.id=v.tag_id AND t.enabled=TRUE
        ]]) or {}) do
            local p = nextPersonals[tonumber(row.personal_id)]
            if p then
                p.tags[tonumber(row.tag_id)] = true
                p.tagLabels[#p.tagLabels + 1] = row.label
                tagIds[tonumber(row.tag_id)] = true
            end
        end
        local nextHolders = {}
        local tagList = {}
        for tagId in pairs(tagIds) do tagList[#tagList + 1] = tagId end
        if #tagList > 0 then
            for _, row in ipairs(MySQL.query.await(
                ('SELECT tag_id,discord_id FROM headtag_grants WHERE tag_id IN (%s)'):format(('?,'):rep(#tagList):sub(1, -2)), tagList
            ) or {}) do
                local tagId = tonumber(row.tag_id)
                nextHolders[tagId] = nextHolders[tagId] or {}
                nextHolders[tagId][tostring(row.discord_id)] = true
            end
        end
        holders = nextHolders

        local owners, ownerList = {}, {}
        for _, p in pairs(nextPersonals) do
            if not owners[p.owner] then owners[p.owner] = true; ownerList[#ownerList + 1] = p.owner end
        end
        for _, row in ipairs(MySQL.query.await(
            ('SELECT discord_id,name FROM players WHERE discord_id IN (%s)'):format(('?,'):rep(#ownerList):sub(1, -2)), ownerList
        ) or {}) do
            for _, p in pairs(nextPersonals) do
                if p.owner == tostring(row.discord_id) then p.ownerName = row.name end
            end
        end
    else
        holders = {}
    end

    local publics, nextRestricted = publicModels(), {}
    for id, p in pairs(nextPersonals) do
        if not publics[p.hash] then
            nextRestricted[p.hash] = nextRestricted[p.hash] or {}
            nextRestricted[p.hash][#nextRestricted[p.hash] + 1] = id
        end
    end
    personals, restricted = nextPersonals, nextRestricted
end

-- 'owner', 'trusted', 'tag' or nil.
local function accessOf(discord, p)
    if not discord or not p then return nil end
    if p.owner == discord then return 'owner' end
    if p.trust[discord] then return 'trusted' end
    for tagId in pairs(p.tags) do
        if holders[tagId] and holders[tagId][discord] then return 'tag' end
    end
    return nil
end

local function discordOf(source)
    local s = sessions[tonumber(source)]
    return s and s.discord or nil
end

local function bypasses(source)
    return hasPermission(source, BYPASS) == true
end

-- The personal id a spawned vehicle belongs to, if any.
local function personalIdOf(vehicle)
    local id = registry[NetworkGetNetworkIdFromEntity(vehicle)]
    if not id then
        local ok, value = pcall(function() return Entity(vehicle).state.fbrpPersonal end)
        id = ok and tonumber(value) or nil
    end
    return id
end

-- Bulletproof: a spawned bulletproof personal, or a personal-only model whose personal is bulletproof.
local function isBulletproof(vehicle)
    local id = personalIdOf(vehicle)
    if id then return personals[id] ~= nil and personals[id].bulletproof == true end
    for _, pid in ipairs(restricted[GetEntityModel(vehicle)] or {}) do
        if personals[pid] and personals[pid].bulletproof then return true end
    end
    return false
end

-- Whether the player may sit in the driver seat of this vehicle entity.
local function mayDrive(source, vehicle)
    local id = personalIdOf(vehicle)
    local discord = discordOf(source)
    if id then
        local p = personals[id]
        if not p then return true end -- deleted or disabled: the vehicle is no longer restricted
        return accessOf(discord, p) ~= nil or bypasses(source)
    end
    local ids = restricted[GetEntityModel(vehicle)]
    if not ids then return true end
    for _, pid in ipairs(ids) do
        if accessOf(discord, personals[pid]) then return true end
    end
    return bypasses(source)
end

-- A locked personal, or a vehicle of a personal-only model whose personal is locked.
local function isLocked(vehicle)
    local id = personalIdOf(vehicle)
    if id then return personals[id] ~= nil and personals[id].locked == true end
    for _, pid in ipairs(restricted[GetEntityModel(vehicle)] or {}) do
        if personals[pid] and personals[pid].locked then return true end
    end
    return false
end

-- Despawns a locked vehicle and tells everyone inside (or the person who touched it) that it is locked.
local function despawnLocked(source, vehicle)
    local stamp = GetGameTimer()
    local told = {}
    for src in pairs(sessions) do
        local ped = GetPlayerPed(src)
        if ped and ped ~= 0 and GetVehiclePedIsIn(ped, false) == vehicle then told[src] = true end
    end
    if source then told[source] = true end
    local netId = NetworkGetNetworkIdFromEntity(vehicle)
    registry[netId] = nil
    for pid, nid in pairs(active) do
        if nid == netId then active[pid] = nil end
    end
    if DoesEntityExist(vehicle) then DeleteEntity(vehicle) end
    for src in pairs(told) do
        if not lastLockNotice[src] or stamp - lastLockNotice[src] > 3000 then
            lastLockNotice[src] = stamp
            notify(src, LOCK_MESSAGE, 'error')
        end
    end
end

-- What the client needs to stop a player before the server has to eject them.
local function push(source)
    local discord = discordOf(source)
    local denied, models = {}, {}
    for id, p in pairs(personals) do
        if not accessOf(discord, p) then denied[#denied + 1] = id end
    end
    for modelHash, ids in pairs(restricted) do
        local can = false
        for _, pid in ipairs(ids) do
            if accessOf(discord, personals[pid]) then can = true break end
        end
        if not can then
            for _, pid in ipairs(ids) do models[personals[pid].model] = true break end
        end
    end
    local names = {}
    for model in pairs(models) do names[#names + 1] = model end
    -- Every client protects bulletproof vehicles it can see, not only the people allowed to drive them.
    local bulletproof, bulletproofModels = {}, {}
    for id, p in pairs(personals) do
        if p.bulletproof then bulletproof[#bulletproof + 1] = id end
    end
    for _, ids in pairs(restricted) do
        for _, pid in ipairs(ids) do
            if personals[pid].bulletproof then bulletproofModels[#bulletproofModels + 1] = personals[pid].model break end
        end
    end
    local locked, lockedModels = {}, {}
    for id, p in pairs(personals) do
        if p.locked then locked[#locked + 1] = id end
    end
    for _, ids in pairs(restricted) do
        for _, pid in ipairs(ids) do
            if personals[pid].locked then lockedModels[#lockedModels + 1] = personals[pid].model break end
        end
    end
    local bypass = bypasses(source)
    pushedBypass[source] = bypass
    TriggerClientEvent('fbrp:personals:sync', source, {
        denied = denied, models = names, bypass = bypass,
        bulletproof = bulletproof, bulletproofModels = bulletproofModels,
        locked = locked, lockedModels = lockedModels,
    })
end

local function pushAll()
    for src in pairs(sessions) do push(src) end
end

local function reload()
    load()
    pushAll()
end

-- F7 garage section for this player.
function FBRP.Personals.category(source)
    local discord = discordOf(source)
    if not discord then return nil end
    local list = {}
    for _, p in pairs(personals) do
        local level = accessOf(discord, p)
        if level then
            local note = level == 'owner' and ('Yours · ' .. p.plate)
                or level == 'trusted' and ('Trusted by ' .. (p.ownerName or 'the owner'))
                or ('Tag access · ' .. table.concat(p.tagLabels, ', '))
            if p.locked then note = 'Locked by the DevOps team' end
            list[#list + 1] = { model = p.model, label = p.label, key = 'p' .. p.id, note = note, sort = level == 'owner' and 0 or 1 }
        end
    end
    if #list == 0 then return nil end
    table.sort(list, function(a, b)
        if a.sort ~= b.sort then return a.sort < b.sort end
        return a.label < b.label
    end)
    return { id = 'personal', label = 'Personal', icon = 'car', vehicles = list }
end

function FBRP.Personals.spawn(source, key)
    local id = tonumber(tostring(key):match('^p(%d+)$'))
    local p = id and personals[id]
    local discord = discordOf(source)
    local level = accessOf(discord, p)
    if not p or not level then return notify(source, 'That personal vehicle is not available to you.', 'error') end
    if p.locked then
        -- Anything of theirs that is still out is removed too.
        local netId = active[id]
        if netId then
            local entity = NetworkGetEntityFromNetworkId(netId)
            if entity and entity ~= 0 and DoesEntityExist(entity) then DeleteEntity(entity) end
            registry[netId] = nil
            active[id] = nil
        end
        return notify(source, LOCK_MESSAGE, 'error')
    end

    local netId = active[id]
    if netId then
        local entity = NetworkGetEntityFromNetworkId(netId)
        if entity and entity ~= 0 and DoesEntityExist(entity) then
            local mine = GetPlayerPed(source)
            for seat = -1, 6 do
                local ped = GetPedInVehicleSeat(entity, seat)
                if ped ~= 0 and ped ~= mine and IsPedAPlayer(ped) then
                    return notify(source, ('%s is already out and in use.'):format(p.label), 'error')
                end
            end
            DeleteEntity(entity)
        end
        registry[netId] = nil
        active[id] = nil
    end

    TriggerClientEvent('fbrp:vehicles:approved', source, p.model, p.label, {
        plate = p.plate, personal = p.id, register = level == 'owner',
    })
    FBRP.DB.audit(discord or source, 'vehicle.spawn', p.model, { category = 'personal', personal = p.id, access = level })
end

-- The client creates the vehicle; it reports the network id so the server can track it.
RegisterNetEvent('fbrp:personals:spawned', function(personalId, netId)
    local src = source
    local p = personals[tonumber(personalId)]
    netId = tonumber(netId)
    if not p or not netId or not accessOf(discordOf(src), p) then return end
    CreateThread(function()
        for _ = 1, 16 do
            local entity = NetworkGetEntityFromNetworkId(netId)
            if entity and entity ~= 0 and DoesEntityExist(entity) then
                if GetEntityModel(entity) ~= p.hash then return end
                registry[netId] = p.id
                active[p.id] = netId
                return
            end
            Wait(250)
        end
    end)
end)

-- Occupants of a bulletproof personal cannot be shot. The client makes its ped bullet proof only
-- after this confirms it, and the anticheat is told the protection is legitimate (renewed every second).
local function armor(source, on)
    if on then
        pcall(function() exports.corevia_ac:recordProtectionGrant(source, 3) end)
        if not armored[source] then
            armored[source] = true
            TriggerClientEvent('fbrp:personals:armor', source, true)
        end
    elseif armored[source] then
        armored[source] = nil
        TriggerClientEvent('fbrp:personals:armor', source, false)
    end
end

-- Enforcement: nobody without access keeps the driver seat of a personal vehicle.
CreateThread(function()
    while true do
        Wait(1000)
        if S.isReady() then
            for src in pairs(sessions) do
                if not synced[src] then
                    synced[src] = true
                    push(src)
                elseif pushedBypass[src] ~= bypasses(src) then
                    -- Staff groups only count while clocked in, so the flag changes mid-session
                    -- (clock in or out, group edits). The client blocks the seat on its own copy.
                    push(src)
                end
                local ped = GetPlayerPed(src)
                if ped and ped ~= 0 then
                    local vehicle = GetVehiclePedIsIn(ped, false)
                    if vehicle ~= 0 and isLocked(vehicle) then
                        despawnLocked(src, vehicle)
                        vehicle = 0
                    end
                    armor(src, vehicle ~= 0 and isBulletproof(vehicle))
                    if vehicle ~= 0 and GetPedInVehicleSeat(vehicle, -1) == ped and not mayDrive(src, vehicle) then
                        TriggerClientEvent('fbrp:personals:eject', src)
                        local stamp = GetGameTimer()
                        if not lastEject[src] or stamp - lastEject[src] > 5000 then
                            lastEject[src] = stamp
                            notify(src, 'This is a personal vehicle. You are not trusted to drive it.', 'error')
                        end
                    end
                end
            end
        end
    end
end)

-- A client that tried to get into a locked vehicle reports it, so it despawns before they sit down.
RegisterNetEvent('fbrp:personals:lockedTouch', function(netId)
    local src = source
    netId = tonumber(netId)
    if not netId or not sessions[src] then return end
    local entity = NetworkGetEntityFromNetworkId(netId)
    if not entity or entity == 0 or not DoesEntityExist(entity) then return end
    if isLocked(entity) then despawnLocked(src, entity) end
end)

AddEventHandler('playerDropped', function()
    lastLockNotice[source] = nil
    lastEject[source] = nil
    synced[source] = nil
    armored[source] = nil
    pushedBypass[source] = nil
end)

AddEventHandler('fbrp:personals:reload', reload)

-- The website importer installed a vehicle resource: start it, or restart it when it was converted
-- again. A running one is only restarted while nobody has that model spawned, because restarting
-- streamed vehicles under players can crash them.
function FBRP.Personals.install(resource, model)
    resource = tostring(resource or '')
    if not resource:match('^fbrp_pv_[a-z0-9_]+$') then return { ok = false, error = 'bad resource' } end
    ExecuteCommand('refresh')
    local state = GetResourceState(resource)
    if state == 'started' or state == 'starting' then
        local modelHash = GetHashKey(tostring(model or resource:sub(9)))
        for _, vehicle in ipairs(GetAllVehicles()) do
            if GetEntityModel(vehicle) == modelHash then return { ok = true, state = 'in_use' } end
        end
        StopResource(resource)
        StartResource(resource)
        return { ok = GetResourceState(resource) == 'started', state = 'restarted' }
    end
    StartResource(resource)
    return { ok = GetResourceState(resource) == 'started', state = GetResourceState(resource) == 'started' and 'started' or state }
end

-- Stop an imported personal resource before the website removes its files from disk.
function FBRP.Personals.uninstall(resource)
    resource = tostring(resource or '')
    if not resource:match('^fbrp_pv_[a-z0-9_]+$') then return { ok = false, error = 'bad resource' } end
    local state = GetResourceState(resource)
    if state == 'started' or state == 'starting' then StopResource(resource) end
    return { ok = true, state = GetResourceState(resource) }
end

-- Re-read periodically as a fallback; the bot also triggers a reload on every change.
CreateThread(function()
    while not S.isReady() do Wait(500) end
    reload()
    while true do
        Wait(15000)
        reload()
    end
end)
