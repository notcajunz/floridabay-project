-- Staff permissions matrix for the Google Sheets tracker. Builds one row per EasyAdmin, FBRP
-- and legacy vMenu permission and one column per staff rank from the live ACE tables.

local PREFIX = 'vMenu.'
local EVERYONE = 'builtin.everyone'
local EVERYTHING_OBJECTS = {
    ['vMenu'] = true, ['vMenu.*'] = true, ['vMenu.Everything'] = true,
}

local VMENU_PERMISSIONS = { 'vMenu.Everything', 'vMenu.NoClip' }
local seenVmenu = { ['vMenu.Everything'] = true, ['vMenu.NoClip'] = true }
for _, name in ipairs(FBRP.VmenuEverything) do
    if not seenVmenu[name] then
        seenVmenu[name] = true
        VMENU_PERMISSIONS[#VMENU_PERMISSIONS + 1] = name
    end
end
for _, name in ipairs(FBRP.VmenuVoiceAces) do
    if not seenVmenu[name] then
        seenVmenu[name] = true
        VMENU_PERMISSIONS[#VMENU_PERMISSIONS + 1] = name
    end
end
table.sort(VMENU_PERMISSIONS)

-- The dotted ACE inheritance FiveM applies, plus the wildcard spellings fbrp stores.
local function matches(entry, target)
    if entry == '*' or entry == target then return true end
    if target:sub(1, #entry + 1) == entry .. '.' then return true end
    if entry:sub(-2) == '.*' and target:sub(1, #entry - 1) == entry:sub(1, -2) then return true end
    return false
end

local function allows(entries, target)
    local allowed = false
    for _, entry in ipairs(entries) do
        if matches(entry.object, target) then
            if entry.mode == 'deny' then return false end
            allowed = true
        end
    end
    return allowed
end

local function legacyVmenuAllows(entries, target)
    if allows(entries, target) then return true end
    if target == 'vMenu.NoClip' or target:sub(1, 15) == 'vMenu.VoiceChat' then return false end
    for _, entry in ipairs(entries) do
        if entry.mode ~= 'deny' and EVERYTHING_OBJECTS[entry.object] and seenVmenu[target] then return true end
    end
    return false
end

local function startsWith(text, prefix) return text:sub(1, #prefix) == prefix end
local function spaced(word) return (word:gsub('(%l)(%u)', '%1 %2')) end

local function vmenuPlacement(name)
    local rest = name:sub(#PREFIX + 1)
    local section, label = rest:match('^([^.]+)%.(.+)$')
    return section and spaced(section) or 'General', label or rest
end

local function build()
    local ranks = MySQL.query.await([[
        SELECT c.name AS team, r.name AS label, r.ace_group AS id, g.rank_order AS rank_order
        FROM staff_roster_ranks r
        JOIN staff_roster_categories c ON c.id = r.category_id
        JOIN ace_groups g ON g.name = r.ace_group
        ORDER BY g.rank_order ASC
    ]]) or {}
    local entryRows = MySQL.query.await([[
        SELECT e.group_name, e.object, e.mode
        FROM ace_entries e JOIN ace_groups g ON g.name = e.group_name
        WHERE g.staff_only = TRUE OR g.name = 'vip_vehicle_tuning'
    ]]) or {}
    local managementFloor = tonumber(MySQL.scalar.await(
        "SELECT rank_order FROM ace_groups WHERE name = 'assistant_community_manager'")) or 825

    local byGroup = {}
    for _, row in ipairs(entryRows) do
        byGroup[row.group_name] = byGroup[row.group_name] or {}
        byGroup[row.group_name][#byGroup[row.group_name] + 1] = row
    end

    -- A rank carries the ACE group of every rank below it and the management team group from
    -- Assistant Community Manager up, matching the Discord bot's membership ladder.
    local effective = {}
    for index, rank in ipairs(ranks) do
        local groups = {}
        for _, other in ipairs(ranks) do
            if tonumber(other.rank_order) <= tonumber(rank.rank_order) then groups[#groups + 1] = other.id end
        end
        if tonumber(rank.rank_order) >= managementFloor then groups[#groups + 1] = 'mgmt_team' end
        local entries = {}
        for _, group in ipairs(groups) do
            for _, entry in ipairs(byGroup[group] or {}) do entries[#entries + 1] = entry end
        end
        effective[index] = entries
    end

    local roles = { { id = 'vip_vehicle_tuning', label = 'VIP Membership role', team = 'Discord role' } }
    local roleEntries = {}
    for index, role in ipairs(roles) do
        roleEntries[index] = {}
        for _, entry in ipairs(byGroup[role.id] or {}) do roleEntries[index][#roleEntries[index] + 1] = entry end
    end

    local columns = { { id = 'everyone', label = 'Everyone', team = 'All players' } }
    for _, role in ipairs(roles) do columns[#columns + 1] = { id = role.id, label = role.label, team = role.team } end
    for _, rank in ipairs(ranks) do columns[#columns + 1] = { id = rank.id, label = rank.label, team = rank.team } end

    local function aceCells(target)
        local out = { IsPrincipalAceAllowed(EVERYONE, target) and '1' or '0' }
        for index = 1, #roles do out[#out + 1] = allows(roleEntries[index], target) and '1' or '0' end
        for index = 1, #ranks do out[#out + 1] = allows(effective[index], target) and '1' or '0' end
        return table.concat(out)
    end

    local function vmenuCells(target)
        local out = { IsPrincipalAceAllowed(EVERYONE, target) and '1' or '0' }
        for index = 1, #roles do
            out[#out + 1] = legacyVmenuAllows(roleEntries[index], target) and '1' or '0'
        end
        for index = 1, #ranks do
            out[#out + 1] = legacyVmenuAllows(effective[index], target) and '1' or '0'
        end
        return table.concat(out)
    end

    local sections = {}
    local labelled = {}
    local function addCatalog(source, catalog)
        for _, section in ipairs(catalog) do
            local rows = {}
            for _, row in ipairs(section.rows) do
                labelled[row[2]] = true
                rows[#rows + 1] = { label = row[1], ace = row[2], has = aceCells(row[2]) }
            end
            sections[#sections + 1] = { source = source, title = section.title, rows = rows }
        end
    end
    addCatalog('EasyAdmin', FBRP.StaffPerms.easyadmin)
    addCatalog('FBRP', FBRP.StaffPerms.fbrp)

    -- Surface unlabelled EasyAdmin/FBRP ACEs so additions appear before someone labels them.
    local extra = { EasyAdmin = {}, FBRP = {} }
    local seen = {}
    for _, row in ipairs(entryRows) do
        local object = row.object
        local source = startsWith(object, 'easyadmin.') and 'EasyAdmin' or startsWith(object, 'fbrp.') and 'FBRP' or nil
        if source and not seen[object] and not labelled[object] then
            seen[object] = true
            local umbrella = false
            for target in pairs(labelled) do
                if startsWith(target, object .. '.') then umbrella = true break end
            end
            if not umbrella then extra[source][#extra[source] + 1] = object end
        end
    end
    for _, source in ipairs({ 'EasyAdmin', 'FBRP' }) do
        table.sort(extra[source])
        if #extra[source] > 0 then
            local rows = {}
            for _, object in ipairs(extra[source]) do rows[#rows + 1] = { label = object, ace = object, has = aceCells(object) } end
            sections[#sections + 1] = { source = source, title = 'Other', rows = rows }
        end
    end

    local order, bySection = {}, {}
    for _, name in ipairs(VMENU_PERMISSIONS) do
        local title, label = vmenuPlacement(name)
        if not bySection[title] then
            bySection[title] = { source = 'vMenu', title = title, rows = {} }
            order[#order + 1] = title
        end
        bySection[title].rows[#bySection[title].rows + 1] = { label = label, ace = name, has = vmenuCells(name) }
    end
    table.sort(order)
    for _, title in ipairs(order) do sections[#sections + 1] = bySection[title] end

    return { ranks = columns, sections = sections, generatedAt = os.time() * 1000 }
end

FBRP.StaffPerms.build = build
