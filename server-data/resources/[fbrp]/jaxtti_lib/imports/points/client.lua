local points = {}
local nearby = {}
local closest = nil
local nextId = 0
local loopRunning = false
local tickRunning = false

local function dist(a, b)
    local dx, dy, dz = a.x - b.x, a.y - b.y, a.z - b.z
    return math.sqrt(dx * dx + dy * dy + dz * dz)
end

local function startTick()
    if tickRunning then return end
    tickRunning = true
    CreateThread(function()
        while #nearby > 0 do
            for i = 1, #nearby do
                local p = nearby[i]
                if p and p.nearby then p:nearby() end
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
        while next(points) do
            local coords = GetEntityCoords(cache.ped)
            local list = {}
            local best = nil

            for _, p in pairs(points) do
                local d = dist(coords, p.coords)
                if d <= p.distance then
                    p.currentDistance = d
                    p.isClosest = nil
                    if not best or d < best.currentDistance then best = p end
                    if not p.inside then
                        p.inside = true
                        if p.onEnter then p:onEnter() end
                    end
                    if p.nearby then list[#list + 1] = p end
                elseif p.inside then
                    p.inside = nil
                    p.isClosest = nil
                    if p.onExit then p:onExit() end
                    p.currentDistance = nil
                end
            end

            if best then best.isClosest = true end
            closest = best
            nearby = list
            if #nearby > 0 then startTick() end

            Wait(300)
        end
        nearby = {}
        closest = nil
        loopRunning = false
    end)
end

local function remove(self)
    if self.inside and self.onExit then self:onExit() end
    points[self.id] = nil
    for i = #nearby, 1, -1 do
        if nearby[i] == self then table.remove(nearby, i) end
    end
    if closest == self then closest = nil end
end

local Points = {}

function Points.new(data, legacyDistance, legacyData)
    if legacyDistance then
        local coords = data
        data = type(legacyData) == 'table' and legacyData or {}
        data.coords, data.distance = coords, legacyDistance
    end

    if not data or not data.coords then error('lib.points.new: coords are required', 2) end

    nextId = nextId + 1
    data.id = nextId
    data.distance = tonumber(data.distance) or 5.0
    data.remove = remove
    points[nextId] = data
    startLoop()
    return data
end

function Points.getAllPoints() return points end
function Points.getNearbyPoints() return nearby end
function Points.getClosestPoint() return closest end

return Points
