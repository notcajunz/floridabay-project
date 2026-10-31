local zones = {}
local nextId = 0
local loopRunning = false
local tickRunning = false

local DEBUG_COLOR = { r = 59, g = 130, b = 246, a = 70 }

local function sphereContains(self, p)
    local c = self.coords
    local dx, dy, dz = p.x - c.x, p.y - c.y, p.z - c.z
    return dx * dx + dy * dy + dz * dz <= self.radius * self.radius
end

local function boxContains(self, p)
    local c = self.coords
    local dx, dy, dz = p.x - c.x, p.y - c.y, p.z - c.z
    local lx = dx * self.cos + dy * self.sin
    local ly = -dx * self.sin + dy * self.cos
    return math.abs(lx) <= self.size.x / 2
        and math.abs(ly) <= self.size.y / 2
        and math.abs(dz) <= self.size.z / 2
end

local function polyContains(self, p)
    if p.z < self.minZ or p.z > self.maxZ then return false end
    local pts = self.points
    local inside = false
    local j = #pts
    for i = 1, #pts do
        local a, b = pts[i], pts[j]
        if ((a.y > p.y) ~= (b.y > p.y)) and (p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) then
            inside = not inside
        end
        j = i
    end
    return inside
end

local function drawWall(a, b, minZ, maxZ)
    local c = DEBUG_COLOR
    DrawPoly(a.x, a.y, minZ, b.x, b.y, minZ, b.x, b.y, maxZ, c.r, c.g, c.b, c.a)
    DrawPoly(a.x, a.y, minZ, b.x, b.y, maxZ, a.x, a.y, maxZ, c.r, c.g, c.b, c.a)
    DrawPoly(b.x, b.y, maxZ, b.x, b.y, minZ, a.x, a.y, minZ, c.r, c.g, c.b, c.a)
    DrawPoly(b.x, b.y, maxZ, a.x, a.y, minZ, a.x, a.y, maxZ, c.r, c.g, c.b, c.a)
    DrawLine(a.x, a.y, minZ, b.x, b.y, minZ, c.r, c.g, c.b, 220)
    DrawLine(a.x, a.y, maxZ, b.x, b.y, maxZ, c.r, c.g, c.b, 220)
    DrawLine(a.x, a.y, minZ, a.x, a.y, maxZ, c.r, c.g, c.b, 220)
end

local function drawOutline(corners, minZ, maxZ)
    for i = 1, #corners do
        drawWall(corners[i], corners[i % #corners + 1], minZ, maxZ)
    end
end

local function debugDraw(zone)
    if zone.type == 'sphere' then
        local c, r = zone.coords, zone.radius
        DrawMarker(28, c.x, c.y, c.z, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, r, r, r,
            DEBUG_COLOR.r, DEBUG_COLOR.g, DEBUG_COLOR.b, DEBUG_COLOR.a, false, false, 0, false, nil, nil, false)
    else
        drawOutline(zone.corners, zone.minZ, zone.maxZ)
    end
end

local function needsTick()
    for _, z in pairs(zones) do
        if z.debug or (z.insideZone and z.inside) then return true end
    end
    return false
end

local function startTick()
    if tickRunning then return end
    tickRunning = true
    CreateThread(function()
        while needsTick() do
            for _, z in pairs(zones) do
                if z.debug then debugDraw(z) end
                if z.insideZone and z.inside then z:inside() end
            end
            Wait(0)
        end
        tickRunning = false
    end)
end

local function startLoop()
    if loopRunning then return end
    loopRunning = true
    CreateThread(function()
        while next(zones) do
            local coords = GetEntityCoords(cache.ped)
            for _, z in pairs(zones) do
                local isInside = z:contains(coords)
                if isInside and not z.insideZone then
                    z.insideZone = true
                    if z.onEnter then z:onEnter() end
                elseif not isInside and z.insideZone then
                    z.insideZone = false
                    if z.onExit then z:onExit() end
                end
            end
            if needsTick() then startTick() end
            Wait(250)
        end
        loopRunning = false
    end)
end

local function remove(self)
    if self.insideZone and self.onExit then self:onExit() end
    zones[self.id] = nil
end

local function register(zone)
    nextId = nextId + 1
    zone.id = nextId
    zone.insideZone = false
    zone.remove = remove
    zone.setDebug = function(self, on) self.debug = on; if on then startTick() end end
    zones[nextId] = zone
    startLoop()
    if zone.debug then startTick() end
    return zone
end

local function boxCorners(c, size, cos, sin)
    local hx, hy = size.x / 2, size.y / 2
    local out = {}
    for i, s in ipairs({ { -1, -1 }, { 1, -1 }, { 1, 1 }, { -1, 1 } }) do
        local lx, ly = s[1] * hx, s[2] * hy
        out[i] = { x = c.x + lx * cos - ly * sin, y = c.y + lx * sin + ly * cos }
    end
    return out
end

local Zones = {}

function Zones.sphere(data)
    data.type = 'sphere'
    data.radius = tonumber(data.radius) or 2.0
    data.contains = sphereContains
    return register(data)
end

function Zones.box(data)
    data.type = 'box'
    local size = data.size or { x = 2.0, y = 2.0, z = 2.0 }
    data.size = { x = size.x or size[1], y = size.y or size[2], z = size.z or size[3] }
    local rad = math.rad(data.rotation or 0.0)
    data.cos, data.sin = math.cos(rad), math.sin(rad)
    data.minZ = data.coords.z - data.size.z / 2
    data.maxZ = data.coords.z + data.size.z / 2
    data.corners = boxCorners(data.coords, data.size, data.cos, data.sin)
    data.contains = boxContains
    return register(data)
end

function Zones.poly(data)
    if type(data.points) ~= 'table' or #data.points < 3 then
        error('lib.zones.poly: needs at least 3 points', 2)
    end
    data.type = 'poly'
    local sumZ, cx, cy = 0, 0, 0
    for _, p in ipairs(data.points) do
        sumZ = sumZ + (p.z or 0); cx = cx + p.x; cy = cy + p.y
    end
    local n = #data.points
    local z = sumZ / n
    local half = (tonumber(data.thickness) or 4.0) / 2
    data.coords = data.coords or { x = cx / n, y = cy / n, z = z }
    data.minZ, data.maxZ = z - half, z + half
    data.corners = data.points
    data.contains = polyContains
    return register(data)
end

function Zones.getAllZones() return zones end

function Zones.getCurrentZones()
    local list = {}
    for _, z in pairs(zones) do
        if z.insideZone then list[#list + 1] = z end
    end
    return list
end

return Zones
