local cfg = TagsConfig

local function notify(src, description, kind)
    TriggerClientEvent('ox_lib:notify', src, { title = 'FBRP Tags', description = description, type = kind or 'inform', position = cfg.notifyPosition })
end

-- Staff /tag-toggle: hide your own headtag and gangtag from other players. Only staff clocked
-- in through fbrp_core may use it.
RegisterNetEvent('fbrp_tags:toggle', function()
    local src = source
    local state = Player(src).state
    if state['fbrp:staffDuty'] ~= true then return notify(src, 'You must be clocked in as staff to use this.', 'error') end
    local hidden = state['fbrp:tagHidden'] ~= true
    state:set('fbrp:tagHidden', hidden, true)
    notify(src, hidden and 'Your tags are now hidden.' or 'Your tags are now visible.', 'success')
end)

AddEventHandler('fbrp:staffDutyChanged', function(src, onDuty)
    if not onDuty then Player(src).state:set('fbrp:tagHidden', false, true) end
end)

local function cardFor(src)
    local state = Player(src).state
    local org = state['fbrp:organization']
    if type(org) ~= 'table' or not cfg.badgeOrgTypes[org.type] then return nil end
    local callsign
    local ok, discord = pcall(function() return exports.fbrp_core:GetPlayerDiscord(src) end)
    if ok and discord then
        local row = MySQL.single.await('SELECT callsign FROM mdt_units WHERE discord_id=?', { discord })
        callsign = row and row.callsign
    end
    local logo
    if tonumber(org.logo) and cfg.logoBase ~= '' then
        logo = ('%s%d?v=%d'):format(cfg.logoBase, org.id, org.logo)
    end
    return {
        department = org.name,
        name = state['fbrp:characterName'] or GetPlayerName(src),
        callsign = callsign or '',
        logo = logo
    }
end

RegisterCommand('showbadge', function(src, args)
    if src == 0 then return end
    local card = cardFor(src)
    if not card then return notify(src, 'You must be clocked into a law enforcement or fire department.', 'error') end

    local mine = GetEntityCoords(GetPlayerPed(src))
    local targets = {}
    local requested = tonumber(args[1])
    for _, player in ipairs(GetPlayers()) do
        local id = tonumber(player)
        if id ~= src and (not requested or id == requested) then
            if #(mine - GetEntityCoords(GetPlayerPed(id))) <= cfg.badgeDistance then targets[#targets + 1] = id end
        end
    end
    if #targets == 0 then return notify(src, 'Nobody is close enough to see your badge.', 'error') end

    TriggerClientEvent('fbrp_tags:showBadge', src, card)
    for _, id in ipairs(targets) do TriggerClientEvent('fbrp_tags:showBadge', id, card) end
    notify(src, ('Showed your badge to %d player(s).'):format(#targets), 'success')
end, false)
