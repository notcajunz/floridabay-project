local function await(handle)
    local status, hit, endCoords, normal, material, entity
    repeat
        status, hit, endCoords, normal, material, entity = GetShapeTestResultIncludingMaterial(handle)
        if status == 1 then Wait(0) end
    until status ~= 1
    return hit == 1 or hit == true, entity, endCoords, normal, material
end

local raycast = {}

function raycast.fromCoords(from, to, flags, ignore)
    local handle = StartShapeTestLosProbe(from.x, from.y, from.z, to.x, to.y, to.z, flags or 511, ignore or cache.ped, 4)
    return await(handle)
end

function raycast.cam(flags, ignore, distance)
    local camCoords = GetFinalRenderedCamCoord()
    local rot = GetFinalRenderedCamRot(2)
    local rx, rz = math.rad(rot.x), math.rad(rot.z)
    local num = math.abs(math.cos(rx))
    local dir = vector3(-math.sin(rz) * num, math.cos(rz) * num, math.sin(rx))
    local dest = camCoords + dir * (distance or 10.0)
    return raycast.fromCoords(camCoords, dest, flags, ignore)
end

return raycast
