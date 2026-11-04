local sessions = {}
local appliedPrincipals = {}
local connectPrincipals = {} -- discord id -> { [principal]=true } granted at connect time (see playerConnecting)
local appliedAces = {}
local permissionRows = {}
local groupTierCache = {}   -- ACE group name -> vMenu staff tier, refreshed with the permission model
local pendingSearches = {}
local cuffShotCooldowns = {}
local ready = false
local stateVersion = 0

-- Modules loaded after this file register third-eye actions here: a handler
-- runs the action, a visibility check hides it when it does not apply.
FBRP.InteractionHandlers = FBRP.InteractionHandlers or {}
FBRP.InteractionVisible = FBRP.InteractionVisible or {}

local function now()
    return os.time() * 1000
end

local function clean(value, max)
    value = tostring(value or ''):gsub('[%c]', ' '):gsub('^%s+', ''):gsub('%s+$', '')
    return value:sub(1, max or 120)
end

-- Assign a six-digit, non-sequential public case ID. The unique database index
-- settles the extremely unlikely race where two writers pick the same number.
local function assignPublicCaseId(id)
    for _ = 1, 20 do
        local publicId = ('FB-%06d'):format(math.random(100000, 999999))
        local exists = MySQL.scalar.await('SELECT 1 FROM moderation_cases WHERE ban_id=? LIMIT 1', { publicId })
        if not exists then
            local ok, changed = pcall(function()
                return MySQL.update.await('UPDATE moderation_cases SET ban_id=? WHERE id=? AND ban_id IS NULL', { publicId, id })
            end)
            if ok and tonumber(changed or 0) > 0 then return publicId end
        end
    end
    error('Could not allocate a unique public case ID')
end

local function identifier(source, kind)
    local prefix = kind .. ':'
    for _, value in ipairs(GetPlayerIdentifiers(source)) do
        if value:sub(1, #prefix) == prefix then return value end
    end
    return nil
end

local function discordId(source)
    local value = identifier(source, 'discord')
    return value and value:sub(9) or nil
end

local function groupPrincipal(name)
    return 'group.fbrp_' .. tostring(name):gsub('[^%w_%-]', '')
end

local function vmenuPrincipal(name)
    return groupPrincipal(name) .. '_vmenu'
end

local function notify(source, message, tone)
    TriggerClientEvent('ox_lib:notify', source, { description = clean(message, 300), type = tone or 'info' })
end

-- ox_lib notification for tag changes (wearing a tag, clearing a slot, duty tags).
local function tagNotify(source, message, tone)
    TriggerClientEvent('ox_lib:notify', source, { title = 'Tags', description = clean(message, 200), type = tone or 'inform', duration = 5000, position = 'center-right' })
end

local function chat(source, title, message, color)
    if GetResourceState('fbrp_chat') == 'started' then
        local rgb = color or { 67, 232, 216 }
        local ok = pcall(function()
            exports['fbrp_chat']:SendMessage(source, {
                badge = clean(title, 24),
                message = clean(message, 500),
                color = ('#%02X%02X%02X'):format(rgb[1] or 67, rgb[2] or 232, rgb[3] or 216),
                icon = 'bx-message-rounded-detail'
            })
        end)
        if ok then return end
    end
    TriggerClientEvent('chat:addMessage', source, {
        color = color or { 67, 232, 216 },
        multiline = true,
        args = { title, clean(message, 500) }
    })
end

local function broadcast(title, message, color)
    if GetResourceState('fbrp_chat') == 'started' then
        local rgb = color or { 67, 232, 216 }
        local ok = pcall(function()
            exports['fbrp_chat']:SendMessage(-1, {
                badge = clean(title, 24),
                message = clean(message, 500),
                color = ('#%02X%02X%02X'):format(rgb[1] or 67, rgb[2] or 232, rgb[3] or 216),
                icon = 'bx-broadcast'
            })
        end)
        if ok then return end
    end
    TriggerClientEvent('chat:addMessage', -1, {
        color = color or { 67, 232, 216 },
        multiline = true,
        args = { title, clean(message, 500) }
    })
end

local function acePatternMatches(pattern, object)
    if pattern == '*' then return true end
    if pattern == object then return true end
    if pattern:sub(-2) == '.*' then
        local prefix = pattern:sub(1, -2)
        return object == prefix or object:sub(1, #prefix + 1) == prefix .. '.'
    end
    return false
end

-- vMenu snapshots permissions before the player's database session is ready, so
-- staff groups also receive a connect-time vMenu-only principal. Never mirror
-- an explicit NoClip grant onto that always-on principal. vMenu.Everything
-- still needs to preserve unrelated player-facing features; the client gate
-- strips its NoClip result unless the server authorizes the current duty.
local function offDutyVmenuObject(object)
    if type(object) ~= 'string' or object:sub(1, 6) ~= 'vMenu.' then return false end
    return not acePatternMatches(object, 'vMenu.NoClip')
end

-- vMenu.Everything is never applied as a wildcard (see config_vmenu.lua): it is the
-- parent of NoClip and of the voice chat permissions in vMenu's client. A row granting
-- it is replaced by the concrete permissions it stands for.
local function effectiveAceRows(row)
    if row.object == 'vMenu.Everything' and row.mode == 'allow' then
        local out = {}
        for _, object in ipairs(FBRP.VmenuEverything) do
            out[#out + 1] = { group_name=row.group_name, object=object, mode='allow' }
        end
        return out
    end
    return { row }
end

local function membershipRows(discord)
    if not discord then return {} end
    return MySQL.query.await([[
        SELECT DISTINCT g.name,g.label,g.staff_only,g.rank_order
        FROM ace_memberships m
        JOIN ace_groups g ON g.name=m.group_name
        WHERE m.discord_id=?
          AND NOT EXISTS (
              SELECT 1 FROM global_role_strips rs WHERE rs.discord_id=m.discord_id
          )
        ORDER BY g.rank_order DESC
    ]], { discord })
end

local function discordHasRole(discord, roleId)
    if not discord or not roleId or tostring(roleId) == '' then return false end
    return MySQL.scalar.await([[
        SELECT 1 FROM discord_member_cache
        WHERE discord_id=? AND JSON_CONTAINS(roles, JSON_QUOTE(?))
        LIMIT 1
    ]], { tostring(discord), tostring(roleId) }) ~= nil
end

function FBRP.HasCarRadioAccess(source)
    local s = sessions[tonumber(source)]
    return s ~= nil and s.carRadioAccess == true
end

local function hasStaffGroupAtLeast(source, minimumGroup)
    local s = sessions[tonumber(source)]
    if not s or not minimumGroup or minimumGroup == '' then return false end
    local threshold = MySQL.scalar.await(
        'SELECT rank_order FROM ace_groups WHERE name=? AND staff_only=TRUE LIMIT 1',
        { minimumGroup }
    )
    threshold = tonumber(threshold)
    if not threshold then return false end
    for _, group in ipairs(s.groups or {}) do
        local staffOnly = group.staff_only == 1 or group.staff_only == true
        if staffOnly and tonumber(group.rank_order or -1) >= threshold then return true end
    end
    return false
end

local function isStaffMember(source)
    local s = sessions[tonumber(source)]
    if not s then return false end
    for _, group in ipairs(s.groups or {}) do
        if group.staff_only == 1 or group.staff_only == true then return true end
    end
    return false
end

local function databasePermission(source, object)
    local s = sessions[tonumber(source)]
    if not s then return false end
    local allowed = false
    for _, group in ipairs(s.groups or {}) do
        local staffOnly = group.staff_only == 1 or group.staff_only == true
        if not staffOnly or s.staffDuty then
            for _, entry in ipairs(permissionRows[group.name] or {}) do
                if acePatternMatches(entry.object, object) then
                    if entry.mode == 'deny' then return false end
                    allowed = true
                end
            end
        end
    end
    return allowed
end

-- Police and EMS tools (and their garage sections) only work while clocked into an organization of the
-- matching type (/duty), whatever ACE groups the player holds.
local DEPARTMENT_TOOLS = {
    { prefix='fbrp.police', types={ leo=true }, label='a law enforcement department' },
    { prefix='fbrp.ems', types={ fire=true }, label='a fire & EMS department' },
    { prefix='fbrp.vehicles.leo', types={ leo=true }, label='a law enforcement department' },
    { prefix='fbrp.vehicles.fire', types={ fire=true }, label='a fire & EMS department' },
}

local function departmentTool(object)
    for _, gate in ipairs(DEPARTMENT_TOOLS) do
        if object == gate.prefix or object:sub(1, #gate.prefix + 1) == gate.prefix .. '.' then return gate end
    end
end

local function rawPermission(source, object)
    if IsPlayerAceAllowed(source, object) then return true end
    return databasePermission(source, object)
end

local function hasPermission(source, object)
    source = tonumber(source)
    if not source or source <= 0 then return true end
    local gate = departmentTool(object)
    if gate then
        local s = sessions[source]
        if not (s and s.org and gate.types[s.org.type]) then return false end
    end
    return rawPermission(source, object)
end

-- True when one of the player's duty-gated staff groups grants the object, i.e. clocking in would allow it.
local function grantedOnDuty(source, object)
    local s = sessions[tonumber(source)]
    if not s or s.staffDuty then return false end
    for _, group in ipairs(s.groups or {}) do
        if group.staff_only == 1 or group.staff_only == true then
            for _, entry in ipairs(permissionRows[group.name] or {}) do
                if entry.mode ~= 'deny' and acePatternMatches(entry.object, object) then return true end
            end
        end
    end
    return false
end

local function removePrincipal(source, key)
    local child = ('player.%d'):format(source)
    local parent = appliedPrincipals[source] and appliedPrincipals[source][key]
    if not parent then return end
    ExecuteCommand(('remove_principal %s %s'):format(child, parent))
    appliedPrincipals[source][key] = nil
end

local function addPrincipal(source, key, parent)
    appliedPrincipals[source] = appliedPrincipals[source] or {}
    if appliedPrincipals[source][key] == parent then return end
    if appliedPrincipals[source][key] then removePrincipal(source, key) end
    ExecuteCommand(('add_principal player.%d %s'):format(source, parent))
    appliedPrincipals[source][key] = parent
end

local function reconcilePrincipals(source)
    local s = sessions[source]
    if not s then return end
    local wanted = {}
    for _, group in ipairs(s.groups or {}) do
        local staffOnly = group.staff_only == 1 or group.staff_only == true
        if not staffOnly or s.staffDuty then wanted['group:' .. group.name] = groupPrincipal(group.name) end
        -- Player-facing vMenu grants may remain available off duty. NoClip is
        -- deliberately excluded and comes only from the duty-gated principal.
        if staffOnly then
            for _, entry in ipairs(permissionRows[group.name] or {}) do
                if offDutyVmenuObject(entry.object) then
                    wanted['vmenu:' .. group.name] = vmenuPrincipal(group.name)
                    break
                end
            end
        end
    end
    if s.org and s.org.ace_group then wanted['group:' .. s.org.ace_group] = groupPrincipal(s.org.ace_group) end

    local early = s.discord and connectPrincipals[s.discord]
    if early then
        local keep = {}
        for _, parent in pairs(wanted) do keep[parent] = true end
        for parent in pairs(early) do
            if not keep[parent] then
                ExecuteCommand(('remove_principal identifier.discord:%s %s'):format(s.discord, parent))
                early[parent] = nil
            end
        end
    end

    for key in pairs(appliedPrincipals[source] or {}) do
        if not wanted[key] then removePrincipal(source, key) end
    end
    for key, parent in pairs(wanted) do addPrincipal(source, key, parent) end
end

local wildcardCleared = {}

-- Staff tier of every ACE group: Co-Owner and above, Community Director up to Co-Owner, Senior Moderator up to Community Director, or standard.
-- Tiers follow rank_order, so a rank added between two existing ones lands in the right tier. When the
-- Co-Owner or Community Director group cannot be found the tier stays unreachable and fails closed.
local function loadGroupTiers()
    local rows = MySQL.query.await('SELECT name,rank_order,staff_only FROM ace_groups') or {}
    local floors = {}
    for _, row in ipairs(rows) do
        local staff = row.staff_only == 1 or row.staff_only == true
        for tier, groupName in pairs(FBRP.VmenuTierGroups) do
            if staff and row.name == groupName then floors[tier] = tonumber(row.rank_order) end
        end
    end
    local tiers = {}
    for _, row in ipairs(rows) do
        local order = tonumber(row.rank_order) or 0
        local tier = 'standard'
        if row.staff_only == 1 or row.staff_only == true then
            if floors.coowner and order >= floors.coowner then tier = 'coowner'
            elseif floors.director and order >= floors.director then tier = 'director'
            elseif floors.senior and order >= floors.senior then tier = 'senior' end
        end
        tiers[row.name] = tier
    end
    return tiers
end

-- A stored row after vMenu.Everything expansion and the vMenu staff tiers: admin features and the
-- unlimited power/torque multipliers only survive for groups of the tier that owns them.
local function tieredAceRows(row, tier)
    local out = {}
    for _, expanded in ipairs(effectiveAceRows(row)) do
        if expanded.mode ~= 'allow' then
            out[#out + 1] = expanded
        else
            for _, object in ipairs(FBRP.VmenuObjectsForTier(tier, expanded.object)) do
                out[#out + 1] = { group_name = expanded.group_name, object = object, mode = 'allow' }
            end
        end
    end
    return out
end

local function loadPermissionModel()
    local nextRows = {}      -- rows exactly as stored, used for permission lookups
    local effective = {}     -- rows actually applied as ACEs, after vMenu.Everything expansion
    local groupTiers = loadGroupTiers()
    for _, row in ipairs(MySQL.query.await('SELECT group_name,object,mode FROM ace_entries')) do
        nextRows[row.group_name] = nextRows[row.group_name] or {}
        nextRows[row.group_name][#nextRows[row.group_name] + 1] = row
        effective[row.group_name] = effective[row.group_name] or {}
        -- A resource restart keeps ACEs an older run added, so make sure the wildcard is gone.
        if row.object == 'vMenu.Everything' and not wildcardCleared[row.group_name] then
            wildcardCleared[row.group_name] = true
            ExecuteCommand(('remove_ace %s vMenu.Everything allow'):format(groupPrincipal(row.group_name)))
            ExecuteCommand(('remove_ace %s vMenu.Everything allow'):format(vmenuPrincipal(row.group_name)))
        end
        for _, applied in ipairs(tieredAceRows(row, groupTiers[row.group_name] or 'standard')) do
            effective[row.group_name][#effective[row.group_name] + 1] = applied
            local key = applied.group_name .. '|' .. applied.object
            if not appliedAces[key] or appliedAces[key] ~= applied.mode then
                if appliedAces[key] then
                    ExecuteCommand(('remove_ace %s %s %s'):format(groupPrincipal(applied.group_name), applied.object, appliedAces[key]))
                end
                ExecuteCommand(('add_ace %s %s %s'):format(groupPrincipal(applied.group_name), applied.object, applied.mode))
                appliedAces[key] = applied.mode
            end
            if offDutyVmenuObject(applied.object) then
                local vmenuKey = applied.group_name .. '|vmenu|' .. applied.object
                if not appliedAces[vmenuKey] or appliedAces[vmenuKey] ~= applied.mode then
                    if appliedAces[vmenuKey] then
                        ExecuteCommand(('remove_ace %s %s %s'):format(vmenuPrincipal(applied.group_name), applied.object, appliedAces[vmenuKey]))
                    end
                    ExecuteCommand(('add_ace %s %s %s'):format(vmenuPrincipal(applied.group_name), applied.object, applied.mode))
                    appliedAces[vmenuKey] = applied.mode
                end
            end
        end
    end
    for key, mode in pairs(appliedAces) do
        local group, object = key:match('^([^|]+)|(.+)$')
        local scopedObject = object and object:match('^vmenu|(.+)$')
        if scopedObject then object = scopedObject end
        local keep = false
        for _, row in ipairs(effective[group] or {}) do
            if row.object == object and row.mode == mode and (not scopedObject or offDutyVmenuObject(row.object)) then keep = true break end
        end
        if not keep then
            local principal = scopedObject and vmenuPrincipal(group) or groupPrincipal(group)
            ExecuteCommand(('remove_ace %s %s %s'):format(principal, object, mode))
            appliedAces[key] = nil
        end
    end
    permissionRows = nextRows
    groupTierCache = groupTiers
    for source in pairs(sessions) do reconcilePrincipals(source) end
end

local function tagRow(row)
    if not row then return nil end
    return {
        id = tonumber(row.id), label = row.label, color = row.color, kind = row.kind,
        orgId = row.org_id and tonumber(row.org_id) or nil, orgName = row.org_name,
        chatTag = row.chat_tag == true or row.chat_tag == 1 or tostring(row.chat_tag) == '1',
        outline = not (row.outline == false or row.outline == 0 or tostring(row.outline) == '0')
    }
end

local function loadSelectedTags(s)
    if not s.discord then return end
    local selected = MySQL.single.await([[
        SELECT hs.id head_id,hs.label head_label,hs.color head_color,hs.outline head_outline,hs.kind head_kind,hs.org_id head_org_id,ho.name head_org_name,
               gs.id gang_id,gs.label gang_label,gs.color gang_color,gs.outline gang_outline,gs.kind gang_kind,gs.org_id gang_org_id,go.name gang_org_name,
               cs.id chat_id,cs.label chat_label,cs.color chat_color,cs.kind chat_kind,cs.org_id chat_org_id,co.name chat_org_name,cs.chat_tag chat_enabled
        FROM player_tag_selection p
        LEFT JOIN headtags hs ON hs.id=p.headtag_id AND hs.enabled=TRUE
        LEFT JOIN organizations ho ON ho.id=hs.org_id
        LEFT JOIN headtags gs ON gs.id=p.gangtag_id AND gs.enabled=TRUE
        LEFT JOIN organizations go ON go.id=gs.org_id
        LEFT JOIN headtags cs ON cs.id=p.chat_tag_id AND cs.enabled=TRUE AND cs.chat_tag=TRUE
        LEFT JOIN organizations co ON co.id=cs.org_id
        WHERE p.discord_id=?
    ]], { s.discord })
    s.headtag = selected and selected.head_id and tagRow({ id=selected.head_id,label=selected.head_label,color=selected.head_color,kind=selected.head_kind,org_id=selected.head_org_id,org_name=selected.head_org_name,outline=selected.head_outline }) or nil
    s.gangtag = selected and selected.gang_id and tagRow({ id=selected.gang_id,label=selected.gang_label,color=selected.gang_color,kind=selected.gang_kind,org_id=selected.gang_org_id,org_name=selected.gang_org_name,outline=selected.gang_outline }) or nil
    s.chatTag = selected and selected.chat_id and tagRow({ id=selected.chat_id,label=selected.chat_label,color=selected.chat_color,kind=selected.chat_kind,org_id=selected.chat_org_id,org_name=selected.chat_org_name,chat_tag=selected.chat_enabled }) or nil
end

local function selectedTagOnDuty(s, tag)
    return tag and tag.orgId and s.org and tonumber(tag.orgId) == tonumber(s.org.id)
end

local function selectedTagVisible(s, tag)
    return tag and (not tag.orgId or selectedTagOnDuty(s, tag)) and tag or nil
end

local function publishPlayer(source)
    local s = sessions[source]
    if not s then return end
    local player = Player(source)
    if not player then return end
    player.state:set('fbrp:id', source, true)
    player.state:set('fbrp:name', player.state['fbrp:characterName'] or GetPlayerName(source) or s.name, true)
    player.state:set('fbrp:staffDuty', s.staffDuty == true, true)
    -- NoClip is a vMenu staff feature: Senior Moderator and above only, and then only while clocked in.
    local noclipTier = false
    for _, group in ipairs(s.groups or {}) do
        if FBRP.VmenuTierAllows(groupTierCache[group.name] or 'standard', 'vMenu.NoClip') then noclipTier = true break end
    end
    player.state:set('fbrp:staffNoclip', s.staffDuty == true and noclipTier and (
        databasePermission(source, 'vMenu.NoClip') or databasePermission(source, 'vMenu.Everything')
    ), true)
    player.state:set('fbrp:maxVehicleSpeedMph', s.maxVehicleSpeedMph or FBRP.Config.vehicleSpeedLimitMph or 180, true)
    player.state:set('fbrp:carRadioAccess', s.carRadioAccess == true, true)
    local headtag = selectedTagVisible(s, s.headtag)
    local gangtag = selectedTagVisible(s, s.gangtag)
    local chatTag = selectedTagVisible(s, s.chatTag)
    -- A selected org-locked tag in either slot fulfills the on-duty tag role. Otherwise the
    -- organization's duty tag replaces whatever tag is worn in the slot it belongs to: head
    -- tags take the headtag slot, everything else the usual bottom (gang) slot. The worn
    -- tag comes back when the player clocks off.
    if s.org and s.org.tag and not selectedTagOnDuty(s, s.headtag) and not selectedTagOnDuty(s, s.gangtag) then
        if s.org.tag.kind == 'head' then headtag = s.org.tag else gangtag = s.org.tag end
    end
    player.state:set('fbrp:headtag', headtag, true)
    player.state:set('fbrp:gangtag', gangtag, true)
    player.state:set('fbrp:chatTag', chatTag and { id=chatTag.id,label=chatTag.label,color=chatTag.color } or nil, true)
    player.state:set('fbrp:organization', s.org and { id=s.org.id,slug=s.org.slug,name=s.org.name,type=s.org.type,logo=s.org.logo } or nil, true)
end

local function closeShift(tableName, shift, reason)
    if not shift then return end
    local ended = now()
    local seconds = math.max(0, math.floor((ended - shift.startedAt) / 1000))
    MySQL.update.await(('UPDATE %s SET ended_at=?,heartbeat_at=?,seconds=?,end_reason=? WHERE id=? AND ended_at IS NULL'):format(tableName), {
        ended, ended, seconds, reason, shift.id
    })
    return seconds
end

local function clockOutStaff(source, reason, actor)
    local s = sessions[source]
    if not s or not s.staffDuty then return false end
    local seconds = closeShift('staff_shifts', s.staffShift, reason or 'clockout') or 0
    s.staffDuty = false
    s.staffShift = nil
    reconcilePrincipals(source)
    publishPlayer(source)
    FBRP.DB.audit(actor or s.discord or source, 'staff.clockout', s.discord, { seconds=seconds, reason=reason })
    TriggerEvent('fbrp:staffDutyChanged', source, false, seconds)
    return true, seconds
end

local function clockOutOrg(source, reason)
    local s = sessions[source]
    if not s or not s.org then return false end
    local old = s.org
    local seconds = closeShift('organization_shifts', s.orgShift, reason or 'clockout') or 0
    s.org = nil
    s.orgShift = nil
    reconcilePrincipals(source)
    publishPlayer(source)
    notify(source, ('Clocked out of %s after %dm.'):format(old.name, math.floor(seconds / 60)), 'success')
    FBRP.DB.audit(s.discord or source, 'organization.clockout', old.id, { seconds=seconds, reason=reason })
    TriggerEvent('fbrp:organizationDutyChanged', source, nil)
    return true
end

local autoClockInStaff -- defined with the /clockin command below

local function initializePlayer(source)
    source = tonumber(source)
    if not source then return end
    local license = identifier(source, 'license') or identifier(source, 'license2')
    if not license then
        DropPlayer(source, 'Florida Bay could not read your Cfx.re license identifier.')
        return
    end
    local discord = discordId(source)
    local name = clean(GetPlayerName(source), 80)
    MySQL.prepare.await([[
        INSERT INTO players(license,discord_id,name) VALUES(?,?,?)
        ON DUPLICATE KEY UPDATE discord_id=COALESCE(VALUES(discord_id),discord_id),name=VALUES(name),last_seen=CURRENT_TIMESTAMP
    ]], { license, discord, name })
    local playerId = MySQL.scalar.await('SELECT id FROM players WHERE license=?', { license })
    for _, value in ipairs(GetPlayerIdentifiers(source)) do
        MySQL.prepare.await('INSERT IGNORE INTO player_identifiers(player_id,identifier) VALUES(?,?)', { playerId, value })
    end

    local privilegedSpeed = discordHasRole(discord, FBRP.Config.vehicleSpeedPrivilegedRoleId)
    local carRadioAccess = discordHasRole(discord, FBRP.Config.carRadioRoleId)
    sessions[source] = {
        source=source, playerId=tonumber(playerId), license=license, discord=discord, name=name,
        groups=membershipRows(discord), staffDuty=false, staffShift=nil, org=nil, orgShift=nil,
        maxVehicleSpeedMph=privilegedSpeed and (FBRP.Config.vehicleSpeedPrivilegedLimitMph or 250) or (FBRP.Config.vehicleSpeedLimitMph or 180),
        carRadioAccess=carRadioAccess
    }
    -- everyone joins with no headtag / gang tag on; they pick them again with /tags
    if FBRP.Config.clearTagsOnJoin ~= false and discord then
        MySQL.update.await('UPDATE player_tag_selection SET headtag_id=NULL,gangtag_id=NULL,updated_at=? WHERE discord_id=?', { now(), discord })
    end
    loadSelectedTags(sessions[source])
    reconcilePrincipals(source)
    publishPlayer(source)
    TriggerClientEvent('fbrp:session', source, {
        discordLinked = discord ~= nil,
        staff = isStaffMember(source),
        invite = FBRP.Config.discordInvite
    })
    -- Lets modules loaded after this file react once the session exists.
    TriggerEvent('fbrp:playerReady', source)
    autoClockInStaff(source)
end

local function refreshPlayer(source)
    local s = sessions[source]
    if not s then return initializePlayer(source) end
    s.groups = membershipRows(s.discord)
    s.maxVehicleSpeedMph = discordHasRole(s.discord, FBRP.Config.vehicleSpeedPrivilegedRoleId)
        and (FBRP.Config.vehicleSpeedPrivilegedLimitMph or 250)
        or (FBRP.Config.vehicleSpeedLimitMph or 180)
    s.carRadioAccess = discordHasRole(s.discord, FBRP.Config.carRadioRoleId)
    if s.staffDuty and s.staffShift then
        local ended = MySQL.scalar.await('SELECT ended_at FROM staff_shifts WHERE id=?', { s.staffShift.id })
        if ended then
            s.staffDuty = false
            s.staffShift = nil
            notify(source, 'Your staff shift was closed remotely. Staff permissions are paused.', 'error')
        end
    end
    if s.staffDuty and not isStaffMember(source) then clockOutStaff(source, 'permission') end
    loadSelectedTags(s)
    reconcilePrincipals(source)
    publishPlayer(source)
end

local function setSharedState(key, value, actor)
    FBRP.DB.setState(key, value, actor)
    GlobalState['fbrp:' .. key] = value
    stateVersion = stateVersion + 1
end

local function wardrobe(discord, kind, orgId)
    if not discord then return {} end
    local dutyFilter = 'AND t.org_id IS NULL'
    local params = { discord }
    if orgId then
        dutyFilter = 'AND (t.org_id IS NULL OR t.org_id=?)'
        params[#params + 1] = tonumber(orgId)
    end
    local slotFilter = kind == 'chat' and 'AND t.chat_tag=TRUE' or "AND (t.kind=? OR t.kind='both')"
    if kind ~= 'chat' then table.insert(params, 2, kind) end
    return MySQL.query.await(([=[
        SELECT DISTINCT t.id,t.kind,t.label,t.color,t.priority,t.org_id,o.name org_name,t.chat_tag
        FROM headtags t
        JOIN headtag_grants g ON g.tag_id=t.id
        LEFT JOIN organizations o ON o.id=t.org_id
        WHERE g.discord_id=? %s AND t.enabled=TRUE
          %s
        ORDER BY t.priority DESC,t.label
    ]=]):format(slotFilter, dutyFilter), params)
end

local function tagWardrobePayload(s)
    local orgId = s.org and s.org.id or nil
    return {
        head=wardrobe(s.discord,'head',orgId),
        gang=wardrobe(s.discord,'gang',orgId),
        chat=wardrobe(s.discord,'chat',orgId),
        selected={head=s.headtag and s.headtag.id or nil,gang=s.gangtag and s.gangtag.id or nil,chat=s.chatTag and s.chatTag.id or nil}
    }
end

local function canWear(discord, tagId, kind, orgId)
    if not tagId then return true, nil end
    local eligibility = kind == 'chat' and 't.chat_tag=TRUE' or "(t.kind=? OR t.kind='both')"
    local params = kind == 'chat' and { discord, tagId } or { discord, tagId, kind }
    local row = MySQL.single.await(([=[
        SELECT t.org_id FROM headtags t JOIN headtag_grants g ON g.tag_id=t.id
        WHERE g.discord_id=? AND t.id=? AND %s AND t.enabled=TRUE LIMIT 1
    ]=]):format(eligibility), params)
    if not row then return false, 'grant' end
    if row.org_id and tonumber(row.org_id) ~= tonumber(orgId) then return false, 'duty' end
    return true, nil
end

local function interactionAllowed(source, spec)
    if spec.public then return true end
    if spec.ace and hasPermission(source, spec.ace) then return true end
    for _, object in ipairs(spec.aceAny or {}) do
        if hasPermission(source, object) then return true end
    end
    return false
end

local function interactionSpec(id)
    for _, spec in ipairs(FBRP.Interactions) do
        if spec.id == id then return spec end
    end
end

local function playersNear(a, b, maxDistance)
    local aped, bped = GetPlayerPed(a), GetPlayerPed(b)
    if aped <= 0 or bped <= 0 then return false end
    local ac, bc = GetEntityCoords(aped), GetEntityCoords(bped)
    return #(ac - bc) <= maxDistance
end

local BLADED_WEAPONS = {
    [joaat('WEAPON_KNIFE')] = true,
    [joaat('WEAPON_DAGGER')] = true,
    [joaat('WEAPON_SWITCHBLADE')] = true,
    [joaat('WEAPON_MACHETE')] = true,
}

local function selectedWeapon(source, evidence)
    local ped = GetPlayerPed(source)
    if ped <= 0 then return joaat('WEAPON_UNARMED'), ped end
    local ok, weapon = pcall(GetSelectedPedWeapon, ped)
    if not ok or not weapon or weapon == joaat('WEAPON_UNARMED') then
        weapon = type(evidence) == 'table' and tonumber(evidence.weapon) or joaat('WEAPON_UNARMED')
    end
    return weapon or joaat('WEAPON_UNARMED'), ped
end

FBRP.InteractionVisible.uncuff = function(_, target)
    return Player(target).state['fbrp:restrained'] ~= nil
end
FBRP.InteractionVisible.cutziptie = function(_, target)
    return Player(target).state['fbrp:restrained'] == 'ziptie'
end
FBRP.InteractionHandlers.cutziptie = function(source, target, evidence)
    if Player(target).state['fbrp:restrained'] ~= 'ziptie' then return false end
    local weapon = selectedWeapon(source, evidence)
    if not BLADED_WEAPONS[weapon] then
        notify(source, 'Hold a knife or another blade to cut the zip tie.', 'error')
        return false
    end
    TriggerClientEvent('fbrp:interaction:apply', target, 'cutziptie', source)
    TriggerClientEvent('fbrp:interaction:actor', source, 'cutziptie', target)
    return true
end

-- Shooting cuffs is deliberately separate from third-eye interactions. The
-- client only requests this after a real shot crosses the cuff/wrist area;
-- the server still verifies the live weapon, range and replicated restraint.
RegisterNetEvent('fbrp:restraints:cuffsShot', function(target, evidence)
    local src = source
    target = tonumber(target)
    if not target or target == src or not sessions[src] or not sessions[target] then return end
    if Player(target).state['fbrp:restrained'] ~= 'cuffs' or not playersNear(src, target, 30.0) then return end

    local stamp = GetGameTimer()
    if stamp < (cuffShotCooldowns[src] or 0) then return end
    cuffShotCooldowns[src] = stamp + 1000

    local weapon, ped = selectedWeapon(src, evidence)
    local ok, armed = pcall(IsPedArmed, ped, 4)
    if weapon == joaat('WEAPON_UNARMED') or BLADED_WEAPONS[weapon] or (ok and not armed) then return end

    TriggerClientEvent('fbrp:interaction:apply', target, 'shootcuffs', src)
    FBRP.DB.audit(sessions[src].discord or src, 'restraints.cuffs_shot', sessions[target].discord or target, {
        source=src, target=target, weapon=weapon
    })
end)

local function banDiscordId(ban)
    for _, value in ipairs(type(ban.identifiers) == 'table' and ban.identifiers or {}) do
        local direct = tostring(value):match('^discord:(%d+)$')
        if direct then return direct end
    end
    for _, value in ipairs(type(ban.identifiers) == 'table' and ban.identifiers or {}) do
        local row = MySQL.single.await([[
            SELECT p.discord_id FROM players p
            LEFT JOIN player_identifiers i ON i.player_id=p.id
            WHERE i.identifier=? OR p.license=? LIMIT 1
        ]], { tostring(value), tostring(value) })
        if row and row.discord_id then return tostring(row.discord_id) end
    end
    return nil
end

local function recordEasyAdminBan(ban, actorSource)
    if type(ban) ~= 'table' or not tonumber(ban.banid) then return end
    local reason = clean(ban.reason or 'EasyAdmin ban', 300)
    local discord = banDiscordId(ban)
    local target = discord or ('game:' .. tostring(ban.banid))

    -- EasyAdmin numbers are only unique within its current banlist and are reused after
    -- the highest ban is removed. Never let an old, inactive #3 suppress a new #3.
    -- A stored Florida Bay ID is the strongest identity when this row was imported before.
    local existing = nil
    if type(ban.fbrp_id) == 'string' and ban.fbrp_id:match('^FB%-%d+$') then
        existing = MySQL.single.await([[
            SELECT id,ban_id,target_id FROM moderation_cases
            WHERE ban_id=? AND active=TRUE LIMIT 1
        ]], { ban.fbrp_id })
    end
    if not existing then
        existing = MySQL.single.await([[
            SELECT id,ban_id,target_id FROM moderation_cases
            WHERE game_ban_id=? AND target_id=? AND active=TRUE
            ORDER BY id DESC LIMIT 1
        ]], { tonumber(ban.banid), target })
    end
    if existing then
        ban.fbrp_id = existing.ban_id
        return existing.ban_id
    end

    -- /global ban creates its unified network case after EasyAdmin returns. On a later
    -- import, attach that case ID to the EasyAdmin row so every surface shows one ID.
    if reason:find('Florida Bay global ban', 1, true) then
        local global = MySQL.single.await([[
            SELECT ban_id FROM moderation_cases
            WHERE game_ban_id=? AND target_id=? AND action='ban'
            ORDER BY id DESC LIMIT 1
        ]], { tonumber(ban.banid), target })
        if global and global.ban_id then ban.fbrp_id = global.ban_id end
        return global and global.ban_id or nil
    end

    local actorSession = sessions[tonumber(actorSource or -1)]
    local actor = actorSession and actorSession.discord or 'easyadmin'
    local expires = tonumber(ban.expire)
    local expiresAt = expires and expires < 10444633200 and expires * 1000 or nil
    local id = MySQL.insert.await([[
        INSERT INTO moderation_cases(guild_id,target_id,target_name,actor_id,action,source,reason,expires_at,created_at,active,duration_ms,game_ban_id)
        VALUES('game',?,?,?,?,?,?,?,?,TRUE,?,?)
    ]], {
        target, clean(ban.name or 'Unknown', 100), tostring(actor),
        'ban', 'easyadmin', reason, expiresAt, now(), expiresAt and math.max(0, expiresAt - now()) or nil, tonumber(ban.banid)
    })
    if id then
        local publicId = assignPublicCaseId(id)
        ban.fbrp_id = publicId
        FBRP.DB.audit(actor, 'moderation.game_ban', target, {
            caseId=id, banId=publicId, easyAdminId=tonumber(ban.banid), reason=reason
        })
        return publicId
    end
end

-- EasyAdmin calls this export synchronously so the public ID is attached before it
-- writes banlist.json, sends its webhook, or disconnects the player.
exports('RecordEasyAdminBan', function(ban, actorSource)
    if not ready then return nil end
    return recordEasyAdminBan(ban, actorSource)
end)

AddEventHandler('fbrp:easyadminBanCreated', function(ban, actorSource)
    if not ready then return end
    recordEasyAdminBan(ban, actorSource)
end)

AddEventHandler('fbrp:easyadminBanRemoved', function(ban, actorSource)
    if not ready or type(ban) ~= 'table' or not tonumber(ban.banid) then return end
    MySQL.update.await('UPDATE moderation_cases SET active=FALSE WHERE game_ban_id=?', { tonumber(ban.banid) })
    local actorSession = sessions[tonumber(actorSource or -1)]
    FBRP.DB.audit(actorSession and actorSession.discord or 'easyadmin', 'moderation.game_unban', tostring(ban.banid), {})
end)

MySQL.ready(function()
    local ok, errorMessage = pcall(FBRP.DB.migrate)
    if not ok then
        print('[FBRP] Database migration failed: ' .. tostring(errorMessage))
        return
    end
    MySQL.update.await("UPDATE staff_shifts SET ended_at=heartbeat_at,seconds=GREATEST(0,FLOOR((heartbeat_at-started_at)/1000)),end_reason='restart' WHERE ended_at IS NULL")
    MySQL.update.await("UPDATE organization_shifts SET ended_at=heartbeat_at,seconds=GREATEST(0,FLOOR((heartbeat_at-started_at)/1000)),end_reason='restart' WHERE ended_at IS NULL")
    loadPermissionModel()
    GlobalState['fbrp:aop'] = FBRP.DB.state('aop', FBRP.Config.defaultAop)
    GlobalState['fbrp:peacetime'] = FBRP.DB.state('peacetime', FBRP.Config.defaultPeacetime)
    GlobalState['fbrp:priority'] = FBRP.DB.state('priority', {})
    ready = true
    -- Import any pre-existing EasyAdmin bans once, so the portal and staff log
    -- cover bans that were created before unified Florida Bay IDs existed.
    local rawBanlist = LoadResourceFile('EasyAdmin', 'banlist.json')
    local okBanlist, storedBans = pcall(json.decode, rawBanlist or '[]')
    if okBanlist and type(storedBans) == 'table' then
        for _, ban in ipairs(storedBans) do
            recordEasyAdminBan(ban, nil)
        end
    end
    for _, id in ipairs(GetPlayers()) do initializePlayer(tonumber(id)) end
    print('[FBRP] Core online: MariaDB, ACE sync, tags, organizations and duty ready.')
end)

-- vMenu snapshots a player's permissions once, on playerJoining. initializePlayer runs after that
-- (it waits on the database), so group principals attached there never reach vMenu's snapshot and
-- staff/Discord grants silently do nothing. Attach the same principals to the player's Discord
-- identifier while they are still connecting; reconcilePrincipals keeps them in sync afterwards and
-- playerDropped removes them. Duty-gated staff groups only get their separate vMenu principal.
local function clearConnectPrincipals(discord)
    local held = discord and connectPrincipals[discord]
    if not held then return end
    for parent in pairs(held) do
        ExecuteCommand(('remove_principal identifier.discord:%s %s'):format(discord, parent))
    end
    connectPrincipals[discord] = nil
end

-- Website verification gate. Returns the rejection text for someone who may not join, or nil.
-- Staff ranks are exempt and a database error lets the player in (never lock everyone out).
local function verificationRejection(discord)
    local url = GetConvar('fbrp_verify_url', 'https://floridabay.net/verify.html')
    if not discord then
        return ('Florida Bay requires Discord. Open the Discord desktop app, verify at %s, then reconnect.'):format(url)
    end
    local ok, allowed = pcall(function()
        return MySQL.scalar.await('SELECT 1 FROM member_verifications WHERE discord_id=? LIMIT 1', { discord })
            or MySQL.scalar.await(
                'SELECT 1 FROM ace_memberships m JOIN ace_groups g ON g.name=m.group_name WHERE m.discord_id=? AND g.staff_only=TRUE LIMIT 1',
                { discord }
            )
    end)
    if not ok then return nil end
    if allowed then return nil end
    return ('Florida Bay requires a verified account. Verify with Discord at %s, then reconnect.'):format(url)
end

AddEventHandler('playerConnecting', function(_, _, deferrals)
    local src = source
    if not ready then return end
    local discord = discordId(src)
    local needVerified = GetConvar('fbrp_require_verified', 'true') ~= 'false'
    if not discord and not needVerified then return end
    deferrals.defer()
    Wait(0)
    if needVerified then
        local rejection = verificationRejection(discord)
        if rejection then
            deferrals.done(rejection)
            return
        end
    end
    if not discord then
        deferrals.done()
        return
    end
    local ok, err = pcall(function()
        clearConnectPrincipals(discord)
        local held = {}
        for _, group in ipairs(membershipRows(discord)) do
            local staffOnly = group.staff_only == 1 or group.staff_only == true
            local parent
            if not staffOnly then
                parent = groupPrincipal(group.name)
            else
                for _, entry in ipairs(permissionRows[group.name] or {}) do
                    if offDutyVmenuObject(entry.object) then parent = vmenuPrincipal(group.name) break end
                end
            end
            if parent and not held[parent] then
                ExecuteCommand(('add_principal identifier.discord:%s %s'):format(discord, parent))
                held[parent] = true
            end
        end
        connectPrincipals[discord] = held
    end)
    if not ok then print(('[FBRP] connect-time vMenu principals failed for discord:%s: %s'):format(discord, tostring(err))) end
    deferrals.done()
end)

AddEventHandler('playerJoining', function()
    local src = source
    CreateThread(function()
        while not ready do Wait(250) end
        Wait(500)
        initializePlayer(src)
    end)
end)

AddEventHandler('playerDropped', function()
    local src = source
    clearConnectPrincipals(sessions[src] and sessions[src].discord or discordId(src))
    clockOutStaff(src, 'disconnect')
    clockOutOrg(src, 'disconnect')
    for group in pairs(appliedPrincipals[src] or {}) do removePrincipal(src, group) end
    appliedPrincipals[src] = nil
    sessions[src] = nil
    pendingSearches[src] = nil
    cuffShotCooldowns[src] = nil
end)

RegisterNetEvent('fbrp:requestSession', function()
    local src = source
    if ready then refreshPlayer(src) end
end)

-- A client reports noclip while the server has not authorized it. Logged for review.
local lastNoclipReport = {}
RegisterNetEvent('fbrp:vmenu:unauthorizedNoclip', function()
    local src = source
    local s = sessions[src]
    if not s then return end
    local player = Player(src)
    if s.staffDuty and player and player.state['fbrp:staffNoclip'] == true then return end
    local stamp = now()
    if lastNoclipReport[src] and stamp - lastNoclipReport[src] < 30000 then return end
    lastNoclipReport[src] = stamp
    FBRP.DB.audit(s.discord or tostring(src), 'security.noclip_blocked', s.discord, { source=src, staffDuty=s.staffDuty == true })
end)
AddEventHandler('playerDropped', function() lastNoclipReport[source] = nil end)

-- Clocks a staff member in. Returns true on success, or false plus the reason shown to the player.
local function clockInStaff(source)
    local s = sessions[source]
    if not s then return false, 'Your Florida Bay session is still loading.' end
    if not s.discord then return false, 'Link Discord before using staff duty.' end
    if not isStaffMember(source) then return false, 'You are not assigned to a staff ACE group.' end
    if s.staffDuty then return false, 'You are already clocked in.', 'info' end
    if s.org
        and not discordHasRole(s.discord, FBRP.Config.staffOrgDutyBypassRoleId)
        and not hasStaffGroupAtLeast(source, FBRP.Config.staffOrgDutyBypassMinGroup)
        and not (s.org.type == 'gang' and discordHasRole(s.discord, FBRP.Config.staffGangDutyBypassRoleId))
    then
        return false, ('Clock out of %s before clocking in as staff.'):format(s.org.name)
    end
    local started = now()
    local id = MySQL.insert.await('INSERT INTO staff_shifts(discord_id,player_id,name,started_at,heartbeat_at) VALUES(?,?,?,?,?)', {
        s.discord, s.playerId, s.name, started, started
    })
    s.staffDuty = true
    s.staffShift = { id=id,startedAt=started }
    reconcilePrincipals(source)
    publishPlayer(source)
    return true
end

RegisterCommand('clockin', function(source)
    if source <= 0 then return end
    local ok, reason, kind = clockInStaff(source)
    if not ok then return notify(source, reason, kind or 'error') end
    notify(source, 'Clocked in. EasyAdmin and staff ACE permissions are active.', 'success')
    FBRP.DB.audit(sessions[source].discord, 'staff.clockin', sessions[source].discord, { source=source })
    TriggerEvent('fbrp:staffDutyChanged', source, true, 0)
end, false)

-- Members of the mgmt_team ACE group are clocked into staff as soon as their session is ready.
local AUTO_CLOCKIN_GROUP = 'mgmt_team'
autoClockInStaff = function(source)
    local s = sessions[source]
    if not s or s.staffDuty then return end
    local held = false
    for _, group in ipairs(s.groups or {}) do
        if group.name == AUTO_CLOCKIN_GROUP then held = true break end
    end
    if not held then return end
    CreateThread(function()
        local ok = clockInStaff(source)
        if not ok then return end
        local session = sessions[source]
        FBRP.DB.audit(session.discord, 'staff.clockin', session.discord, { source=source, auto=true, group=AUTO_CLOCKIN_GROUP })
        TriggerEvent('fbrp:staffDutyChanged', source, true, 0)
        Wait(4000)
        notify(source, 'Management team: you were automatically clocked in as staff. Use /clockout to go off duty.', 'success')
    end)
end

RegisterCommand('clockout', function(source)
    if source <= 0 then return end
    local ok, seconds = clockOutStaff(source, 'clockout')
    if not ok then return notify(source, 'You are not clocked in.', 'info') end
    notify(source, ('Clocked out. Shift saved: %dm.'):format(math.floor((seconds or 0) / 60)), 'success')
end, false)

RegisterCommand('staffhours', function(source)
    if source <= 0 then return end
    local s = sessions[source]
    if not s or not s.discord then return notify(source, 'Discord is not linked.', 'error') end
    local cutoff = now() - (7 * 86400000)
    local row = MySQL.single.await([[
        SELECT COALESCE(SUM(CASE WHEN ended_at IS NULL THEN FLOOR((?-started_at)/1000) ELSE seconds END),0) seconds,COUNT(*) shifts
        FROM staff_shifts WHERE discord_id=? AND started_at>=?
    ]], { now(), s.discord, cutoff })
    chat(source, 'STAFF HOURS', ('Last 7 days: %.1f hours across %d shifts.'):format((tonumber(row.seconds) or 0)/3600, tonumber(row.shifts) or 0))
end, false)

-- Every active organization the player may clock into (gangs, businesses, departments and the
-- rest). The general access role or any rank role bound to the organization proves membership.
-- Accepting the bound rank directly keeps department members working when a network access-role
-- sync is delayed. A slug narrows the result to one organization.
local function dutyOrganizations(discord, slug)
    slug = slug or ''
    return MySQL.query.await([[
        SELECT DISTINCT o.*,t.label tag_label,t.color tag_color,t.kind tag_kind,t.outline tag_outline
        FROM organizations o
        JOIN headtags t ON t.id=o.tag_id
        WHERE o.active=TRUE AND (?='' OR o.slug=?)
          AND (
            EXISTS(SELECT 1 FROM organization_duty_global_access g WHERE g.discord_id=?)
            OR EXISTS(
              SELECT 1 FROM organization_role_requirements r
              JOIN discord_member_cache c ON c.guild_id=r.guild_id AND c.discord_id=?
                AND JSON_CONTAINS(c.roles, JSON_QUOTE(r.role_id))
              WHERE r.org_id=o.id
            )
            OR EXISTS(
              SELECT 1 FROM org_rank_roles rr
              JOIN discord_member_cache c ON c.guild_id=rr.guild_id AND c.discord_id=?
                AND JSON_CONTAINS(c.roles, JSON_QUOTE(rr.role_id))
              WHERE rr.org_id=o.id
            )
          )
        ORDER BY o.name
    ]], { slug, slug, discord, discord, discord }) or {}
end

local dutyLastChoice = {}

-- /duty: send the organizations this player can clock in as to the client's
-- centered dropdown. The choice comes back through fbrp:duty:choose and is re-validated there.
local function openDutyMenu(source, s)
    local rows = dutyOrganizations(s.discord)
    if #rows == 0 then return notify(source, 'You do not belong to an organization.', 'error') end
    local orgs = {}
    for _, row in ipairs(rows) do
        orgs[#orgs+1] = {
            slug=row.slug, name=row.name, type=row.type,
            color=row.color or row.tag_color, tag=row.tag_label,
            active=s.org ~= nil and tonumber(s.org.id) == tonumber(row.id)
        }
    end
    TriggerClientEvent('fbrp:duty:open', source, { current=s.org and s.org.slug or nil, orgs=orgs })
end

local function clockInOrganization(source, s, requested)
    local rows = dutyOrganizations(s.discord, requested)
    if #rows == 0 then return notify(source, 'You are not a member of that organization.', 'error') end
    local org = rows[1]
    if s.org then clockOutOrg(source, 'switch') end
    local started = now()
    local id = MySQL.insert.await('INSERT INTO organization_shifts(org_id,discord_id,player_id,name,started_at,heartbeat_at) VALUES(?,?,?,?,?,?)', {
        org.id,s.discord,s.playerId,s.name,started,started
    })
    -- Logo version (updated_at) lets Discord presence link the website logo; nil means no logo.
    local okLogo, logo = pcall(MySQL.scalar.await, 'SELECT updated_at FROM org_logos WHERE org_id=?', { org.id })
    s.org = {
        id=tonumber(org.id),slug=org.slug,name=org.name,type=org.type,ace_group=org.ace_group,
        logo=okLogo and tonumber(logo) or nil,
        tag=tagRow({ id=org.tag_id,label=org.tag_label,color=org.tag_color,kind=org.tag_kind,org_id=org.id,org_name=org.name,outline=org.tag_outline })
    }
    s.orgShift = { id=id,startedAt=started }
    reconcilePrincipals(source)
    publishPlayer(source)
    notify(source, ('On duty: %s'):format(org.name), 'success')
    local dutyTag = s.org.tag
    if dutyTag and dutyTag.label then
        local shown = Player(source).state[dutyTag.kind == 'head' and 'fbrp:headtag' or 'fbrp:gangtag']
        if shown and shown.id == dutyTag.id then
            tagNotify(source, ('Now wearing your duty tag %s (%s).'):format(dutyTag.label, dutyTag.kind == 'head' and 'headtag' or 'gang tag'), 'success')
        end
    end
    FBRP.DB.audit(s.discord, 'organization.clockin', org.id, { source=source })
    TriggerEvent('fbrp:organizationDutyChanged', source, org.id)
end

-- requested: an organization slug, or 'off' to clock out.
local function chooseDuty(source, requested)
    local s = sessions[source]
    if not s or not s.discord then return notify(source, 'Link Discord before using organization duty.', 'error') end
    if requested == 'off' then
        if not clockOutOrg(source, 'clockout') then notify(source, 'You are not on organization duty.', 'info') end
        return
    end
    if s.org and requested == s.org.slug then return clockOutOrg(source, 'clockout') end
    clockInOrganization(source, s, requested)
end

-- /duty is the only duty command: it always opens the picker, there are no per-organization arguments.
local function dutyCommand(source)
    if source <= 0 then return end
    local s = sessions[source]
    if not s or not s.discord then return notify(source, 'Link Discord before using organization duty.', 'error') end
    openDutyMenu(source, s)
end

RegisterNetEvent('fbrp:duty:choose', function(slug)
    local src = source
    if type(slug) ~= 'string' then return end
    local t = GetGameTimer()
    if dutyLastChoice[src] and t - dutyLastChoice[src] < 1500 then return end
    dutyLastChoice[src] = t
    local requested = clean(slug, 40):lower()
    if requested == '' then return end
    chooseDuty(src, requested)
end)

AddEventHandler('playerDropped', function() dutyLastChoice[source] = nil end)

RegisterCommand('duty', dutyCommand, false)

local function deny(source, object)
    local gate = departmentTool(object)
    if gate and rawPermission(source, object) then
        return notify(source, ('Clock into %s with /duty to use this.'):format(gate.label), 'error')
    end
    if grantedOnDuty(source, object) then
        return notify(source, 'Clock in with /clockin to use this.', 'error')
    end
    notify(source, ('You do not have permission to do that (%s).'):format(object), 'error')
end

local function actorOf(source)
    if source <= 0 then return 'console', 'Console' end
    local s = sessions[source]
    return s and s.discord or source, GetPlayerName(source) or ('Player ' .. source)
end

-- AOP / priority / peacetime changes: ox_lib notifications on screen (not chat)
local function notifyAll(title, message, tone, icon, duration)
    TriggerClientEvent('ox_lib:notify', -1, {
        title = title, description = clean(message, 300), type = tone or 'inform',
        position = 'center-right', duration = duration or 7000, icon = icon,
    })
end

-- big txAdmin announcement banner for AOP changes, so nobody misses it
-- (txcl:showAnnouncement is txAdmin's own announcement event; needs txAdmin v7+ / the 'monitor' resource)
local function txAnnounce(message, author)
    TriggerClientEvent('txcl:showAnnouncement', -1, clean(message, 300), author or 'Area of Play')
end

local PRIORITY_STATUS = { available='Available', active='In Progress', cooldown='Cooldown', hold='On Hold' }
local PRIORITY_ALIAS = {
    available='available', avail='available', clear='available', off='available', open='available',
    active='active', progress='active', inprogress='active', on='active', start='active',
    cooldown='cooldown', cd='cooldown',
    hold='hold', onhold='hold', held='hold'
}

local function zoneSpec(id)
    for _, zone in ipairs(FBRP.PriorityZones) do
        if zone.id == id then return zone end
    end
end

-- what people can type for a zone in /cooldown and /onhold
local ZONE_ALIAS = {
    ls='ls', la='ls', lossantos='ls', losangeles='ls', city='ls',
    blaine='blaine', sandy='blaine', grapeseed='blaine', sandygrapeseed='blaine', sandyshores='blaine', county='blaine',
    paleto='paleto', paletobay='paleto',
    zancudo='zancudo', fz='zancudo', fortzancudo='zancudo', fort='zancudo',
    roxwood='roxwood', rox='roxwood', roxwoodcounty='roxwood', rw='roxwood',
}

-- returns a list of zone ids, or nil if the name isn't a zone
local function zonesFromArg(arg)
    arg = tostring(arg or ''):lower():gsub('[%s/_%-]', '')
    if arg == 'all' then
        local ids = {}
        for _, zone in ipairs(FBRP.PriorityZones) do ids[#ids + 1] = zone.id end
        return ids
    end
    local id = ZONE_ALIAS[arg] or (zoneSpec(arg) and arg)
    return id and { id } or nil
end

local function zoneNames()
    local names = {}
    for _, zone in ipairs(FBRP.PriorityZones) do names[#names + 1] = zone.id end
    names[#names + 1] = 'all'
    return table.concat(names, ', ')
end

local function priorityZones()
    local stored = GlobalState['fbrp:priority']
    local out = {}
    for _, zone in ipairs(FBRP.PriorityZones) do
        local z = type(stored) == 'table' and type(stored[zone.id]) == 'table' and stored[zone.id] or nil
        if z and PRIORITY_STATUS[z.status] then
            out[zone.id] = { status=z.status, ends=tonumber(z.ends), remaining=tonumber(z.remaining) or 0, by=z.by, at=tonumber(z.at) }
        else
            out[zone.id] = { status='available', remaining=0 }
        end
    end
    return out
end

local function priorityText(zone, entry)
    if entry.status == 'cooldown' then return ('%s priority cooldown: %d minutes.'):format(zone, entry.remaining or 0) end
    return ('%s priority is now %s.'):format(zone, PRIORITY_STATUS[entry.status])
end

local function setPriority(ids, status, minutes, source)
    local actor, name = actorOf(source)
    local zones = priorityZones()
    local entry = { status=status, by=name, at=now(), remaining=0 }
    if status == 'cooldown' then
        minutes = math.max(1, math.min(120, math.floor(tonumber(minutes) or FBRP.PriorityCooldownDefault)))
        entry.ends = now() + minutes * 60000
        entry.remaining = minutes
    end
    for _, id in ipairs(ids) do zones[id] = entry end
    setSharedState('priority', zones, actor)
    local label = #ids == #FBRP.PriorityZones and 'All zones' or zoneSpec(ids[1]).label
    notifyAll('Priority', priorityText(label, entry), status == 'available' and 'success' or 'warning', 'fa-solid fa-tower-broadcast')
    FBRP.DB.audit(actor, 'server.priority', table.concat(ids, ','), { status=status, minutes=entry.remaining })
end

local function setAop(value, source)
    local actor = actorOf(source)
    setSharedState('aop', value, actor)
    -- (txAdmin's announcement banner can only show top-middle, so AOP uses a longer notification at middle right)
    notifyAll('Area of Play', 'Area of play is now ' .. value .. '.', 'warning', 'fa-solid fa-map-location-dot', 12000)
    TriggerClientEvent('fbrp:aop:changed', -1, value) -- plays the AOP sound (client/aop.lua)
    FBRP.DB.audit(actor, 'server.aop', nil, { value=value })
end

local function setPeacetime(on, source)
    local actor = actorOf(source)
    setSharedState('peacetime', on, actor)
    notifyAll('Peacetime', on and 'Peacetime is now active.' or 'Peacetime has ended.', on and 'success' or 'error', 'fa-solid fa-dove')
    FBRP.DB.audit(actor, 'server.peacetime', nil, { value=on })
end

local function controlPayload(source, focus)
    local zones = priorityZones()
    local list = {}
    for _, zone in ipairs(FBRP.PriorityZones) do
        local z = zones[zone.id]
        list[#list + 1] = { id=zone.id, label=zone.label, status=z.status, statusLabel=PRIORITY_STATUS[z.status], remaining=z.remaining, by=z.by }
    end
    return {
        focus=focus,
        aop=GlobalState['fbrp:aop'] or FBRP.Config.defaultAop,
        presets=FBRP.AopPresets,
        peacetime=GlobalState['fbrp:peacetime'] == true,
        zones=list,
        cooldownDefault=FBRP.PriorityCooldownDefault,
        canAop=hasPermission(source, FBRP.Ace.aop),
        canPriority=hasPermission(source, FBRP.Ace.priority),
        canPeacetime=hasPermission(source, FBRP.Ace.peacetime),
    }
end

local function openControl(source, focus)
    TriggerClientEvent('fbrp:control:open', source, controlPayload(source, focus))
end

-- /aop            -> small dropdown to pick an AOP (ox_lib input dialog)
-- /aop <text>     -> set it straight away (also works from the server console)
RegisterCommand('aop', function(source, args)
    local value = clean(table.concat(args, ' '), 60)
    local current = GlobalState['fbrp:aop'] or FBRP.Config.defaultAop
    if source <= 0 then
        if value == '' then return print('AOP: ' .. tostring(current)) end
        return setAop(value, source)
    end
    if not hasPermission(source, FBRP.Ace.aop) then
        if value == '' then return notify(source, 'Area of play: ' .. tostring(current) .. '.', 'inform') end
        return deny(source, FBRP.Ace.aop)
    end
    if value == '' then return TriggerClientEvent('fbrp:aop:pick', source, FBRP.AopPresets, current) end
    setAop(value, source)
end, false)

RegisterCommand('peacetime', function(source, args)
    if source > 0 and not hasPermission(source, FBRP.Ace.peacetime) then return deny(source, FBRP.Ace.peacetime) end
    local on = args[1] == 'on' or (args[1] == nil and not GlobalState['fbrp:peacetime'])
    setPeacetime(on, source)
end, false)

-- /priority opens the menu. Shortcuts: /priority <zone|all> <status> [minutes] or /priority <status> [minutes] (all zones).
RegisterCommand('priority', function(source, args)
    local allowed = source <= 0 or hasPermission(source, FBRP.Ace.priority)
    -- /priority with nothing after it: staff get the ox_lib dialog (client/aop.lua), everyone else gets the status list
    if #args == 0 and source > 0 and allowed then
        local zones = priorityZones()
        local list = {}
        for _, zone in ipairs(FBRP.PriorityZones) do
            local z = zones[zone.id]
            list[#list + 1] = { id=zone.id, label=zone.label, status=z.status, remaining=z.remaining }
        end
        return TriggerClientEvent('fbrp:priority:pick', source, list, FBRP.PriorityCooldownDefault)
    end
    if #args == 0 then
        local zones, parts = priorityZones(), {}
        for _, zone in ipairs(FBRP.PriorityZones) do
            local z = zones[zone.id]
            parts[#parts + 1] = ('%s: %s'):format(zone.label, z.status == 'cooldown' and ('Cooldown %dm'):format(z.remaining or 0) or PRIORITY_STATUS[z.status])
        end
        if source <= 0 then return print(table.concat(parts, ' | ')) end
        return notify(source, table.concat(parts, '\n'), 'inform')
    end
    if not allowed then return deny(source, FBRP.Ace.priority) end
    local first = clean(args[1], 16):lower()
    local ids, statusArg, minutesArg = {}, first, args[2]
    if first == 'all' or zoneSpec(first) then
        statusArg, minutesArg = clean(args[2], 16):lower(), args[3]
        if first == 'all' then
            for _, zone in ipairs(FBRP.PriorityZones) do ids[#ids + 1] = zone.id end
        else
            ids = { first }
        end
    else
        for _, zone in ipairs(FBRP.PriorityZones) do ids[#ids + 1] = zone.id end
    end
    local status = PRIORITY_ALIAS[statusArg]
    if not status then return notify(source, 'Usage: /priority [ls|blaine|paleto|zancudo|roxwood|all] <available|active|cooldown|hold> [minutes]', 'error') end
    setPriority(ids, status, minutesArg, source)
end, false)

-- /cooldown <zone> <minutes>
RegisterCommand('cooldown', function(source, args)
    if source > 0 and not hasPermission(source, FBRP.Ace.priority) then return deny(source, FBRP.Ace.priority) end
    local ids = zonesFromArg(args[1])
    local minutes = tonumber(args[2])
    if not ids or not minutes then
        return notify(source, ('Usage: /cooldown <zone> <minutes>  (zones: %s)'):format(zoneNames()), 'error')
    end
    setPriority(ids, 'cooldown', minutes, source)
end, false)

-- /onhold <zone>
RegisterCommand('onhold', function(source, args)
    if source > 0 and not hasPermission(source, FBRP.Ace.priority) then return deny(source, FBRP.Ace.priority) end
    local ids = zonesFromArg(args[1])
    if not ids then
        return notify(source, ('Usage: /onhold <zone>  (zones: %s)'):format(zoneNames()), 'error')
    end
    setPriority(ids, 'hold', nil, source)
end, false)

local lastControl = {}
RegisterNetEvent('fbrp:control:action', function(kind, data)
    local src = source
    if type(data) ~= 'table' then data = {} end
    local stamp = GetGameTimer()
    if lastControl[src] and stamp - lastControl[src] < 600 then return end
    lastControl[src] = stamp
    if kind == 'aop' then
        if not hasPermission(src, FBRP.Ace.aop) then return deny(src, FBRP.Ace.aop) end
        local value = clean(data.value, 60)
        if value == '' then return notify(src, 'Enter an area of play.', 'error') end
        setAop(value, src)
    elseif kind == 'peacetime' then
        if not hasPermission(src, FBRP.Ace.peacetime) then return deny(src, FBRP.Ace.peacetime) end
        setPeacetime(data.value == true, src)
    elseif kind == 'priority' then
        if not hasPermission(src, FBRP.Ace.priority) then return deny(src, FBRP.Ace.priority) end
        local status = PRIORITY_ALIAS[clean(data.status, 16):lower()]
        if not status then return end
        local ids = {}
        if data.zone == 'all' then
            for _, zone in ipairs(FBRP.PriorityZones) do ids[#ids + 1] = zone.id end
        elseif zoneSpec(data.zone) then
            ids = { data.zone }
        else
            return
        end
        setPriority(ids, status, data.minutes, src)
    elseif kind ~= 'refresh' then
        return
    end
    TriggerClientEvent('fbrp:control:update', src, controlPayload(src))
end)

AddEventHandler('playerDropped', function() lastControl[source] = nil end)

-- Counts cooldowns down once a minute and reopens zones when they finish.
CreateThread(function()
    while true do
        Wait(10000)
        if ready then
            local zones, changed, finished = priorityZones(), false, {}
            for _, zone in ipairs(FBRP.PriorityZones) do
                local z = zones[zone.id]
                if z.status == 'cooldown' and z.ends then
                    local left = math.ceil((z.ends - now()) / 60000)
                    if left <= 0 then
                        zones[zone.id] = { status='available', remaining=0, by='Cooldown ended', at=now() }
                        finished[#finished + 1] = zone.label
                        changed = true
                    elseif left ~= z.remaining then
                        z.remaining = left
                        changed = true
                    end
                end
            end
            if changed then setSharedState('priority', zones, 'system') end
            for _, label in ipairs(finished) do
                notifyAll('Priority', label .. ' priority cooldown is over. Priority is available.', 'success', 'fa-solid fa-tower-broadcast')
            end
        end
    end
end)

local function announcementCommand(source, args)
    if source > 0 and not hasPermission(source, FBRP.Ace.announce) then return deny(source, FBRP.Ace.announce) end
    local message = clean(table.concat(args, ' '), 300)
    if message ~= '' then broadcast('FLORIDA BAY', message, { 67,232,216 }) end
end
RegisterCommand('announce', announcementCommand, false)
RegisterCommand('staff', announcementCommand, false)

-- Centre-screen announcement for every player, Assistant Community Manager and above (the
-- mgmt_team group). An optional leading -urgent or -warning flag picks the colour.
local ANNOUNCEMENT_TONES = { ['-info'] = 'info', ['-warning'] = 'warning', ['-urgent'] = 'urgent' }
local ANNOUNCEMENT_COOLDOWN_MS = 3000
local lastCenterAnnouncement = 0

RegisterCommand('announcement', function(source, args)
    if source > 0 and not hasPermission(source, FBRP.Ace.announceCenter) then return deny(source, FBRP.Ace.announceCenter) end
    local tone = 'info'
    local first = args[1] and args[1]:lower()
    if first and ANNOUNCEMENT_TONES[first] then
        tone = ANNOUNCEMENT_TONES[first]
        table.remove(args, 1)
    end
    local message = clean(table.concat(args, ' '), 240)
    if message == '' then
        if source > 0 then notify(source, 'Usage: /announcement [-info|-warning|-urgent] <message>', 'error') end
        return
    end
    local stamp = GetGameTimer()
    if source > 0 and stamp - lastCenterAnnouncement < ANNOUNCEMENT_COOLDOWN_MS then
        return notify(source, 'Wait a moment before sending another announcement.', 'error')
    end
    lastCenterAnnouncement = stamp
    TriggerClientEvent('fbrp:announcement:show', -1, { message = message, tone = tone })
    broadcast('ANNOUNCEMENT', message, tone == 'urgent' and { 255, 107, 87 } or tone == 'warning' and { 255, 181, 71 } or { 67, 232, 216 })
    FBRP.DB.audit(actorOf(source), 'staff.center_announcement', nil, { message = message, tone = tone })
end, false)

RegisterCommand('ondutystaff', function(source, args)
    if source > 0 and not hasPermission(source, FBRP.Ace.staffOnDutyAnnounce) then return deny(source, FBRP.Ace.staffOnDutyAnnounce) end
    local message = clean(table.concat(args, ' '), 300)
    if message == '' then return notify(source, 'Usage: /ondutystaff <message>', 'error') end
    local sourcePlayer = source > 0 and Player(source) or nil
    local sender = source > 0 and ((sourcePlayer and sourcePlayer.state['fbrp:characterName']) or GetPlayerName(source) or ('Player ' .. source)) or 'Console'
    for target, session in pairs(sessions) do
        if session.staffDuty then chat(target, 'ON-DUTY STAFF · ' .. sender, message, { 255, 180, 87 }) end
    end
    FBRP.DB.audit(actorOf(source), 'staff.onduty_announcement', nil, { message=message })
end, false)

-- /me, /do and /ooc are owned by s4_chat so its proximity routing,
-- anti-spam, autocomplete and 3D emote presentation remain authoritative.

-- Recent calls stay answerable with /respond for half an hour.
local recentCalls = {}

local function displayName(source)
    local player = Player(source)
    return (player and player.state['fbrp:characterName']) or GetPlayerName(source) or ('Player ' .. tostring(source))
end

-- Sends a dispatch card to every player holding any of the ACE objects. Stored
-- kinds (911/311/EMS) get a row in dispatch_calls and a /respond number.
local function sendDispatch(kind, source, message, coords, objects, store)
    coords = coords or vector3(0.0, 0.0, 0.0)
    local s = source and sessions[source]
    local id
    if store then
        id = MySQL.insert.await('INSERT INTO dispatch_calls(kind,caller_discord,caller_name,message,location,x,y,z,created_at) VALUES(?,?,?,?,?,?,?,?,?)', {
            kind, s and s.discord or nil, source and displayName(source) or 'Dispatch', message, ('%.0f, %.0f'):format(coords.x, coords.y), coords.x, coords.y, coords.z, now()
        })
        recentCalls[id] = { id=id, kind=kind, caller=source, callerName=source and displayName(source) or 'Dispatch', message=message, coords={ x=coords.x, y=coords.y, z=coords.z }, at=now(), responders={} }
    end
    local call = { id=id, kind=kind, caller=source and displayName(source) or 'Dispatch', message=message, coords={ x=coords.x, y=coords.y, z=coords.z } }
    local sent = 0
    for target in pairs(sessions) do
        for _, object in ipairs(objects) do
            if hasPermission(target, object) then
                TriggerClientEvent('fbrp:dispatch', target, call)
                sent = sent + 1
                break
            end
        end
    end
    return id, sent
end

local function callerCoords(source)
    local ped = GetPlayerPed(source)
    return ped > 0 and GetEntityCoords(ped) or vector3(0.0, 0.0, 0.0)
end

RegisterCommand('911', function(source, args)
    if source <= 0 then return end
    local message = clean(table.concat(args, ' '), 300)
    if message == '' then return notify(source, 'Usage: /911 <emergency>', 'error') end
    local id, sent = sendDispatch('911', source, message, callerCoords(source), { FBRP.Ace.police, FBRP.Ace.ems }, true)
    notify(source, sent > 0 and ('911 call #%d submitted. %d unit(s) notified.'):format(id, sent) or ('911 call #%d submitted. No emergency units are on duty right now.'):format(id), sent > 0 and 'success' or 'warning')
end, false)

RegisterCommand('311', function(source, args)
    if source <= 0 then return end
    local message = clean(table.concat(args, ' '), 300)
    if message == '' then return notify(source, 'Usage: /311 <non-emergency report>', 'error') end
    local id = sendDispatch('311', source, message, callerCoords(source), { FBRP.Ace.police }, true)
    notify(source, ('Non-emergency report #%d submitted.'):format(id), 'success')
end, false)

RegisterNetEvent('fbrp:hub:dispatch', function(rawKind, rawMessage)
    local src = source
    if not sessions[src] then return end
    local kind = tostring(rawKind or '')
    local message = clean(rawMessage, 300)
    if kind ~= '911' and kind ~= '311' then return end
    if #message < 3 then return notify(src, 'Please describe what is happening.', 'error') end
    local objects = kind == '911' and { FBRP.Ace.police, FBRP.Ace.ems } or { FBRP.Ace.police }
    local id, sent = sendDispatch(kind, src, message, callerCoords(src), objects, true)
    if kind == '911' then
        notify(src, sent > 0 and ('911 call #%d submitted. %d unit(s) notified.'):format(id, sent) or ('911 call #%d submitted. No emergency units are on duty right now.'):format(id), sent > 0 and 'success' or 'warning')
    else
        notify(src, ('Non-emergency report #%d submitted.'):format(id), 'success')
    end
end)

RegisterCommand('respond', function(source, args)
    if source <= 0 then return end
    if not hasPermission(source, FBRP.Ace.police) and not hasPermission(source, FBRP.Ace.ems) then return deny(source, FBRP.Ace.police) end
    local id = tonumber(args[1])
    local call = id and recentCalls[id]
    if not call then return notify(source, 'Usage: /respond <call number> (calls expire after 30 minutes).', 'error') end
    TriggerClientEvent('fbrp:dispatch:waypoint', source, call.coords, id)
    if not call.responders[source] then
        call.responders[source] = true
        if call.caller and sessions[call.caller] then
            notify(call.caller, ('%s is responding to your call #%d.'):format(displayName(source), id), 'success')
        end
        for target in pairs(sessions) do
            if target ~= source and (hasPermission(target, FBRP.Ace.police) or hasPermission(target, FBRP.Ace.ems)) then
                notify(target, ('%s is responding to call #%d.'):format(displayName(source), id), 'info')
            end
        end
    end
    notify(source, ('GPS set to call #%d.'):format(id), 'success')
end, false)

CreateThread(function()
    while true do
        Wait(60000)
        local cutoff = now() - 30 * 60000
        for id, call in pairs(recentCalls) do
            if call.at < cutoff then recentCalls[id] = nil end
        end
    end
end)

RegisterCommand('panic', function(source)
    if source <= 0 then return end
    if not hasPermission(source,FBRP.Ace.police) then return deny(source,FBRP.Ace.police) end
    local c=callerCoords(source); local s=sessions[source]
    sendDispatch('PANIC', source, 'Officer panic activation', c, { FBRP.Ace.police }, false)
    FBRP.DB.audit(s and s.discord or source,'dispatch.panic',nil,{x=c.x,y=c.y,z=c.z})
end,false)

RegisterNetEvent('fbrp:tags:request', function()
    local src=source; local s=sessions[src]
    if not s then return end
    TriggerClientEvent('fbrp:tags:data',src,tagWardrobePayload(s))
end)

RegisterNetEvent('fbrp:tags:equip', function(kind, rawId)
    local src=source; local s=sessions[src]
    if not s or not s.discord or (kind~='head' and kind~='gang' and kind~='chat') then return end
    local tagId=tonumber(rawId); if tagId and tagId<=0 then tagId=nil end
    local allowed, reason=canWear(s.discord,tagId,kind,s.org and s.org.id or nil)
    if not allowed then
        if reason=='duty' then return notify(src,'Clock into this tag\'s organization before wearing it.','error') end
        return notify(src,'That Discord role does not grant this tag.','error')
    end
    MySQL.prepare.await([[
        INSERT INTO player_tag_selection(discord_id,headtag_id,gangtag_id,chat_tag_id,updated_at) VALUES(?,?,?,?,?)
        ON DUPLICATE KEY UPDATE headtag_id=IF(?='head',VALUES(headtag_id),headtag_id),gangtag_id=IF(?='gang',VALUES(gangtag_id),gangtag_id),chat_tag_id=IF(?='chat',VALUES(chat_tag_id),chat_tag_id),updated_at=VALUES(updated_at)
    ]], {s.discord,kind=='head' and tagId or nil,kind=='gang' and tagId or nil,kind=='chat' and tagId or nil,now(),kind,kind,kind})
    loadSelectedTags(s); publishPlayer(src)
    TriggerClientEvent('fbrp:tags:selected',src,{head=s.headtag and s.headtag.id or nil,gang=s.gangtag and s.gangtag.id or nil,chat=s.chatTag and s.chatTag.id or nil})
    local slotName = kind=='head' and 'headtag' or kind=='gang' and 'gang tag' or 'chat tag'
    local worn = kind=='head' and s.headtag or kind=='gang' and s.gangtag or s.chatTag
    if tagId and worn then
        tagNotify(src, ('Now wearing the %s %s.'):format(worn.label or 'selected', slotName), 'success')
    else
        tagNotify(src, ('Removed your %s.'):format(slotName), 'inform')
    end
end)

RegisterNetEvent('fbrp:interactions:request', function(target)
    local src=source; target=tonumber(target)
    if not target or target==src or not sessions[target] or not playersNear(src,target,FBRP.Config.interactionDistance) then return notify(src,'No player is close enough.','error') end
    local actions={}
    for _,spec in ipairs(FBRP.Interactions) do
        local visible=FBRP.InteractionVisible[spec.id]
        if interactionAllowed(src,spec) and (not visible or visible(src,target)) then actions[#actions+1]={id=spec.id,label=spec.label} end
    end
    TriggerClientEvent('fbrp:interactions:data',src,{target=target,name=GetPlayerName(target),actions=actions})
end)

RegisterNetEvent('fbrp:interactions:use', function(target, action, evidence)
    local src=source; target=tonumber(target); action=clean(action,24)
    local spec=interactionSpec(action)
    if not spec or not target or target==src or not sessions[target] or not playersNear(src,target,FBRP.Config.interactionDistance) then return notify(src,'Interaction rejected: target moved away.','error') end
    if not interactionAllowed(src,spec) then return notify(src,'You do not have permission for that interaction.','error') end
    local handler=FBRP.InteractionHandlers[action]
    if handler then
        if handler(src,target,evidence)~=false then FBRP.DB.audit(sessions[src].discord or src,'interaction.'..action,sessions[target].discord or target,{source=src,target=target}) end
        return
    end
    if action=='checkid' then
        local t=sessions[target]; return chat(src,'IDENTIFICATION',('%s · server ID %d · citizen record %d'):format(GetPlayerName(target),target,t.playerId))
    end
    if action=='search' then pendingSearches[target]={actor=src,expires=GetGameTimer()+5000}; return TriggerClientEvent('fbrp:interaction:search',target) end
    TriggerClientEvent('fbrp:interaction:apply',target,action,src)
    TriggerClientEvent('fbrp:interaction:actor',src,action,target)
    FBRP.DB.audit(sessions[src].discord or src,'interaction.'..action,sessions[target].discord or target,{source=src,target=target})
end)

RegisterNetEvent('fbrp:interaction:searchResult', function(items)
    local src=source; local pending=pendingSearches[src]; pendingSearches[src]=nil
    if not pending or pending.expires<GetGameTimer() or not playersNear(src,pending.actor,FBRP.Config.interactionDistance+1.0) then return end
    local safe={}; if type(items)=='table' then for _,item in ipairs(items) do safe[#safe+1]=clean(item,50); if #safe>=20 then break end end end
    -- Packaged product is found and, by police, seized on the spot.
    if FBRP.Economy and FBRP.Economy.contrabandText and FBRP.Economy.contrabandText(src) then
        local found=hasPermission(pending.actor,FBRP.Ace.policeSearch) and FBRP.Economy.seize(src,pending.actor) or FBRP.Economy.contrabandText(src)
        if found then safe[#safe+1]=found..(hasPermission(pending.actor,FBRP.Ace.policeSearch) and ' - SEIZED' or '') end
    end
    chat(pending.actor,'SEARCH · '..GetPlayerName(src),#safe>0 and table.concat(safe,', ') or 'No visible weapons or contraband found.')
end)

RegisterNetEvent('fbrp:vehicles:request', function()
    local src=source; local categories={}
    -- Base-game vehicles are spawned from the vMenu Vehicle Spawner; F7 only lists personals
    -- (and organization garages) unless the catalog is switched back on in config.lua.
    if FBRP.Config.garageCatalogEnabled then
        for _,category in ipairs(FBRP.VehicleCatalog) do
            if hasPermission(src,category.ace) and (not category.onDuty or (sessions[src] and sessions[src].staffDuty)) then categories[#categories+1]=category end
        end
    end
    local orgGarage=FBRP.Economy and FBRP.Economy.garageCategory and FBRP.Economy.garageCategory(src)
    if orgGarage then table.insert(categories,1,orgGarage) end
    local personal=FBRP.Personals and FBRP.Personals.category and FBRP.Personals.category(src)
    if personal then table.insert(categories,1,personal) end
    TriggerClientEvent('fbrp:vehicles:data',src,categories)
end)

RegisterNetEvent('fbrp:vehicles:spawn', function(categoryId, model)
    local src=source; categoryId=clean(categoryId,32); model=clean(model,40):lower()
    if categoryId=='personal' then
        if FBRP.Personals and FBRP.Personals.spawn then return FBRP.Personals.spawn(src,model) end
        return notify(src,'Personal vehicles are not available right now.','error')
    end
    local orgGarage=categoryId=='org' and FBRP.Economy and FBRP.Economy.garageCategory and FBRP.Economy.garageCategory(src)
    if orgGarage then
        for _,vehicle in ipairs(orgGarage.vehicles) do
            if vehicle.model:lower()==model then
                TriggerClientEvent('fbrp:vehicles:approved',src,model,vehicle.label,orgGarage.style)
                return FBRP.DB.audit(sessions[src].discord or src,'vehicle.spawn',model,{category='org',organization=orgGarage.label})
            end
        end
    end
    for _,category in ipairs(FBRP.Config.garageCatalogEnabled and FBRP.VehicleCatalog or {}) do
        if category.id==categoryId and hasPermission(src,category.ace) and (not category.onDuty or (sessions[src] and sessions[src].staffDuty)) then
            for _,vehicle in ipairs(category.vehicles) do
                if vehicle.model:lower()==model then
                    TriggerClientEvent('fbrp:vehicles:approved',src,model,vehicle.label)
                    return FBRP.DB.audit(sessions[src].discord or src,'vehicle.spawn',model,{category=categoryId})
                end
            end
        end
    end
    notify(src,'That vehicle or category is not authorized.','error')
end)

CreateThread(function()
    while true do
        Wait((FBRP.Config.staffHeartbeatSeconds or 60)*1000)
        if ready then
            local stamp=now()
            for src,s in pairs(sessions) do
                if s.staffShift then MySQL.update('UPDATE staff_shifts SET heartbeat_at=? WHERE id=? AND ended_at IS NULL',{stamp,s.staffShift.id}) end
                if s.orgShift then MySQL.update('UPDATE organization_shifts SET heartbeat_at=? WHERE id=? AND ended_at IS NULL',{stamp,s.orgShift.id}) end
                if GetPlayerPing(src)<=0 then sessions[src]=nil end
            end
        end
    end
end)

CreateThread(function()
    while true do
        Wait(15000)
        if ready then
            loadPermissionModel()
            for src in pairs(sessions) do refreshPlayer(src) end
            local aop=FBRP.DB.state('aop',GlobalState['fbrp:aop']); if aop~=GlobalState['fbrp:aop'] then GlobalState['fbrp:aop']=aop end
            local pt=FBRP.DB.state('peacetime',GlobalState['fbrp:peacetime']); if pt~=GlobalState['fbrp:peacetime'] then GlobalState['fbrp:peacetime']=pt end
            local priority=FBRP.DB.state('priority',GlobalState['fbrp:priority']); GlobalState['fbrp:priority']=priority
        end
    end
end)

RegisterCommand('fbrp-refresh', function(source)
    if source>0 and not hasPermission(source,FBRP.Ace.staffManage) then return end
    loadPermissionModel(); for src in pairs(sessions) do refreshPlayer(src) end
    if source>0 then notify(source,'Discord roles, ACE groups, and tags refreshed.','success') end
end, false)

local function authorized(req)
    local expected=FBRP.Config.serviceToken
    if expected=='' then return false end
    local header=req.headers and (req.headers['authorization'] or req.headers['Authorization']) or ''
    return header=='Bearer '..expected
end

SetHttpHandler(function(req,res)
    local headers={['Content-Type']='application/json',['Cache-Control']='no-store'}
    if req.path=='/health' and req.method=='GET' then
        res.writeHead(200,headers)
        return res.send(json.encode({
            ok=ready,players=#GetPlayers(),maxPlayers=tonumber(GetConvar('sv_maxclients','48')) or 48,aop=GlobalState['fbrp:aop'],
            peacetime=GlobalState['fbrp:peacetime']==true,priority=GlobalState['fbrp:priority'] or {}
        }))
    end
    if not authorized(req) then res.writeHead(401,{['Content-Type']='application/json'}); return res.send('{"ok":false,"error":"unauthorized"}') end
    if req.path=='/ops' and req.method=='GET' then
        local snapshot=FBRP.Server and FBRP.Server.liveOpsSnapshot and FBRP.Server.liveOpsSnapshot() or {online=true,players={},scenes={},calls={}}
        res.writeHead(200,headers); return res.send(json.encode(snapshot))
    end
    if req.path=='/staff-permissions' and req.method=='GET' then
        local built,matrix=pcall(FBRP.StaffPerms.build)
        res.writeHead(built and 200 or 500,headers)
        return res.send(built and json.encode(matrix) or '{"ok":false,"error":"build_failed"}')
    end
    req.setDataHandler(function(body)
        local ok,payload=pcall(json.decode,body~='' and body or '{}'); if not ok then payload={} end
        if req.path=='/refresh' then loadPermissionModel(); for src in pairs(sessions) do refreshPlayer(src) end; TriggerEvent('fbrp:radio:reload'); res.writeHead(200,headers); return res.send('{"ok":true}') end
        if req.path=='/personals/refresh' then TriggerEvent('fbrp:personals:reload'); res.writeHead(200,headers); return res.send('{"ok":true}') end
        if req.path=='/personals/install' and FBRP.Personals and FBRP.Personals.install then res.writeHead(200,headers); return res.send(json.encode(FBRP.Personals.install(payload.resource,payload.model))) end
        if req.path=='/personals/uninstall' and FBRP.Personals and FBRP.Personals.uninstall then res.writeHead(200,headers); return res.send(json.encode(FBRP.Personals.uninstall(payload.resource))) end
        if req.path=='/economy/refresh' then TriggerEvent('fbrp:economy:reload'); res.writeHead(200,headers); return res.send('{"ok":true}') end
        if req.path=='/announce' then broadcast('FLORIDA BAY',clean(payload.message,300)); res.writeHead(200,headers); return res.send('{"ok":true}') end
        if req.path=='/ops/action' and FBRP.Server and FBRP.Server.liveOpsAction then
            local actionOk,actionError=FBRP.Server.liveOpsAction(payload)
            res.writeHead(actionOk and 200 or 400,headers)
            return res.send(json.encode({ok=actionOk==true,error=actionError}))
        end
        if req.path=='/state' and payload.key and (payload.key=='aop' or payload.key=='peacetime' or payload.key=='priority') then setSharedState(payload.key,payload.value,'discord-bot'); res.writeHead(200,headers); return res.send('{"ok":true}') end
        if req.path=='/forceout' and payload.discord then
            local changed=false
            for src,s in pairs(sessions) do
                if s.discord==tostring(payload.discord) and s.staffDuty then
                    clockOutStaff(src,'forceout',payload.actor or 'discord-bot')
                    notify(src,'A manager clocked you out: '..clean(payload.reason or 'No reason provided',160),'error')
                    changed=true
                end
            end
            res.writeHead(200,headers); return res.send(json.encode({ok=true,changed=changed}))
        end
        -- /global ban game:true. Bans every stored identifier of the Discord user through EasyAdmin
        -- (offline-safe) and drops any session they have open right now.
        if req.path=='/ban' and type(payload.identifiers)=='table' then
            local ids={}
            for _,value in ipairs(payload.identifiers) do
                if type(value)=='string' and value:match('^%a[%w]*:[%w]+$') then ids[#ids+1]=value end
            end
            if #ids==0 then res.writeHead(400,headers); return res.send('{"ok":false,"error":"no_identifiers"}') end
            local reason=clean(payload.reason or 'Banned across the Florida Bay network',250)
            local ok,ban=pcall(function() return exports.EasyAdmin:addBan(ids,reason,tonumber(payload.seconds),clean(payload.banner or 'Discord',60)) end)
            for src,s in pairs(sessions) do
                if payload.discord and s.discord==tostring(payload.discord) then DropPlayer(src,'Banned from Florida Bay: '..reason) end
            end
            res.writeHead(ok and ban and 200 or 500,headers)
            return res.send(json.encode({ok=ok and ban and true or false,banid=ok and type(ban)=='table' and ban.banid or nil}))
        end
        if req.path=='/unban' and tonumber(payload.banid) then
            local ok,lifted=pcall(function() return exports.EasyAdmin:unbanPlayer(tonumber(payload.banid)) end)
            res.writeHead(200,headers); return res.send(json.encode({ok=ok and lifted==true}))
        end
        res.writeHead(404,{['Content-Type']='application/json'}); res.send('{"ok":false,"error":"not_found"}')
    end)
end)

-- Shared with the justice, medical and life modules loaded after this file.
FBRP.Server = {
    sessions = sessions,
    now = now,
    clean = clean,
    notify = notify,
    chat = chat,
    broadcast = broadcast,
    hasPermission = hasPermission,
    deny = deny,
    actorOf = actorOf,
    playersNear = playersNear,
    displayName = displayName,
    isStaffMember = isStaffMember,
    hasStaffGroupAtLeast = hasStaffGroupAtLeast,
    sendDispatch = sendDispatch,
    recentCalls = recentCalls,
    isReady = function() return ready end,
}

function IsStaffOnDuty(source) return sessions[tonumber(source)] and sessions[tonumber(source)].staffDuty==true or false end
function GetActiveOrganization(source) return sessions[tonumber(source)] and sessions[tonumber(source)].org or nil end
function HasPermission(source,object) return hasPermission(tonumber(source),tostring(object)) end
-- Highest-ranked staff group the player holds (chat rank badge). Only meaningful while on duty.
function GetStaffRank(source)
    local s = sessions[tonumber(source)]
    if not s then return nil end
    local best
    for _, group in ipairs(s.groups or {}) do
        if (group.staff_only == 1 or group.staff_only == true) and (not best or tonumber(group.rank_order or 0) > tonumber(best.rank_order or 0)) then best = group end
    end
    return best and { name=best.name, label=best.label, rank=tonumber(best.rank_order or 0), onDuty=s.staffDuty==true } or nil
end
function GetPlayerDiscord(source) return sessions[tonumber(source)] and sessions[tonumber(source)].discord or discordId(tonumber(source)) end
