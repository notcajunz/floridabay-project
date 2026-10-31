-- M203 grenade launcher for the M4A1-M203 addon weapons (R4 m203 pack, Adrian).
-- Uses PlayerPedId() and plain math instead of ox_lib's cache.ped and glm so the
-- resource needs no extra dependency or Lua 5.4 switch.
local math_abs, math_sin, math_cos, math_rad = math.abs, math.sin, math.cos, math.rad

local function getForwardVector()
    local rot = GetFinalRenderedCamRot(2)
    local x, z = math_rad(rot.x), math_rad(rot.z)
    return vec3(-math_sin(z) * math_abs(math_cos(x)), math_cos(z) * math_abs(math_cos(x)), math_sin(x))
end

local lastTimeShot = 0

RegisterCommand("shootgrenade", function()
    if GetGameTimer() - lastTimeShot > 15000 then
        if IsPlayerFreeAiming(PlayerId()) and (GetSelectedPedWeapon(PlayerPedId()) == `weapon_m4m203` or GetSelectedPedWeapon(PlayerPedId()) == `weapon_m4m203a`or GetSelectedPedWeapon(PlayerPedId()) == `weapon_m4m203r`) then
            local grenade = `weapon_grenadelauncher`

            local ped = PlayerPedId()
            RequestModel(grenade)
            RequestWeaponAsset(grenade, 31, 26)
            while not HasWeaponAssetLoaded(grenade) do
                Citizen.Wait(0)
            end

            local coords = GetFinalRenderedCamCoord()
            local destination = coords + getForwardVector() * 70

            local x2, y2, z2 = table.unpack(destination)


            local x1, y1, z1 = table.unpack(GetEntityCoords(ped))
            ShootSingleBulletBetweenCoords(x1, y1, z1, x2, y2, z2, 100, true, grenade, ped, true, false, 20)

            lastTimeShot = GetGameTimer()
        end
    else
        TriggerEvent('ox_lib:notify', {
            title = 'M203',
            description = ('You have %d seconds left before you can shoot again.'):format(15 - math.floor((GetGameTimer() - lastTimeShot) / 1000)),
            type = 'warning'
        })
    end
end, false)

RegisterKeyMapping('shootgrenade', 'Shoot M203', 'keyboard', 'g')
