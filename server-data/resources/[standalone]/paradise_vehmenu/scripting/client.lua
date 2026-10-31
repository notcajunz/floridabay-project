local menuOpen = false

local function toggleNuiFrame(shouldShow)
  menuOpen = shouldShow
  SetNuiFocus(shouldShow, shouldShow)
  SendReactMessage('setVisible', shouldShow)
end

local function isPlayerInVehicle()
  local vehicle = GetVehiclePedIsIn(PlayerPedId(), false)
  return vehicle and vehicle ~= 0
end

local lastSeatSwitch = 0
local isOnCooldown = false

local function handleVehicleDoor(controlId, state)
  local vehicle = GetVehiclePedIsIn(PlayerPedId(), false)
  if not vehicle or vehicle == 0 then return end

  local doorIndex = Config.DoorControls[controlId]
  if doorIndex then
    if state then
      SetVehicleDoorOpen(vehicle, doorIndex, false, false)
    else
      SetVehicleDoorShut(vehicle, doorIndex, false)
    end
  end
end

local function handleVehicleWindow(controlId, state)
  local vehicle = GetVehiclePedIsIn(PlayerPedId(), false)
  if not vehicle or vehicle == 0 then return end

  local windowIndex = Config.WindowControls[controlId]
  if windowIndex then
    if state then
      RollDownWindow(vehicle, windowIndex)
    else
      RollUpWindow(vehicle, windowIndex)
    end
  end
end

local function handleVehicleSeat(controlId)
  local vehicle = GetVehiclePedIsIn(PlayerPedId(), false)
  if not vehicle or vehicle == 0 then return end

  local currentTime = GetGameTimer()
  if isOnCooldown and (currentTime - lastSeatSwitch) < (Config.SeatSwitchCooldown * 1000) then
    lib.notify({
      title = 'Vehicle',
      description = Config.Notifications.seatCooldown,
      type = 'error'
    })
    return
  end

  local seatIndex = Config.SeatControls[controlId]
  if seatIndex then
    local isSeatOccupied = IsVehicleSeatFree(vehicle, seatIndex)
    if isSeatOccupied then
      TaskWarpPedIntoVehicle(PlayerPedId(), vehicle, seatIndex)
      lastSeatSwitch = currentTime
      isOnCooldown = true
      SetTimeout(Config.SeatSwitchCooldown * 1000, function()
        isOnCooldown = false
      end)
      SendReactMessage('seatChanged', {
        newSeat = controlId,
        oldSeat = GetPedInVehicleSeat(vehicle, -1) == PlayerPedId() and 'driver_seat' or
                 GetPedInVehicleSeat(vehicle, 0) == PlayerPedId() and 'passenger_seat' or
                 GetPedInVehicleSeat(vehicle, 1) == PlayerPedId() and 'rear_left_seat' or
                 GetPedInVehicleSeat(vehicle, 2) == PlayerPedId() and 'rear_right_seat' or
                 GetPedInVehicleSeat(vehicle, 3) == PlayerPedId() and 'rear_middle_seat' or
                 GetPedInVehicleSeat(vehicle, 4) == PlayerPedId() and 'rear_extra_seat' or nil
      })
    else
      lib.notify({
        title = 'Vehicle',
        description = Config.Notifications.seatOccupied,
        type = 'error'
      })
    end
  end
end

local interiorLights = {} -- GTA has no getter for the dome light, so remember what the menu set per vehicle

local function isDriver(vehicle)
  return GetPedInVehicleSeat(vehicle, -1) == PlayerPedId()
end

local function notify(description, kind)
  lib.notify({ title = 'Vehicle', description = description, type = kind or 'inform' })
end

--- Everything the menu can show as active, keyed by the NUI control id.
local function vehicleState(vehicle)
  local state = {
    engine = GetIsVehicleEngineRunning(vehicle),
    trunk = GetVehicleDoorAngleRatio(vehicle, Config.OtherControls.trunk) > 0.1,
    hood = GetVehicleDoorAngleRatio(vehicle, Config.OtherControls.hood) > 0.1,
    interior = interiorLights[vehicle] == true
  }
  for id, index in pairs(Config.DoorControls) do
    state[id] = GetVehicleDoorAngleRatio(vehicle, index) > 0.1
  end
  local _, lightsOn, highBeamsOn = GetVehicleLightsState(vehicle)
  state.headlights = lightsOn == 1 or highBeamsOn == 1
  state.highbeams = highBeamsOn == 1
  return state
end

-- The game re-applies automatic headlights (night, engine start, its own H
-- control) over a single SetVehicleLights call, so a chosen light state is
-- held every frame while the player drives that vehicle.
local lightMode = {}

CreateThread(function()
  while true do
    local ped = PlayerPedId()
    local vehicle = GetVehiclePedIsIn(ped, false)
    local mode = vehicle ~= 0 and lightMode[vehicle] or nil
    if mode and GetPedInVehicleSeat(vehicle, -1) == ped then
      -- Forcing the lights off also hides the emergency light bar. While the siren is on the held
      -- state is released, so Q on an emergency vehicle always shows its lights.
      if mode.lights == 1 and IsVehicleSirenOn(vehicle) then
        SetVehicleLights(vehicle, 0)
      else
        SetVehicleLights(vehicle, mode.lights)
      end
      SetVehicleFullbeam(vehicle, mode.fullbeam)
      Wait(0)
    else
      Wait(vehicle ~= 0 and 250 or 1000)
    end
  end
end)

local function handleLights(vehicle, controlId, state)
  if not isDriver(vehicle) then
    notify(Config.Notifications.driverOnly, 'error')
    return
  end

  if controlId == 'headlights' then
    if state then
      lightMode[vehicle] = { lights = 2, fullbeam = false }
    else
      lightMode[vehicle] = { lights = 1, fullbeam = false }
    end
    notify(state and Config.Notifications.headlightsOn or Config.Notifications.headlightsOff, state and 'success' or 'inform')
  elseif controlId == 'highbeams' then
    if state then
      lightMode[vehicle] = { lights = 2, fullbeam = true }
    else
      local current = lightMode[vehicle]
      lightMode[vehicle] = { lights = current and current.lights or 0, fullbeam = false }
    end
    notify(state and Config.Notifications.highBeamsOn or Config.Notifications.highBeamsOff, state and 'success' or 'inform')
  elseif controlId == 'interior' then
    interiorLights[vehicle] = state or nil
    SetVehicleInteriorlight(vehicle, state)
    notify(state and Config.Notifications.interiorOn or Config.Notifications.interiorOff, state and 'success' or 'inform')
  end
end

local function handleVehicleOther(controlId, state)
  local vehicle = GetVehiclePedIsIn(PlayerPedId(), false)
  if not vehicle or vehicle == 0 then return end

  if controlId == "trunk" or controlId == "hood" then
    local index = Config.OtherControls[controlId]
    if state then
      SetVehicleDoorOpen(vehicle, index, false, true)
    else
      SetVehicleDoorShut(vehicle, index, false)
    end
  elseif controlId == "music" then
    toggleNuiFrame(false)
    ExecuteCommand(Config.RadioCommand)
  elseif controlId == "engine" then
    if not isDriver(vehicle) then
      notify(Config.Notifications.driverOnly, 'error')
      return
    end
    ExecuteCommand(Config.EngineCommand)
  elseif controlId == "headlights" or controlId == "highbeams" or controlId == "interior" then
    handleLights(vehicle, controlId, state)
  end
end

local function getVehicleSeatingCapacity(vehicle)
    local maxSeats = GetVehicleMaxNumberOfPassengers(vehicle)
    return maxSeats + 1
end

RegisterCommand(Config.Command, function()
  if not isPlayerInVehicle() then
    notify(Config.Notifications.notInVehicle, 'error')
    return
  end
  toggleNuiFrame(true)
  debugPrint('Show NUI frame')
end)

RegisterNUICallback('hideFrame', function(_, cb)
  toggleNuiFrame(false)
  debugPrint('Hide NUI frame')
  cb({})
end)

RegisterNUICallback('vehicleControl', function(data, cb)
  debugPrint('Vehicle control request:', json.encode(data))

  if data.controlId and data.state ~= nil then
    if string.find(data.controlId, "door") then
      handleVehicleDoor(data.controlId, data.state)
    elseif string.find(data.controlId, "window") then
      handleVehicleWindow(data.controlId, data.state)
    elseif string.find(data.controlId, "seat") then
      handleVehicleSeat(data.controlId)
    else
      handleVehicleOther(data.controlId, data.state)
    end
  end

  -- The engine command and a vehicle's own damage rules can refuse a request, so report the
  -- real state back and let the menu show what actually happened.
  if data.controlId == 'engine' then Wait(150) end
  local vehicle = GetVehiclePedIsIn(PlayerPedId(), false)
  cb({ success = true, states = vehicle ~= 0 and vehicleState(vehicle) or {} })
end)

RegisterNUICallback('getVehicleInfo', function(_, cb)
  local vehicle = GetVehiclePedIsIn(PlayerPedId(), false)
  if not vehicle or vehicle == 0 then
    cb({ success = false })
    return
  end

  cb({
    success = true,
    seatingCapacity = getVehicleSeatingCapacity(vehicle),
    states = vehicleState(vehicle)
  })
end)

RegisterKeyMapping(Config.Command, 'Open Vehicle Menu', 'keyboard', Config.Keybind)

-- Close the menu when the player leaves the vehicle, and keep the old vehcontrol extras:
-- a long press of F leaves the engine running, and the passenger seat does not shuffle over.
CreateThread(function()
  while true do
    Wait(0)
    local ped = PlayerPedId()
    local vehicle = GetVehiclePedIsIn(ped, false)

    if vehicle ~= 0 then
      if Config.LeaveRunning and IsControlPressed(2, 75) and not IsEntityDead(ped) then
        Wait(150)
        if IsControlPressed(2, 75) and GetVehiclePedIsIn(ped, false) == vehicle then
          SetVehicleEngineOn(vehicle, true, true, false)
          TaskLeaveVehicle(ped, vehicle, 0)
        end
      end
      if Config.DisableSeatShuffle and GetPedInVehicleSeat(vehicle, 0) == ped and GetIsTaskActive(ped, 165) then
        SetPedIntoVehicle(ped, vehicle, 0)
      end
    elseif menuOpen then
      toggleNuiFrame(false)
    end
  end
end)
