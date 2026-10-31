local MENU_X, MENU_Y = 1400, 125

local KINDS = {
    { kind = 'head', title = 'Headtag',  none = 'No Headtag',  search = 'Headtag Search Filter', example = 'Example: UK Scammers' },
    { kind = 'gang', title = 'Gangtag',  none = 'No Gangtag',  search = 'Gangtag Search Filter', example = 'Example: Jax Dev Trolls' },
    { kind = 'chat', title = 'Chat tag', none = 'No Chat tag', search = 'Chat tag Search Filter', example = 'Example: Verified' },
}

local bannerTxd = CreateRuntimeTxd('fbrp_menubanner')
CreateRuntimeTextureFromImage(bannerTxd, 'banner', 'ui/img/banner.png')
local function textHeader(menu)
    menu.Sprite = { Dictionary = 'fbrp_menubanner', Texture = 'banner', Color = { R = 255, G = 255, B = 255, A = 255 } }
    menu.Rectangle = nil
    menu.Title = ''
end

local menus, orgMenus, filters = {}, {}, {}
local allMenus = {}
for _, k in ipairs(KINDS) do
    local root = RageUI.CreateMenu(' ', ('~p~FBRP | %s Menu'):format(k.title), MENU_X, MENU_Y)
    local org = RageUI.CreateSubMenu(root, ' ', ('~y~FBRP | Org %ss'):format(k.title), MENU_X, MENU_Y)
    org.Subtitle = ('~y~FBRP | Org %ss'):format(k.title)
    menus[k.kind], orgMenus[k.kind] = root, org
    for _, m in ipairs({ root, org }) do
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

local MENU_WIDTH = 431
local function menuPos()
    local sz = GetSafeZoneSize()
    local inset = (1.0 - sz) / 2
    local x = TagsConfig.menuX or ((1920 * sz - MENU_WIDTH) / 2)
    return sz, math.max(0, x - inset * 1920), math.max(0, (TagsConfig.menuTop or 110) - inset * 1080)
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
        placeMenus()
        RageUI.Visible(menus[pendingOpen], true)
    elseif not isOpen() then
        placeMenus()
        RageUI.Visible(menus.chat, true)
    end
    pendingOpen = nil
end)

RegisterNetEvent('fbrp:tags:selected', function(selected)
    if type(selected) == 'table' then tagData.selected = selected end
end)

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
            if kind == 'head' then
                Items:AddButton('~b~Chat Tags', 'Open the chat tag menu.', { RightLabel = '→' }, function(onSelected)
                    if onSelected then
                        RageUI.CloseAll()
                        RageUI.Visible(menus.chat, true)
                    end
                end)
            end
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
    end
end

RegisterCommand('headtag', function() request('head') end, false)
RegisterCommand('gangtag', function() request('gang') end, false)
RegisterCommand('chattag', function() request('chat') end, false)
TriggerEvent('chat:addSuggestion', '/headtag', 'Open the headtag menu')
TriggerEvent('chat:addSuggestion', '/gangtag', 'Open the gangtag menu')
TriggerEvent('chat:addSuggestion', '/chattag', 'Open the chat tag menu')

AddEventHandler('fbrp_tags:open', function(kind) request(kind) end)
exports('OpenMenu', function(kind) request(kind) end)
