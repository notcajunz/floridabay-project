-- Tag menus in the Jaxtti style (RageUI fork in src/). Three separate menus, one per command:
--   /headtag  /gangtag  /chattag   (/tags and /tagmenu open the headtag menu)
-- The tags themselves still come from fbrp_core: it sends the player's wardrobe ('fbrp:tags:data') and saves the
-- pick ('fbrp:tags:equip'). fbrp_core skips its own tag menu while this resource is running.

local MENU_X, MENU_Y = 1400, 125 -- starting values only; placeMenus() moves them to the right-middle on every open

local KINDS = {
    { kind = 'head', title = 'Headtag',  none = 'No Headtag',  search = 'Headtag Search Filter', example = 'Example: London Scammers' },
    { kind = 'gang', title = 'Gangtag',  none = 'No Gangtag',  search = 'Gangtag Search Filter', example = "Example: Grav's Plugs" },
    { kind = 'chat', title = 'Chat tag', none = 'No Chat tag', search = 'Chat tag Search Filter', example = 'Example: Verified' },
}

-- no image banner: a plain dark header with "FBRP | Tags" text on every page
local HEADER_TEXT = 'FBRP | Tags'
local function textHeader(menu)
    menu.Sprite = nil
    menu.Rectangle = RageUI.Style.Header
    menu.Title = HEADER_TEXT
    menu.TitleFont = 4
    menu.TitleScale = RageUI.Settings.Items.Title.Text.Scale
end

-- each kind is its own root menu, with Org Tags and About tabs inside it
local menus, orgMenus, aboutMenus, filters = {}, {}, {}, {}
local allMenus = {}
for _, k in ipairs(KINDS) do
    local root = RageUI.CreateMenu(' ', ('~p~FBRP | %s Menu'):format(k.title), MENU_X, MENU_Y)
    local org = RageUI.CreateSubMenu(root, ' ', ('~y~FBRP | Org %ss'):format(k.title), MENU_X, MENU_Y)
    local about = RageUI.CreateSubMenu(root, ' ', '~p~FBRP | About Tag Menu', MENU_X, MENU_Y)
    -- CreateSubMenu upper-cases subtitles (which breaks the colour codes); keep them as written
    org.Subtitle = ('~y~FBRP | Org %ss'):format(k.title)
    about.Subtitle = '~p~FBRP | About Tag Menu'
    menus[k.kind], orgMenus[k.kind], aboutMenus[k.kind] = root, org, about
    for _, m in ipairs({ root, org, about }) do
        textHeader(m)
        allMenus[#allMenus + 1] = m
    end
end

local tagData = {}
local pendingOpen = nil

local function isOpen()
    for _, m in ipairs(allMenus) do
        if RageUI.Visible(m) then return true end
    end
    return false
end

-- top-middle of the screen, just under the compass (same spot as fbrp_donatormenu).
-- RageUI draws in 1920x1080 units from the top-left of the safe zone, so convert from the real screen position.
local MENU_WIDTH = 431
local function menuPos()
    local sz = GetSafeZoneSize()
    local inset = (1.0 - sz) / 2
    return sz, (1920 * sz - MENU_WIDTH) / 2, math.max(0, (TagsConfig.menuTop or 110) - inset * 1080)
end

local function placeMenus()
    local _, x, y = menuPos()
    for _, m in ipairs(allMenus) do m.X, m.Y = math.floor(x), math.floor(y) end
end

local function request(openKind)
    if not menus[openKind] then openKind = 'head' end
    placeMenus()
    pendingOpen = openKind
    TriggerServerEvent('fbrp:tags:request')
end

local function equip(kind, id)
    TriggerServerEvent('fbrp:tags:equip', kind, id)
end

local function selectedId(kind)
    return tonumber((tagData.selected or {})[kind]) or 0
end

-- a tag's colour as { r, g, b } (same hex the overhead tag uses), or nil for plain white
local function colorOf(row)
    local hex = row and (row.color or row.colour or row.hex)
    if not hex or tostring(hex):gsub('#', '') == '' then return nil end
    local r, g, b = TagHexColor(hex)
    return { r, g, b }
end

local function hasOrgTags(kind)
    for _, row in ipairs(tagData[kind] or {}) do
        if row.org_id then return true end
    end
    return false
end

-- one "[n] Label" row in the tag's own colour; the worn tag gets a green "Selected" on the right
local function tagButton(Items, kind, number, row)
    local id = tonumber(row.id) or 0
    local worn = id == selectedId(kind)
    Items:AddButton(
        ('~y~[%d]~s~ %s'):format(number, tostring(row.label or 'Tag')),
        worn and 'You are wearing this tag.' or (row.org_name and ('Available while on duty with %s.'):format(row.org_name) or 'This will select this tag.'),
        { RightLabel = worn and '~g~Selected' or nil, LabelColor = colorOf(row) },
        function(onSelected) if onSelected and not worn then equip(kind, id) end end
    )
end

RegisterNetEvent('fbrp:tags:data', function(data)
    tagData = type(data) == 'table' and data or {}
    if pendingOpen then
        -- a command asked for a specific menu: open it (switches over if another tag menu is already open)
        placeMenus()
        RageUI.Visible(menus[pendingOpen], true)
    elseif not isOpen() then
        -- data requested by another script (fbrp_chat's /chattag asks fbrp_core directly)
        placeMenus()
        RageUI.Visible(menus.chat, true)
    end
    pendingOpen = nil
end)

-- after a pick, fbrp_core confirms; refresh so the "Selected" mark moves
RegisterNetEvent('fbrp:tags:selected', function(selected)
    if type(selected) == 'table' then tagData.selected = selected end
end)

-- going on / off duty changes which org tags are allowed
AddStateBagChangeHandler('fbrp:organization', nil, function(bagName)
    if bagName ~= ('player:%s'):format(GetPlayerServerId(PlayerId())) then return end
    if isOpen() then SetTimeout(100, function() TriggerServerEvent('fbrp:tags:request') end) end
end)

function RageUI.PoolMenus:FbrpTags()
    for _, k in ipairs(KINDS) do
        local kind = k.kind

        menus[kind]:IsVisible(function(Items)
            local filter = filters[kind]
            if filter then
                Items:AddButton('~p~Reset Filter', 'Reset your search filter.', {}, function(onSelected)
                    if onSelected then filters[kind] = nil end
                end)
            else
                Items:AddButton('~p~Search Tags', ('Search your %ss.'):format(k.title:lower()), {}, function(onSelected)
                    if not onSelected then return end
                    local input = lib.inputDialog(k.search, {
                        { type = 'input', label = 'Name', description = k.example, required = true },
                    })
                    if input and input[1] and input[1] ~= '' then filters[kind] = input[1] end
                end)
            end
            Items:AddButton('~g~Org Tags', 'This will show tags under your current organisation.',
                { RightLabel = '→', IsDisabled = not hasOrgTags(kind) }, function() end, orgMenus[kind])
            Items:AddButton('About Tag Menu', 'Information about this menu.', { RightLabel = '→' }, function() end, aboutMenus[kind])
            Items:AddSeparator('')

            local worn = selectedId(kind)
            Items:AddButton(('~y~[1] %s'):format(k.none), ('This will clear your %s.'):format(k.title:lower()),
                { RightLabel = worn == 0 and '~g~Selected' or nil },
                function(onSelected) if onSelected and worn ~= 0 then equip(kind, 0) end end)

            local needle = filter and filter:lower() or nil
            local n = 1
            for _, row in ipairs(tagData[kind] or {}) do
                if not row.org_id then
                    n = n + 1
                    local label = tostring(row.label or ''):lower()
                    if not needle or label:find(needle, 1, true) then tagButton(Items, kind, n, row) end
                end
            end
        end, function() end)

        orgMenus[kind]:IsVisible(function(Items)
            local n = 0
            for _, row in ipairs(tagData[kind] or {}) do
                if row.org_id then
                    n = n + 1
                    tagButton(Items, kind, n, row)
                end
            end
            if n == 0 then
                Items:AddButton('No organisation tags', 'Clock in with an organisation to see its tags.', { IsDisabled = true }, function() end)
            end
        end, function() end)

        aboutMenus[kind]:IsVisible(function(Items)
            Items:AddButton('Tag Menu', 'FBRP | Tags - headtags, gangtags and chat tags.', { RightLabel = '~p~FBRP | Tags' }, function() end)
            Items:AddButton('Designed by', 'FBRP | Tag Menu - designed by Jaxtti.', { RightLabel = '~p~Jaxtti' }, function() end)
        end, function() end)
    end
end

RegisterCommand('headtag', function() request('head') end, false)
RegisterCommand('gangtag', function() request('gang') end, false)
RegisterCommand('chattag', function() request('chat') end, false)
RegisterCommand('tags', function() request('head') end, false)
RegisterCommand('tagmenu', function() request('head') end, false)
TriggerEvent('chat:addSuggestion', '/headtag', 'Open the headtag menu')
TriggerEvent('chat:addSuggestion', '/gangtag', 'Open the gangtag menu')
TriggerEvent('chat:addSuggestion', '/chattag', 'Open the chat tag menu')

-- other scripts can open a specific menu: TriggerEvent('fbrp_tags:open', 'head' | 'gang' | 'chat')
AddEventHandler('fbrp_tags:open', function(kind) request(kind) end)
exports('OpenMenu', function(kind) request(kind) end)
