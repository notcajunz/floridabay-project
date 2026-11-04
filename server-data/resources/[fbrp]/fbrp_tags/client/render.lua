local cfg = TagsConfig
local format = string.format

local tagsHidden = GetResourceKvpString('fbrp_hide_tags') == '1'
local ownSetting = GetResourceKvpString('fbrp_show_own_tag')
local showOwn = cfg.showOwnTag ~= false
if ownSetting == '1' then showOwn = true elseif ownSetting == '0' then showOwn = false end

RegisterCommand('selftag', function()
    showOwn = not showOwn
    SetResourceKvp('fbrp_show_own_tag', showOwn and '1' or '0')
    TagNotify(showOwn and 'You can now see your own tags.' or 'Your own tags are hidden.')
end, false)

local function firstPerson(ped)
    if IsPedInAnyVehicle(ped, false) then return GetFollowVehicleCamViewMode() == 4 end
    return GetFollowPedCamViewMode() == 4
end
local rows = {}
local canSee = {}

RegisterCommand('hidetags', function()
    tagsHidden = not tagsHidden
    SetResourceKvp('fbrp_hide_tags', tagsHidden and '1' or '0')
    TagNotify(tagsHidden and 'Overhead tags hidden.' or 'Overhead tags shown.')
end, false)
TriggerEvent('chat:addSuggestion', '/hidetags', "Toggle the visibility of other player's headtags.")
TriggerEvent('chat:addSuggestion', '/selftag', 'Show or hide your own headtag and gangtag.')
TriggerEvent('chat:addSuggestion', '/tag-toggle', '[Staff-Only] Toggles the visibility of your headtag & gangtag!')

RegisterCommand('tag-toggle', function() TriggerServerEvent('fbrp_tags:toggle') end, false)

local function tagFrom(bag)
    if type(bag) ~= 'table' then return nil end
    local label = CleanTagLabel(bag.label)
    if not label then return nil end
    local r, g, b = TagHexColor(bag.color)
    return { label = label, r = r, g = g, b = b, outline = bag.outline ~= false }
end

CreateThread(function()
    local mine = PlayerId()
    while true do
        local nextRows, nextSee = {}, {}
        if not tagsHidden and not LocalPlayer.state['fbrp:blindfolded'] then
            local ped = PlayerPedId()
            local origin = GetEntityCoords(ped)
            local preview = showOwn and not firstPerson(ped)
            for _, player in ipairs(GetActivePlayers()) do
                if player ~= mine or preview then
                    local themPed = GetPlayerPed(player)
                    if themPed ~= 0 and DoesEntityExist(themPed) and not IsEntityDead(themPed) and IsEntityVisible(themPed) then
                        local serverId = GetPlayerServerId(player)
                        local state = Player(serverId).state
                        if state['fbrp:noclip'] ~= true and state['fbrp:tagHidden'] ~= true and not state.inTrunk
                            and #(origin - GetEntityCoords(themPed)) <= cfg.distance then
                            nextRows[serverId] = { player = player, ped = themPed }
                            if player == mine or HasEntityClearLosToEntity(ped, themPed, 17) then nextSee[serverId] = true end
                        end
                    end
                end
            end
        end
        rows, canSee = nextRows, nextSee
        Wait(next(nextRows) and cfg.losInterval or 400)
    end
end)

CreateThread(function()
    while true do
        if next(rows) == nil then
            Wait(250)
        else
            for serverId, row in pairs(rows) do
                if canSee[serverId] and DoesEntityExist(row.ped) then
                    local state = Player(serverId).state
                    local head, gang = tagFrom(state['fbrp:headtag']), tagFrom(state['fbrp:gangtag'])

                    local inVehicle = GetVehiclePedIsIn(row.ped, false) ~= 0
                    local coords = GetEntityCoords(row.ped)
                    if inVehicle then coords = GetWorldPositionOfEntityBone(row.ped, 0) end
                    local own = row.player == PlayerId()

                    local id = format('%s[%d]', NetworkIsPlayerTalking(row.player) and '~b~' or '~w~', serverId)
                    local lines = {}
                    if head then
                        lines[1] = { text = head.label .. ' ' .. id, size = cfg.headScale, r = head.r, g = head.g, b = head.b, outline = head.outline, spacing = cfg.headSpacing }
                    else
                        lines[1] = { text = id, size = cfg.headScale, r = 255, g = 255, b = 255, spacing = cfg.headSpacing }
                    end

                    local callsign = not inVehicle and CleanTagLabel(state['fbrp:callsign'])
                    if callsign then
                        local name = CleanTagLabel(state['fbrp:name'])
                        lines[#lines + 1] = { text = name and (callsign .. ' | ' .. name) or callsign, size = cfg.nameScale, r = 255, g = 255, b = 255, spacing = cfg.nameSpacing }
                    end
                    if gang then

                        if #lines == 1 then lines[1].spacing = cfg.gangSpacing or lines[1].spacing end
                        lines[#lines + 1] = { text = gang.label, size = cfg.gangScale, r = gang.r, g = gang.g, b = gang.b, outline = gang.outline }
                    end
                    DrawTagLines(coords.x, coords.y, coords.z + cfg.headHeight, lines, own)
                end
            end
            Wait(0)
        end
    end
end)

RegisterCommand('tagdebug', function()
    local lines = {}
    local function add(s) lines[#lines + 1] = s print('[fbrp_tags] ' .. s) end
    add(('hidden by /hidetags: %s | blindfolded: %s | own tag: %s'):format(tostring(tagsHidden), tostring(LocalPlayer.state['fbrp:blindfolded'] == true), tostring(showOwn)))
    local ped = PlayerPedId()
    local origin = GetEntityCoords(ped)
    local count = 0
    for _, player in ipairs(GetActivePlayers()) do
        local them = GetPlayerPed(player)
        local id = GetPlayerServerId(player)
        local st = Player(id).state
        local head = type(st['fbrp:headtag']) == 'table' and st['fbrp:headtag'].label or 'none'
        local dist = #(origin - GetEntityCoords(them))
        count = count + 1
        add(('[%d]%s dist %.1fm | visible %s | sight %s | noclip %s | staff-hidden %s | headtag %s'):format(
            id, player == PlayerId() and ' (you)' or '', dist, tostring(IsEntityVisible(them)),
            tostring(player == PlayerId() or HasEntityClearLosToEntity(ped, them, 17)),
            tostring(st['fbrp:noclip'] == true), tostring(st['fbrp:tagHidden'] == true), tostring(head)))
    end
    add(('players loaded around you: %d (tags draw within %.0fm)'):format(count, cfg.distance))
    TagNotify(table.concat(lines, '\n'))
end, false)
