-- Text helpers ported from the Jaxtti tag resource (DrawText3D).
local GetScreenCoordFromWorldCoord = GetScreenCoordFromWorldCoord
local GetFinalRenderedCamCoord = GetFinalRenderedCamCoord
local GetGameplayCamFov = GetGameplayCamFov

---Draw a stack of text lines centred above a world position, bottom line first. All lines share
---one screen anchor and are spaced by their rendered height, so the gap stays tight at any distance.
---@param x number
---@param y number
---@param z number
---@param lines { text: string, size: number, r: integer, g: integer, b: integer, a: integer, outline: boolean|nil }[]
function DrawTagStack(x, y, z, lines)
    local onScreen, sx, sy = GetScreenCoordFromWorldCoord(x, y, z)
    if not onScreen then return end

    local dist = #(GetFinalRenderedCamCoord() - vector3(x, y, z))
    local scale = (1 / math.max(dist, 0.1)) * 2 * ((1 / GetGameplayCamFov()) * 100)

    for _, line in ipairs(lines) do
        local size = line.size * scale
        SetTextScale(0.0, size)
        SetTextFont(0)
        SetTextProportional(true)
        SetTextColour(line.r, line.g, line.b, line.a)
        SetTextDropshadow(0, 0, 0, 0, 255)
        SetTextEdge(2, 0, 0, 0, 150)
        SetTextDropShadow()
        if line.outline ~= false then SetTextOutline() end
        BeginTextCommandDisplayText('STRING')
        SetTextCentre(true)
        AddTextComponentSubstringPlayerName(line.text)
        EndTextCommandDisplayText(sx, sy)
        sy = sy - GetRenderedCharacterHeight(size, 0) * 0.98
    end
end

-- One tag line, sized like jaxtti_tags' DrawText3D: size * (2 / distance) * (100 / camera fov), size = cfg.headScale / cfg.gangScale.
-- Your own tag (camera is right behind you) is sized as if at least cfg.ownMinDistance away so it never gets huge.
function DrawTag(x, y, z, text, size, r, g, b, outline, own)
    local onScreen, sx, sy = GetScreenCoordFromWorldCoord(x, y, z)
    if not onScreen then return end
    local dist = #(GetFinalRenderedCamCoord() - vector3(x, y, z))
    if own then dist = math.max(dist, TagsConfig.ownMinDistance or 6.0) end
    local scale = (1 / math.max(dist, 0.1)) * 2 * ((1 / GetGameplayCamFov()) * 100)
    SetTextScale(0.0, size * scale)
    SetTextFont(0)
    SetTextProportional(true)
    SetTextColour(r, g, b, 255)
    SetTextDropshadow(0, 0, 0, 0, 255)
    SetTextEdge(2, 0, 0, 0, 150)
    SetTextDropShadow()
    if outline ~= false then SetTextOutline() end
    BeginTextCommandDisplayText('STRING')
    SetTextCentre(true)
    AddTextComponentSubstringPlayerName(text)
    EndTextCommandDisplayText(sx, sy)
end

function TagHexColor(hex)
    hex = tostring(hex or ''):gsub('#', '')
    if #hex ~= 6 then return 255, 255, 255 end
    return tonumber(hex:sub(1, 2), 16) or 255, tonumber(hex:sub(3, 4), 16) or 255, tonumber(hex:sub(5, 6), 16) or 255
end

-- Tag labels are plain text from the database. Strip GTA colour codes and control characters so
-- a label can never inject formatting into the ID segment drawn after it.
function CleanTagLabel(label)
    if type(label) ~= 'string' then return nil end
    label = label:gsub('~', ''):gsub('[%c]', ''):gsub('^%s+', ''):gsub('%s+$', '')
    return label ~= '' and label or nil
end

-- ox_lib notification; position comes from config.lua (TagsConfig.notifyPosition)
function TagNotify(description, kind)
    lib.notify({ title = 'FBRP Tags', position = TagsConfig.notifyPosition, description = description, type = kind or 'inform', duration = 6000 })
end
