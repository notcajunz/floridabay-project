-- vMenu hands out its permissions once, when a player joins. NoClip is never
-- carried by the always-on vMenu principal: the server publishes a separate,
-- authoritative flag which is true only while a staff member with the grant is
-- clocked in. Keep vMenu's cached table synchronized with that flag.

local rawPermissions = nil -- last permissions JSON vMenu's server sent
local applied = nil        -- authorization state the table was last written for
local applying = false

local function authorized()
    return LocalPlayer.state['fbrp:staffDuty'] == true
        and LocalPlayer.state['fbrp:staffNoclip'] == true
end

local function apply(force)
    if not rawPermissions then return end
    local allowed = authorized()
    if not force and applied == allowed then return end
    local ok, data = pcall(json.decode, rawPermissions)
    if not ok or type(data) ~= 'table' then return end
    data.NoClip = allowed
    applied = allowed
    applying = true
    TriggerEvent('vMenu:SetPermissions', json.encode(data))
    applying = false
end

RegisterNetEvent('vMenu:SetPermissions')
AddEventHandler('vMenu:SetPermissions', function(payload)
    if applying or type(payload) ~= 'string' then return end
    rawPermissions = payload
    applied = nil
    -- vMenu's own handler runs after this one, so write our copy on the next tick.
    CreateThread(function()
        Wait(0)
        apply(true)
    end)
end)

CreateThread(function()
    while true do
        Wait(250)
        apply(false)
    end
end)
