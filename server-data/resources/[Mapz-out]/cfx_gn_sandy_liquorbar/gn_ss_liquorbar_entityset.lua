local interiors = {
    {
        ipl = 'int_gn_sandy_liquor_milo_',
        coords = { x = 1949.52563, y = 3838.285, z = 31.1874237 },
        entitySets = {
            { name = 'liquor_weed', enable = true }, --Do not modify
            { name = 'liquor_weed_dry', enable = true }, --Activate the mechanic workshop
            { name = 'liquor_weed_stage1', enable = false }, --Activate the elevators
            { name = 'liquor_weed_stage2', enable = true }, --Activate the elevators
            { name = 'liquor_weed_stage3', enable = false }, --Activate the elevators
            { name = 'liquor_weed_stage4', enable = false }, --Activate the elevators
        }
    }
}

CreateThread(function()
    for _, interior in ipairs(interiors) do
        RequestIpl(interior.ipl)
        local interiorID = GetInteriorAtCoords(interior.coords.x, interior.coords.y, interior.coords.z)
        if IsValidInterior(interiorID) then
            for __, entitySet in ipairs(interior.entitySets) do
                if entitySet.enable then
                    EnableInteriorProp(interiorID, entitySet.name)
                    if entitySet.color then
                        SetInteriorPropColor(interiorID, entitySet.name, entitySet.color)
                    end
                else
                    DisableInteriorProp(interiorID, entitySet.name)
                end
            end
            RefreshInterior(interiorID)
        end
    end
end)
