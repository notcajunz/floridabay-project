-- vMenu hands out its permissions once, when a player joins. This file keeps what
-- vMenu believes in line with what the server allows:
--
--   * NoClip is true only while a staff member with the grant is clocked in.
--   * vMenu's own voice chat is always off. pma-voice owns voice; vMenu's loop would
--     otherwise switch the game's voice chat off every frame for anyone it applies to.
--   * vMenu.Everything is never trusted. vMenu's client checks it as the parent of every
--     permission, so leaving it true would keep NoClip and the voice loop reachable.
--
-- The server already stops sending the wildcard (see config_vmenu.lua). The rewrite below
-- is the second line of defence, and the enforcement loop is the third: vMenu caches every
-- permission that was ever true for the rest of the session, so a clock-out cannot take
-- NoClip away through the permission table alone.

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
    data.Everything = false
    data.NoClip = allowed
    for _, name in ipairs(FBRP.VmenuVoicePermissions) do data[name] = false end
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

-- ─────────────────────── noclip enforcement ───────────────────────
-- vMenu's NoClipHandler leaves a distinctive footprint on the controlled entity every
-- frame: alpha 51 with collision switched off. If that appears while the server has not
-- authorized it (for example the player clocked out mid-flight), press vMenu's own
-- toggle command to switch it off and tell the server.

local function footprint(entity)
    return entity ~= 0 and DoesEntityExist(entity)
        and GetEntityAlpha(entity) <= 60 and GetEntityCollisonDisabled(entity)
end

local function noclipFootprint()
    local ped = PlayerPedId()
    if footprint(ped) then return true end
    local vehicle = GetVehiclePedIsIn(ped, false)
    return vehicle ~= 0 and footprint(vehicle)
end

CreateThread(function()
    local streak, toggles, windowStart = 0, 0, 0
    while true do
        Wait(100)
        if authorized() or not noclipFootprint() then
            streak = 0
        else
            streak = streak + 1
            if streak >= 3 then
                streak = 0
                local stamp = GetGameTimer()
                if stamp - windowStart > 15000 then windowStart, toggles = stamp, 0 end
                if toggles < 3 then
                    toggles = toggles + 1
                    ExecuteCommand(('vMenu:%s:NoClip'):format(GetConvar('vmenu_keymapping_id', 'Default')))
                    TriggerServerEvent('fbrp:vmenu:unauthorizedNoclip')
                    TriggerEvent('fbrp:notify', 'NoClip is only available while you are clocked in as staff.', 'error')
                end
            end
        end
    end
end)
