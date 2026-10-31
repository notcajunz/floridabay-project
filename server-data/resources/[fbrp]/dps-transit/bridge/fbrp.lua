--[[
    dps-transit - Florida Bay RP bridge
    FBRP has no qbx_core, no in-game cash and no ox_target, so this bridge
    - identifies players by their Cfx license and uses their Cfx name,
    - maps fbrp_core data to the jobs dps-transit checks (law-enforcement org on duty -> 'police',
      staff on duty -> 'admin'),
    - makes rides free (balance is effectively unlimited, charging always succeeds), and
    - provides Bridge.Target, a small ox_lib-zone replacement for the ox_target calls.
]]

if IsDuplicityVersion() then
    function Bridge.GetPlayer(source)
        if not GetPlayerName(source) then return nil end
        return { source = source }
    end

    function Bridge.GetCharacterName(source)
        return GetPlayerName(source) or 'Unknown'
    end

    function Bridge.GetJob(source)
        local okStaff, staff = pcall(function() return exports.fbrp_core:IsStaffOnDuty(source) end)
        if okStaff and staff then return 'admin', 0 end
        local okOrg, org = pcall(function() return exports.fbrp_core:GetActiveOrganization(source) end)
        if okOrg and org and org.type == 'leo' then return 'police', 0 end
        return 'unemployed', 0
    end

    function Bridge.GetIdentifier(source)
        return GetPlayerIdentifierByType(source, 'license') or GetPlayerIdentifierByType(source, 'license2')
    end

    -- Rides are free: there is no cash to take, so every charge succeeds.
    function Bridge.RemoveMoney() return true end
    function Bridge.AddMoney() return true end
    function Bridge.GetMoney() return 1000000000 end

    function Bridge.GetPlayers()
        local ids = {}
        for _, id in ipairs(GetPlayers()) do ids[#ids + 1] = tonumber(id) end
        return ids
    end

    function Bridge.Notify(source, title, msg, type)
        TriggerClientEvent('ox_lib:notify', source, { title = title, description = msg, type = type })
    end

    function Bridge.OnPlayerLoaded(cb)
        AddEventHandler('playerJoining', function() cb(source) end)
    end

    function Bridge.OnPlayerUnload(cb)
        AddEventHandler('playerDropped', function() cb(source) end)
    end
else
    local function state(key) return LocalPlayer.state[key] end

    function Bridge.GetPlayerData() return { citizenid = 'fbrp' } end

    function Bridge.GetJob()
        if state('fbrp:staffDuty') == true then return 'admin', 0 end
        local org = state('fbrp:organization')
        if type(org) == 'table' and org.type == 'leo' then return 'police', 0 end
        return 'unemployed', 0
    end

    function Bridge.IsPlayerLoaded() return NetworkIsPlayerActive(PlayerId()) end

    function Bridge.OnPlayerLoaded(cb)
        CreateThread(function()
            while not NetworkIsPlayerActive(PlayerId()) do Wait(500) end
            cb()
        end)
    end

    function Bridge.OnPlayerUnload() end
    function Bridge.OnJobUpdate() end

    function Bridge.Notify(msg, type)
        lib.notify({ description = msg, type = type })
    end

    -- Minimal ox_target replacement: an ox_lib zone shows "[E] label" and runs the option on E.
    -- With several options on one zone, E opens an ox_lib context menu to pick one.
    Bridge.Target = {}

    local function attach(zone, data)
        local function usable()
            local list = {}
            for _, opt in ipairs(data.options) do
                if not opt.canInteract or opt.canInteract() then list[#list + 1] = opt end
            end
            return list
        end

        local shown = false
        local function hide()
            if shown then lib.hideTextUI() shown = false end
        end

        zone.inside = function()
            local list = usable()
            if #list == 0 then hide() return end
            if not shown then
                lib.showTextUI(('[E] %s'):format(#list == 1 and list[1].label or 'Transit options'))
                shown = true
            end
            if IsControlJustReleased(0, 38) then
                hide()
                if #list == 1 then
                    list[1].onSelect()
                else
                    local menu = {}
                    for _, opt in ipairs(list) do
                        menu[#menu + 1] = { title = opt.label, icon = opt.icon, onSelect = opt.onSelect }
                    end
                    local id = 'dps_transit_target_' .. (data.options[1].name or 'zone')
                    lib.registerContext({ id = id, title = 'Transit', options = menu })
                    lib.showContext(id)
                end
            end
        end
        zone.onExit = hide
        return zone
    end

    function Bridge.Target.addBoxZone(data)
        return lib.zones.box(attach({
            coords = data.coords, size = data.size, rotation = data.rotation, debug = data.debug,
        }, data))
    end

    function Bridge.Target.addSphereZone(data)
        return lib.zones.sphere(attach({
            coords = data.coords, radius = data.radius, debug = data.debug,
        }, data))
    end
end
