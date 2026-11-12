--This script aims to prevent **pool size=400** issues caused by the number of portals in certain MLOs within an area around the player.
ipl_unload_config = {

  Sandy_Sheriff = {
    unload_threshold = 80,
    interiors = {
      { name = "int_gn_sheriff_sandyshore_milo_", coordinates = vector3(1827.88452, 3678.75024, 34.72581) },
    }
  },
  Sandy_Motel = {
    unload_threshold = 50,
    interiors = {
      { name = "001_sm_room_01_milo_", coordinates = vector3(1511.27893, 3572.93457, 35.7391853) },
      { name = "002_sm_room_02_milo_", coordinates = vector3(1516.11243, 3575.719, 35.7391853) },
      { name = "003_sm_room_01_milo_", coordinates = vector3(1520.94006, 3578.51245, 35.7391853) },
      { name = "004_sm_room_02_milo_", coordinates = vector3(1525.77356, 3581.29688, 35.7391853) },
      { name = "005_sm_room_01_milo_", coordinates = vector3(1535.48657, 3586.911, 35.7391853) },
      { name = "006_sm_room_02_milo_", coordinates = vector3(1540.32007, 3589.69531, 35.7391853) },
      { name = "007_sm_room_01_milo_", coordinates = vector3(1545.14771, 3592.48877, 35.7391853) },
      { name = "008_sm_room_02_milo_", coordinates = vector3(1549.9812, 3595.27319, 35.7391853) },
      { name = "009_sm_room_01_milo_", coordinates = vector3(1557.01416, 3599.33984, 35.7391853) },
      { name = "010_sm_room_02_milo_", coordinates = vector3(1561.84766, 3602.12427, 35.7391853) },
      { name = "101_sm_room_01_milo_", coordinates = vector3(1511.27893, 3572.93457, 39.0416145) },
      { name = "102_sm_room_02_milo_", coordinates = vector3(1516.11243, 3575.719, 39.0416145) },
      { name = "103_sm_room_01_milo_", coordinates = vector3(1520.94006, 3578.51245, 39.0416145) },
      { name = "104_sm_room_02_milo_", coordinates = vector3(1525.77356, 3581.29688, 39.0416145) },
      { name = "105_sm_room_01_milo_", coordinates = vector3(1535.48657, 3586.911, 39.0416145) },
      { name = "106_sm_room_02_milo_", coordinates = vector3(1540.32007, 3589.69531, 39.0416145) },
      { name = "107_sm_room_01_milo_", coordinates = vector3(1545.14771, 3592.48877, 39.0416145) },
      { name = "108_sm_room_02_milo_", coordinates = vector3(1549.9812, 3595.27319, 39.0416145) },
      { name = "109_sm_room_01_milo_", coordinates = vector3(1557.01416, 3599.33984, 39.0416145) },
      { name = "110_sm_room_02_milo_", coordinates = vector3(1561.84766, 3602.12427, 39.0416145) },
      { name = "201_sm_room_01_milo_", coordinates = vector3(1578.88232, 3616.2124, 35.7391853) },
      { name = "202_sm_room_02_milo_", coordinates = vector3(1581.66675, 3611.379, 35.7391853) },
      { name = "203_sm_room_01_milo_", coordinates = vector3(1584.46021, 3606.55127, 35.7391853) },
      { name = "204_sm_room_02_milo_", coordinates = vector3(1587.24463, 3601.71777, 35.7391853) },
      { name = "205_sm_room_01_milo_", coordinates = vector3(1592.85864, 3592.005, 35.7391853) },
      { name = "206_sm_room_02_milo_", coordinates = vector3(1595.64307, 3587.17139, 35.7391853) },
      { name = "207_sm_room_01_milo_", coordinates = vector3(1598.43652, 3582.34375, 35.7391853) },
      { name = "208_sm_room_02_milo_", coordinates = vector3(1601.221, 3577.51025, 35.7391853) },
      { name = "209_sm_room_01_milo_", coordinates = vector3(1605.2876, 3570.477, 35.7391853) },
      { name = "210_sm_room_02_milo_", coordinates = vector3(1608.072, 3565.64355, 35.7391853) },
      { name = "301_sm_room_01_milo_", coordinates = vector3(1578.88232, 3616.2124, 39.0416145) },
      { name = "302_sm_room_02_milo_", coordinates = vector3(1581.66675, 3611.379, 39.0416145) },
      { name = "303_sm_room_01_milo_", coordinates = vector3(1584.46021, 3606.55127, 39.0416145) },
      { name = "304_sm_room_02_milo_", coordinates = vector3(1587.24463, 3601.71777, 39.0416145) },
      { name = "305_sm_room_01_milo_", coordinates = vector3(1592.85864, 3592.005, 39.0416145) },
      { name = "306_sm_room_02_milo_", coordinates = vector3(1595.64307, 3587.17139, 39.0416145) },
      { name = "307_sm_room_01_milo_", coordinates = vector3(1598.43652, 3582.34375, 39.0416145) },
      { name = "308_sm_room_02_milo_", coordinates = vector3(1601.221, 3577.51025, 39.0416145) },
      { name = "309_sm_room_01_milo_", coordinates = vector3(1605.2876, 3570.477, 39.0416145) },
      { name = "310_sm_room_02_milo_", coordinates = vector3(1608.072, 3565.64355, 39.0416145) }
    }
  }
}

local loadedIpls = {}

Citizen.CreateThread(function()
  while true do
    local coords = GetFinalRenderedCamCoord()

    for name, v1 in pairs(ipl_unload_config) do
      if config[name] ~= false then
        for i = 1, #v1.interiors do
          local data = v1.interiors[i]
          if #(data.coordinates - coords) > v1.unload_threshold then
            if loadedIpls[data.name] then
              debugPrint('unload ' .. data.name)
              loadedIpls[data.name] = false
              RemoveIpl(data.name)
            end
          else
            if not loadedIpls[data.name] then
              debugPrint('load ' .. data.name)
              loadedIpls[data.name] = true
              RequestIpl(data.name)
            end
          end
        end
      end
    end
    Wait(100)
  end
end)
