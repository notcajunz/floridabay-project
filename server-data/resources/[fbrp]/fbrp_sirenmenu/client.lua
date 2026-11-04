local Index = 1
local IsOpen = false
local HasPerms = nil -- nil until the server answers

local function dbg(...)
    if Config.Debug then print("[fbrp_sirenmenu]", ...) end
end

local function notify(msg, kind)
    SendNUIMessage({ action = "notify", message = msg, kind = kind or "info" })
end

local function labels()
    local t = {}
    for i, s in ipairs(Config.Sirens) do t[i] = s.label end
    return t
end

-- Same rule LVC uses: Florida Bay can classify addon personals as emergency vehicles, otherwise GTA class 18.
local function isEmergencyVehicle(veh)
    if GetResourceState('fbrp_core') == 'started' then
        local ok, result = pcall(function() return exports.fbrp_core:IsEmergencyVehicle(veh) end)
        if ok and result ~= nil then return result == true end
    end
    return GetVehicleClass(veh) == 18
end

local function getVehicle()
    local ped = PlayerPedId()
    local veh = GetVehiclePedIsIn(ped, false)
    if veh == 0 or GetPedInVehicleSeat(veh, -1) ~= ped then
        return nil, "You need to be driving a vehicle to use this!"
    end
    if not isEmergencyVehicle(veh) then
        return nil, "You are not in an emergency vehicle!"
    end
    return veh
end

local function isRestricted()
    return LocalPlayer.state.dead or LocalPlayer.state.restrained or IsEntityDead(PlayerPedId())
end

local function closeMenu()
    if not IsOpen then return end
    IsOpen = false
    SendNUIMessage({ action = "close" })
end

local function startKeyLoop()
    CreateThread(function()
        local keys = Config.Controls
        while IsOpen do
            Wait(0)

            -- close automatically if you leave the driver seat or die
            local ped = PlayerPedId()
            local veh = GetVehiclePedIsIn(ped, false)
            if veh == 0 or GetPedInVehicleSeat(veh, -1) ~= ped or IsEntityDead(ped) then
                closeMenu()
                break
            end

            -- stop these keys from doing their normal game action while the menu is open
            DisableControlAction(0, keys.prev, true)
            DisableControlAction(0, keys.next, true)
            DisableControlAction(0, keys.apply, true)
            DisableControlAction(0, keys.close, true)

            if IsDisabledControlJustPressed(0, keys.next) then
                SendNUIMessage({ action = "key", key = "next" })
            elseif IsDisabledControlJustPressed(0, keys.prev) then
                SendNUIMessage({ action = "key", key = "prev" })
            elseif IsDisabledControlJustPressed(0, keys.apply) then
                SendNUIMessage({ action = "key", key = "apply" })
            elseif IsDisabledControlJustPressed(0, keys.close) then
                closeMenu()
            end
        end
    end)
end

local function openMenu()
    dbg("openMenu called")
    if IsOpen then return closeMenu() end -- /sirenmenu again closes it

    if HasPerms == false then
        return notify("You don't have access to the siren menu.", "error")
    end
    local veh, err = getVehicle()
    if not veh then
        dbg("blocked:", err)
        return notify(err, "error")
    end

    IsOpen = true
    -- NOTE: no SetNuiFocus here on purpose, so you can keep driving with the menu open
    SendNUIMessage({
        action = "open",
        title = Config.Menu.title,
        sirens = labels(),
        index = Index,
        showLogo = Config.ShowLogo,
        hint = Config.Menu.hint,
    })
    startKeyLoop()
    dbg("menu shown")
end

RegisterNUICallback("select", function(data, cb)
    cb("ok")
    local idx = tonumber(data.index)
    local siren = idx and Config.Sirens[idx]
    if not siren then return end

    local veh, err = getVehicle()
    if not veh then return notify(err, "error") end
    if isRestricted() then return notify("You aren't able to use this right now!", "error") end

    local ok, success = pcall(function()
        return exports.lvc:overrideSiren(siren.sound, siren.label)
    end)
    dbg("overrideSiren", siren.sound, ok, success)

    if ok and success then
        Index = idx
        SetResourceKvp("fbrp_savedSiren", siren.sound)
        notify(("Siren set to %s. Press 1/2/3 to update the tone."):format(siren.label), "success")
    else
        notify("Failed to change siren! (check the sound name in LVC)", "error")
    end
end)

RegisterNUICallback("close", function(_, cb)
    cb("ok")
    closeMenu()
end)

RegisterNetEvent("fbrp_sirenmenu:perms", function(allowed)
    HasPerms = allowed
    if not allowed then return end
    local saved = GetResourceKvpString("fbrp_savedSiren")
    if not saved then return end

    -- ignore a saved siren that is no longer in the menu list (e.g. from the old setup)
    local found
    for i, s in ipairs(Config.Sirens) do
        if s.sound == saved then found = i break end
    end
    if not found then
        dbg("Saved siren no longer exists, ignoring:", saved)
        DeleteResourceKvp("fbrp_savedSiren")
        return
    end
    Index = found
    local ok, success = pcall(function()
        return exports.lvc:overrideSirenManual(saved, saved)
    end)
    dbg("Applied saved siren:", saved, ok, success)
end)

RegisterCommand("sirenmenu", openMenu, false)
RegisterKeyMapping("sirenmenu", "Open Florida Bay Siren Menu", "keyboard", Config.Keybind or "")
TriggerEvent("chat:addSuggestion", "/sirenmenu", "Open the Florida Bay RP Siren Menu")

CreateThread(function()
    Wait(2000)
    TriggerServerEvent("fbrp_sirenmenu:checkPerms")
end)
