ClientConfig = {
    RespawnTimer = 120, -- Time in seconds for /respawn
    ReviveTimer = 40,   -- Time in seconds for /revive (only applies to melee weapon knockouts)
    Debug = false,      -- print debug lines in F8
    -- Respawn locations (x, y, z, heading, name) - picked by AOP (see AopRespawn below), else the nearest
    RespawnPoints = {
        { 298.68,  -584.48, 43.26, 70.0,  "Pillbox Hill Medical Center" },
        { 1839.60, 3672.90, 34.28, 210.0, "Sandy Shores Medical Center" },
        { -247.76, 6331.23, 32.43, 225.0, "Paleto Bay Medical Center" },
    },
    -- On-duty police respawn at the nearest station instead
    LeoRespawnPoints = {
        { 432.50,  -981.50, 30.71, 90.0,  "Mission Row PD" },
        { 1853.40, 3686.00, 34.27, 210.0, "Sandy Shores Sheriff" },
        { -448.60, 6012.00, 31.72, 45.0,  "Paleto Bay Sheriff" },
    },
    -- Respawn follows the AOP (fbrp_core /aop). The first entry whose words appear in the AOP name is used:
    -- civilians go to `hospital`, on-duty police to `station` (names from the two lists above).
    -- Statewide / anything not listed = the nearest one, like before.
    AopRespawn = {
        { match = { "paleto" },                                hospital = "Paleto Bay Medical Center",   station = "Paleto Bay Sheriff" },
        { match = { "sandy", "grapeseed", "blaine", "county" }, hospital = "Sandy Shores Medical Center", station = "Sandy Shores Sheriff" },
        { match = { "los santos", "city", "ls", "south" },      hospital = "Pillbox Hill Medical Center", station = "Mission Row PD" },
    },
    MuteWhenDead = true,             -- mute the player in VC when dead
    ShowWastedScreen = false,        -- show gta style screen
    EnableHelpUpFromKnockout = true, -- "Help up" on fbrp_core's third eye for knocked-out players
    DeadlyMelee = {
        -- melee weapons that should NOT knock out a player and instead kill them
        [GetHashKey("weapon_dagger")] = true,
        [GetHashKey("weapon_battleaxe")] = true,
        [GetHashKey("weapon_hatchet")] = true,
        [GetHashKey("weapon_knife")] = true,
        [GetHashKey("weapon_machete")] = true,
        [GetHashKey("weapon_stone_hatchet")] = true,
        [GetHashKey("weapon_switchblade")] = true,
        [GetHashKey("WEAPON_AXE")] = true,
        [GetHashKey("WEAPON_BUTTERFLYKNIFE")] = true,
        [GetHashKey("WEAPON_FIREAXE")] = true,
        [GetHashKey("WEAPON_KARAMBIT")] = true,
        [GetHashKey("WEAPON_SCREWDRIVER")] = true,
        [GetHashKey("WEAPON_ZKKNIFE")] = true,
        [GetHashKey("WEAPON_SHURIKEN")] = true,
        [GetHashKey("weapon_grenade")] = true,
        [GetHashKey("weapon_molotov")] = true,
        [GetHashKey("weapon_pipebomb")] = true,
        [GetHashKey("weapon_proxmine")] = true,
        [GetHashKey("weapon_stickybomb")] = true,
        --[GetHashKey("weapon_knuckle")] = true,
        [GetHashKey("weapon_scythe")] = true,
        [GetHashKey("WEAPON_INCENDIARYGRENADE")] = true,
    },
    lessLethalWeapons = {
        [GetHashKey("weapon_teargas_launcher")] = true,
        [GetHashKey("WEAPON_SMOKEGRENADE")] = true,
        [-868994466] = 'Water Cannon',
        [GetHashKey("weapon_beanbag")] = true,
        [GetHashKey("weapon_beanbag2")] = true,
        [GetHashKey("WEAPON_LESSLAUNCHER")] = true,
        [GetHashKey("WEAPON_LESSLAUNCHER3")] = true,
    },
    isNonLethal = function(weapon)
        return ClientConfig.lessLethalWeapons[weapon]
    end,
    hospitalBedModels = { 2117668672, -1091386327, 1004440924, 1901643221, 1573503690 },
    -- Hospital workers you can walk up to (press E) for treatment. These are for the El Burro Heights and
    -- Paleto hospital MLOs - change them to match your hospitals (and hospitalBeds in config_shared.lua).
    hospitalLocations = {
        ["El Burro Hospital"] = {
            peds = {
                { pos = { 1126.07, -1532.26, 35.03, 325.48 }, model = "s_m_m_doctor_01",           blip = true },
                { pos = { 1144.23, -1540.16, 35.03, 293.92 }, model = "s_m_m_doctor_01",           blip = true },
                { pos = { 1141.39, -1539.78, 39.50, 335.12 }, model = "s_m_m_doctor_01",           blip = true },
                { pos = { 1133.01, -1557.95, 35.03, 114.98 }, model = "s_f_y_scrubs_01",           blip = true,             scenario = "WORLD_HUMAN_CLIPBOARD" },
                { pos = { 1137.04, -1557.86, 35.03, 271.10 }, scenario = "WORLD_HUMAN_STAND_MOBILE", model = "s_f_y_shop_low" },
                { pos = { 1147.86, -1565.70, 35.03, 172.73 }, scenario = "WORLD_HUMAN_JANITOR",    model = "s_m_m_janitor" },
            },
            interiorId = GetInteriorAtCoords(1123.34, -1558.79, 35.03),
            sound = {
                pos = vector3(1121.51, -1558.99, 35.03),
                distance = 50.0,
                volume = 0.4,
            }
        },
        ["Paleto Hospital"] = {
            peds = {
                { pos = {-253.33, 6335.69, 32.45, 240.47}, model="s_m_m_doctor_01", blip=true },
                { pos = {-250.26, 6323.16, 32.45, 282.64}, model="s_f_y_scrubs_01", blip=true,scenario = "WORLD_HUMAN_CLIPBOARD" },
            },
            interiorId = GetInteriorAtCoords(-255.69, 6314.56, 32.45),
            sound = {
                pos = vector3(-255.08, 6320.08, 32.45),
                distance = 50.0,
                volume = 0.4,
            }
        }
    },
}

exports('getNearestHospital', function(maxDistance)

    local nearest, nearestDistance
    local coords = GetEntityCoords(PlayerPedId())

    for name, hospitalData in pairs(ClientConfig.hospitalLocations) do
        for _, data in pairs(hospitalData.peds) do
            local distance = #(coords - vector3(data.pos[1], data.pos[2], data.pos[3]))
            if maxDistance then
                if distance <= maxDistance then
                    if not nearestDistance or distance < nearestDistance then
                        nearest = data
                        nearestDistance = distance
                    end
                end
            else
                if not nearestDistance or distance < nearestDistance then
                    nearest = data
                    nearestDistance = distance
                end
            end
        end
    end

    --lib.print.debug("Nearest hospital: %s (%s)", nearest, nearestDistance)
    return nearest

end)

exports(
    "AddRespawnPoint",
    function(obj)
        ClientConfig.RespawnPoints[#ClientConfig.RespawnPoints + 1] = obj
    end
)
