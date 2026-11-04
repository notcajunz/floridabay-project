-- Overhead identity, ported from the Jaxtti tag system: a headtag followed by the server ID
-- (blue while talking) with the gangtag underneath. Tag content comes from fbrp_core's state
-- bags, so every existing tag source (website, API, bots, /tags menu, duty) keeps working.
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

-- your own tag would float in front of the camera in first person
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

-- Level of detail: nearby players, line of sight, trunk and noclip privacy.
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
                    -- headtag + [ID] at cfg.headHeight above the ped, gang tag at cfg.gangHeight (under it)
                    local coords = GetEntityCoords(row.ped)
                    if GetVehiclePedIsIn(row.ped, false) ~= 0 then coords = GetWorldPositionOfEntityBone(row.ped, 0) end
                    local own = row.player == PlayerId()

                    local id = format('%s[%d]', NetworkIsPlayerTalking(row.player) and '~b~' or '~w~', serverId)
                    if head then
                        DrawTag(coords.x, coords.y, coords.z + cfg.headHeight, head.label .. ' ' .. id, cfg.headScale, head.r, head.g, head.b, head.outline, own)
                    else
                        DrawTag(coords.x, coords.y, coords.z + cfg.headHeight, id, cfg.headScale, 255, 255, 255, true, own)
                    end
                    if gang then
                        DrawTag(coords.x, coords.y, coords.z + cfg.gangHeight, gang.label, cfg.gangScale, gang.r, gang.g, gang.b, gang.outline, own)
                    end
                end
            end
            Wait(0)
        end
    end
end)

-- /tagdebug: explains why tags are or aren't drawn (prints to F8 and shows a notification)
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
