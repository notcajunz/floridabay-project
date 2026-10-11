--[[
QuantiX Anticheat bridge — server side.

Lets QuantiX tell a teleport or a camera that *your server's scripts* caused
apart from one a cheat caused, without you writing any integration code.

Add it as the FIRST server script in the fxmanifest.lua of any resource that
moves players or opens cameras for them (housing, jail, elevators, garages,
spawn selectors, clothing shops, admin menus):

    server_script '@corevia_ac/bridge/server.lua'

What it does inside that resource:

  * SetEntityCoords / SetEntityCoordsNoOffset on a player's ped, or on a
    vehicle with players in it, tells QuantiX where those players are about
    to land. A landing there is excused; a jump anywhere else in the same
    seconds is still a jump.
  * TriggerClientEvent / TriggerLatentClientEvent to one player, for an event
    whose name says it moves them (teleport, warp, spawn, enter, exit,
    elevator, apartment, jail, ...) and whose arguments carry coordinates,
    vouches for those coordinates the same way.
  * The same events, when the name says the client is about to open a camera
    (camera, spectate, preview, clothing, barber, drone, ...), open a short
    scripted-camera window so a detached viewpoint is not read as a freecam.

Nothing here runs on a client, and nothing a client sends can reach it: every
vouch is made by server code in a resource you installed. If corevia_ac is not
running, every wrapper falls straight through to the original native.
]]

local AC = 'corevia_ac'
if GetCurrentResourceName() == AC then return end

local MOVE_WORDS = {
  'teleport', 'warp', 'spawn', 'setcoords', 'setpos', 'enter', 'exit', 'leave',
  'goto', 'bring', 'revive', 'respawn', 'jail', 'prison', 'elevator', 'lift',
  'interior', 'shell', 'apartment', 'house', 'property', 'motel', 'instance',
  'hospital',
}
local CAMERA_WORDS = {
  'camera', 'spectat', 'preview', 'cinematic', 'photo', 'drone', 'decorat',
  'furnish', 'clothing', 'clothes', 'barber', 'tattoo', 'skin', 'appearance',
  'creator', 'customi', 'showroom', 'cctv', 'cutscene',
}
local CAMERA_SECONDS = 60
local MAX_COORDS_PER_EVENT = 4

local function acReady()
  return GetResourceState(AC) == 'started'
end

local function hasWord(name, words)
  for _, word in ipairs(words) do
    if name:find(word, 1, true) then return true end
  end
  return false
end

-- Event names are classified once and remembered: TriggerClientEvent can be
-- hot, and the wrapper must cost nothing for events that are neither.
local classified = {}
local function classify(eventName)
  local cached = classified[eventName]
  if cached ~= nil then return cached end
  local name = tostring(eventName):lower()
  local kind = false
  if name:sub(1, 5) ~= '__cfx' then
    local move = hasWord(name, MOVE_WORDS)
      or name:find('^tp[^%a]') ~= nil
      or name:find('[^%a]tp[^%a]') ~= nil
      or name:find('[^%a]tp$') ~= nil
    local camera = hasWord(name, CAMERA_WORDS)
      or name:find('[^%a]cam[^%a]') ~= nil
      or name:find('[^%a]cam$') ~= nil
    if move or camera then kind = { move = move, camera = camera } end
  end
  classified[eventName] = kind
  return kind
end

local function playerOfPed(ped)
  if not ped or ped == 0 then return nil end
  for _, id in ipairs(GetPlayers()) do
    if GetPlayerPed(id) == ped then return tonumber(id) end
  end
  return nil
end

-- The players an entity move carries with it: the ped's own player, or
-- everyone sitting in the vehicle.
local function playersOn(entity)
  local out = {}
  local ok, kind = pcall(GetEntityType, entity)
  if not ok then return out end
  if kind == 1 then
    local player = playerOfPed(entity)
    if player then out[#out + 1] = player end
  elseif kind == 2 then
    for seat = -1, 14 do
      local okSeat, ped = pcall(GetPedInVehicleSeat, entity, seat)
      if okSeat and ped and ped ~= 0 then
        local player = playerOfPed(ped)
        if player then out[#out + 1] = player end
      end
    end
  end
  return out
end

local function authorize(player, x, y, z)
  if not acReady() then return end
  pcall(function()
    exports[AC]:authorizeTeleport(player, x + 0.0, y + 0.0, z + 0.0)
  end)
end

local function beginCamera(player)
  if not acReady() then return end
  pcall(function()
    exports[AC]:beginScriptedCamera(player, CAMERA_SECONDS)
  end)
end

local function asCoords(value)
  local t = type(value)
  if t == 'vector3' or t == 'vector4' then return value.x, value.y, value.z end
  if t == 'table' and type(value.x) == 'number' and type(value.y) == 'number' and type(value.z) == 'number' then
    return value.x, value.y, value.z
  end
  return nil
end

-- Coordinates in an event's arguments, one level of nesting deep.
local function coordsIn(args, out)
  for i = 1, args.n do
    if #out >= MAX_COORDS_PER_EVENT then return out end
    local value = args[i]
    local x, y, z = asCoords(value)
    if x then
      out[#out + 1] = { x, y, z }
    elseif type(value) == 'table' then
      for _, inner in pairs(value) do
        if #out >= MAX_COORDS_PER_EVENT then break end
        local ix, iy, iz = asCoords(inner)
        if ix then out[#out + 1] = { ix, iy, iz } end
      end
    end
  end
  return out
end

-- Three bare numbers in a row are how a lot of scripts send a position.
local function bareCoords(args, out)
  for i = 1, args.n - 2 do
    if #out >= MAX_COORDS_PER_EVENT then return out end
    local a, b, c = args[i], args[i + 1], args[i + 2]
    if type(a) == 'number' and type(b) == 'number' and type(c) == 'number'
      and math.abs(a) <= 20000 and math.abs(b) <= 20000 and math.abs(c) <= 5000
      and (math.type == nil or math.type(a) == 'float' or math.type(b) == 'float') then
      out[#out + 1] = { a, b, c }
      return out
    end
  end
  return out
end

local function onClientEvent(eventName, target, ...)
  local kind = classify(eventName)
  if not kind then return end
  local player = tonumber(target)
  -- A broadcast is not about one player being moved.
  if not player or player <= 0 then return end
  if kind.camera then beginCamera(player) end
  if kind.move then
    local args = table.pack(...)
    local found = coordsIn(args, {})
    if #found == 0 then bareCoords(args, found) end
    for _, c in ipairs(found) do authorize(player, c[1], c[2], c[3]) end
  end
end

local function wrap(name, build)
  local original = _G[name]
  if type(original) ~= 'function' then return end
  _G[name] = build(original)
end

local function wrapSetter(name)
  wrap(name, function(original)
    return function(entity, x, y, z, ...)
      if type(x) == 'number' and type(y) == 'number' and type(z) == 'number' then
        local ok, players = pcall(playersOn, entity)
        if ok then
          for _, player in ipairs(players) do authorize(player, x, y, z) end
        end
      end
      return original(entity, x, y, z, ...)
    end
  end)
end

wrapSetter('SetEntityCoords')
wrapSetter('SetEntityCoordsNoOffset')

wrap('TriggerClientEvent', function(original)
  return function(eventName, target, ...)
    pcall(onClientEvent, eventName, target, ...)
    return original(eventName, target, ...)
  end
end)

wrap('TriggerLatentClientEvent', function(original)
  return function(eventName, target, bps, ...)
    pcall(onClientEvent, eventName, target, ...)
    return original(eventName, target, bps, ...)
  end
end)
