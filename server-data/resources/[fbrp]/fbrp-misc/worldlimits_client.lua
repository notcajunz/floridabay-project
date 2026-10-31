-- Lets players (and the camera) go far beyond the normal map edges, for add-on islands
local minX, minY, minZ = -40000.0, -40000.0, 30.0
local maxX, maxY, maxZ = 40000.0, 40000.0, 30.0

CreateThread(function()
    if not MiscConfig.ExpandWorldLimits then return end
    while true do
        ExpandWorldLimits(minX, minY, minZ)
        ExpandWorldLimits(maxX, maxY, maxZ)
        Wait(0)
    end
end)
