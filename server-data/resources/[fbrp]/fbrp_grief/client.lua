-- FBRP Grief Menu - client: NativeUI menu. The server re-checks every action, so this only builds the menu.
local pool = NativeUI.CreatePool()
local targetId, targetName = nil, nil
local frozen = false

local function notify(msg)
    BeginTextCommandThefeedPost("STRING")
    AddTextComponentSubstringPlayerName(msg)
    EndTextCommandThefeedPostTicker(false, true)
end

local function send(action)
    if not targetId then
        return notify("~y~Select a target player first.")
    end
    TriggerServerEvent("fbrp_grief:action", targetId, action)
end

local function addAction(menu, label, desc, action, rightLabel)
    local item = NativeUI.CreateItem(label, desc)
    if rightLabel then item:RightLabel(rightLabel) end
    menu:AddItem(item)
    item.Activated = function() send(action) end
    return item
end

-- ===================== BUILD MENU =====================
local function buildMenu()
    pool = NativeUI.CreatePool()
    pool:MouseEdgeEnabled(false)

    local main = NativeUI.CreateMenu("Grief Menu", "FBRP ~y~v1.0")
    pool:Add(main)

    -- Target selection
    local sel = pool:AddSubMenu(main, "Select Player", "Choose who to target", true, true)
    sel.ParentItem:RightLabel(targetName and ("~b~" .. targetName) or "None")

    for _, p in ipairs(GetActivePlayers()) do
        local sid = GetPlayerServerId(p)
        local name = GetPlayerName(p)
        local item = NativeUI.CreateItem(name, "Server ID: " .. sid)
        item:RightLabel("ID " .. sid)
        sel:AddItem(item)
        item.Activated = function()
            targetId, targetName = sid, name
            sel.ParentItem:RightLabel("~b~" .. name)
            notify("Target set to ~b~" .. name)
            sel:GoBack()
        end
    end

    -- Player tools
    local ptools = pool:AddSubMenu(main, "Player Toolbox", "Actions on the selected player", true, true)
    addAction(ptools, "Set On Fire", "Sets the player on fire", "fire")
    addAction(ptools, "Extinguish", "Puts the fire out", "extinguish")
    addAction(ptools, "Launch Into Air", "Sends the player flying", "launch")
    addAction(ptools, "Slap", "Knocks the player over", "slap")
    addAction(ptools, "Ragdoll", "Makes the player fall over", "ragdoll")
    addAction(ptools, "Freeze / Unfreeze", "Toggles freeze on the player", "freeze")
    addAction(ptools, "Explode Player", "Blows up the player", "explode_player")

    -- Vehicle tools
    local vtools = pool:AddSubMenu(main, "Vehicle Toolbox", "Actions on the player's vehicle", true, true)
    addAction(vtools, "Explode Vehicle", "Blows up their vehicle", "explode_vehicle")
    addAction(vtools, "Launch Vehicle", "Sends their vehicle flying", "launch_vehicle")
    addAction(vtools, "Flip Vehicle", "Flips their vehicle upside down", "flip_vehicle")
    addAction(vtools, "Pop Tires", "Pops all tires", "pop_tires")
    addAction(vtools, "Kill Engine", "Kills the engine", "kill_engine")
    addAction(vtools, "Eject From Vehicle", "Throws the player out", "eject")

    -- Teleport tools
    local ttools = pool:AddSubMenu(main, "Teleport Toolbox", "Teleport options", true, true)
    addAction(ttools, "Go To Player", "Teleport yourself to the target", "goto")
    addAction(ttools, "Bring Player", "Teleport the target to you", "bring")

    local info = NativeUI.CreateItem("Refresh Players", "Reload the player list")
    main:AddItem(info)
    info.Activated = function()
        pool:CloseAllMenus()
        buildMenu()
        pool:RefreshIndex()
        main:Visible(true)
    end

    pool:RefreshIndex()
    return main
end

local mainMenu

local function openMenu()
    if pool:IsAnyMenuOpen() then
        pool:CloseAllMenus()
        return
    end
    mainMenu = buildMenu()
    mainMenu:Visible(true)
end

-- /grief (Esc / Backspace close or go back, NativeUI default)
RegisterCommand(GriefConfig.Command, function()
    if pool:IsAnyMenuOpen() then return pool:CloseAllMenus() end
    lib.callback('fbrp_grief:canOpen', false, function(ok)
        if ok then openMenu() else notify("~r~The grief menu is restricted to Co-Owner and above while clocked in as staff.") end
    end)
end, false)

CreateThread(function()
    while true do
        if pool:IsAnyMenuOpen() then
            pool:ProcessMenus()
            DisableControlAction(0, 200, true) -- stop Esc opening the pause menu
            Wait(0)
        else
            Wait(250)
        end
    end
end)

-- ===================== EFFECTS (run on the target) =====================
RegisterNetEvent("fbrp_grief:teleport", function(x, y, z)
    local ped = PlayerPedId()
    local ent = IsPedInAnyVehicle(ped, false) and GetVehiclePedIsIn(ped, false) or ped
    SetEntityCoords(ent, x, y, z + 0.5, false, false, false, false)
end)

RegisterNetEvent("fbrp_grief:apply", function(action)
    local ped = PlayerPedId()
    local veh = GetVehiclePedIsIn(ped, false)

    if action == "fire" then
        StartEntityFire(ped)
    elseif action == "extinguish" then
        StopEntityFire(ped)
        if veh ~= 0 then StopEntityFire(veh) end
    elseif action == "launch" then
        SetPedToRagdoll(ped, 4000, 4000, 0, false, false, false)
        SetEntityVelocity(ped, 0.0, 0.0, 25.0)
    elseif action == "slap" then
        SetPedToRagdoll(ped, 3000, 3000, 0, false, false, false)
        local fwd = GetEntityForwardVector(ped)
        SetEntityVelocity(ped, -fwd.x * 8.0, -fwd.y * 8.0, 4.0)
    elseif action == "ragdoll" then
        SetPedToRagdoll(ped, 5000, 5000, 0, false, false, false)
    elseif action == "freeze" then
        frozen = not frozen
        FreezeEntityPosition(veh ~= 0 and veh or ped, frozen)
        if veh ~= 0 then FreezeEntityPosition(ped, frozen) end
    elseif action == "explode_player" then
        local c = GetEntityCoords(ped)
        AddExplosion(c.x, c.y, c.z, 2, 1.0, true, false, 1.0)
    elseif veh ~= 0 then
        if action == "explode_vehicle" then
            NetworkExplodeVehicle(veh, true, false, false)
        elseif action == "launch_vehicle" then
            SetEntityVelocity(veh, 0.0, 0.0, 45.0)
        elseif action == "flip_vehicle" then
            local h = GetEntityHeading(veh)
            SetEntityRotation(veh, 0.0, 180.0, h, 2, true)
        elseif action == "pop_tires" then
            for i = 0, 7 do SetVehicleTyreBurst(veh, i, true, 1000.0) end
        elseif action == "kill_engine" then
            SetVehicleEngineHealth(veh, -4000.0)
            SetVehicleEngineOn(veh, false, true, true)
        elseif action == "eject" then
            TaskLeaveVehicle(ped, veh, 4160)
        end
    end
end)
