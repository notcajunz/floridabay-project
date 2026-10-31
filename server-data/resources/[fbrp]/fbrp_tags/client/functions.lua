local GetScreenCoordFromWorldCoord = GetScreenCoordFromWorldCoord
local GetFinalRenderedCamCoord = GetFinalRenderedCamCoord
local GetGameplayCamFov = GetGameplayCamFov

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

function DrawTagLines(x, y, z, lines, own)
    -- Each line is drawn at its own fixed world height above the ped (like calirp-discord_tags)
    local camCoords = GetFinalRenderedCamCoord()
    local fovScale = (1 / GetGameplayCamFov()) * 100
    for _, line in ipairs(lines) do
        local lz = z + (line.height or 1.50)
        local onScreen, sx, sy = GetScreenCoordFromWorldCoord(x, y, lz)
        if onScreen then
            local dist = #(camCoords - vector3(x, y, lz))
            if own then dist = math.max(dist, TagsConfig.ownMinDistance or 6.0) end
            local scale = (1 / math.max(dist, 0.1)) * 2 * fovScale
            local size = line.size * scale
            SetTextScale(0.0, size)
            SetTextFont(0)
            SetTextProportional(true)
            SetTextColour(line.r, line.g, line.b, 255)
            SetTextDropshadow(0, 0, 0, 0, 255)
            SetTextEdge(2, 0, 0, 0, 150)
            SetTextDropShadow()
            if line.outline ~= false then SetTextOutline() end
            BeginTextCommandDisplayText('STRING')
            SetTextCentre(true)
            AddTextComponentSubstringPlayerName(line.text)
            EndTextCommandDisplayText(sx, sy)
        end
    end
end

function TagHexColor(hex)
    hex = tostring(hex or ''):gsub('#', '')
    if #hex ~= 6 then return 255, 255, 255 end
    return tonumber(hex:sub(1, 2), 16) or 255, tonumber(hex:sub(3, 4), 16) or 255, tonumber(hex:sub(5, 6), 16) or 255
end

function CleanTagLabel(label)
    if type(label) ~= 'string' then return nil end
    label = label:gsub('~', ''):gsub('[%c]', ''):gsub('^%s+', ''):gsub('%s+$', '')
    return label ~= '' and label or nil
end

function TagNotify(description, kind)
    lib.notify({ title = 'FBRP Tags', position = TagsConfig.notifyPosition, description = description, type = kind or 'inform', duration = 6000 })
end
