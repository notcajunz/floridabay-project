-- Nearest postal code (shown on the compass) and /postal <code> routes.
if not HudConfig.Postals.enabled then return end

local postals = nil
local nearest = nil
local route = nil

local function notify(message, kind)
    TriggerEvent('ox_lib:notify', { description = message, type = kind or 'inform' })
end

FBRPHud.postal = function() return nearest end
exports('getPostal', function() return nearest end)

CreateThread(function()
    local raw = LoadResourceFile(GetCurrentResourceName(), 'data/postals.json')
    local ok, list = pcall(json.decode, raw or '[]')
    if not ok or type(list) ~= 'table' then
        print('^1[fbrp_core] data/postals.json could not be read; postal codes are off.^7')
        return
    end
    postals = {}
    for i, p in ipairs(list) do postals[i] = { pos = vector2(p.x, p.y), code = tostring(p.code) } end

    while true do
        local c = GetEntityCoords(PlayerPedId())
        local here = vector2(c.x, c.y)
        local best, bestD = nil, nil
        for i = 1, #postals do
            local d = #(here - postals[i].pos)
            if not bestD or d < bestD then best, bestD = postals[i], d end
        end
        if best and best.code ~= nearest then
            nearest = best.code
            LocalPlayer.state:set('postal', nearest, true)
        end
        if route and #(route.pos - here) < HudConfig.Postals.arriveDistance then
            RemoveBlip(route.blip)
            route = nil
            notify("You've reached your destination!", 'success')
        end
        Wait(500)
    end
end)

local function findPostal(_, args)
    if not args[1] then
        if route then
            RemoveBlip(route.blip)
            route = nil
            notify('Route deleted.')
        end
        return
    end
    if not postals then return notify('Postals are still loading, try again in a second.') end
    local wanted = string.upper(args[1])
    for _, p in ipairs(postals) do
        if string.upper(p.code) == wanted then
            if route then RemoveBlip(route.blip) end
            local blip = AddBlipForCoord(p.pos.x, p.pos.y, 0.0)
            SetBlipSprite(blip, 8)
            SetBlipColour(blip, 5)
            SetBlipRoute(blip, true)
            SetBlipRouteColour(blip, 5)
            BeginTextCommandSetBlipName('STRING')
            AddTextComponentSubstringPlayerName(('Postal %s'):format(p.code))
            EndTextCommandSetBlipName(blip)
            route = { blip = blip, pos = p.pos, code = p.code }
            return notify(('Route set to postal %s.'):format(p.code), 'success')
        end
    end
    notify("That postal doesn't exist.", 'error')
end

for _, name in ipairs(HudConfig.Postals.commands) do
    RegisterCommand(name, findPostal, false)
    TriggerEvent('chat:addSuggestion', '/' .. name, 'Set a route to a postal code', { { name = 'code', help = 'Postal code, leave empty to clear the route' } })
end
