-- vMenu hands out its permissions once, when a player joins, from their ACE groups at that moment.
-- NoClip is a staff power that must only work while clocked in (/clockin), so this keeps vMenu's
-- own permission table in step with the duty state: the server's table is intercepted and NoClip is
-- cleared while off duty, then restored when the player clocks in.

local rawPermissions = nil -- last permissions JSON vMenu's server sent
local applied = nil        -- duty state the table was last written for
local applying = false

local function onDuty()
    return LocalPlayer.state['fbrp:staffDuty'] == true
end

local function apply(force)
    if not rawPermissions then return end
    local duty = onDuty()
    if not force and applied == duty then return end
    local ok, data = pcall(json.decode, rawPermissions)
    if not ok or type(data) ~= 'table' then return end
    if not duty and data.NoClip ~= nil then data.NoClip = false end
    applied = duty
    applying = true
    TriggerEvent('vMenu:SetPermissions', json.encode(data))
    applying = false
end

RegisterNetEvent('vMenu:SetPermissions')
AddEventHandler('vMenu:SetPermissions', function(payload)
    if applying or type(payload) ~= 'string' then return end
    rawPermissions = payload
    applied = nil
    -- vMenu's own handler runs after this one, so write our copy once it has settled.
    CreateThread(function()
        Wait(300)
        apply(true)
    end)
end)

CreateThread(function()
    while true do
        Wait(1000)
        apply(false)
    end
end)
