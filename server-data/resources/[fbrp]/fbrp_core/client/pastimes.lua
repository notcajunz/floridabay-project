-- Florida Bay Pastimes client core: the shared menu, objective banner and
-- route helpers used by side jobs, supply drops, street duels and skydiving.

local PC = { actions = {} }
FBRP.PastimeClient = PC

local function notify(message, tone) TriggerEvent('fbrp:notify', message, tone or 'info') end
PC.notify = notify

-- ───────────────────────── drawing helpers ─────────────────────────

local function drawText(x, y, text, scale, color, centered)
    SetTextFont(4)
    SetTextScale(0.0, scale)
    SetTextColour(color[1], color[2], color[3], color[4] or 255)
    SetTextOutline()
    if centered then SetTextCentre(true) end
    BeginTextCommandDisplayText('STRING')
    AddTextComponentSubstringPlayerName(text)
    EndTextCommandDisplayText(x, y)
end
PC.drawText = drawText

local AQUA, WHITE, AMBER, DIM = { 63, 227, 210 }, { 238, 243, 245 }, { 255, 181, 71 }, { 147, 163, 171 }
PC.colors = { aqua = AQUA, white = WHITE, amber = AMBER, dim = DIM }

-- The banner is a small objective card on the left edge. Modules set it
-- with `{ title='...', rows={ 'line', ... } }` and clear it with nil.
local banner = nil
function PC.setBanner(value) banner = value end

CreateThread(function()
    while true do
        if banner then
            local rows = banner.rows or {}
            local height = 0.045 + #rows * 0.026
            DrawRect(0.105, 0.40 + height / 2, 0.19, height, 6, 10, 14, 175)
            DrawRect(0.0105, 0.40 + height / 2, 0.0025, height, AQUA[1], AQUA[2], AQUA[3], 230)
            drawText(0.016, 0.405, banner.title or '', 0.5, AQUA, false)
            for index, row in ipairs(rows) do
                drawText(0.016, 0.405 + 0.012 + index * 0.026, row, 0.36, WHITE, false)
            end
            Wait(0)
        else
            Wait(250)
        end
    end
end)

function PC.groundZ(x, y, z)
    local found, ground = GetGroundZFor_3dCoord(x + 0.0, y + 0.0, z + 60.0, false)
    return found and ground or z
end

function PC.flat(a, b)
    local dx, dy = a.x - b.x, a.y - b.y
    return math.sqrt(dx * dx + dy * dy)
end

function PC.formatTime(seconds)
    seconds = math.max(0, math.floor(seconds))
    return ('%d:%02d'):format(seconds // 60, seconds % 60)
end

function PC.formatDistance(meters)
    if meters >= 1000.0 then return ('%.1f km'):format(meters / 1000.0) end
    return ('%d m'):format(math.floor(meters))
end

-- A single route blip shared by whichever pastime is running.
local routeBlip = nil
function PC.clearRoute()
    if routeBlip and DoesBlipExist(routeBlip) then RemoveBlip(routeBlip) end
    routeBlip = nil
end

function PC.setRoute(x, y, z, label, sprite, colour)
    PC.clearRoute()
    routeBlip = AddBlipForCoord(x + 0.0, y + 0.0, z + 0.0)
    SetBlipSprite(routeBlip, sprite or 1)
    SetBlipColour(routeBlip, colour or 5)
    SetBlipRoute(routeBlip, true)
    SetBlipRouteColour(routeBlip, colour or 5)
    BeginTextCommandSetBlipName('STRING')
    AddTextComponentString(label or 'Destination')
    EndTextCommandSetBlipName(routeBlip)
end

function PC.busy()
    if FBRP.IsDowned and FBRP.IsDowned() then return 'You cannot do that while incapacitated.' end
    if LocalPlayer.state['fbrp:restrained'] then return 'You are restrained.' end
    if LocalPlayer.state['fbrp:jailed'] or LocalPlayer.state['fbrp:communityService'] then return 'You cannot do that in custody.' end
    return nil
end

-- ───────────────────────── menu ─────────────────────────

RegisterCommand('pastimes', function()
    if FBRP.IsMenuOpen() and FBRP.MenuView() ~= 'pastimes' then return end
    TriggerServerEvent('fbrp:pastimes:request')
end, false)
RegisterKeyMapping('pastimes', 'Open Florida Bay Pastimes', 'keyboard', '')

RegisterNetEvent('fbrp:pastimes:open', function(data)
    FBRP.OpenMenu('pastimes', data or {})
end)

RegisterNUICallback('pastimeAction', function(data, cb)
    data = type(data) == 'table' and data or {}
    local action = tostring(data.action or '')
    local handler = PC.actions[action]
    if handler then handler(data) end
    cb({ ok = true })
end)

PC.actions.daily = function() TriggerServerEvent('fbrp:pastimes:daily') end
PC.actions.title = function(data) TriggerServerEvent('fbrp:pastimes:title', tostring(data.id or '')) end
PC.actions.claim = function(data) TriggerServerEvent('fbrp:pastimes:goal:claim', tostring(data.id or '')) end
PC.actions.refresh = function() TriggerServerEvent('fbrp:pastimes:request') end

AddEventHandler('onResourceStop', function(name)
    if name ~= GetCurrentResourceName() then return end
    PC.clearRoute()
end)
