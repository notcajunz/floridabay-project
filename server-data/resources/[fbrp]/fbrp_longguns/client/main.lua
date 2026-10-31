-- Long guns: only pistols, stun guns, melee and tools can be drawn anywhere.
-- Rifles, shotguns, SMGs, snipers and heavy weapons are taken out of a vehicle
-- trunk, then slung on the back or chest. A long gun that is not holstered by
-- hand is slung automatically, and a long gun that never came from a trunk (or
-- the armory) cannot be held at all.

local UNARMED = joaat('WEAPON_UNARMED')

local function u32(hash)
    return (tonumber(hash) or 0) & 0xFFFFFFFF
end

local groupSet = {}
for _, name in ipairs(LG.groups) do groupSet[u32(joaat(name))] = true end

local weaponHash, nameByHash, allowedName = {}, {}, {}
for _, name in ipairs(LG.weapons) do
    local hash = joaat(name)
    weaponHash[name] = hash
    nameByHash[u32(hash)] = name
    allowedName[name] = true
end

local sanctioned = {}   -- u32 hash -> true, long guns legitimately in the ped's inventory
local grace = {}        -- u32 hash -> game timer before which state is not re-evaluated
local slung = { back = nil, chest = nil }  -- pos -> { snap, hash, prop }
local preferred = 'back'
local busy = false
local lastWarn = 0
local trackedPed = 0
local syncSlungState
local takeSelected

do
    local saved = GetResourceKvpString('fbrp_longguns:pref')
    if saved == 'back' or saved == 'chest' then preferred = saved end
end

local function notify(message, tone)
    TriggerEvent('ox_lib:notify', { description = message, type = tone or 'info' })
end

local function help(text)
    BeginTextCommandDisplayHelp('STRING')
    AddTextComponentSubstringPlayerName(text)
    EndTextCommandDisplayHelp(0, false, true, -1)
end

local function isLongGun(hash)
    if not hash or hash == 0 then return false end
    if nameByHash[u32(hash)] then return true end
    return groupSet[u32(GetWeapontypeGroup(hash))] == true
end

local function labelFor(name)
    if LG.labels[name] then return LG.labels[name] end
    local label = tostring(name):gsub('^WEAPON_', ''):gsub('_', ' '):lower()
    return (label:gsub('(%a)([%w]*)', function(first, rest) return first:upper() .. rest end))
end

local function isDowned()
    return FBRP and FBRP.IsDowned and FBRP.IsDowned() or false
end

-- ---------------------------------------------------------------------------
-- Weapon snapshots (ammo, clip, tint, attachments) so slinging and trunk
-- storage give back exactly what was put away.
-- ---------------------------------------------------------------------------

local genericComponents = {
    'COMPONENT_AT_AR_FLSH', 'COMPONENT_AT_AR_SUPP', 'COMPONENT_AT_AR_SUPP_02', 'COMPONENT_AT_AR_AFGRIP',
    'COMPONENT_AT_AR_AFGRIP_02', 'COMPONENT_AT_PI_FLSH', 'COMPONENT_AT_PI_SUPP', 'COMPONENT_AT_PI_SUPP_02',
    'COMPONENT_AT_SCOPE_MACRO', 'COMPONENT_AT_SCOPE_MACRO_02', 'COMPONENT_AT_SCOPE_SMALL',
    'COMPONENT_AT_SCOPE_SMALL_02', 'COMPONENT_AT_SCOPE_MEDIUM', 'COMPONENT_AT_SCOPE_LARGE',
    'COMPONENT_AT_SCOPE_LARGE_FIXED_ZOOM', 'COMPONENT_AT_SCOPE_MAX', 'COMPONENT_AT_SCOPE_NV',
    'COMPONENT_AT_SCOPE_THERMAL', 'COMPONENT_AT_SCOPE_MACRO_MK2', 'COMPONENT_AT_SCOPE_SMALL_MK2',
    'COMPONENT_AT_SCOPE_MEDIUM_MK2', 'COMPONENT_AT_SCOPE_LARGE_MK2', 'COMPONENT_AT_SIGHTS',
    'COMPONENT_AT_SIGHTS_SMG', 'COMPONENT_AT_RAILCOVER_01', 'COMPONENT_AT_MUZZLE_01', 'COMPONENT_AT_MUZZLE_02',
    'COMPONENT_AT_MUZZLE_03', 'COMPONENT_AT_MUZZLE_04', 'COMPONENT_AT_MUZZLE_05', 'COMPONENT_AT_MUZZLE_06',
    'COMPONENT_AT_MUZZLE_07', 'COMPONENT_AT_MUZZLE_08', 'COMPONENT_AT_MUZZLE_09', 'COMPONENT_AT_AR_BARREL_01',
    'COMPONENT_AT_AR_BARREL_02', 'COMPONENT_AT_SB_BARREL_01', 'COMPONENT_AT_SB_BARREL_02',
    'COMPONENT_AT_SR_BARREL_01', 'COMPONENT_AT_SR_BARREL_02', 'COMPONENT_AT_SR_SUPP', 'COMPONENT_AT_SR_SUPP_03',
    'COMPONENT_AT_SC_BARREL_01', 'COMPONENT_AT_SC_BARREL_02', 'COMPONENT_AT_MG_BARREL_01',
    'COMPONENT_AT_MG_BARREL_02', 'COMPONENT_AT_BP_BARREL_01', 'COMPONENT_AT_BP_BARREL_02',
    -- Florida Bay addon weapons
    'COMPONENT_AT_AR_SUPP_M700', 'COMPONENT_AT_HK416B_FLSH', 'COMPONENT_AT_HK416B_SUPP',
    'COMPONENT_AT_MP9A_FLSH', 'COMPONENT_AT_MP9A_SUPP_02', 'COMPONENT_AT_SCOPE_HK416B',
    'COMPONENT_AT_SCOPE_M700', 'COMPONENT_AT_SCOPE_MP9A', 'COMPONENT_AT_SCOPE_FBIARB',
    'COMPONENT_AT_FBIARB_AFGRIP', 'COMPONENT_AT_FBIARB_FLSH', 'COMPONENT_CARBINE_SIGHT_01',
    'COMPONENT_GHOSTARP_MAG_01', 'COMPONENT_GHOSTARP_SCOPE_01', 'COMPONENT_HK416B_CLIP_01',
    'COMPONENT_M700_CLIP_01', 'COMPONENT_MM4_CLIP_01', 'COMPONENT_MP9A_CLIP_02', 'COMPONENT_FBIARB_CLIP_01'
}

local perWeaponSuffixes = {
    '_CLIP_01', '_CLIP_02', '_CLIP_03', '_CLIP_TRACER', '_CLIP_INCENDIARY', '_CLIP_ARMORPIERCING', '_CLIP_FMJ',
    '_CLIP_HOLLOWPOINT', '_CLIP_EXPLOSIVE', '_VARMOD_LUXE', '_VARMOD_LOWRIDER', '_VARMOD_SECURITY', '_CAMO',
    '_CAMO_02', '_CAMO_03', '_CAMO_04', '_CAMO_05', '_CAMO_06', '_CAMO_07', '_CAMO_08', '_CAMO_09', '_CAMO_10',
    '_CAMO_IND_01', '_BARREL_01', '_BARREL_02', '_MAG_01'
}

local componentCache = {}

local function candidateComponents(name)
    if componentCache[name] then return componentCache[name] end
    local list = {}
    for _, component in ipairs(genericComponents) do list[#list + 1] = component end
    local base = name:gsub('^WEAPON_', '')
    for _, suffix in ipairs(perWeaponSuffixes) do list[#list + 1] = 'COMPONENT_' .. base .. suffix end
    componentCache[name] = list
    return list
end

local function snapshotWeapon(ped, name)
    local hash = weaponHash[name] or joaat(name)
    local components = {}
    for _, component in ipairs(candidateComponents(name)) do
        local componentHash = joaat(component)
        if DoesWeaponTakeWeaponComponent(hash, componentHash) and HasPedGotWeaponComponent(ped, hash, componentHash) then
            components[#components + 1] = component
        end
    end
    local ok, clip = GetAmmoInClip(ped, hash)
    return {
        weapon = name,
        ammo = GetAmmoInPedWeapon(ped, hash),
        clip = ok and clip or 0,
        tint = GetPedWeaponTintIndex(ped, hash),
        components = components
    }
end

local function sanction(hash, seconds)
    sanctioned[u32(hash)] = true
    grace[u32(hash)] = GetGameTimer() + (seconds or 3) * 1000
end

local function giveSnapshot(ped, snap, equip)
    local hash = weaponHash[snap.weapon] or joaat(snap.weapon)
    sanction(hash, 4)
    RequestWeaponAsset(hash, 31, 0)
    local untilAt = GetGameTimer() + 2500
    while not HasWeaponAssetLoaded(hash) and GetGameTimer() < untilAt do Wait(20) end
    GiveWeaponToPed(ped, hash, math.max(0, tonumber(snap.ammo) or 0), false, equip == true)
    for _, component in ipairs(snap.components or {}) do
        GiveWeaponComponentToPed(ped, hash, joaat(component))
    end
    if (tonumber(snap.tint) or 0) > 0 then SetPedWeaponTintIndex(ped, hash, snap.tint) end
    if (tonumber(snap.clip) or 0) > 0 then pcall(SetAmmoInClip, ped, hash, snap.clip) end
    if equip then SetCurrentPedWeapon(ped, hash, true) end
end

-- ---------------------------------------------------------------------------
-- Sling props
-- ---------------------------------------------------------------------------

local function destroyProp(prop)
    if prop and DoesEntityExist(prop) then
        DetachEntity(prop, true, false)
        DeleteEntity(prop)
    end
end

local function attachProp(prop, ped, pos)
    local placement = LG.sling[pos]
    if not placement then return end
    AttachEntityToEntity(
        prop, ped, GetPedBoneIndex(ped, placement.bone),
        placement.pos[1] + 0.0, placement.pos[2] + 0.0, placement.pos[3] + 0.0,
        placement.rot[1] + 0.0, placement.rot[2] + 0.0, placement.rot[3] + 0.0,
        false, false, false, false, 2, true
    )
end

local function spawnProp(ped, hash, pos)
    local model = GetWeapontypeModel(hash)
    if not model or model == 0 or not IsModelInCdimage(model) then return nil end
    RequestModel(model)
    local untilAt = GetGameTimer() + 2500
    while not HasModelLoaded(model) and GetGameTimer() < untilAt do Wait(20) end
    if not HasModelLoaded(model) then return nil end
    local coords = GetEntityCoords(ped)
    local prop = CreateObject(model, coords.x, coords.y, coords.z + 0.3, true, true, false)
    SetModelAsNoLongerNeeded(model)
    if not prop or prop == 0 then return nil end
    SetEntityCollision(prop, false, false)
    SetEntityAsMissionEntity(prop, true, true)
    attachProp(prop, ped, pos)
    return prop
end

local function freePosition()
    if not slung[preferred] then return preferred end
    local other = preferred == 'back' and 'chest' or 'back'
    if not slung[other] then return other end
    return nil
end

local function slungCount()
    return (slung.back and 1 or 0) + (slung.chest and 1 or 0)
end

local function inventoryLongGuns(ped)
    local owned = {}
    for _, name in ipairs(LG.weapons) do
        if HasPedGotWeapon(ped, weaponHash[name], false) then owned[#owned + 1] = name end
    end
    return owned
end

local function carriedCount(ped)
    local count = slungCount()
    for _, name in ipairs(inventoryLongGuns(ped)) do
        if sanctioned[u32(weaponHash[name])] then count = count + 1 end
    end
    return count
end

local function slingWeapon(ped, name, pos)
    if busy then return false end
    pos = pos or freePosition()
    if not pos or slung[pos] then return false end
    busy = true
    local hash = weaponHash[name]
    local snap = snapshotWeapon(ped, name)
    -- Reserve the slot before the prop finishes loading so nothing else grabs it.
    slung[pos] = { snap = snap, hash = hash, prop = nil }
    RemoveWeaponFromPed(ped, hash)
    sanctioned[u32(hash)] = nil
    slung[pos].prop = spawnProp(ped, hash, pos)
    busy = false
    return true
end

local function drawSling(ped, pos)
    if busy then return false end
    local record = slung[pos]
    if not record then return false end
    busy = true
    slung[pos] = nil
    destroyProp(record.prop)
    giveSnapshot(ped, record.snap, true)
    busy = false
    return true
end

local function handWeapon(ped)
    local current = GetSelectedPedWeapon(ped)
    if isLongGun(current) and sanctioned[u32(current)] then
        return nameByHash[u32(current)], current
    end
    return nil
end

local function toggleSling(force)
    local ped = PlayerPedId()
    if isDowned() or IsEntityDead(ped) or IsPedInAnyVehicle(ped, false) then return end
    if busy then return end
    local name = handWeapon(ped)
    if name then
        local pos = force or freePosition()
        if not pos then return notify('Both slings are full. Put a long gun back in a trunk first.', 'error') end
        if slung[pos] then return notify(('Your %s sling is already in use.'):format(pos), 'error') end
        if slingWeapon(ped, name, pos) then
            notify(('%s slung on your %s.'):format(labelFor(name), pos), 'success')
        end
        return
    end
    local pos = force
    if not pos then
        pos = slung[preferred] and preferred or (slung.back and 'back') or (slung.chest and 'chest') or nil
    end
    if not pos or not slung[pos] then
        return notify('Nothing slung. Long guns come out of a vehicle trunk.', 'info')
    end
    local label = labelFor(slung[pos].snap.weapon)
    if drawSling(ped, pos) then notify(('Drew the %s.'):format(label), 'info') end
end

-- ---------------------------------------------------------------------------
-- Enforcement
-- ---------------------------------------------------------------------------

local function resetAfterPedChange()
    for _, pos in ipairs({ 'back', 'chest' }) do
        if slung[pos] then destroyProp(slung[pos].prop); slung[pos] = nil end
    end
    sanctioned = {}
    grace = {}
end

-- Slung guns are separate networked props. While this player is noclipping, hide them
-- for everyone (SetEntityVisible is synced) and publish their net ids so other clients
-- can also hide them locally (fbrp_core client/tags.lua).
local hidingProps = false
local publishedProps = ''

syncSlungState = function()
    local ids, entities = {}, {}
    for _, pos in ipairs({ 'back', 'chest' }) do
        local prop = slung[pos] and slung[pos].prop
        if prop and DoesEntityExist(prop) then
            entities[#entities + 1] = prop
            if NetworkGetEntityIsNetworked(prop) then ids[#ids + 1] = NetworkGetNetworkIdFromEntity(prop) end
        end
    end
    local key = table.concat(ids, ',')
    if key ~= publishedProps then
        publishedProps = key
        LocalPlayer.state:set('fbrp:slungProps', ids, true)
    end
    local noclip = LocalPlayer.state['fbrp:noclip'] == true
    if noclip then
        for _, prop in ipairs(entities) do SetEntityVisible(prop, false, false) end
        hidingProps = true
    elseif hidingProps then
        hidingProps = false
        for _, prop in ipairs(entities) do SetEntityVisible(prop, true, false) end
    end
end

CreateThread(function()
    local ticks = {}
    while true do
        Wait(120)
        syncSlungState()
        if LG.enabled then
            local ped = PlayerPedId()
            if ped ~= trackedPed then
                if trackedPed ~= 0 then resetAfterPedChange() end
                trackedPed = ped
            end
            if IsEntityDead(ped) then
                if slungCount() > 0 or next(sanctioned) then resetAfterPedChange() end
            else
                local current = GetSelectedPedWeapon(ped)
                takeSelected(current)
                if isLongGun(current) and not sanctioned[u32(current)] then
                    SetCurrentPedWeapon(ped, UNARMED, true)
                    local now = GetGameTimer()
                    if now - lastWarn > 6000 then
                        lastWarn = now
                        notify('Long guns can only be taken out at a vehicle trunk. Go to a trunk and choose it from the weapon wheel.', 'warning')
                    end
                end

                local selected = u32(current)
                local now = GetGameTimer()
                for _, name in ipairs(LG.weapons) do
                    local hash = weaponHash[name]
                    local key = u32(hash)
                    if HasPedGotWeapon(ped, hash, false) then
                        if sanctioned[key] then
                            if selected == key or busy or now < (grace[key] or 0) or IsPedInAnyVehicle(ped, false) then
                                ticks[key] = 0
                            else
                                -- Not in hand any more: put it on the sling.
                                ticks[key] = (ticks[key] or 0) + 1
                                if ticks[key] >= 6 then
                                    ticks[key] = 0
                                    local pos = freePosition()
                                    if pos and slingWeapon(ped, name, pos) then
                                        notify(('%s slung on your %s.'):format(labelFor(name), pos), 'info')
                                    end
                                end
                            end
                        end
                    elseif sanctioned[key] and now >= (grace[key] or 0) then
                        sanctioned[key] = nil
                        ticks[key] = nil
                    end
                end
            end
        else
            Wait(1000)
        end
    end
end)

-- Armory issue: guns handed out by an organization armory are legitimate.
RegisterNetEvent('fbrp_longguns:issued', function(names)
    for _, name in ipairs(type(names) == 'table' and names or {}) do
        name = tostring(name):upper()
        if allowedName[name] then sanction(weaponHash[name], 12) end
    end
end)

-- ---------------------------------------------------------------------------
-- Sling controls
-- ---------------------------------------------------------------------------

-- Three separately rebindable keys (Settings > Key Bindings > FiveM): J toggles by
-- default, and "Sling" / "Unsling" are unbound until a player picks a key for them.
RegisterCommand('fbrp_sling_toggle', function() CreateThread(function() toggleSling(nil) end) end, false)
RegisterKeyMapping('fbrp_sling_toggle', 'Long gun: sling or draw (toggle)', 'keyboard', 'J')

RegisterCommand('fbrp_sling_put', function()
    CreateThread(function()
        if not handWeapon(PlayerPedId()) then
            return notify('You have no long gun in your hands to sling.', 'info')
        end
        toggleSling(nil)
    end)
end, false)
RegisterKeyMapping('fbrp_sling_put', 'Long gun: sling', 'keyboard', '')

RegisterCommand('fbrp_sling_draw', function()
    CreateThread(function()
        if handWeapon(PlayerPedId()) then
            return notify('You already have a long gun in your hands.', 'info')
        end
        toggleSling(nil)
    end)
end, false)
RegisterKeyMapping('fbrp_sling_draw', 'Long gun: unsling (draw)', 'keyboard', '')

RegisterCommand('slingkeys', function()
    notify('Set your sling keys in Settings > Key Bindings > FiveM: toggle, sling and unsling.', 'info')
end, false)

local function position(arg)
    arg = tostring(arg or ''):lower()
    if arg == 'back' or arg == 'chest' then return arg end
    return nil
end

RegisterCommand('sling', function(_, args)
    local pos = position(args[1])
    if not pos then
        return notify('Use /sling back or /sling chest, or press J to sling the long gun in your hands.', 'info')
    end
    preferred = pos
    SetResourceKvp('fbrp_longguns:pref', pos)
    CreateThread(function()
        if handWeapon(PlayerPedId()) then toggleSling(pos)
        else notify(('Sling position set to %s.'):format(pos), 'success') end
    end)
end, false)

local function drawCommand(_, args)
    CreateThread(function()
        local pos = position(args[1])
        local ped = PlayerPedId()
        if handWeapon(ped) then return notify('You already have a long gun in your hands. Press J to sling it.', 'info') end
        toggleSling(pos)
    end)
end
RegisterCommand('unsling', drawCommand, false)
RegisterCommand('drawsling', drawCommand, false)

-- /slingtune <back|chest> x y z rx ry rz: adjust where a slung gun sits, live.
RegisterCommand('slingtune', function(_, args)
    local pos = position(args[1])
    if not pos or #args < 7 then
        return notify('Usage: /slingtune <back|chest> x y z rx ry rz', 'info')
    end
    local values = {}
    for index = 2, 7 do values[#values + 1] = tonumber(args[index]) end
    for index = 1, 6 do
        if values[index] == nil then return notify('Offsets must be numbers.', 'error') end
    end
    LG.sling[pos].pos = { values[1], values[2], values[3] }
    LG.sling[pos].rot = { values[4], values[5], values[6] }
    local record = slung[pos]
    if record and record.prop and DoesEntityExist(record.prop) then attachProp(record.prop, PlayerPedId(), pos) end
    local line = ('%s = { bone = %d, pos = { %s, %s, %s }, rot = { %s, %s, %s } }'):format(
        pos, LG.sling[pos].bone, values[1], values[2], values[3], values[4], values[5], values[6])
    print('[fbrp_longguns] ' .. line)
    notify('Sling offset applied. Printed to the F8 console.', 'success')
end, false)

-- ---------------------------------------------------------------------------
-- Trunks
-- ---------------------------------------------------------------------------

local blockedClasses = { [8] = true, [13] = true, [14] = true, [15] = true, [16] = true, [21] = true }

local function trunkPosition(vehicle)
    local bone = GetEntityBoneIndexByName(vehicle, 'boot')
    if bone and bone ~= -1 then return GetWorldPositionOfEntityBone(vehicle, bone) end
    local minimum = GetModelDimensions(GetEntityModel(vehicle))
    return GetOffsetFromEntityInWorldCoords(vehicle, 0.0, minimum.y - 0.35, 0.0)
end

local function nearestTrunk(ped)
    local origin = GetEntityCoords(ped)
    local best, bestDistance
    for _, vehicle in ipairs(GetGamePool('CVehicle')) do
        if DoesEntityExist(vehicle) and not blockedClasses[GetVehicleClass(vehicle)] then
            local center = GetEntityCoords(vehicle)
            if #(center - origin) <= 9.0 then
                local trunk = trunkPosition(vehicle)
                local dx, dy, dz = trunk.x - origin.x, trunk.y - origin.y, trunk.z - origin.z
                local distance = math.sqrt(dx * dx + dy * dy)
                if distance <= LG.reach and math.abs(dz) <= 2.2 and (not bestDistance or distance < bestDistance) then
                    best, bestDistance = vehicle, distance
                end
            end
        end
    end
    return best
end

local function blockedFromTrunk(ped)
    if isDowned() or IsEntityDead(ped) or IsPedInAnyVehicle(ped, false) then return true end
    if IsPedRagdoll(ped) or IsPedFalling(ped) or IsPedSwimming(ped) then return true end
    if LocalPlayer.state['fbrp:restrained'] then return true end
    if IsNuiFocused() or IsPauseMenuActive() then return true end
    if FBRP and FBRP.IsMenuOpen and FBRP.IsMenuOpen() then return true end
    return false
end

-- Trunk weapons live in the normal weapon wheel (hold TAB). While you stand at a
-- trunk, its long guns are placed in your wheel; choosing one takes it out of the
-- trunk and equips it. Press E at the trunk to put a carried long gun back.


-- Standing at an unlocked trunk lets you pick a long gun from the normal weapon
-- wheel (hold TAB). Away from a trunk the same pick is refused.
local trunkVehicle = nil
local boots = {}

local function flashBoot(vehicle)
    if boots[vehicle] or not DoesEntityExist(vehicle) then return end
    boots[vehicle] = true
    CreateThread(function()
        local opened = GetVehicleDoorAngleRatio(vehicle, 5) < 0.1
        if opened then
            NetworkRequestControlOfEntity(vehicle)
            SetVehicleDoorOpen(vehicle, 5, false, false)
            Wait(2500)
            if DoesEntityExist(vehicle) then SetVehicleDoorShut(vehicle, 5, false) end
        end
        boots[vehicle] = nil
    end)
end

takeSelected = function(current)
    local key = u32(current)
    local name = nameByHash[key]
    if not name or sanctioned[key] or not trunkVehicle or not DoesEntityExist(trunkVehicle) then return false end
    local ped = PlayerPedId()
    if carriedCount(ped) >= LG.maxCarried then
        SetCurrentPedWeapon(ped, UNARMED, true)
        notify(('You can only carry %d long guns. Put one away first.'):format(LG.maxCarried), 'error')
        return true
    end
    sanction(current, 4)
    flashBoot(trunkVehicle)
    notify(('Took the %s from the trunk. Press J to sling it.'):format(labelFor(name)), 'success')
    return true
end

CreateThread(function()
    local nextScan = 0
    while true do
        local now = GetGameTimer()
        local ped = PlayerPedId()
        if not LG.enabled then
            trunkVehicle = nil
            Wait(1000)
        else
            if now >= nextScan then
                nextScan = now + 300
                local vehicle = (not blockedFromTrunk(ped)) and nearestTrunk(ped) or nil
                if vehicle and GetVehicleDoorLockStatus(vehicle) >= 2 then vehicle = nil end
                trunkVehicle = vehicle
            end
            Wait(150)
        end
    end
end)

AddEventHandler('onResourceStop', function(resource)
    if resource ~= GetCurrentResourceName() then return end
    -- Do not lose slung guns when the resource restarts.
    for _, pos in ipairs({ 'back', 'chest' }) do
        local record = slung[pos]
        if record then
            destroyProp(record.prop)
            local ped = PlayerPedId()
            local hash = weaponHash[record.snap.weapon]
            GiveWeaponToPed(ped, hash, math.max(0, tonumber(record.snap.ammo) or 0), false, false)
            slung[pos] = nil
        end
    end
end)
